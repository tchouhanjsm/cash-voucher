<?php
declare(strict_types=1);

use CashVoucher\Api\Http\Kernel;
use CashVoucher\Api\Http\Request;
use CashVoucher\Api\Http\Response;
use CashVoucher\Api\Financial\VoucherNumberAllocator;
use CashVoucher\Api\Financial\IdempotencyService;
use CashVoucher\Api\Infrastructure\Database;
use CashVoucher\Api\Infrastructure\MigrationRunner;
use CashVoucher\Api\Security\Authorization;
use CashVoucher\Api\Security\PasswordVerifier;
use CashVoucher\Api\Security\SessionService;
use CashVoucher\Api\Security\Role;
use CashVoucher\Api\Support\ApiException;
use CashVoucher\Api\Support\Money;

require dirname(__DIR__, 2) . '/api/v1/bootstrap.php';

$checks = 0;

function check(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException('FAIL: ' . $message);
    }
    $checks++;
}

function expectFailure(callable $callback, string $message, string $class = Throwable::class): void
{
    try {
        $callback();
    } catch (Throwable $exception) {
        if (!$exception instanceof $class) {
            throw new RuntimeException(
                'FAIL: ' . $message . ' (unexpected ' . get_class($exception) . ')',
                0,
                $exception
            );
        }
        return;
    }
    throw new RuntimeException('FAIL: ' . $message . ' (no exception was thrown)');
}

function uuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' .
        substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}

if (strtolower((string) (getenv('CV_APP_ENV') ?: '')) !== 'test') {
    fwrite(STDERR, "Refusing PHP API tests unless CV_APP_ENV=test.\n");
    exit(2);
}

// Exact paise conversion. Floats and excess decimal precision are intentionally not accepted.
check(Money::toPaise('125.10') === 12510, 'rupees convert to integer paise without floating-point arithmetic');
check(Money::toPaise('10.1') === 1010, 'a single decimal digit is right-padded to paise');
check(Money::toPaise('0.01') === 1, 'one paise remains exactly one paise');
expectFailure(static fn () => Money::toPaise('1.001'), 'money rejects fractional paise', InvalidArgumentException::class);
expectFailure(static fn () => Money::toPaise('-1.00'), 'money rejects negative voucher amount', InvalidArgumentException::class);
expectFailure(static fn () => Money::toPaise('0'), 'money rejects zero voucher amount', InvalidArgumentException::class);
expectFailure(static fn () => Money::toPaise('10000000.01'), 'money rejects values above the existing rupee ceiling', InvalidArgumentException::class);

$passwordVerifier = new PasswordVerifier();
$longPassword = str_repeat('A', 80) . '-suffix-91';
$longPasswordHash = $passwordVerifier->hash($longPassword);
$longPasswordValid = $passwordVerifier->verify($longPasswordHash, $longPassword, false);
$longPasswordCollision = $passwordVerifier->verify(
    $longPasswordHash,
    str_repeat('A', 80) . '-suffix-92',
    false
);
check($longPasswordValid['valid'], 'password hashing accepts the full legacy 128-character policy range');
check(!$longPasswordCollision['valid'], 'password suffixes beyond bcrypt 72-byte boundary remain cryptographically significant');
check(str_starts_with($longPasswordHash, 'php-sha384' . chr(36)), 'PHP hashes use the versioned full-input prehash format');


// The new API carries forward the existing backend roles and the exact current capability grants.
check(Role::keys() === ['staff', 'manager', 'owner', 'accountant'], 'legacy backend role keys are unchanged');
check(Role::allows('staff', 'create') && Role::allows('staff', 'viewOwn'), 'staff can create and view own records');
check(!Role::allows('staff', 'viewAll'), 'staff cannot read all records');
check(Role::allows('manager', 'cashClose') && Role::allows('manager', 'approvePayments'), 'manager retains daily operations grants');
check(!Role::allows('manager', 'users') && !Role::allows('manager', 'settings') && !Role::allows('manager', 'audit'), 'manager has no owner-only grants');
check(Role::allows('owner', 'users') && Role::allows('owner', 'settings') && Role::allows('owner', 'audit'), 'owner retains administration grants');
check(Role::capabilities('accountant') === ['reports'], 'accountant remains report-only');
expectFailure(
    static fn () => Authorization::requireCapability(['role' => 'accountant'], 'create'),
    'accountant cannot create vouchers',
    ApiException::class
);
check(
    Authorization::canViewVoucher(['id' => 'staff-1', 'role' => 'staff'], 'staff-1', 'voucher-1'),
    'staff can view an own-record scoped voucher'
);
check(
    !Authorization::canViewVoucher(['id' => 'staff-1', 'role' => 'staff'], 'staff-2', 'voucher-2'),
    'staff cannot view another user voucher'
);
check(
    Authorization::canViewVoucher(['id' => 'manager-1', 'role' => 'manager'], 'staff-2', 'voucher-3'),
    'manager can view permitted all-record scope'
);
check(
    !Authorization::canViewVoucher(['id' => 'x', 'role' => 'admin'], 'x', 'voucher-4'),
    'unknown admin role fails closed rather than becoming manager'
);

// Request decoding rejects oversized, non-JSON and non-object payloads before dispatch.
$request = Request::fromValues('GET', '/api/v1/meta?check=1');
check($request->path === '/api/v1/meta' && $request->method === 'GET', 'request parser strips query string and normalizes method');
$jsonRequest = Request::fromValues(
    'POST',
    '/api/v1/example',
    ['Content-Type' => 'application/json; charset=utf-8'],
    '{"action":"login","email":"operator@example.test"}'
);
check(($jsonRequest->json['action'] ?? null) === 'login', 'request parser accepts a JSON object');
expectFailure(
    static fn () => Request::fromValues('POST', '/', ['Content-Type' => 'text/plain'], '{}'),
    'request parser rejects non-JSON bodies',
    ApiException::class
);
expectFailure(
    static fn () => Request::fromValues('POST', '/', ['Content-Type' => 'application/json'], '[]'),
    'request parser rejects top-level JSON arrays',
    ApiException::class
);
expectFailure(
    static fn () => Request::fromValues('POST', '/', ['Content-Type' => 'application/json'], '{'),
    'request parser rejects malformed JSON',
    ApiException::class
);
expectFailure(
    static fn () => Request::fromValues('POST', '/', [], str_repeat('x', Request::MAX_BODY_BYTES + 1)),
    'request parser enforces the body size limit',
    ApiException::class
);

// Liveness requires no database; readiness proves the isolated test schema is applied.
$kernel = new Kernel();
$live = $kernel->handle(Request::fromValues('GET', '/api/v1/health/live'));
check($live->status() === 200 && ($live->body()['data']['status'] ?? null) === 'live', 'liveness endpoint responds without touching the database');
$meta = $kernel->handle(Request::fromValues('GET', '/api/v1/meta'));
check(($meta->body()['data']['rolloutState'] ?? null) === 'isolated-foundation', 'metadata declares the non-production rollout state');
$wrongMethod = $kernel->handle(Request::fromValues('POST', '/api/v1/health/live'));
check($wrongMethod->status() === 405, 'health endpoint rejects unsupported methods');
$missing = $kernel->handle(Request::fromValues('GET', '/api/v1/admin'));
check($missing->status() === 404, 'unimplemented business routes are not silently exposed');

// Freeze every registered legacy action before the new API handlers are ported.
$repositoryRoot = dirname(__DIR__, 2);
$actionMap = json_decode(
    (string) file_get_contents($repositoryRoot . '/api/v1/legacy-action-map.json'),
    true,
    64,
    JSON_THROW_ON_ERROR
);
$routesSource = (string) file_get_contents($repositoryRoot . '/backend/99-routes.gs');
$registeredBlock = explode('const WRITES =', $routesSource, 2)[0];
preg_match_all('/^\\s{2}([A-Za-z][A-Za-z0-9]+):\\s*[A-Za-z0-9_]+,?$/m', $registeredBlock, $routeMatches);
$registeredActions = $routeMatches[1] ?? [];
$mappedActions = array_keys($actionMap['actions'] ?? []);
sort($registeredActions);
sort($mappedActions);
check($registeredActions === array_values(array_diff($mappedActions, ['login'])), 'every registered Apps Script action has a versioned API contract mapping');
check(
    in_array('login', $actionMap['phpFoundation']['implementedActions'] ?? [], true),
    'the special public login action remains explicitly mapped in the PHP foundation inventory'
);
$foundationActions = $actionMap['phpFoundation']['implementedActions'] ?? [];
sort($foundationActions);
check(
    $foundationActions === ['changePassword', 'login', 'logout', 'saveVendor', 'toggleVendor'],
    'the PHP foundation retains its explicit implemented-action boundary separately from Laravel-shadow parity'
);
check(
    ($actionMap['actions']['login']['state'] ?? null) === 'implemented'
    && ($actionMap['actions']['logout']['state'] ?? null) === 'implemented'
    && ($actionMap['actions']['changePassword']['state'] ?? null) === 'implemented',
    'the three shipped legacy authentication actions are explicitly tracked as implemented'
);
check(
    ($actionMap['actions']['saveVendor']['state'] ?? null) === 'implemented'
    && ($actionMap['actions']['saveVendor']['path'] ?? null) === '/vendors[/{vendorId}]'
    && ($actionMap['actions']['toggleVendor']['state'] ?? null) === 'implemented'
    && ($actionMap['actions']['toggleVendor']['path'] ?? null) === '/vendors/{vendorId}/active',
    'vendor write actions are mapped only to their implemented Laravel endpoints'
);

// Integration checks run only with the restricted application account, never the migration account.
$pdo = Database::connectFromEnvironment();
$runner = new MigrationRunner($pdo, dirname(__DIR__, 2) . '/database/migrations');
$migrations = $runner->status();
check(count($migrations) === 6, 'six ordered migrations are registered');
check(count(array_filter($migrations, static fn (array $row): bool => $row['applied'])) === 6, 'all six migrations are applied');
$ready = $kernel->handle(Request::fromValues('GET', '/api/v1/health/ready'));
check($ready->status() === 200 && ($ready->body()['data']['schemaVersion'] ?? null) === '0006', 'readiness endpoint requires the expected schema version');

$requiredTables = [
    'users', 'vendors', 'settings', 'vouchers', 'voucher_approval_events',
    'voucher_receipts', 'cash_closes', 'cash_close_corrections',
    'user_sessions', 'login_attempts', 'idempotency_requests', 'voucher_number_sequences', 'audit_events',
    'schema_migrations', 'vendor_name_claims',
];
$tableQuery = $pdo->prepare(
    'SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = :table_name'
);
foreach ($requiredTables as $table) {
    $tableQuery->execute(['table_name' => $table]);
    check((int) $tableQuery->fetchColumn() === 1, 'required schema table exists: ' . $table);
}

$columnQuery = $pdo->prepare(
    'SELECT data_type FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = :table_name AND column_name = :column_name'
);
$columnQuery->execute(['table_name' => 'vouchers', 'column_name' => 'amount_paise']);
check($columnQuery->fetchColumn() === 'bigint', 'voucher money is stored as BIGINT paise');
$columnQuery->execute(['table_name' => 'vouchers', 'column_name' => 'business_date']);
check($columnQuery->fetchColumn() === 'date', 'business date is stored independently of UTC timestamps');

$allocator = new VoucherNumberAllocator($pdo);
expectFailure(
    static fn () => $allocator->allocate('PAYMENT', 201),
    'voucher number allocation requires an enclosing database transaction',
    RuntimeException::class
);
expectFailure(
    static function () use ($pdo, $allocator): void {
        $pdo->beginTransaction();
        try {
            $allocator->allocate('UNKNOWN', 1);
        } finally {
            $pdo->rollBack();
        }
    },
    'voucher number allocator rejects unsupported types',
    InvalidArgumentException::class
);

$pdo->beginTransaction();
try {
    check($allocator->allocate('PAYMENT', 201) === '201', 'payment number starts from the configured legacy next number');
    check($allocator->allocate('PAYMENT', 201) === '202', 'payment number increments under the same row lock');
    check($allocator->allocate('RECEIPT', 1) === '1', 'receipt series is independent of payment series');
    $pdo->rollBack();
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    throw $exception;
}

$pdo->beginTransaction();
$firstCommitted = $allocator->allocate('PAYMENT', 201);
$pdo->commit();
$pdo->beginTransaction();
$secondCommitted = $allocator->allocate('PAYMENT', 201);
$pdo->commit();
check($firstCommitted === '201', 'a rolled-back allocation does not consume the first sequence number');
check($secondCommitted === '202', 'the next committed transaction receives the immediately following number');
$pdo->beginTransaction();
$thirdCommitted = $allocator->allocate('PAYMENT', 201);
$pdo->commit();
check($thirdCommitted === '203', 'each committed transaction advances the sequence exactly once');

// Verify voucher-number row locking across two independent PHP processes.
$pdo->beginTransaction();
$parentNumber = $allocator->allocate('RECEIPT', 50);
$workerCommand = [
    PHP_BINARY,
    dirname(__FILE__) . '/allocate-number-worker.php',
    'RECEIPT',
    '50',
];
$pipes = [];
$process = proc_open(
    $workerCommand,
    [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ],
    $pipes
);
if (!is_resource($process)) {
    $pdo->rollBack();
    throw new RuntimeException('Could not start the voucher number concurrency worker.');
}
fclose($pipes[0]);
stream_set_blocking($pipes[1], false);
$readyDeadline = microtime(true) + 10;
$workerReady = false;
while (microtime(true) < $readyDeadline) {
    $read = [$pipes[1]];
    $write = null;
    $except = null;
    $selected = stream_select($read, $write, $except, 0, 200000);
    if ($selected > 0 && fgets($pipes[1]) === "READY\n") {
        $workerReady = true;
        break;
    }
    if (!proc_get_status($process)['running']) {
        break;
    }
}
if (!$workerReady) {
    $pdo->rollBack();
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($process);
    throw new RuntimeException('Voucher number concurrency worker did not become ready: ' . $stderr);
}
usleep(200_000);
$earlyOutput = stream_get_contents($pipes[1]);
check($earlyOutput === '', 'second transaction waits while the first holds the voucher-series row lock');
$pdo->commit();
stream_set_blocking($pipes[1], true);
$workerOutput = stream_get_contents($pipes[1]);
$workerError = stream_get_contents($pipes[2]);
fclose($pipes[1]);
fclose($pipes[2]);
$workerExit = proc_close($process);
check($workerExit === 0, 'concurrent voucher-number worker exits successfully: ' . $workerError);
$workerLines = preg_split('/\R/', trim((string) $workerOutput));
check($parentNumber === '50', 'first concurrent receipt transaction receives the configured seed');
check(($workerLines[0] ?? null) === '51', 'waiting concurrent transaction receives the next unique receipt number');

// Exercise one complete voucher write as a single idempotency + audit transaction.
$serviceActorId = uuid();
$serviceActorEmail = 'idempotency-' . bin2hex(random_bytes(4)) . '@example.test';
$createServiceActor = $pdo->prepare(
    'INSERT INTO users
     (id, full_name, email, email_normalized, role, is_active, password_hash,
      must_change_password, created_at_utc, updated_at_utc)
     VALUES (:id, :name, :email, :normalized, :role, 1, :password_hash, 0, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))'
);
$createServiceActor->execute([
    'id' => $serviceActorId,
    'name' => 'Idempotency Integration User',
    'email' => $serviceActorEmail,
    'normalized' => $serviceActorEmail,
    'role' => 'manager',
    'password_hash' => password_hash('TestOnly-NotARealPassword-99', PASSWORD_DEFAULT),
]);

$idempotencyService = new IdempotencyService($pdo);
$serviceVoucherId = uuid();
$serviceClientId = 'offline-' . bin2hex(random_bytes(8));
$servicePayload = ['amount' => '100.75', 'date' => '2026-11-04', 'vendor' => 'Test counterparty'];
$serviceAudit = [
    'eventType' => 'VOUCHER_CREATE',
    'targetType' => 'voucher',
    'targetId' => $serviceVoucherId,
    'reason' => 'Isolated API integration test',
];
$operationCalls = 0;
$createVoucherOperation = static function (PDO $transaction) use (
    $allocator,
    $serviceVoucherId,
    $serviceClientId,
    $serviceActorId,
    &$operationCalls
): array {
    $operationCalls++;
    $number = $allocator->allocate('PAYMENT', 201);
    $amountPaise = Money::toPaise('100.75');
    $insert = $transaction->prepare(
        'INSERT INTO vouchers
         (id, voucher_type, voucher_number, business_date, vendor_name_snapshot,
          amount_paise, category, client_id, created_by_user_id, created_at_utc, updated_at_utc)
         VALUES (:id, :type, :number, :date, :vendor, :amount, :category, :client,
          :actor, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))'
    );
    $insert->execute([
        'id' => $serviceVoucherId,
        'type' => 'PAYMENT',
        'number' => $number,
        'date' => '2026-11-04',
        'vendor' => 'Test counterparty',
        'amount' => $amountPaise,
        'category' => 'Other',
        'client' => $serviceClientId,
        'actor' => $serviceActorId,
    ]);
    return [
        'voucherId' => $serviceVoucherId,
        'voucherNumber' => $number,
        'amountPaise' => $amountPaise,
    ];
};

$firstWrite = $idempotencyService->execute(
    $serviceActorId,
    $serviceActorEmail,
    'createVouchers',
    'offline-create-voucher-01',
    $servicePayload,
    $createVoucherOperation,
    $serviceAudit
);
check($firstWrite['replayed'] === false, 'first idempotent voucher request performs a new write');
check($firstWrite['data']['voucherId'] === $serviceVoucherId, 'first voucher response contains the committed voucher identity');
$replayedWrite = $idempotencyService->execute(
    $serviceActorId,
    $serviceActorEmail,
    'createVouchers',
    'offline-create-voucher-01',
    ['vendor' => 'Test counterparty', 'date' => '2026-11-04', 'amount' => '100.75'],
    $createVoucherOperation,
    $serviceAudit
);
check($replayedWrite['replayed'] === true, 'retry with the same key and canonical payload replays the original response');
check($replayedWrite['data'] === $firstWrite['data'], 'idempotent retry returns the exact original response');
check($operationCalls === 1, 'idempotent retry does not execute the financial write a second time');
expectFailure(
    static fn () => $idempotencyService->execute(
        $serviceActorId,
        $serviceActorEmail,
        'createVouchers',
        'offline-create-voucher-01',
        ['amount' => '101.00', 'date' => '2026-11-04', 'vendor' => 'Test counterparty'],
        $createVoucherOperation,
        $serviceAudit
    ),
    'reusing a client key with different content is rejected',
    ApiException::class
);
$voucherCount = $pdo->prepare('SELECT COUNT(*) FROM vouchers WHERE id = :id');
$voucherCount->execute(['id' => $serviceVoucherId]);
check((int) $voucherCount->fetchColumn() === 1, 'idempotency creates exactly one financial voucher');
$auditCount = $pdo->prepare(
    'SELECT COUNT(*) FROM audit_events WHERE target_type = :target_type AND target_id = :target_id'
);
$auditCount->execute(['target_type' => 'voucher', 'target_id' => $serviceVoucherId]);
check((int) $auditCount->fetchColumn() === 1, 'the financial write and one audit event commit atomically');

$sequenceBeforeFailure = $pdo->query(
    "SELECT next_number FROM voucher_number_sequences WHERE voucher_type = 'PAYMENT'"
)->fetchColumn();
$failedIdempotencyKey = 'offline-failing-write-01';
expectFailure(
    static fn () => $idempotencyService->execute(
        $serviceActorId,
        $serviceActorEmail,
        'createVouchers',
        $failedIdempotencyKey,
        ['amount' => '50.00', 'date' => '2026-11-04'],
        static function (PDO $transaction) use ($allocator): array {
            $allocator->allocate('PAYMENT', 201);
            throw new RuntimeException('Simulated failure after number allocation.');
        },
        [
            'eventType' => 'VOUCHER_CREATE',
            'targetType' => 'voucher',
            'targetId' => uuid(),
            'reason' => 'Failure rollback assertion',
        ]
    ),
    'failed financial operation rolls its idempotency claim back',
    RuntimeException::class
);
$failedClaim = $pdo->prepare(
    'SELECT COUNT(*) FROM idempotency_requests WHERE actor_user_id = :actor AND action_key = :action AND idempotency_key = :key'
);
$failedClaim->execute([
    'actor' => $serviceActorId,
    'action' => 'createVouchers',
    'key' => $failedIdempotencyKey,
]);
check((int) $failedClaim->fetchColumn() === 0, 'failed transaction leaves no permanently claimed idempotency key');
$sequenceAfterFailure = $pdo->query(
    "SELECT next_number FROM voucher_number_sequences WHERE voucher_type = 'PAYMENT'"
)->fetchColumn();
check((string) $sequenceAfterFailure === (string) $sequenceBeforeFailure, 'failed voucher transaction rolls back its sequence increment');

$pdo->beginTransaction();
try {
    $userId = uuid();
    $vendorId = uuid();
    $voucherId = uuid();
    $closeId = uuid();
    $approvalEventId = uuid();
    $receiptId = uuid();
    $correctionId = uuid();
    $idempotencyId = uuid();
    $auditId = uuid();
    $email = 'api-' . bin2hex(random_bytes(4)) . '@example.test';

    $insertUser = $pdo->prepare(
        'INSERT INTO users
         (id, full_name, email, email_normalized, role, is_active, password_hash,
          must_change_password, created_at_utc, updated_at_utc)
         VALUES (:id, :name, :email, :normalized, :role, 1, :password_hash, 0, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))'
    );
    $insertUser->execute([
        'id' => $userId,
        'name' => 'API Integration User',
        'email' => $email,
        'normalized' => $email,
        'role' => 'manager',
        'password_hash' => password_hash('TestOnly-NotARealPassword-99', PASSWORD_DEFAULT),
    ]);

    $insertVendor = $pdo->prepare(
        'INSERT INTO vendors
         (id, display_name, is_active, created_by_user_id, created_at_utc, updated_at_utc)
         VALUES (:id, :name, 1, :actor, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))'
    );
    $insertVendor->execute(['id' => $vendorId, 'name' => 'Integration Vendor', 'actor' => $userId]);

    $clientId = 'test-' . bin2hex(random_bytes(12));
    $insertVoucher = $pdo->prepare(
        'INSERT INTO vouchers
         (id, voucher_type, voucher_number, business_date, vendor_name_snapshot,
          vendor_id, amount_paise, category, client_id, created_by_user_id,
          created_by_email_snapshot, created_at_utc, updated_at_utc)
         VALUES (:id, :type, :number, :business_date, :vendor_name,
          :vendor_id, :amount, :category, :client_id, :actor, :actor_email,
          UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))'
    );
    $insertVoucher->execute([
        'id' => $voucherId,
        'type' => 'PAYMENT',
        'number' => 'IT-' . bin2hex(random_bytes(3)),
        'business_date' => '2026-11-04',
        'vendor_name' => 'Integration Vendor',
        'vendor_id' => $vendorId,
        'amount' => Money::toPaise('100.75'),
        'category' => 'Other',
        'client_id' => $clientId,
        'actor' => $userId,
        'actor_email' => 'integration@example.test',
    ]);
    $storedAmount = $pdo->prepare('SELECT amount_paise FROM vouchers WHERE id = :id');
    $storedAmount->execute(['id' => $voucherId]);
    check((int) $storedAmount->fetchColumn() === 10075, 'financial insert preserves exact integer paise');

    $insertApproval = $pdo->prepare(
        'INSERT INTO voucher_approval_events
         (id, voucher_id, decision, previous_status, next_status, actor_user_id, occurred_at_utc)
         VALUES (:id, :voucher, :decision, :previous, :next, :actor, UTC_TIMESTAMP(6))'
    );
    $insertApproval->execute([
        'id' => $approvalEventId,
        'voucher' => $voucherId,
        'decision' => 'SUBMITTED',
        'previous' => 'NOT_REQUIRED',
        'next' => 'PENDING',
        'actor' => $userId,
    ]);

    $insertReceipt = $pdo->prepare(
        'INSERT INTO voucher_receipts
         (id, voucher_id, content_type, byte_size, sha256, created_by_user_id, created_at_utc)
         VALUES (:id, :voucher, :type, :size, :sha, :actor, UTC_TIMESTAMP(6))'
    );
    $insertReceipt->execute([
        'id' => $receiptId,
        'voucher' => $voucherId,
        'type' => 'image/jpeg',
        'size' => 1234,
        'sha' => hash('sha256', 'test receipt metadata only'),
        'actor' => $userId,
    ]);

    $insertClose = $pdo->prepare(
        'INSERT INTO cash_closes
         (id, business_date, drawer_key, opening_cash_paise, opening_source,
          cash_in_total_paise, cash_out_total_paise, expected_cash_paise,
          counted_cash_paise, variance_paise, included_voucher_count,
          included_voucher_ids, included_voucher_snapshot, created_by_user_id,
          created_at_utc, request_id, request_payload_hash)
         VALUES (:id, :date, :drawer, :opening, :source, 0, :cash_out, :expected,
          :counted, :variance, 1, :ids, :snapshot, :actor, UTC_TIMESTAMP(6), :request_id, :request_hash)'
    );
    $insertClose->execute([
        'id' => $closeId,
        'date' => '2026-11-04',
        'drawer' => 'MAIN',
        'source' => 'OPENING',
        'opening' => 20000,
        'cash_out' => 10075,
        'expected' => 9925,
        'counted' => 9925,
        'variance' => 0,
        'ids' => json_encode([$voucherId], JSON_THROW_ON_ERROR),
        'snapshot' => json_encode([['voucherId' => $voucherId, 'amountPaise' => 10075]], JSON_THROW_ON_ERROR),
        'actor' => $userId,
        'request_id' => 'close-' . bin2hex(random_bytes(8)),
        'request_hash' => hash('sha256', 'close payload'),
    ]);

    $insertCorrection = $pdo->prepare(
        'INSERT INTO cash_close_corrections
         (id, cash_close_id, business_date, voucher_id, correction_type, details,
          reason, created_by_user_id, created_at_utc)
         VALUES (:id, :close_id, :date, :voucher_id, :type, :details, :reason, :actor, UTC_TIMESTAMP(6))'
    );
    $insertCorrection->execute([
        'id' => $correctionId,
        'close_id' => $closeId,
        'date' => '2026-11-04',
        'voucher_id' => $voucherId,
        'type' => 'VOUCHER',
        'details' => 'Test correction metadata',
        'reason' => 'Integration test only',
        'actor' => $userId,
    ]);

    $insertIdempotency = $pdo->prepare(
        'INSERT INTO idempotency_requests
         (id, actor_user_id, action_key, idempotency_key, request_hash, state, created_at_utc)
         VALUES (:id, :actor, :action, :key, :hash, :state, UTC_TIMESTAMP(6))'
    );
    $idempotencyKey = 'key-' . bin2hex(random_bytes(8));
    $idempotencyPayload = [
        'id' => $idempotencyId,
        'actor' => $userId,
        'action' => 'createVouchers',
        'key' => $idempotencyKey,
        'hash' => hash('sha256', 'same request'),
        'state' => 'COMPLETED',
    ];
    $insertIdempotency->execute([
        'id' => $idempotencyPayload['id'],
        'actor' => $idempotencyPayload['actor'],
        'action' => $idempotencyPayload['action'],
        'key' => $idempotencyPayload['key'],
        'hash' => $idempotencyPayload['hash'],
        'state' => $idempotencyPayload['state'],
    ]);
    expectFailure(
        static function () use ($insertIdempotency, $idempotencyPayload): void {
            $insertIdempotency->execute([
                'id' => uuid(),
                'actor' => $idempotencyPayload['actor'],
                'action' => $idempotencyPayload['action'],
                'key' => $idempotencyPayload['key'],
                'hash' => $idempotencyPayload['hash'],
                'state' => $idempotencyPayload['state'],
            ]);
        },
        'same actor/action/idempotency key cannot be accepted twice',
        PDOException::class
    );

    $insertAudit = $pdo->prepare(
        'INSERT INTO audit_events
         (id, actor_user_id, actor_email_snapshot, event_type, target_type,
          target_id, after_json, reason, occurred_at_utc)
         VALUES (:id, :actor, :email, :event, :target_type, :target_id, :after_json, :reason, UTC_TIMESTAMP(6))'
    );
    $insertAudit->execute([
        'id' => $auditId,
        'actor' => $userId,
        'email' => 'integration@example.test',
        'event' => 'INTEGRATION_TEST',
        'target_type' => 'voucher',
        'target_id' => $voucherId,
        'after_json' => json_encode(['amountPaise' => 10075], JSON_THROW_ON_ERROR),
        'reason' => 'Test event; transaction will be rolled back',
    ]);

    // The normal API account is intentionally denied UPDATE/DELETE on audit history,
    // approval events and cash-close corrections.
    expectFailure(
        static fn () => $pdo->prepare('UPDATE audit_events SET reason = :reason WHERE id = :id')
            ->execute(['reason' => 'rewrite attempt', 'id' => $auditId]),
        'runtime account cannot update audit history',
        PDOException::class
    );
    expectFailure(
        static fn () => $pdo->prepare('DELETE FROM audit_events WHERE id = :id')->execute(['id' => $auditId]),
        'runtime account cannot delete audit history',
        PDOException::class
    );
    expectFailure(
        static fn () => $pdo->prepare('UPDATE voucher_approval_events SET reason = :reason WHERE id = :id')
            ->execute(['reason' => 'rewrite attempt', 'id' => $approvalEventId]),
        'runtime account cannot rewrite approval events',
        PDOException::class
    );
    expectFailure(
        static fn () => $pdo->prepare('UPDATE cash_close_corrections SET reason = :reason WHERE id = :id')
            ->execute(['reason' => 'rewrite attempt', 'id' => $correctionId]),
        'runtime account cannot rewrite cash-close corrections',
        PDOException::class
    );
} finally {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
}

// Authentication lifecycle: database-backed sessions, CSRF, legacy hash upgrade and revocation.
$rateKey = (string) getenv('CV_AUTH_RATE_LIMIT_KEY');
$legacyPepper = (string) getenv('CV_LEGACY_PASSWORD_PEPPER');
check(strlen($rateKey) >= 32 && strlen($legacyPepper) >= 16, 'test environment provides isolated authentication keys');

function insertAuthTestUser(PDO $pdo, string $email, string $role, string $passwordHash, bool $mustChange = false): string
{
    $id = uuid();
    $insert = $pdo->prepare(
        'INSERT INTO users
         (id, full_name, email, email_normalized, role, is_active, password_hash,
          must_change_password, created_at_utc, updated_at_utc)
         VALUES (:id, :name, :email, :normalized, :role, 1, :password_hash,
          :must_change, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))'
    );
    $insert->execute([
        'id' => $id,
        'name' => 'Authentication Test User',
        'email' => $email,
        'normalized' => strtolower($email),
        'role' => $role,
        'password_hash' => $passwordHash,
        'must_change' => $mustChange ? 1 : 0,
    ]);
    return $id;
}

function authRequest(string $method, string $path, array $payload = [], array $cookies = [], array $headers = [], string $ip = '203.0.113.40'): Request
{
    $requestHeaders = $headers;
    if ($payload !== []) {
        $requestHeaders['Content-Type'] = 'application/json';
    }
    if ($cookies !== []) {
        $requestHeaders['Cookie'] = implode('; ', array_map(
            static fn (string $name, string $value): string => $name . '=' . $value,
            array_keys($cookies),
            array_values($cookies)
        ));
    }
    $body = $payload === [] ? '' : json_encode($payload, JSON_THROW_ON_ERROR);
    return Request::fromValues($method, $path, $requestHeaders, $body, $ip);
}

function authCookies(Response $response): array
{
    $cookies = [];
    foreach ($response->headerValues('Set-Cookie') as $header) {
        $pair = explode(';', $header, 2)[0];
        [$name, $value] = array_pad(explode('=', $pair, 2), 2, '');
        $cookies[$name] = $value;
    }
    return $cookies;
}

$authKernel = new Kernel();
$knownPassword = 'Legacy-Temp-Password-91';
$authEmail = 'session-' . bin2hex(random_bytes(5)) . '@example.test';
$authUserId = insertAuthTestUser(
    $pdo,
    $authEmail,
    'manager',
    password_hash($knownPassword, PASSWORD_DEFAULT),
    true
);

$loginResponse = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions',
    ['email' => strtoupper($authEmail), 'password' => $knownPassword]
));
check($loginResponse->status() === 200, 'valid user can establish a database-backed session');
$loginCookies = authCookies($loginResponse);
check(isset($loginCookies['cv_session'], $loginCookies['cv_csrf']), 'login issues separate session and CSRF cookies');
check(
    preg_match('/^[a-f0-9]{64}$/D', $loginCookies['cv_session']) === 1
    && preg_match('/^[a-f0-9]{64}$/D', $loginCookies['cv_csrf']) === 1,
    'session and CSRF cookies contain cryptographically random opaque tokens'
);
$sessionCookieHeaders = $loginResponse->headerValues('Set-Cookie');
check(
    count($sessionCookieHeaders) === 2
    && str_contains($sessionCookieHeaders[0], 'HttpOnly')
    && str_contains($sessionCookieHeaders[0], 'Secure')
    && str_contains($sessionCookieHeaders[0], 'SameSite=Strict')
    && !str_contains($sessionCookieHeaders[1], 'HttpOnly'),
    'session cookie is Secure/HttpOnly/SameSite and CSRF cookie remains readable to the same-origin client'
);
$storedSession = $pdo->prepare(
    'SELECT session_token_hash, csrf_token_hash, revoked_at_utc
     FROM user_sessions WHERE user_id = :user ORDER BY created_at_utc DESC LIMIT 1'
);
$storedSession->execute(['user' => $authUserId]);
$storedSessionRow = $storedSession->fetch();
check(
    is_array($storedSessionRow)
    && hash_equals((string) $storedSessionRow['session_token_hash'], hash('sha256', $loginCookies['cv_session']))
    && !hash_equals((string) $storedSessionRow['session_token_hash'], $loginCookies['cv_session']),
    'database stores only a one-way hash of the session cookie'
);
check(
    is_array($storedSessionRow)
    && hash_equals((string) $storedSessionRow['csrf_token_hash'], hash('sha256', $loginCookies['cv_csrf'])),
    'database stores only a one-way hash of the CSRF token'
);

$currentResponse = $authKernel->handle(authRequest(
    'GET',
    '/api/v1/sessions/current',
    [],
    $loginCookies
));
check(
    $currentResponse->status() === 200
    && ($currentResponse->body()['data']['user']['role'] ?? null) === 'manager'
    && ($currentResponse->body()['data']['user']['mustChangePassword'] ?? null) === true,
    'session restoration reloads active role and forced-password-change state from the database'
);
$changeRole = $pdo->prepare('UPDATE users SET role = :role WHERE id = :id');
$changeRole->execute(['role' => 'accountant', 'id' => $authUserId]);
$currentRoleResponse = $authKernel->handle(authRequest(
    'GET',
    '/api/v1/sessions/current',
    [],
    $loginCookies
));
check(
    $currentRoleResponse->status() === 200
    && ($currentRoleResponse->body()['data']['user']['role'] ?? null) === 'accountant',
    'existing session observes a role change immediately instead of retaining stale privileges'
);
$changeRole->execute(['role' => 'manager', 'id' => $authUserId]);

$csrfMissing = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions/current/logout',
    [],
    ['cv_session' => $loginCookies['cv_session']]
));
check($csrfMissing->status() === 403, 'state-changing session routes reject missing CSRF tokens');
$csrfMismatch = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions/current/logout',
    [],
    $loginCookies,
    ['X-CSRF-Token' => str_repeat('0', 64)]
));
check($csrfMismatch->status() === 403, 'state-changing session routes reject a mismatched double-submit CSRF token');

$logoutResponse = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions/current/logout',
    [],
    $loginCookies,
    ['X-CSRF-Token' => $loginCookies['cv_csrf']]
));
check($logoutResponse->status() === 200 && ($logoutResponse->body()['data']['signedOut'] ?? false), 'valid CSRF token allows session logout');
check(count($logoutResponse->headerValues('Set-Cookie')) === 2, 'logout clears both session and CSRF cookies');
$afterLogout = $authKernel->handle(authRequest(
    'GET',
    '/api/v1/sessions/current',
    [],
    $loginCookies
));
check($afterLogout->status() === 401, 'revoked session cannot be restored');

$legacyEmail = 'legacy-' . bin2hex(random_bytes(5)) . '@example.test';
$legacyPassword = 'Legacy-Password-72';
$legacySalt = uuid();
$legacyHash = hash_hmac('sha256', $legacySalt . ':' . $legacyPassword, $legacyPepper);
$legacyUserId = insertAuthTestUser(
    $pdo,
    $legacyEmail,
    'staff',
    'legacy-hmac-sha256$' . $legacySalt . '$' . $legacyHash,
    true
);
$legacyLogin = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions',
    ['email' => $legacyEmail, 'password' => $legacyPassword]
));
check($legacyLogin->status() === 200, 'valid imported Apps Script HMAC credential can sign in during migration');
$upgradedHashQuery = $pdo->prepare('SELECT password_hash FROM users WHERE id = :id');
$upgradedHashQuery->execute(['id' => $legacyUserId]);
$upgradedHash = (string) $upgradedHashQuery->fetchColumn();
$upgradedVerification = $passwordVerifier->verify($upgradedHash, $legacyPassword, false);
check(
    str_starts_with($upgradedHash, 'php-sha384' . chr(36)) && $upgradedVerification['valid'],
    'legacy HMAC credential is upgraded to the versioned PHP password hash after successful login'
);
$legacyLoginCookies = authCookies($legacyLogin);
$legacyLogout = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions/current/logout',
    [],
    $legacyLoginCookies,
    ['X-CSRF-Token' => $legacyLoginCookies['cv_csrf']]
));
check($legacyLogout->status() === 200, 'upgraded legacy account can complete logout');

$shortLegacyEmail = 'short-legacy-' . bin2hex(random_bytes(4)) . '@example.test';
$shortLegacyPassword = 'Pin7';
$shortSalt = uuid();
$shortHash = hash_hmac('sha256', $shortSalt . ':' . $shortLegacyPassword, $legacyPepper);
$shortLegacyUserId = insertAuthTestUser(
    $pdo,
    $shortLegacyEmail,
    'staff',
    'legacy-hmac-sha256$' . $shortSalt . '$' . $shortHash,
    true
);
putenv('CV_ALLOW_LEGACY_SHORT_PASSWORDS=true');
check(
    getenv('CV_ALLOW_LEGACY_SHORT_PASSWORDS') === 'true',
    'test process explicitly enables short-PIN migration compatibility'
);
$shortVerifierResult = $passwordVerifier->verify(
    'legacy-hmac-sha256$' . $shortSalt . '$' . $shortHash,
    $shortLegacyPassword,
    true
);
check(
    $shortVerifierResult['valid'] === true,
    'short legacy credential verifies only with migration flag and must-change marker'
);
$shortLogin = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions',
    ['email' => $shortLegacyEmail, 'password' => $shortLegacyPassword]
));
putenv('CV_ALLOW_LEGACY_SHORT_PASSWORDS=false');
check(
    getenv('CV_ALLOW_LEGACY_SHORT_PASSWORDS') === 'false',
    'short-PIN migration compatibility is disabled again after the integration case'
);
$shortHashQuery = $pdo->prepare('SELECT password_hash FROM users WHERE id = :id');
$shortHashQuery->execute(['id' => $shortLegacyUserId]);
check(
    (string) $shortHashQuery->fetchColumn() === 'legacy-hmac-sha256$' . $shortSalt . '$' . $shortHash,
    'short legacy PIN remains in its legacy format until the mandatory password change'
);
check(
    ($shortLogin->body()['data']['user']['mustChangePassword'] ?? false) === true,
    'short legacy PIN session is restricted to the forced password-change step'
);
$shortCookies = authCookies($shortLogin);
$shortLogout = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions/current/logout',
    [],
    $shortCookies,
    ['X-CSRF-Token' => $shortCookies['cv_csrf']]
));
check($shortLogout->status() === 200, 'temporary short-credential migration session can sign out');

$passwordChangeEmail = 'change-' . bin2hex(random_bytes(5)) . '@example.test';
$oldPassword = 'Temporary-Change-81';
$newPassword = 'New-Secure-Password-92';
$passwordChangeUserId = insertAuthTestUser(
    $pdo,
    $passwordChangeEmail,
    'staff',
    password_hash($oldPassword, PASSWORD_DEFAULT),
    true
);
$secondSessionEmail = $passwordChangeEmail;
$passwordLoginOne = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions',
    ['email' => $passwordChangeEmail, 'password' => $oldPassword],
    [],
    [],
    '203.0.113.41'
));
$passwordLoginTwo = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions',
    ['email' => $secondSessionEmail, 'password' => $oldPassword],
    [],
    [],
    '203.0.113.42'
));
check($passwordLoginOne->status() === 200 && $passwordLoginTwo->status() === 200, 'user may have multiple independent active sessions');
$passwordCookies = authCookies($passwordLoginOne);
$changeResponse = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions/current/password',
    ['oldPassword' => $oldPassword, 'newPassword' => $newPassword],
    $passwordCookies,
    ['X-CSRF-Token' => $passwordCookies['cv_csrf']]
));
check(
    $changeResponse->status() === 200
    && ($changeResponse->body()['data']['sessionRevoked'] ?? false)
    && ($changeResponse->body()['data']['requiresSignIn'] ?? false),
    'password change requires valid current password and revokes all existing sessions'
);
$allRevoked = $pdo->prepare(
    'SELECT COUNT(*) FROM user_sessions WHERE user_id = :user AND revoked_at_utc IS NOT NULL'
);
$allRevoked->execute(['user' => $passwordChangeUserId]);
check((int) $allRevoked->fetchColumn() === 2, 'password change revokes every session for the user');
$mustChangeQuery = $pdo->prepare('SELECT must_change_password FROM users WHERE id = :user');
$mustChangeQuery->execute(['user' => $passwordChangeUserId]);
check((int) $mustChangeQuery->fetchColumn() === 0, 'successful password change clears the forced-change flag');
$oldPasswordLogin = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions',
    ['email' => $passwordChangeEmail, 'password' => $oldPassword],
    [],
    [],
    '203.0.113.43'
));
check($oldPasswordLogin->status() === 401, 'old password no longer authenticates after password change');
$newPasswordLogin = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions',
    ['email' => $passwordChangeEmail, 'password' => $newPassword],
    [],
    [],
    '203.0.113.44'
));
check(
    $newPasswordLogin->status() === 200
    && ($newPasswordLogin->body()['data']['user']['mustChangePassword'] ?? true) === false,
    'new password authenticates and reports that mandatory change is complete'
);
$newCookies = authCookies($newPasswordLogin);
$newLogout = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions/current/logout',
    [],
    $newCookies,
    ['X-CSRF-Token' => $newCookies['cv_csrf']]
));
check($newLogout->status() === 200, 'post-change session can be ended normally');

$rateLimitEmail = 'locked-' . bin2hex(random_bytes(5)) . '@example.test';
$lockedUserId = insertAuthTestUser(
    $pdo,
    $rateLimitEmail,
    'staff',
    password_hash('Valid-Password-82', PASSWORD_DEFAULT)
);
for ($attempt = 1; $attempt <= 5; $attempt++) {
    $failedLogin = $authKernel->handle(authRequest(
        'POST',
        '/api/v1/sessions',
        ['email' => $rateLimitEmail, 'password' => 'Wrong-Password-00'],
        [],
        [],
        '203.0.113.45'
    ));
    check(
        $failedLogin->status() === ($attempt < 5 ? 401 : 429),
        'login throttle denies bad credentials and locks on the fifth failed attempt #' . $attempt
    );
}
$rateLimitedLogin = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions',
    ['email' => $rateLimitEmail, 'password' => 'Valid-Password-82'],
    [],
    [],
    '203.0.113.45'
));
check($rateLimitedLogin->status() === 429, 'locked login subject remains blocked even with the correct password');

$disabledEmail = 'disabled-' . bin2hex(random_bytes(5)) . '@example.test';
$disabledUserId = insertAuthTestUser(
    $pdo,
    $disabledEmail,
    'manager',
    password_hash('Disabled-Password-83', PASSWORD_DEFAULT)
);
$disabledLogin = $authKernel->handle(authRequest(
    'POST',
    '/api/v1/sessions',
    ['email' => $disabledEmail, 'password' => 'Disabled-Password-83']
));
$disabledCookies = authCookies($disabledLogin);
$disableUser = $pdo->prepare('UPDATE users SET is_active = 0 WHERE id = :id');
$disableUser->execute(['id' => $disabledUserId]);
$disabledSessionResponse = $authKernel->handle(authRequest(
    'GET',
    '/api/v1/sessions/current',
    [],
    $disabledCookies
));
check($disabledSessionResponse->status() === 401, 'deactivating a user invalidates all their sessions at the next request');
$disabledRevocations = $pdo->prepare(
    'SELECT COUNT(*) FROM user_sessions WHERE user_id = :user AND revoked_at_utc IS NOT NULL'
);
$disabledRevocations->execute(['user' => $disabledUserId]);
check((int) $disabledRevocations->fetchColumn() === 1, 'deactivation revokes the user session rows in the database');

$authAudit = $pdo->prepare(
    'SELECT COUNT(*) FROM audit_events
     WHERE event_type IN (
       "AUTH_LOGIN_SUCCESS", "AUTH_LOGIN_FAILED", "AUTH_LOGOUT",
       "AUTH_PASSWORD_CHANGED", "AUTH_PASSWORD_CHANGE_FAILED"
     )'
);
$authAudit->execute();
check((int) $authAudit->fetchColumn() >= 10, 'authentication lifecycle writes attributable audit events');

fwrite(STDOUT, sprintf("PHP API foundation tests passed: %d assertions.\n", $checks));
