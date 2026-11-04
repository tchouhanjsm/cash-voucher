<?php
declare(strict_types=1);

use CashVoucher\Api\Infrastructure\Database;
use CashVoucher\Api\Infrastructure\MigrationRunner;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

require dirname(__DIR__) . '/api/v1/bootstrap.php';

$command = $argv[1] ?? '--help';

if (!in_array($command, ['--status', '--dry-run', '--apply'], true)) {
    fwrite(STDERR, "Usage: php bin/migrate.php --status|--dry-run|--apply\n");
    exit($command === '--help' ? 0 : 2);
}

if ($command === '--apply') {
    $environment = strtolower((string) (getenv('CV_APP_ENV') ?: ''));
    $allowed = strtolower((string) (getenv('CV_ALLOW_SCHEMA_MIGRATIONS') ?: ''));
    $safeEnvironments = ['local', 'development', 'test', 'staging'];
    if (!in_array($environment, $safeEnvironments, true) || $allowed !== 'true') {
        fwrite(
            STDERR,
            "Refusing schema changes. CV_APP_ENV must be local, development, test or staging, and CV_ALLOW_SCHEMA_MIGRATIONS=true must be explicit.\n"
        );
        exit(3);
    }
}

try {
    $pdo = Database::connectForMigrations();
    $runner = new MigrationRunner($pdo, dirname(__DIR__) . '/database/migrations');

    if ($command === '--apply') {
        $applied = $runner->applyPending();
        foreach ($applied as $filename) {
            fwrite(STDOUT, "APPLIED {$filename}\n");
        }
        fwrite(STDOUT, count($applied) . " migration(s) applied.\n");
        exit(0);
    }

    $rows = $runner->status();
    foreach ($rows as $row) {
        $state = $row['applied'] ? 'APPLIED' : 'PENDING';
        fwrite(STDOUT, sprintf("%s %s %s\n", $state, $row['filename'], $row['checksum']));
    }
    $pending = count(array_filter($rows, static fn (array $row): bool => !$row['applied']));
    fwrite(STDOUT, sprintf("%d pending migration(s).\n", $pending));
    exit(0);
} catch (Throwable $exception) {
    fwrite(STDERR, 'Migration command failed: ' . $exception->getMessage() . "\n");
    exit(1);
}
