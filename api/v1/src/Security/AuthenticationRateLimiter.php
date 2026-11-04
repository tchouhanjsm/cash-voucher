<?php
declare(strict_types=1);

namespace CashVoucher\Api\Security;

use PDO;
use RuntimeException;

final class AuthenticationRateLimiter
{
    private const WINDOW_MINUTES = 15;
    private const MAX_ATTEMPTS = 5;

    public function __construct(
        private readonly PDO $pdo,
        private readonly string $key
    ) {
        if (strlen($key) < 32) {
            throw new RuntimeException('The authentication rate-limit key must contain at least 32 characters.');
        }
    }

    public static function fromEnvironment(PDO $pdo): self
    {
        $key = getenv('CV_AUTH_RATE_LIMIT_KEY');
        if (!is_string($key) || strlen($key) < 32) {
            throw new RuntimeException('Authentication rate limiting is not configured.');
        }
        return new self($pdo, $key);
    }

    public function subjectHash(string $purpose, string $identity, string $remoteAddress): string
    {
        return hash_hmac('sha256', $purpose . "\0" . $identity . "\0" . $remoteAddress, $this->key);
    }

    public function isLocked(string $subjectHash): bool
    {
        $query = $this->pdo->prepare(
            'SELECT locked_until_utc > UTC_TIMESTAMP(6)
             FROM login_attempts WHERE subject_hash = :subject_hash'
        );
        $query->execute(['subject_hash' => $subjectHash]);
        return (int) $query->fetchColumn() === 1;
    }

    public function recordFailure(string $subjectHash, int $maxAttempts = self::MAX_ATTEMPTS): bool
    {
        if ($maxAttempts < 1 || $maxAttempts > 100) {
            throw new RuntimeException('The authentication attempt limit is invalid.');
        }
        $this->pdo->beginTransaction();
        try {
            $insert = $this->pdo->prepare(
                'INSERT IGNORE INTO login_attempts
                 (subject_hash, window_started_at_utc, attempt_count, locked_until_utc, updated_at_utc)
                 VALUES (:subject_hash, UTC_TIMESTAMP(6), 0, NULL, UTC_TIMESTAMP(6))'
            );
            $insert->execute(['subject_hash' => $subjectHash]);

            $select = $this->pdo->prepare(
                'SELECT window_started_at_utc, attempt_count,
                        (window_started_at_utc <= UTC_TIMESTAMP(6) - INTERVAL 15 MINUTE) AS window_expired,
                        (locked_until_utc > UTC_TIMESTAMP(6)) AS is_locked
                 FROM login_attempts WHERE subject_hash = :subject_hash FOR UPDATE'
            );
            $select->execute(['subject_hash' => $subjectHash]);
            $row = $select->fetch();
            if (!is_array($row)) {
                throw new RuntimeException('The authentication throttle could not be read.');
            }
            if ((int) $row['is_locked'] === 1) {
                $this->pdo->commit();
                return true;
            }

            $expired = (int) $row['window_expired'] === 1;
            $attempts = ($expired ? 0 : (int) $row['attempt_count']) + 1;
            $locked = $attempts >= $maxAttempts;
            $update = $this->pdo->prepare(
                'UPDATE login_attempts
                 SET window_started_at_utc = IF(:expired = 1, UTC_TIMESTAMP(6), window_started_at_utc),
                     attempt_count = :attempt_count,
                     locked_until_utc = IF(:locked = 1, UTC_TIMESTAMP(6) + INTERVAL 15 MINUTE, NULL),
                     updated_at_utc = UTC_TIMESTAMP(6)
                 WHERE subject_hash = :subject_hash'
            );
            $update->execute([
                'expired' => $expired ? 1 : 0,
                'attempt_count' => $attempts,
                'locked' => $locked ? 1 : 0,
                'subject_hash' => $subjectHash,
            ]);
            $this->pdo->commit();
            return $locked;
        } catch (\Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }

    /** Call within the caller's successful-authentication transaction. */
    public function resetWithinTransaction(string $subjectHash): void
    {
        if (!$this->pdo->inTransaction()) {
            throw new RuntimeException('Authentication throttle reset must share the login transaction.');
        }
        $update = $this->pdo->prepare(
            'UPDATE login_attempts SET attempt_count = 0, locked_until_utc = NULL,
             window_started_at_utc = UTC_TIMESTAMP(6), updated_at_utc = UTC_TIMESTAMP(6)
             WHERE subject_hash = :subject_hash'
        );
        $update->execute(['subject_hash' => $subjectHash]);
    }
}
