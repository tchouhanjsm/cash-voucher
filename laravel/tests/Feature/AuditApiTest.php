<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class AuditApiTest extends TestCase
{
    public function test_only_owner_can_browse_audit_events_or_voucher_history(): void
    {
        foreach (['staff', 'manager', 'accountant'] as $role) {
            $this->withRoleSession($role)
                ->getJson('/api/v1/audit-events')
                ->assertForbidden();
        }

        $this->withRoleSession('manager')
            ->getJson('/api/v1/vouchers/'.self::uuid().'/history')
            ->assertForbidden();
    }

    public function test_owner_audit_browser_is_keyset_paginated_and_redacts_credential_fields(): void
    {
        $owner = $this->withRoleSession('owner');
        $this->insertAuditFixture('USER_CREATED', 'user', self::uuid(), [
            'name' => 'Older safe event',
        ]);
        $this->insertAuditFixture('USER_UPDATED', 'user', self::uuid(), [
            'name' => 'Latest safe event',
            'password_hash' => 'should-not-be-visible',
            'nested' => ['sessionToken' => 'hidden-session-token'],
            'temporaryPassword' => 'should-not-be-visible-either',
        ]);

        $first = $owner->getJson('/api/v1/audit-events?limit=1');
        $first->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.hasMore', true);
        $item = $first->json('data.items.0');
        self::assertSame('[REDACTED]', $item['after']['password_hash']);
        self::assertSame('[REDACTED]', $item['after']['nested']['sessionToken']);
        self::assertSame('[REDACTED]', $item['after']['temporaryPassword']);

        $cursor = (string) $first->json('data.nextCursor');
        self::assertNotSame('', $cursor);
        $second = $owner->getJson('/api/v1/audit-events?limit=1&cursor='.rawurlencode($cursor));
        $second->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.hasMore', false);
        self::assertNotSame($first->json('data.items.0.id'), $second->json('data.items.0.id'));
    }

    public function test_audit_cursor_and_page_size_are_validated(): void
    {
        $this->withRoleSession('owner')
            ->getJson('/api/v1/audit-events?limit=101')
            ->assertUnprocessable();

        $this->withLegacySession()
            ->getJson('/api/v1/audit-events?cursor=not-a-valid-cursor')
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'AUDIT_CURSOR_INVALID');
    }

    public function test_owner_can_read_bounded_voucher_history_by_stable_id(): void
    {
        $owner = $this->withRoleSession('owner');
        $voucherId = $this->insertVoucherFixture($this->userId, 'History Supplier', 25000);
        $this->insertAuditFixture('VOUCHER_UPDATED', 'voucher', $voucherId, [
            'vendor' => 'History Supplier',
            'password' => 'not-relevant-secret',
        ]);

        $owner->getJson('/api/v1/vouchers/'.$voucherId.'/history?limit=10')
            ->assertOk()
            ->assertJsonPath('data.voucher.id', $voucherId)
            ->assertJsonPath('data.voucher.vendor', 'History Supplier')
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.items.0.after.password', '[REDACTED]');

        $owner->getJson('/api/v1/vouchers/'.self::uuid().'/history')
            ->assertNotFound();
    }

    public function test_voucher_history_filters_structured_events_by_source_event_category(): void
    {
        $owner = $this->withRoleSession('owner');
        $voucherId = $this->insertVoucherFixture($this->userId, 'Filtered History Supplier', 25000);
        $this->insertAuditFixture('VOUCHER_CREATED', 'voucher', $voucherId, [
            'vendor' => 'Filtered History Supplier',
        ]);
        $this->insertAuditFixture('VOUCHER_UPDATED', 'voucher', $voucherId, [
            'vendor' => 'Updated History Supplier',
        ]);

        $created = $owner->getJson('/api/v1/vouchers/'.$voucherId.'/history?eventCategory=CREATED');
        $created->assertOk()
            ->assertJsonPath('data.source', 'laravel-sql-audit-events')
            ->assertJsonPath('data.eventCategory', 'CREATED')
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.items.0.eventType', 'VOUCHER_CREATED')
            ->assertJsonPath('data.items.0.targetId', $voucherId);

        $updated = $owner->getJson('/api/v1/vouchers/'.$voucherId.'/history?eventCategory=UPDATED');
        $updated->assertOk()
            ->assertJsonPath('data.eventCategory', 'UPDATED')
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.items.0.eventType', 'VOUCHER_UPDATED');

        $owner->getJson('/api/v1/vouchers/'.$voucherId.'/history?eventCategory=INVALID')
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'VALIDATION_FAILED');
    }

    private function insertAuditFixture(string $eventType, string $targetType, string $targetId, array $after): void
    {
        DB::connection()->getPdo()->prepare(
            'INSERT INTO audit_events (
                id, actor_user_id, actor_email_snapshot, event_type, target_type,
                target_id, before_json, after_json, reason, occurred_at_utc
            ) VALUES (
                :id, :actor, :email, :event, :target_type,
                :target_id, NULL, :after, :reason, UTC_TIMESTAMP(6)
            )'
        )->execute([
            'id' => self::uuid(),
            'actor' => $this->userId,
            'email' => 'audit-fixture@example.test',
            'event' => $eventType,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'after' => json_encode($after, JSON_THROW_ON_ERROR),
            'reason' => 'Test-only audit fixture',
        ]);
    }
}
