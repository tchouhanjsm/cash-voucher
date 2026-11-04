<?php
declare(strict_types=1);

namespace CashVoucher\Api\Security;

use CashVoucher\Api\Financial\AuditWriter;
use CashVoucher\Api\Support\ApiException;
use PDO;
use RuntimeException;
use Throwable;

final class SessionService
{
    public const COOKIE_NAME = 'cv_session';
    public const CSRF_COOKIE_NAME = 'cv_csrf';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<string, mixed> */
    public function authenticate(string $sessionToken): array
    {
        if (!preg_match('/^[a-f0-9]{64}$/D', $sessionToken)) {
            throw new ApiException(401, 'SESSION_REQUIRED', 'Please sign in again.');
        }

        $query = $this->pdo->prepare(
            'SELECT
                s.id AS session_id,
                s.csrf_token_hash,
                s.expires_at_utc,
                s.last_seen_at_utc,
                u.id,
                u.full_name,
                u.email,
                u.role,
                u.is_active,
                u.must_change_password
             FROM user_sessions s
             INNER JOIN users u ON u.id = s.user_id
             WHERE s.session_token_hash = :token_hash
               AND s.revoked_at_utc IS NULL
               AND s.expires_at_utc > UTC_TIMESTAMP(6)
             LIMIT 1'
        );
        $query->execute(['token_hash' => hash('sha256', $sessionToken)]);
        $row = $query->fetch();

        if (!is_array($row) || (int) $row['is_active'] !== 1) {
            throw new ApiException(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
        }

        $role = (string) $row['role'];
        if (!Role::isKnown($role)) {
            throw new ApiException(403, 'ROLE_UNAVAILABLE', 'This account role is not supported.');
        }

        $lastSeen = strtotime((string) $row['last_seen_at_utc'] . ' UTC');
        if ($lastSeen === false || $lastSeen <= time() - 300) {
            $touch = $this->pdo->prepare(
                'UPDATE user_sessions
                 SET last_seen_at_utc = UTC_TIMESTAMP(6)
                 WHERE id = :id AND revoked_at_utc IS NULL AND expires_at_utc > UTC_TIMESTAMP(6)'
            );
            $touch->execute(['id' => $row['session_id']]);
        }

        return [
            'sessionId' => (string) $row['session_id'],
            'csrfTokenHash' => (string) $row['csrf_token_hash'],
            'expiresAtUtc' => (string) $row['expires_at_utc'],
            'id' => (string) $row['id'],
            'name' => (string) $row['full_name'],
            'email' => (string) $row['email'],
            'role' => $role,
            'active' => true,
            'mustChangePassword' => (int) $row['must_change_password'] === 1,
            'capabilities' => Role::capabilities($role),
        ];
    }

    public function assertCsrf(array $principal, string $headerToken, string $cookieToken): void
    {
        if ($headerToken === ''
            || $cookieToken === ''
            || !preg_match('/^[a-f0-9]{64}$/D', $headerToken)
            || !hash_equals($cookieToken, $headerToken)
            || !hash_equals(
                (string) ($principal['csrfTokenHash'] ?? ''),
                hash('sha256', $cookieToken)
            )
        ) {
            throw new ApiException(403, 'CSRF_INVALID', 'The request security token is invalid. Refresh and try again.');
        }
    }

    /** @param array<string, mixed> $principal */
    public function logout(array $principal): void
    {
        $this->pdo->beginTransaction();
        try {
            $revoke = $this->pdo->prepare(
                'UPDATE user_sessions
                 SET revoked_at_utc = UTC_TIMESTAMP(6)
                 WHERE id = :id AND revoked_at_utc IS NULL'
            );
            $revoke->execute(['id' => $principal['sessionId']]);
            if ($revoke->rowCount() !== 1) {
                throw new ApiException(401, 'SESSION_EXPIRED', 'Your session has already ended.');
            }

            AuditWriter::append(
                $this->pdo,
                (string) $principal['id'],
                (string) $principal['email'],
                [
                    'eventType' => 'LOGOUT',
                    'targetType' => 'user_session',
                    'targetId' => (string) $principal['sessionId'],
                    'reason' => 'User signed out',
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

    /** @return array<string, mixed> */
    public static function publicUser(array $principal): array
    {
        return [
            'id' => $principal['id'],
            'name' => $principal['name'],
            'email' => $principal['email'],
            'role' => $principal['role'],
            'active' => true,
            'mustChangePassword' => $principal['mustChangePassword'],
            'capabilities' => $principal['capabilities'],
        ];
    }
}
