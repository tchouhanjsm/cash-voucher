<?php
declare(strict_types=1);

use CashVoucher\Api\Infrastructure\Database;

if (PHP_SAPI !== 'cli' || strtolower((string) (getenv('CV_APP_ENV') ?: '')) !== 'test') {
    fwrite(STDERR, "This helper is restricted to the isolated test environment.\n");
    exit(2);
}

require dirname(__DIR__, 2) . '/api/v1/bootstrap.php';

$database = (string) (getenv('CV_DB_NAME') ?: '');
$username = (string) (getenv('CV_DB_USER') ?: '');
$password = (string) (getenv('CV_DB_PASSWORD') ?: '');

if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $database)
    || !preg_match('/^[A-Za-z0-9_]{1,32}$/', $username)
    || $password === ''
) {
    fwrite(STDERR, "Test database account configuration is invalid.\n");
    exit(2);
}

try {
    $pdo = Database::connectForMigrations();
    $pdo->exec(
        "CREATE USER IF NOT EXISTS '" . $username . "'@'%' IDENTIFIED BY " . $pdo->quote($password)
    );

    $grants = [
        ['users', 'SELECT, INSERT, UPDATE'],
        ['vendors', 'SELECT, INSERT, UPDATE'],
        ['vendor_name_claims', 'SELECT, INSERT, DELETE'],
        ['settings', 'SELECT, INSERT, UPDATE'],
        ['vouchers', 'SELECT, INSERT, UPDATE'],
        ['voucher_approval_events', 'SELECT, INSERT'],
        ['voucher_receipts', 'SELECT, INSERT'],
        ['cash_closes', 'SELECT, INSERT'],
        ['cash_close_corrections', 'SELECT, INSERT'],
        ['user_sessions', 'SELECT, INSERT, UPDATE'],
        ['login_attempts', 'SELECT, INSERT, UPDATE'],
        ['idempotency_requests', 'SELECT, INSERT, UPDATE'],
        ['voucher_number_sequences', 'SELECT, INSERT, UPDATE'],
        ['audit_events', 'SELECT, INSERT'],
        ['voucher_import_batches', 'SELECT, INSERT, UPDATE'],
        ['voucher_import_rows', 'SELECT, INSERT, UPDATE'],
        ['schema_migrations', 'SELECT'],
    ];

    foreach ($grants as [$table, $privileges]) {
        $pdo->exec('GRANT ' . $privileges . ' ON ' . $database . '.' . $table . " TO '" . $username . "'@'%'");
    }

    $pdo->exec('FLUSH PRIVILEGES');
    fwrite(STDOUT, "Restricted runtime account configured for isolated tests.\n");
} catch (Throwable $exception) {
    fwrite(STDERR, 'Could not configure test database grants: ' . $exception->getMessage() . "\n");
    exit(1);
}
