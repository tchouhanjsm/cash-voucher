<?php

declare(strict_types=1);

namespace App\Modules\Users\Actions;

use CashVoucher\Api\Financial\IdempotencyService;
use CashVoucher\Api\Security\PasswordVerifier;
use CashVoucher\Api\Security\Role;
use CashVoucher\Api\Security\SessionService;
use CashVoucher\Api\Support\ApiException;
use CashVoucher\Api\Support\Uuid;
use PDO;
use PDOException;

final class UserAdministration
{
    private readonly PasswordVerifier $passwords;

    public function __construct()
    {
        $this->passwords = new PasswordVerifier();
    }

    /** @return array{items:list<array<string,mixed>>,count:int} */
    public function index(PDO $pdo): array
    {
        $query = $pdo->query(
            'SELECT id, full_name, email, role, is_active, must_change_password,
                    created_at_utc, updated_at_utc, last_login_at_utc
             FROM users
             ORDER BY full_name ASC, email_normalized ASC
             LIMIT 500'
        );
        $items = array_map(
            fn (array $row): array => $this->present($row),
            $query->fetchAll(PDO::FETCH_ASSOC),
        );

        return ['items' => $items, 'count' => count($items)];
    }

    /**
     * @param array<string,mixed> $input
     * @param array<string,mixed> $principal
     * @return array{data:array<string,mixed>,replayed:bool}
     */
    public function save(
        PDO $pdo,
        array $input,
        array $principal,
        string $idempotencyKey,
        ?string $userId = null,
    ): array {
        if ($userId !== null) {
            $this->requireUuid($userId);
        }

        $name = $this->name($input['name'] ?? null);
        $email = $this->email($input['email'] ?? null);
        $role = $this->role($input['role'] ?? null);
        $active = $userId === null ? true : $this->boolean($input['active'] ?? true);
        $temporaryPassword = '';
        if ($userId === null) {
            $temporaryPassword = $input['temporaryPassword'] ?? '';
            if (! is_string($temporaryPassword) || ! $this->passwords->isAcceptablePassword($temporaryPassword)) {
                throw new ApiException(422, 'PASSWORD_INVALID', 'Temporary password must be between 8 and 128 characters.');
            }
        }

        $payload = [
            'userId' => $userId,
            'name' => $name,
            'email' => $email,
            'role' => $role,
            'active' => $active,
            // IdempotencyService stores only the canonical payload hash, never this value.
            'temporaryPassword' => $temporaryPassword,
        ];

        return (new IdempotencyService($pdo))->execute(
            (string) $principal['id'],
            (string) $principal['email'],
            'saveUser',
            $idempotencyKey,
            $payload,
            function (PDO $connection) use (
                $userId,
                $name,
                $email,
                $role,
                $active,
                $temporaryPassword,
                $principal,
            ): array {
                // Serialize owner-count decisions with every other account mutation.
                $lockedUsers = $connection->query(
                    'SELECT id, role, is_active FROM users ORDER BY id FOR UPDATE'
                )->fetchAll(PDO::FETCH_ASSOC);
                $activeOwners = 0;
                foreach ($lockedUsers as $lockedUser) {
                    if ((string) $lockedUser['role'] === 'owner' && (int) $lockedUser['is_active'] === 1) {
                        $activeOwners++;
                    }
                }

                $duplicateSql = $userId === null
                    ? 'SELECT id FROM users WHERE email_normalized = :email LIMIT 1 FOR UPDATE'
                    : 'SELECT id FROM users WHERE email_normalized = :email AND id <> :user_id LIMIT 1 FOR UPDATE';
                $duplicate = $connection->prepare($duplicateSql);
                $duplicateParams = ['email' => $email];
                if ($userId !== null) {
                    $duplicateParams['user_id'] = $userId;
                }
                $duplicate->execute($duplicateParams);
                if ($duplicate->fetchColumn() !== false) {
                    throw new ApiException(409, 'USER_EMAIL_EXISTS', 'That email address is already assigned to a user.');
                }

                if ($userId === null) {
                    $newId = Uuid::v4();
                    $passwordHash = $this->passwords->hash($temporaryPassword);
                    try {
                        $insert = $connection->prepare(
                            'INSERT INTO users (
                                id, full_name, email, email_normalized, role, is_active,
                                password_hash, must_change_password, created_at_utc, updated_at_utc,
                                last_login_at_utc
                            ) VALUES (
                                :id, :name, :email, :email_normalized, :role, 1,
                                :password_hash, 1, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), NULL
                            )'
                        );
                        $insert->execute([
                            'id' => $newId,
                            'name' => $name,
                            'email' => $email,
                            'email_normalized' => $email,
                            'role' => $role,
                            'password_hash' => $passwordHash,
                        ]);
                    } catch (PDOException $exception) {
                        if ((int) ($exception->errorInfo[1] ?? 0) === 1062) {
                            throw new ApiException(409, 'USER_EMAIL_EXISTS', 'That email address is already assigned to a user.');
                        }
                        throw $exception;
                    }

                    $after = $this->load($connection, $newId);

                    return [
                        'user' => $after,
                        '_audit' => [
                            'eventType' => 'USER_CREATED',
                            'targetType' => 'user',
                            'targetId' => $newId,
                            'reason' => 'User account created; temporary password change required.',
                            'before' => null,
                        ],
                    ];
                }

                $existing = $this->loadForUpdate($connection, $userId);
                $before = $this->present($existing);
                $wasActive = (int) $existing['is_active'] === 1;
                $wasOwner = (string) $existing['role'] === 'owner' && $wasActive;
                $willBeOwner = $role === 'owner' && $active;
                if ($wasOwner && ! $willBeOwner && $activeOwners <= 1) {
                    throw new ApiException(409, 'LAST_ACTIVE_OWNER', 'At least one active Owner account must remain.');
                }

                try {
                    $update = $connection->prepare(
                        'UPDATE users
                         SET full_name = :name,
                             email = :email,
                             email_normalized = :email_normalized,
                             role = :role,
                             is_active = :active,
                             updated_at_utc = UTC_TIMESTAMP(6)
                         WHERE id = :id'
                    );
                    $update->execute([
                        'name' => $name,
                        'email' => $email,
                        'email_normalized' => $email,
                        'role' => $role,
                        'active' => $active ? 1 : 0,
                        'id' => $userId,
                    ]);
                } catch (PDOException $exception) {
                    if ((int) ($exception->errorInfo[1] ?? 0) === 1062) {
                        throw new ApiException(409, 'USER_EMAIL_EXISTS', 'That email address is already assigned to a user.');
                    }
                    throw $exception;
                }

                $roleChanged = (string) $existing['role'] !== $role;
                $activeChanged = $wasActive !== $active;
                if ($roleChanged || $activeChanged) {
                    (new SessionService($connection))->revokeAllWithinTransaction($userId);
                }

                $after = $this->load($connection, $userId);

                return [
                    'user' => $after,
                    '_audit' => [
                        'eventType' => 'USER_UPDATED',
                        'targetType' => 'user',
                        'targetId' => $userId,
                        'reason' => 'User account updated; role or active-state changes revoke existing sessions.',
                        'before' => $before,
                    ],
                ];
            },
            [
                'eventType' => $userId === null ? 'USER_CREATED' : 'USER_UPDATED',
                'targetType' => 'user',
                'targetId' => $userId ?? '',
                'reason' => 'Owner-managed user account change.',
            ],
        );
    }

    /**
     * @param array<string,mixed> $input
     * @param array<string,mixed> $principal
     * @return array{data:array<string,mixed>,replayed:bool}
     */
    public function resetPassword(
        PDO $pdo,
        string $userId,
        array $input,
        array $principal,
        string $idempotencyKey,
    ): array {
        $this->requireUuid($userId);
        $password = $input['temporaryPassword'] ?? null;
        if (! is_string($password) || ! $this->passwords->isAcceptablePassword($password)) {
            throw new ApiException(422, 'PASSWORD_INVALID', 'Temporary password must be between 8 and 128 characters.');
        }

        return (new IdempotencyService($pdo))->execute(
            (string) $principal['id'],
            (string) $principal['email'],
            'resetUserPassword',
            $idempotencyKey,
            ['userId' => $userId, 'temporaryPassword' => $password],
            function (PDO $connection) use ($userId, $password): array {
                $existing = $this->loadForUpdate($connection, $userId);
                $before = $this->present($existing);
                $hash = $this->passwords->hash($password);
                $update = $connection->prepare(
                    'UPDATE users
                     SET password_hash = :password_hash,
                         must_change_password = 1,
                         updated_at_utc = UTC_TIMESTAMP(6)
                     WHERE id = :id'
                );
                $update->execute(['password_hash' => $hash, 'id' => $userId]);
                if ($update->rowCount() !== 1) {
                    throw new ApiException(409, 'PASSWORD_RESET_FAILED', 'The temporary password could not be reset.');
                }

                (new SessionService($connection))->revokeAllWithinTransaction($userId);
                $after = $this->load($connection, $userId);

                return [
                    'user' => $after,
                    '_audit' => [
                        'eventType' => 'USER_PASSWORD_RESET',
                        'targetType' => 'user',
                        'targetId' => $userId,
                        'reason' => 'Temporary password reset; credential material intentionally excluded; all sessions revoked.',
                        'before' => ['mustChangePassword' => (bool) $before['mustChangePassword']],
                    ],
                ];
            },
            [
                'eventType' => 'USER_PASSWORD_RESET',
                'targetType' => 'user',
                'targetId' => $userId,
                'reason' => 'Temporary password reset; credential material intentionally excluded.',
            ],
        );
    }

    /** @return array<string,mixed> */
    private function load(PDO $pdo, string $id): array
    {
        $query = $pdo->prepare(
            'SELECT id, full_name, email, role, is_active, must_change_password,
                    created_at_utc, updated_at_utc, last_login_at_utc
             FROM users WHERE id = :id LIMIT 1'
        );
        $query->execute(['id' => $id]);
        $row = $query->fetch(PDO::FETCH_ASSOC);
        if (! is_array($row)) {
            throw new \RuntimeException('User row could not be reloaded.');
        }

        return $this->present($row);
    }

    /** @return array<string,mixed> */
    private function loadForUpdate(PDO $pdo, string $id): array
    {
        $query = $pdo->prepare(
            'SELECT id, full_name, email, role, is_active, must_change_password,
                    created_at_utc, updated_at_utc, last_login_at_utc
             FROM users WHERE id = :id LIMIT 1 FOR UPDATE'
        );
        $query->execute(['id' => $id]);
        $row = $query->fetch(PDO::FETCH_ASSOC);
        if (! is_array($row)) {
            throw new ApiException(404, 'USER_NOT_FOUND', 'The user could not be found.');
        }

        return $row;
    }

    /** @param array<string,mixed> $row @return array<string,mixed> */
    private function present(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'name' => (string) $row['full_name'],
            'email' => (string) $row['email'],
            'role' => (string) $row['role'],
            'active' => (int) $row['is_active'] === 1,
            'mustChangePassword' => (int) $row['must_change_password'] === 1,
            'createdAtUtc' => (string) $row['created_at_utc'],
            'updatedAtUtc' => (string) $row['updated_at_utc'],
            'lastLoginAtUtc' => $row['last_login_at_utc'] === null ? null : (string) $row['last_login_at_utc'],
        ];
    }

    private function name(mixed $value): string
    {
        if (! is_string($value)) {
            throw new ApiException(422, 'USER_NAME_INVALID', 'Enter a valid user name.');
        }
        $name = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
        if (
            $name === ''
            || mb_strlen($name, 'UTF-8') > 80
            || preg_match('/[\x00-\x1F\x7F-\x9F\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{206F}\x{FEFF}]/u', $name)
        ) {
            throw new ApiException(422, 'USER_NAME_INVALID', 'Enter a valid user name.');
        }

        return $name;
    }

    private function email(mixed $value): string
    {
        if (! is_string($value)) {
            throw new ApiException(422, 'USER_EMAIL_INVALID', 'Enter a valid email address.');
        }
        $email = strtolower(trim($value));
        if (strlen($email) > 254 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw new ApiException(422, 'USER_EMAIL_INVALID', 'Enter a valid email address.');
        }

        return $email;
    }

    private function role(mixed $value): string
    {
        if (! is_string($value) || ! Role::isKnown($value)) {
            throw new ApiException(422, 'USER_ROLE_INVALID', 'Choose one of the existing user roles.');
        }

        return $value;
    }

    private function boolean(mixed $value): bool
    {
        if (! is_bool($value)) {
            throw new ApiException(422, 'USER_ACTIVE_INVALID', 'Active state must be true or false.');
        }

        return $value;
    }

    private function requireUuid(string $value): void
    {
        if (! preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $value)) {
            throw new ApiException(422, 'USER_ID_INVALID', 'The user identifier is invalid.');
        }
    }
}
