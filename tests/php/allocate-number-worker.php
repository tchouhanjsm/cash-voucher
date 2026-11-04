<?php
declare(strict_types=1);

use CashVoucher\Api\Financial\VoucherNumberAllocator;
use CashVoucher\Api\Infrastructure\Database;

if (PHP_SAPI !== 'cli' || strtolower((string) (getenv('CV_APP_ENV') ?: '')) !== 'test') {
    fwrite(STDERR, "Voucher-number concurrency worker is restricted to the isolated test environment.\n");
    exit(2);
}

require dirname(__DIR__, 2) . '/api/v1/bootstrap.php';

$type = $argv[1] ?? '';
$firstNumber = filter_var($argv[2] ?? null, FILTER_VALIDATE_INT);
if (!in_array($type, ['PAYMENT', 'RECEIPT'], true) || $firstNumber === false || $firstNumber < 1) {
    fwrite(STDERR, "Usage: php allocate-number-worker.php PAYMENT|RECEIPT first-number\n");
    exit(2);
}

$pdo = Database::connectFromEnvironment();
try {
    $pdo->beginTransaction();
    fwrite(STDOUT, "READY\n");
    fflush(STDOUT);
    $number = (new VoucherNumberAllocator($pdo))->allocate($type, $firstNumber);
    $pdo->commit();
    fwrite(STDOUT, $number . "\n");
    exit(0);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'Worker failed: ' . $exception->getMessage() . "\n");
    exit(1);
}
