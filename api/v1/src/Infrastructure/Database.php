<?php
declare(strict_types=1);

namespace CashVoucher\Api\Infrastructure;

use PDO;
use RuntimeException;
use Throwable;

final class Database
{
    public static function connectFromEnvironment(): PDO
    {
        return self::connect(
            self::required('CV_DB_USER'),
            self::required('CV_DB_PASSWORD')
        );
    }

    /** Schema changes use a different account from normal HTTP requests. */
    public static function connectForMigrations(): PDO
    {
        if (PHP_SAPI !== 'cli') {
            throw new RuntimeException('Schema migration credentials are available to CLI processes only.');
        }

        return self::connect(
            self::required('CV_MIGRATION_DB_USER'),
            self::required('CV_MIGRATION_DB_PASSWORD')
        );
    }

    private static function connect(string $username, string $password): PDO
    {
        $host = self::required('CV_DB_HOST');
        $database = self::required('CV_DB_NAME');
        $port = getenv('CV_DB_PORT') ?: '3306';

        if (!preg_match('/^[A-Za-z0-9._:-]{1,255}$/', $host)
            || !preg_match('/^[A-Za-z0-9_]{1,64}$/', $database)
            || !preg_match('/^[0-9]{1,5}$/', $port)
            || (int) $port < 1
            || (int) $port > 65535
        ) {
            throw new RuntimeException('Database connection configuration is invalid.');
        }

        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $host,
            (int) $port,
            $database
        );

        try {
            $pdo = new PDO($dsn, $username, $password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_PERSISTENT => false,
                PDO::ATTR_TIMEOUT => 5,
            ]);
            $pdo->exec("SET SESSION time_zone = '+00:00'");
            $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY'");
            return $pdo;
        } catch (Throwable $exception) {
            throw new RuntimeException('The database connection is unavailable.', 0, $exception);
        }
    }

    private static function required(string $name): string
    {
        $value = getenv($name);
        if (!is_string($value) || $value === '') {
            throw new RuntimeException('Required database configuration is missing: ' . $name);
        }
        return $value;
    }
}
