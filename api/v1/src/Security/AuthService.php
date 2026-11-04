<?php
declare(strict_types=1);

namespace CashVoucher\Api\Security;

use CashVoucher\Api\Financial\AuditWriter;
use CashVoucher\Api\Support\ApiException;
use CashVoucher\Api\Support\Uuid;
use PDO;
use Throwable;

final class AuthService
{
    public const SESSION_TTL_SECONDS = 21_600;
    private const MAX_FAILED_ATTEMPTS = 5;
    private const LOCK_SECONDS = 900;
    private const DUMMY_HASH = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

    public function __construct(
        private readonly PDO $pdo,
        private readonly string $throttleSecret,
        private readonly ?string $legacyPepper,
        private readonly bool $allowLegacyShortCredential
    ) {
        if (strlen($this->throttleSecret) < 32) {
            throw new \InvalidArgumentException('The authentication throttle secret must contain at least 32 bytes.');
        }
    }

    public static function fromEnvironment(PDO $pdo): self
    {
        $secret = getenv('CV_AUTH_THROTTLE_SECRET');
        if (!is_string($secret) || strlen($secret) < 32) {
            throw new \RuntimeException('The authentication throttle secret is not configured.');
        }
        $legacyPepper = getenv('CV_LEGACY_AUTH_PEPPER');
        $marker = getenv('CV_LEGACY_SHORT_CREDENTIAL_MIGRATION');

        return new self(
            $pdo,
            $secret,
            is_string($legacyPepper) && $legacyPepper !== '' ? $legacyPepper : null,
            $marker === 'PIN_TO_PASSWORD_V1'
        );
    }

    /**
     * @return array{
     *   sessionToken:string,
     *   csrfToken:string,
     *   expiresIn:int,
     *   user:array<string, mixed>
     * }
     */
    public function login(string $email, string $password, string $remoteAddress): array
    {
        $normalizedEmail = strtolower(trim($email));
        if (strlen($normalizedEmail) > 254) {
            $normalizedEmail = substr($normalizedEmail, 0, 254);
        }
        $validEmail = filter_var($normalizedEmail, FILTER_VALIDATE_EMAIL) !== false;
        $subjects = $this->rateLimitSubjects($normalizedEmail, $remoteAddress);

        $this->pdo->beginTransaction();
        try {
            $lockedRows = $this->lockRateLimitRows($subjects);
            foreach ($lockedRows as $row) {
                if ($row['locked']) {
                    $this->pdo->commit();
                    throw new ApiException(
                        429,
                        'LOGIN_THROTTLED',
                        'Too many sign-in attempts. Try again in 15 minutes.'
                    );
                }
            }

            $user = null;
            if ($validEmail) {
                $query = $this->pdo->prepare(
                    'SELECT id, full_name, email, email_normalized, role, is_active,
                            password_hash, must_change_password
                     FROM users
                     WHERE email_normalized = :email
                     LIMIT 1
                     FOR UPDATE'
                );
                $query->execute(['email' => $normalizedEmail]);
                $found = $query->fetch();
                $user = is_array($found) ? $found : null;
            }

            $userActive = is_array($user) && (int) $user['is_active'] === 1;
            $passwordHash = is_array($user) ? (string) $user['password_hash'] : self::DUMMY_HASH;
            $mustChange = is_array($user) && (int) $user['must_change_password'] === 1;
            $verification = PasswordHasher::verify(
                $password,
                $passwordHash,
                $this->legacyPepper,
                $mustChange,
                $this->allowLegacyShortCredential
            );

            $role = is_array($user) ? (string) $user['role'] : '';
            $eligible = $userActive && $verification['valid'] && Role::isKnown($role);
            if (!$eligible) {
                $this->recordFailedAttempt($lockedRows);
                $this->pdo->commit();
                throw new ApiException(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
            }

            if (is_string($verification['upgradedHash'])) {
                $upgrade = $this->pdo->prepare(
                    'UPDATE users SET password_hash = :password_hash, updated_at_utc = UTC_TIMESTAMP(6)
                     WHERE id = :id'
                );
                $upgrade->execute([
                    'password_hash' => $verification['upgradedHash'],
                    'id' => $user['id'],
                ]);
                $user['password_hash'] = $verification['upgradedHash'];
            }

            $resetAttempts = $this->pdo->prepare(
                'UPDATE login_attempts
                 SET attempt_count = 0, locked_until_utc = NULL,
                     window_started_at_utc = UTC_TIMESTAMP(6), updated_at_utc = UTC_TIMESTAMP(6)
                 WHERE subject_hash = :subject_hash'
            );
            foreach ($lockedRows as $row) {
                $resetAttempts->execute(['subject_hash' => $row['subject_hash']]);
            }

            $sessionToken = bin2hex(random_bytes(32));
            $csrfToken = bin2hex(random_bytes(32));
            $sessionId = Uuid::v4();
            $createSession = $this->pdo->prepare(
                'INSERT INTO user_sessions
                 (id, user_id, session_token_hash, csrf_token_hash, created_at_utc,
                  last_seen_at_utc, expires_at_utc, revoked_at_utc)
                 VALUES (:id, :user_id, :session_hash, :csrf_hash, UTC_TIMESTAMP(6),
                         UTC_TIMESTAMP(6), DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 21600 SECOND), NULL)'
            );
            $createSession->execute([
                'id' => $sessionId,
                'user_id' => $user['id'],
                'session_hash' => hash('sha256', $sessionToken),
                'csrf_hash' => hash('sha256', $csrfToken),
            ]);

            $lastLogin = $this->pdo->prepare(
                'UPDATE users SET last_login_at_utc = UTC_TIMESTAMP(6), updated_at_utc = UTC_TIMESTAMP(6)
                 WHERE id = :id'
            );
            $lastLogin->execute(['id' => $user['id']]);

            AuditWriter::append(
                $this->pdo,
                (string) $user['id'],
                (string) $user['email'],
                [
                    'eventType' => 'LOGIN_SUCCESS',
                    'targetType' => 'user_session',
                    'targetId' => $sessionId,
                    'reason' => 'Authenticated session created',
                    'after' => ['role' => $role],
                ]
            );

            $this->pdo->commit();

            return [
                'sessionToken' => $sessionToken,
                'csrfToken' => $csrfToken,
                'expiresIn' => self::SESSION_TTL_SECONDS,
                'user' => [
                    'id' => (string) $user['id'],
                    'name' => (string) $user['full_name'],
                    'email' => (string) $user['email'],
                    'role' => $role,
                    'active' => true,
                    'mustChangePassword' => $mustChange,
                    'capabilities' => Role::capabilities($role),
                ],
            ];
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }

    /** @param array<string, mixed> $principal */
    public function changePassword(
        array $principal,
        string $currentPassword,
        string $newPassword
    ): void {
        PasswordHasher::assertNewPassword($newPassword);
        if (hash_equals($currentPassword, $newPassword)) {
            throw new ApiException(422, 'PASSWORD_UNCHANGED', 'Choose a different password.');
        }

        $this->pdo->beginTransaction();
        try {
            $query = $this->pdo->prepare(
                'SELECT id, email, role, is_active, password_hash, must_change_password
                 FROM users WHERE id = :id FOR UPDATE'
            );
            $query->execute(['id' => $principal['id']]);
            $user = $query->fetch();
            if (!is_array($user) || (int) $user['is_active'] !== 1) {
                throw new ApiException(401, 'SESSION_EXPIRED', 'Please sign in again.');
            }

            $verification = PasswordHasher::verify(
                $currentPassword,
                (string) $user['password_hash'],
                $this->legacyPepper,
                (int) $user['must_change_password'] === 1,
                $this->allowLegacyShortCredential
            );
            if (!$verification['valid']) {
                throw new ApiException(401, 'CURRENT_PASSWORD_INVALID', 'Current password is incorrect.');
            }

            $newHash = PasswordHasher::hash($newPassword);
            $update = $this->pdo->prepare(
                'UPDATE users
                 SET password_hash = :password_hash,
                     must_change_password = 0,
                     updated_at_utc = UTC_TIMESTAMP(6)
                 WHERE id = :id'
            );
            $update->execute(['password_hash' => $newHash, 'id' => $user['id']]);

            $revoke = $this->pdo->prepare(
                'UPDATE user_sessions
                 SET revoked_at_utc = UTC_TIMESTAMP(6)
                 WHERE user_id = :user_id AND revoked_at_utc IS NULL'
            );
            $revoke->execute(['user_id' => $user['id']]);

            AuditWriter::append(
                $this->pdo,
                (string) $user['id'],
                (string) $user['email'],
                [
                    'eventType' => 'PASSWORD_CHANGED',
                    'targetType' => 'user',
                    'targetId' => (string) $user['id'],
                    'reason' => 'Password changed; all active sessions revoked',
                ]
            );

            $this->pdo->commit();
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }

    /** @return list<string> */
    private function rateLimitSubjects(string $email, string $remoteAddress): array
    {
        $subjects = [
            hash_hmac('sha256', 'email:' . $email, $this->throttleSecret),
        ];
        if (filter_var($remoteAddress, FILTER_VALIDATE_IP) !== false) {
            $subjects[] = hash_hmac('sha256', 'ip:' . $remoteAddress, $this->throttleSecret);
        }
        $subjects = array_values(array_unique($subjects));
        sort($subjects, SORT_STRING);
        return $subjects;
    }

    /**
     * @param list<string> $subjects
     * @return list<array{subject_hash:string,attempt_count:int,locked:bool}>
     */
    private function lockRateLimitRows(array $subjects): array
    {
        $insert = $this->pdo->prepare(
            'INSERT IGNORE INTO login_attempts
             (subject_hash, window_started_at_utc, attempt_count, locked_until_utc, updated_at_utc)
             VALUES (:subject_hash, UTC_TIMESTAMP(6), 0, NULL, UTC_TIMESTAMP(6))'
        );
        $select = $this->pdo->prepare(
            'SELECT attempt_count,
                    (locked_until_utc IS NOT NULL AND locked_until_utc > UTC_TIMESTAMP(6)) AS is_locked,
                    (window_started_at_utc <= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 15 MINUTE)) AS window_expired
             FROM login_attempts WHERE subject_hash = :subject_hash FOR UPDATE'
        );
        $reset = $this->pdo->prepare(
            'UPDATE login_attempts
             SET attempt_count = 0, locked_until_utc = NULL,
                 window_started_at_utc = UTC_TIMESTAMP(6), updated_at_utc = UTC_TIMESTAMP(6)
             WHERE subject_hash = :subject_hash'
        );

        $rows = [];
        foreach ($subjects as $subject) {
            $insert->execute(['subject_hash' => $subject]);
            $select->execute(['subject_hash' => $subject]);
            $row = $select->fetch();
            if (!is_array($row)) {
                throw new \RuntimeException('The sign-in rate-limit record could not be locked.');
            }
            $expired = (int) $row['window_expired'] === 1;
            if ($expired) {
                $reset->execute(['subject_hash' => $subject]);
            }
            $rows[] = [
                'subject_hash' => $subject,
                'attempt_count' => $expired ? 0 : (int) $row['attempt_count'],
                'locked' => !$expired && (int) $row['is_locked'] === 1,
            ];
        }
        return $rows;
    }

    /** @param list<array{subject_hash:string,attempt_count:int,locked:bool}> $rows */
    private function recordFailedAttempt(array $rows): void
    {
        $update = $this->pdo->prepare(
            'UPDATE login_attempts
             SET attempt_count = :attempt_count,
                 locked_until_utc = CASE
                     WHEN :should_lock = 1 THEN DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 15 MINUTE)
                     ELSE NULL
                 END,
                 updated_at_utc = UTC_TIMESTAMP(6)
             WHERE subject_hash = :subject_hash'
        );
        foreach ($rows as $row) {
            $next = $row['attempt_count'] + 1;
            $update->execute([
                'attempt_count' => $next,
                'should_lock' => $next >= self::MAX_FAILED_ATTEMPTS ? 1 : 0,
                'subject_hash' => $row['subject_hash'],
            ]);
        }
    }
}
