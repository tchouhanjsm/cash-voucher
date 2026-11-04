<?php
declare(strict_types=1);

namespace CashVoucher\Api\Infrastructure;

use PDO;
use RuntimeException;
use Throwable;

final class MigrationRunner
{
    private const LOCK_NAME = 'cash_voucher_schema_migrations';

    public function __construct(
        private readonly PDO $pdo,
        private readonly string $migrationDirectory
    ) {
    }

    /** @return list<array{version:string,filename:string,checksum:string,applied:bool}> */
    public function status(): array
    {
        $files = $this->migrationFiles();
        $applied = $this->appliedMigrations();
        $result = [];
        $pendingEncountered = false;

        foreach ($files as $version => $file) {
            $filename = basename($file);
            $checksum = hash_file('sha256', $file);
            if (!is_string($checksum)) {
                throw new RuntimeException('Could not checksum migration: ' . $filename);
            }
            $record = $applied[$version] ?? null;

            if ($record !== null && !hash_equals($record['checksum'], $checksum)) {
                throw new RuntimeException(
                    sprintf('Applied migration %s has changed. Create a new migration instead of editing it.', $filename)
                );
            }
            if ($record === null) {
                $pendingEncountered = true;
            } elseif ($pendingEncountered) {
                throw new RuntimeException(
                    sprintf('Migration history has a gap before %s. Stop and inspect schema_migrations.', $filename)
                );
            }

            $result[] = [
                'version' => $version,
                'filename' => $filename,
                'checksum' => $checksum,
                'applied' => $record !== null,
            ];
        }

        foreach ($applied as $version => $record) {
            if (!isset($files[$version])) {
                throw new RuntimeException(
                    sprintf('Database contains migration %s (%s), but its file is missing from the repository.', $version, $record['filename'])
                );
            }
        }

        return $result;
    }

    /** @return list<string> Newly applied migration filenames. */
    public function applyPending(): array
    {
        $lock = $this->pdo->prepare('SELECT GET_LOCK(:lock_name, 10)');
        $lock->execute(['lock_name' => self::LOCK_NAME]);
        if ((int) $lock->fetchColumn() !== 1) {
            throw new RuntimeException('Could not acquire the schema migration lock.');
        }

        $appliedNow = [];
        try {
            $this->ensureMigrationTable();
            $status = $this->status();

            foreach ($status as $migration) {
                if ($migration['applied']) {
                    continue;
                }
                $path = $this->migrationDirectory . DIRECTORY_SEPARATOR . $migration['filename'];
                $this->executeSqlFile($path);

                $insert = $this->pdo->prepare(
                    'INSERT INTO schema_migrations (version, filename, checksum, applied_at_utc)
                     VALUES (:version, :filename, :checksum, UTC_TIMESTAMP(6))'
                );
                $insert->execute([
                    'version' => $migration['version'],
                    'filename' => $migration['filename'],
                    'checksum' => $migration['checksum'],
                ]);
                $appliedNow[] = $migration['filename'];
            }
        } finally {
            try {
                $release = $this->pdo->prepare('SELECT RELEASE_LOCK(:lock_name)');
                $release->execute(['lock_name' => self::LOCK_NAME]);
            } catch (Throwable) {
                // The connection will release the advisory lock when it closes.
            }
        }

        return $appliedNow;
    }

    /** @return array<string, array{filename:string,checksum:string}> */
    private function appliedMigrations(): array
    {
        if (!$this->migrationTableExists()) {
            return [];
        }

        $rows = $this->pdo->query(
            'SELECT version, filename, checksum FROM schema_migrations ORDER BY version'
        )->fetchAll();

        $applied = [];
        foreach ($rows as $row) {
            $version = (string) $row['version'];
            $applied[$version] = [
                'filename' => (string) $row['filename'],
                'checksum' => (string) $row['checksum'],
            ];
        }
        return $applied;
    }

    private function ensureMigrationTable(): void
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS schema_migrations (
                version CHAR(4) NOT NULL PRIMARY KEY,
                filename VARCHAR(160) NOT NULL,
                checksum CHAR(64) NOT NULL,
                applied_at_utc DATETIME(6) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }

    private function migrationTableExists(): bool
    {
        $statement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name = :table_name'
        );
        $statement->execute(['table_name' => 'schema_migrations']);
        return (int) $statement->fetchColumn() > 0;
    }

    /** @return array<string, string> Map of four-digit version to absolute path. */
    private function migrationFiles(): array
    {
        if (!is_dir($this->migrationDirectory)) {
            throw new RuntimeException('The database migration directory is missing.');
        }

        $paths = glob($this->migrationDirectory . DIRECTORY_SEPARATOR . '*.sql') ?: [];
        sort($paths, SORT_STRING);
        $files = [];

        foreach ($paths as $path) {
            $filename = basename($path);
            if (!preg_match('/^([0-9]{4})_[a-z0-9_]+\.sql$/', $filename, $matches)) {
                throw new RuntimeException('Migration filename must use NNNN_lowercase_name.sql: ' . $filename);
            }
            $version = $matches[1];
            if (isset($files[$version])) {
                throw new RuntimeException('Duplicate migration version: ' . $version);
            }
            $files[$version] = $path;
        }

        $expectedVersion = 1;
        foreach (array_keys($files) as $version) {
            if ($version !== sprintf('%04d', $expectedVersion)) {
                throw new RuntimeException(
                    sprintf('Migration version gap: expected %04d but found %s.', $expectedVersion, $version)
                );
            }
            $expectedVersion++;
        }

        return $files;
    }

    private function executeSqlFile(string $path): void
    {
        $sql = file_get_contents($path);
        if (!is_string($sql) || trim($sql) === '') {
            throw new RuntimeException('Migration file is empty or unreadable: ' . basename($path));
        }

        // Migration files contain complete SQL statements separated by semicolons.
        // Stored procedures and delimiter blocks are intentionally unsupported.
        foreach (explode(';', $sql) as $statement) {
            $statement = trim($statement);
            if ($statement !== '') {
                $this->pdo->exec($statement);
            }
        }
    }
}
