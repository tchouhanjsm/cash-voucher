<?php

declare(strict_types=1);

namespace Tests\Feature;

use CashVoucher\Api\Security\PasswordVerifier;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class UserAdminApiTest extends TestCase
{
    public function test_non_owners_cannot_list_or_mutate_user_accounts(): void
    {
        foreach (['staff', 'manager', 'accountant'] as $role) {
            $this->withRoleSession($role)
                ->getJson('/api/v1/users')
                ->assertForbidden()
                ->assertJsonPath('error.code', 'FORBIDDEN');
        }

        $this->withRoleSession('manager')
            ->postJson('/api/v1/users', [
                'name' => 'Blocked Account',
                'email' => 'blocked-account@example.test',
                'role' => 'staff',
                'temporaryPassword' => 'Temporary-Password-2026',
            ], ['Idempotency-Key' => 'user-manager-create'])
            ->assertForbidden();
        self::assertSame(0, DB::table('users')->where('email_normalized', 'blocked-account@example.test')->count());
    }

    public function test_owner_can_create_user_with_current_hash_format_and_idempotent_safe_response(): void
    {
        $owner = $this->withRoleSession('owner');
        $payload = [
            'name' => 'New Property Staff',
            'email' => 'new.staff@example.test',
            'role' => 'staff',
            'temporaryPassword' => 'Temporary-Password-2026',
        ];
        $key = 'user-create-'.bin2hex(random_bytes(5));

        $first = $owner->postJson('/api/v1/users', $payload, ['Idempotency-Key' => $key]);
        $first->assertCreated()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('data.replayed', false)
            ->assertJsonPath('data.user.name', 'New Property Staff')
            ->assertJsonPath('data.user.email', 'new.staff@example.test')
            ->assertJsonPath('data.user.role', 'staff')
            ->assertJsonPath('data.user.active', true)
            ->assertJsonPath('data.user.mustChangePassword', true)
            ->assertJsonMissingPath('data.user.password')
            ->assertJsonMissingPath('data.user.passwordHash')
            ->assertJsonMissingPath('data.user.temporaryPassword');

        $userId = (string) $first->json('data.user.id');
        self::assertNotSame('', $userId);
        $row = DB::table('users')->where('id', $userId)->first();
        self::assertNotNull($row);
        self::assertStringStartsWith('php-sha384$', (string) $row->password_hash);
        self::assertSame(1, (int) $row->must_change_password);
        self::assertTrue((new PasswordVerifier())->verify((string) $row->password_hash, $payload['temporaryPassword'], true)['valid']);

        $owner->postJson('/api/v1/users', $payload, ['Idempotency-Key' => $key])
            ->assertOk()
            ->assertJsonPath('data.replayed', true)
            ->assertJsonPath('data.user.id', $userId);

        self::assertSame(1, DB::table('users')->where('email_normalized', 'new.staff@example.test')->count());
        self::assertSame(
            1,
            DB::table('audit_events')->where('target_id', $userId)->where('event_type', 'USER_CREATED')->count(),
        );
        $event = DB::table('audit_events')->where('target_id', $userId)->where('event_type', 'USER_CREATED')->first();
        self::assertNotNull($event);
        self::assertStringNotContainsString($payload['temporaryPassword'], (string) $event->after_json);
        self::assertStringNotContainsString((string) $row->password_hash, (string) $event->after_json);
    }

    public function test_owner_can_update_user_and_role_or_active_change_revokes_sessions(): void
    {
        $owner = $this->withRoleSession('owner');
        $targetId = $this->createUser('staff');
        $sessionToken = bin2hex(random_bytes(32));
        $csrfToken = bin2hex(random_bytes(32));
        $sessionId = self::uuid();
        DB::table('user_sessions')->insert([
            'id' => $sessionId,
            'user_id' => $targetId,
            'session_token_hash' => hash('sha256', $sessionToken),
            'csrf_token_hash' => hash('sha256', $csrfToken),
            'created_at_utc' => now('UTC')->format('Y-m-d H:i:s'),
            'last_seen_at_utc' => now('UTC')->format('Y-m-d H:i:s'),
            'expires_at_utc' => now('UTC')->addHours(6)->format('Y-m-d H:i:s'),
            'revoked_at_utc' => null,
        ]);

        $updated = $owner->patchJson('/api/v1/users/'.$targetId, [
            'name' => 'Shift Supervisor',
            'email' => 'shift.supervisor@example.test',
            'role' => 'manager',
            'active' => true,
        ], ['Idempotency-Key' => 'user-update-role-'.bin2hex(random_bytes(4))]);

        $updated->assertOk()
            ->assertJsonPath('data.user.name', 'Shift Supervisor')
            ->assertJsonPath('data.user.role', 'manager')
            ->assertJsonPath('data.user.active', true);

        self::assertNotNull(DB::table('user_sessions')->where('id', $sessionId)->value('revoked_at_utc'));
        self::assertSame('manager', DB::table('users')->where('id', $targetId)->value('role'));
    }

    public function test_last_active_owner_cannot_be_deactivated_or_demoted(): void
    {
        $owner = $this->withRoleSession('owner');
        $ownerId = $this->userId;
        $email = (string) DB::table('users')->where('id', $ownerId)->value('email');

        $owner->patchJson('/api/v1/users/'.$ownerId, [
            'name' => 'Only Active Owner',
            'email' => $email,
            'role' => 'manager',
            'active' => true,
        ], ['Idempotency-Key' => 'user-demote-last-owner'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'LAST_ACTIVE_OWNER');

        $owner->patchJson('/api/v1/users/'.$ownerId, [
            'name' => 'Only Active Owner',
            'email' => $email,
            'role' => 'owner',
            'active' => false,
        ], ['Idempotency-Key' => 'user-disable-last-owner'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'LAST_ACTIVE_OWNER');

        self::assertSame(1, DB::table('users')->where('id', $ownerId)->value('is_active'));
        self::assertSame('owner', DB::table('users')->where('id', $ownerId)->value('role'));
    }

    public function test_owner_can_deactivate_one_owner_when_another_active_owner_remains(): void
    {
        $owner = $this->withRoleSession('owner');
        $ownerId = $this->userId;
        $secondOwner = $this->createUser('owner');
        $email = (string) DB::table('users')->where('id', $ownerId)->value('email');

        $owner->patchJson('/api/v1/users/'.$ownerId, [
            'name' => 'Former Owner',
            'email' => $email,
            'role' => 'owner',
            'active' => false,
        ], ['Idempotency-Key' => 'user-disable-nonlast-owner'])
            ->assertOk()
            ->assertJsonPath('data.user.active', false);

        self::assertSame(0, DB::table('users')->where('id', $ownerId)->value('is_active'));
        self::assertSame(1, DB::table('users')->where('id', $secondOwner)->value('is_active'));
        self::assertNotNull(
            DB::table('user_sessions')->where('user_id', $ownerId)->whereNotNull('revoked_at_utc')->first(),
        );
    }

    public function test_password_reset_requires_temporary_change_and_revokes_all_sessions(): void
    {
        $owner = $this->withRoleSession('owner');
        $created = $owner->postJson('/api/v1/users', [
            'name' => 'Reset Target',
            'email' => 'reset.target@example.test',
            'role' => 'staff',
            'temporaryPassword' => 'Initial-Password-2026',
        ], ['Idempotency-Key' => 'user-reset-create'])
            ->assertCreated();
        $targetId = (string) $created->json('data.user.id');

        $sessionId = self::uuid();
        DB::table('user_sessions')->insert([
            'id' => $sessionId,
            'user_id' => $targetId,
            'session_token_hash' => hash('sha256', bin2hex(random_bytes(32))),
            'csrf_token_hash' => hash('sha256', bin2hex(random_bytes(32))),
            'created_at_utc' => now('UTC')->format('Y-m-d H:i:s'),
            'last_seen_at_utc' => now('UTC')->format('Y-m-d H:i:s'),
            'expires_at_utc' => now('UTC')->addHours(6)->format('Y-m-d H:i:s'),
            'revoked_at_utc' => null,
        ]);

        $newPassword = 'Replacement-Password-2026';
        $owner->postJson('/api/v1/users/'.$targetId.'/password-reset', [
            'temporaryPassword' => $newPassword,
        ], ['Idempotency-Key' => 'user-reset-'.bin2hex(random_bytes(4))])
            ->assertOk()
            ->assertJsonPath('data.user.mustChangePassword', true);

        $row = DB::table('users')->where('id', $targetId)->first();
        self::assertNotNull($row);
        self::assertTrue((new PasswordVerifier())->verify((string) $row->password_hash, $newPassword, true)['valid']);
        self::assertSame(1, (int) $row->must_change_password);
        self::assertNotNull(DB::table('user_sessions')->where('id', $sessionId)->value('revoked_at_utc'));

        $event = DB::table('audit_events')->where('target_id', $targetId)->where('event_type', 'USER_PASSWORD_RESET')->first();
        self::assertNotNull($event);
        self::assertStringNotContainsString($newPassword, (string) $event->reason);
        self::assertStringNotContainsString((string) $row->password_hash, (string) $event->after_json);
    }

    public function test_duplicate_email_and_invalid_role_are_rejected_without_writes(): void
    {
        $owner = $this->withRoleSession('owner');
        $email = (string) DB::table('users')->where('id', $this->userId)->value('email');

        $owner->postJson('/api/v1/users', [
            'name' => 'Duplicate Email',
            'email' => strtoupper($email),
            'role' => 'staff',
            'temporaryPassword' => 'Temporary-Password-2026',
        ], ['Idempotency-Key' => 'user-duplicate-email'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'USER_EMAIL_EXISTS');

        $owner->postJson('/api/v1/users', [
            'name' => 'Unknown Role',
            'email' => 'unknown.role@example.test',
            'role' => 'admin',
            'temporaryPassword' => 'Temporary-Password-2026',
        ], ['Idempotency-Key' => 'user-invalid-role'])
            ->assertUnprocessable();

        self::assertSame(0, DB::table('users')->where('email_normalized', 'unknown.role@example.test')->count());
    }
}
