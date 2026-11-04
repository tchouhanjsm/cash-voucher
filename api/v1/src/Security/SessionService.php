<?php
declare(strict_types=1);

namespace CashVoucher\Api\Security;

use CashVoucher\Api\Http\Request;
use CashVoucher\Api\Support\ApiException;
use CashVoucher\Api\Support\Uuid;
use PDO;
use RuntimeException;

final class SessionService
{
    public const COOKIE_SESSION = 'cv_session';
    public const COOKIE_CSRF = 'cv_csrf';
    public const TTL_SECONDS = 21600;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array{sessionToken:string,csrfToken:string,sessionId:string,expiresAtUtc:string} */
    public function issueWithinTransaction(string $userId): array
    {
        if (!$this->pdo->inTransaction()) {
            throw new RuntimeException('Session creation must share the authentication transaction.');
        }

        $sessionToken = bin2hex(random_bytes(32));
        $csrfToken = bin2hex(random_bytes(32));
        $sessionId = Uuid::v4();

        $insert = $this->pdo->prepare(
            'INSERT INTO user_sessions
             (id, user_id, session_token_hash, csrf_token_hash,
              created_at_utc, last_seen_at_utc, expires_at_utc, revoked_at_utc)
             VALUES (:id, :user_id, :session_hash, :csrf_hash, UTC_TIMESTAMP(6),
                     UTC_TIMESTAMP(6), UTC_TIMESTAMP(6) + INTERVAL 6 HOUR, NULL)'
        );
        $insert->execute([
            'id' => $sessionId,
            'user_id' => $userId,
            'session_hash' => hash('sha256', $sessionToken),
            'csrf_hash' => hash('sha256', $csrfToken),
        ]);

        $expiry = $this->pdo->query(
            'SELECT DATE_FORMAT(UTC_TIMESTAMP(6) + INTERVAL 6 HOUR, "%Y-%m-%dT%H:%i:%s.%fZ")'
        )->fetchColumn();

        return [
            'sessionToken' => $sessionToken,
            'csrfToken' => $csrfToken,
            'sessionId' => $sessionId,
            'expiresAtUtc' => (string) $expiry,
        ];
    }

    /** @return array{id:string,name:string,email:string,role:string,mustChangePassword:bool,sessionId:string} */
    public function authenticate(Request $request, bool $requireCsrf): array
    {
        $token = $request->cookie(self::COOKIE_SESSION);
        if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) {
            throw new ApiException(401, 'SESSION_REQUIRED', 'Sign in to continue.');
        }

        $query = $this->pdo->prepare(
            'SELECT s.id AS session_id, s.csrf_token_hash, s.last_seen_at_utc,
                    u.id, u.full_name, u.email, u.role, u.is_active, u.must_change_password
             FROM user_sessions s
             INNER JOIN users u ON u.id = s.user_id
             WHERE s.session_token_hash = :token_hash
               AND s.revoked_at_utc IS NULL
               AND s.expires_at_utc > UTC_TIMESTAMP(6)
             LIMIT 1'
        );
        $query->execute(['token_hash' => hash('sha256', $token)]);
        $row = $query->fetch();

        if (!is_array($row)
            || (int) $row['is_active'] !== 1
            || !Role::isKnown((string) $row['role'])
        ) {
            if (is_array($row)) {
                $this->revokeAll((string) $row['id']);
            }
            throw new ApiException(401, 'SESSION_EXPIRED', 'Your session is no longer valid. Sign in again.');
        }

        if ($requireCsrf) {
            $csrfCookie = $request->cookie(self::COOKIE_CSRF);
            $csrfHeader = $request->headers['x-csrf-token'] ?? '';
            if (!is_string($csrfCookie)
                || !preg_match('/^[a-f0-9]{64}$/D', $csrfCookie)
                || !is_string($csrfHeader)
                || !hash_equals($csrfCookie, $csrfHeader)
                || !hash_equals((string) $row['csrf_token_hash'], hash('sha256', $csrfHeader))
            ) {
                throw new ApiException(403, 'CSRF_INVALID', 'The security token is missing or invalid. Refresh and try again.');
            }
        }

        $touch = $this->pdo->prepare(
            'UPDATE user_sessions SET last_seen_at_utc = UTC_TIMESTAMP(6)
             WHERE id = :id AND last_seen_at_utc < UTC_TIMESTAMP(6) - INTERVAL 5 MINUTE'
        );
        $touch->execute(['id' => $row['session_id']]);

        return [
            'id' => (string) $row['id'],
            'name' => (string) $row['full_name'],
            'email' => (string) $row['email'],
            'role' => (string) $row['role'],
            'mustChangePassword' => (int) $row['must_change_password'] === 1,
            'sessionId' => (string) $row['session_id'],
        ];
    }

    public function revokeSession(string $sessionId): void
    {
        $update = $this->pdo->prepare(
            'UPDATE user_sessions SET revoked_at_utc = UTC_TIMESTAMP(6)
             WHERE id = :id AND revoked_at_utc IS NULL'
        );
        $update->execute(['id' => $sessionId]);
    }

    public function revokeAll(string $userId): void
    {
        $update = $this->pdo->prepare(
            'UPDATE user_sessions SET revoked_at_utc = UTC_TIMESTAMP(6)
             WHERE user_id = :user_id AND revoked_at_utc IS NULL'
        );
        $update->execute(['user_id' => $userId]);
    }

    /** Must be called inside the caller's account mutation transaction. */
    public function revokeAllWithinTransaction(string $userId): void
    {
        if (!$this->pdo->inTransaction()) {
            throw new RuntimeException('Session revocation must share the account mutation transaction.');
        }
        $update = $this->pdo->prepare(
            'UPDATE user_sessions SET revoked_at_utc = UTC_TIMESTAMP(6)
             WHERE user_id = :user_id AND revoked_at_utc IS NULL'
        );
        $update->execute(['user_id' => $userId]);
    }

    /** @return array{0:string,1:string} Session and CSRF Set-Cookie values. */
    public static function issueCookieHeaders(string $sessionToken, string $csrfToken): array
    {
        if (!preg_match('/^[a-f0-9]{64}$/D', $sessionToken)
            || !preg_match('/^[a-f0-9]{64}$/D', $csrfToken)
        ) {
            throw new RuntimeException('Refusing to issue malformed session cookies.');
        }

        $common = 'Path=/api/v1; Max-Age=' . self::TTL_SECONDS . '; Secure; SameSite=Strict';
        return [
            self::COOKIE_SESSION . '=' . $sessionToken . '; ' . $common . '; HttpOnly',
            self::COOKIE_CSRF . '=' . $csrfToken . '; ' . $common,
        ];
    }

    /** @return array{0:string,1:string} Expired session and CSRF Set-Cookie values. */
    public static function clearCookieHeaders(): array
    {
        $common = 'Path=/api/v1; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Strict';
        return [
            self::COOKIE_SESSION . '=; ' . $common . '; HttpOnly',
            self::COOKIE_CSRF . '=; ' . $common,
        ];
    }
}
