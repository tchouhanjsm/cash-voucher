<?php
declare(strict_types=1);

use CashVoucher\Api\Http\Kernel;
use CashVoucher\Api\Http\Request;
use CashVoucher\Api\Financial\VoucherNumberAllocator;
use CashVoucher\Api\Financial\IdempotencyService;
use CashVoucher\Api\Infrastructure\Database;
use CashVoucher\Api\Infrastructure\MigrationRunner;
use CashVoucher\Api\Security\Authorization;
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
check(isset($actionMap['actions']['login']), 'the special public login action is mapped separately');
check(
    count(array_filter($actionMap['actions'], static fn (array $action): bool => ($action['state'] ?? '') === 'planned')) === count($actionMap['actions']),
    'action map distinguishes planned routes from implemented business handlers'
);

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
preg_match_all('/^\s{2}([A-Za-z][A-Za-z0-9]+):\s*[A-Za-z0-9_]+,?$/m', $registeredBlock, $routeMatches);
$registeredActions = $routeMatches[1] ?? [];
$mappedActions = array_keys($actionMap['actions'] ?? []);
sort($registeredActions);
sort($mappedActions);
check($registeredActions === array_values(array_diff($mappedActions, ['login'])), 'every registered Apps Script action has a versioned API contract mapping');
check(isset($actionMap['actions']['login']), 'the special public login action is mapped separately');
check(
    count(array_filter($actionMap['actions'], static fn (array $action): bool => ($action['state'] ?? '') === 'planned')) === count($actionMap['actions']),
    'action map distinguishes planned routes from implemented business handlers'
);

// Integration checks run only with the restricted application account, never the migration account.
$pdo = Database::connectFromEnvironment();
$runner = new MigrationRunner($pdo, dirname(__DIR__, 2) . '/database/migrations');
$migrations = $runner->status();
check(count($migrations) === 4, 'four ordered migrations are registered');
check(count(array_filter($migrations, static fn (array $row): bool => $row['applied'])) === 4, 'all four migrations are applied');
$ready = $kernel->handle(Request::fromValues('GET', '/api/v1/health/ready'));
check($ready->status() === 200 && ($ready->body()['data']['schemaVersion'] ?? null) === '0004', 'readiness endpoint requires the expected schema version');

$requiredTables = [
    'users', 'vendors', 'settings', 'vouchers', 'voucher_approval_events',
    'voucher_receipts', 'cash_closes', 'cash_close_corrections',
    'user_sessions', 'login_attempts', 'idempotency_requests', 'voucher_number_sequences', 'audit_events',
    'schema_migrations',
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

fwrite(STDOUT, sprintf("PHP API foundation tests passed: %d assertions.\n", $checks));
