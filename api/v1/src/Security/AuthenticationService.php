<?php
declare(strict_types=1);

namespace CashVoucher\Api\Security;

use CashVoucher\Api\Http\Request;
use CashVoucher\Api\Support\ApiException;
use PDO;
use Throwable;

final class AuthenticationService
{
    private readonly AuthenticationRateLimiter $rateLimiter;
    private readonly PasswordVerifier $passwordVerifier;
    private readonly SessionService $sessions;

    public function __construct(private readonly PDO $pdo)
    {
        $this->rateLimiter = AuthenticationRateLimiter::fromEnvironment($pdo);
        $this->passwordVerifier = new PasswordVerifier();
        $this->sessions = new SessionService($pdo);
    }

    /** @return array{user:array<string,mixed>,sessionToken:string,csrfToken:string,expiresAtUtc:string} */
    public function login(Request $request): array
    {
        $email = $request->json['email'] ?? '';
        $password = $request->json['password'] ?? '';
        if (!is_string($email) || !is_string($password) || strlen($password) > 1024) {
            throw new ApiException(401, 'AUTH_FAILED', 'Invalid email or password.');
        }

        $email = strtolower(trim($email));
        $remoteAddress = $request->remoteAddress !== '' ? $request->remoteAddress : 'unknown';
        $subject = $this->rateLimiter->subjectHash('login', $email, $remoteAddress);
        $accountSubject = $this->rateLimiter->subjectHash('login-account', $email, '');
        $ipSubject = $this->rateLimiter->subjectHash('login-ip', '', $remoteAddress);
        if ($this->rateLimiter->isLocked($subject)
            || $this->rateLimiter->isLocked($accountSubject)
            || $this->rateLimiter->isLocked($ipSubject)
        ) {
            throw new ApiException(429, 'AUTH_RATE_LIMITED', 'Too many attempts. Try again in 15 minutes.');
        }

        $candidateEmail = filter_var($email, FILTER_VALIDATE_EMAIL) !== false && strlen($email) <= 254;
        $user = null;
        $verification = ['valid' => false, 'needsRehash' => false, 'legacy' => false];

        $this->pdo->beginTransaction();
        try {
            if ($candidateEmail) {
                $query = $this->pdo->prepare(
                    'SELECT id, full_name, email, role, is_active, password_hash,
                            must_change_password
                     FROM users WHERE email_normalized = :email LIMIT 1 FOR UPDATE'
                );
                $query->execute(['email' => $email]);
                $found = $query->fetch();
                if (is_array($found)) {
                    $user = $found;
                }
            }

            if (is_array($user)
                && (int) $user['is_active'] === 1
                && Role::isKnown((string) $user['role'])
            ) {
                $verification = $this->passwordVerifier->verify(
                    (string) $user['password_hash'],
                    $password,
                    (int) $user['must_change_password'] === 1
                );
            } else {
                $this->passwordVerifier->burnUnknownUserVerification($password);
            }

            if (!is_array($user)
                || (int) $user['is_active'] !== 1
                || !Role::isKnown((string) $user['role'])
                || !$verification['valid']
            ) {
                $this->pdo->rollBack();
                $locked = $this->rateLimiter->recordFailure($subject);
                $accountLocked = $this->rateLimiter->recordFailure($accountSubject);
                $ipLocked = $this->rateLimiter->recordFailure($ipSubject, 25);
                $this->writeAuthAudit(
                    is_array($user) ? (string) $user['id'] : null,
                    $email,
                    'AUTH_LOGIN_FAILED',
                    is_array($user) ? (string) $user['id'] : '',
                    'Invalid credentials; password value intentionally excluded.'
                );
                if ($locked || $accountLocked || $ipLocked) {
                    throw new ApiException(429, 'AUTH_RATE_LIMITED', 'Too many attempts. Try again in 15 minutes.');
                }
                throw new ApiException(401, 'AUTH_FAILED', 'Invalid email or password.');
            }

            if ($verification['needsRehash']) {
                $newHash = $this->passwordVerifier->hash($password);
                $upgrade = $this->pdo->prepare(
                    'UPDATE users SET password_hash = :password_hash, updated_at_utc = UTC_TIMESTAMP(6)
                     WHERE id = :id'
                );
                $upgrade->execute(['password_hash' => $newHash, 'id' => $user['id']]);
                $user['password_hash'] = $newHash;
            }

            $session = $this->sessions->issueWithinTransaction((string) $user['id']);
            $lastLogin = $this->pdo->prepare(
                'UPDATE users SET last_login_at_utc = UTC_TIMESTAMP(6), updated_at_utc = UTC_TIMESTAMP(6)
                 WHERE id = :id AND is_active = 1'
            );
            $lastLogin->execute(['id' => $user['id']]);
            if ($lastLogin->rowCount() !== 1) {
                throw new ApiException(401, 'AUTH_FAILED', 'Invalid email or password.');
            }

            $this->rateLimiter->resetWithinTransaction($subject);
            $this->rateLimiter->resetWithinTransaction($accountSubject);
            $this->rateLimiter->resetWithinTransaction($ipSubject);
            $this->writeAuthAudit(
                (string) $user['id'],
                (string) $user['email'],
                'AUTH_LOGIN_SUCCESS',
                (string) $user['id'],
                $verification['legacy'] ? 'Legacy credential verified and upgraded.' : 'Password authentication succeeded.'
            );
            $this->pdo->commit();

            return [
                'user' => [
                    'id' => (string) $user['id'],
                    'name' => (string) $user['full_name'],
                    'email' => (string) $user['email'],
                    'role' => (string) $user['role'],
                    'active' => true,
                    'mustChangePassword' => (int) $user['must_change_password'] === 1,
                ],
                'sessionToken' => $session['sessionToken'],
                'csrfToken' => $session['csrfToken'],
                'expiresAtUtc' => $session['expiresAtUtc'],
            ];
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }

    /** @param array<string, mixed> $principal */
    public function logout(array $principal): void
    {
        $this->pdo->beginTransaction();
        try {
            $this->sessions->revokeSession((string) $principal['sessionId']);
            $this->writeAuthAudit(
                (string) $principal['id'],
                (string) $principal['email'],
                'AUTH_LOGOUT',
                (string) $principal['id'],
                'User session ended.'
            );
            $this->pdo->commit();
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }

    /**
     * Password changes revoke every current session, including the caller.
     * The client must sign in again using the new password.
     *
     * @param array<string, mixed> $principal
     */
    public function changePassword(array $principal, Request $request): void
    {
        $oldPassword = $request->json['oldPassword'] ?? '';
        $newPassword = $request->json['newPassword'] ?? '';
        if (!is_string($oldPassword) || !is_string($newPassword)
            || strlen($oldPassword) > 1024 || strlen($newPassword) > 1024
        ) {
            throw new ApiException(422, 'PASSWORD_INVALID', 'The password details are invalid.');
        }

        $remoteAddress = $request->remoteAddress !== '' ? $request->remoteAddress : 'unknown';
        $subject = $this->rateLimiter->subjectHash(
            'password-change',
            (string) $principal['id'],
            $remoteAddress
        );
        if ($this->rateLimiter->isLocked($subject)) {
            throw new ApiException(429, 'PASSWORD_RATE_LIMITED', 'Too many attempts. Try again in 15 minutes.');
        }

        $this->pdo->beginTransaction();
        try {
            $query = $this->pdo->prepare(
                'SELECT password_hash, must_change_password FROM users
                 WHERE id = :id AND is_active = 1 FOR UPDATE'
            );
            $query->execute(['id' => $principal['id']]);
            $user = $query->fetch();
            if (!is_array($user)) {
                throw new ApiException(401, 'SESSION_EXPIRED', 'Your session is no longer valid. Sign in again.');
            }

            $verification = $this->passwordVerifier->verify(
                (string) $user['password_hash'],
                $oldPassword,
                (int) $user['must_change_password'] === 1
            );
            if (!$verification['valid']) {
                $this->pdo->rollBack();
                $locked = $this->rateLimiter->recordFailure($subject);
                $this->writeAuthAudit(
                    (string) $principal['id'],
                    (string) $principal['email'],
                    'AUTH_PASSWORD_CHANGE_FAILED',
                    (string) $principal['id'],
                    'Invalid current password; credential value intentionally excluded.'
                );
                if ($locked) {
                    throw new ApiException(429, 'PASSWORD_RATE_LIMITED', 'Too many attempts. Try again in 15 minutes.');
                }
                throw new ApiException(401, 'CURRENT_PASSWORD_INVALID', 'The current password is incorrect.');
            }

            if (!$this->passwordVerifier->isAcceptablePassword($newPassword)) {
                throw new ApiException(422, 'PASSWORD_INVALID', 'New password must be between 8 and 128 characters.');
            }
            if (hash_equals($oldPassword, $newPassword)) {
                throw new ApiException(422, 'PASSWORD_UNCHANGED', 'Choose a password different from the current password.');
            }

            $newHash = $this->passwordVerifier->hash($newPassword);
            $update = $this->pdo->prepare(
                'UPDATE users SET password_hash = :password_hash,
                    must_change_password = 0, updated_at_utc = UTC_TIMESTAMP(6)
                 WHERE id = :id'
            );
            $update->execute(['password_hash' => $newHash, 'id' => $principal['id']]);
            if ($update->rowCount() !== 1) {
                throw new ApiException(409, 'PASSWORD_NOT_CHANGED', 'The password could not be updated.');
            }

            $this->sessions->revokeAllWithinTransaction((string) $principal['id']);
            $this->rateLimiter->resetWithinTransaction($subject);
            $this->writeAuthAudit(
                (string) $principal['id'],
                (string) $principal['email'],
                'AUTH_PASSWORD_CHANGED',
                (string) $principal['id'],
                'Password changed; all existing sessions revoked.'
            );
            $this->pdo->commit();
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }

    private function writeAuthAudit(
        ?string $actorUserId,
        string $actorEmail,
        string $eventType,
        string $targetId,
        string $reason
    ): void {
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) {
            $this->pdo->beginTransaction();
        }

        try {
            $insert = $this->pdo->prepare(
            'INSERT INTO audit_events
             (id, actor_user_id, actor_email_snapshot, event_type, target_type,
              target_id, reason, occurred_at_utc)
             VALUES (:id, :actor, :email, :event, :target_type, :target_id, :reason, UTC_TIMESTAMP(6))'
        );
        $insert->execute([
            'id' => \CashVoucher\Api\Support\Uuid::v4(),
            'actor' => $actorUserId,
            'email' => substr($actorEmail, 0, 254),
            'event' => $eventType,
            'target_type' => 'user',
            'target_id' => substr($targetId, 0, 128),
            'reason' => $reason,
            ]);
            if ($ownsTransaction) {
                $this->pdo->commit();
            }
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }
}
