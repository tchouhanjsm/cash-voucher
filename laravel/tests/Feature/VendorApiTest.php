<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class VendorApiTest extends TestCase
{
    public function test_staff_and_accountant_cannot_read_vendor_catalog(): void
    {
        $this->withLegacySession()
            ->getJson('/api/v1/vendors')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'FORBIDDEN');

        $this->withRoleSession('accountant')
            ->getJson('/api/v1/vendors')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'FORBIDDEN');
    }

    public function test_manager_can_create_vendor_with_idempotent_audit(): void
    {
        $payload = $this->validVendorPayload();
        $key = 'vendor-create-'.bin2hex(random_bytes(8));

        $first = $this->withRoleSession('manager')
            ->postJson('/api/v1/vendors', $payload, ['Idempotency-Key' => $key]);

        $first->assertCreated()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('data.replayed', false)
            ->assertJsonPath('data.vendor.name', $payload['name'])
            ->assertJsonPath('data.vendor.active', true)
            ->assertJsonPath('data.vendor.defaultPaymentMethod', 'UPI');

        $vendorId = (string) $first->json('data.vendor.id');
        self::assertNotSame('', $vendorId);

        $this->withLegacySession()
            ->postJson('/api/v1/vendors', $payload, ['Idempotency-Key' => $key])
            ->assertOk()
            ->assertJsonPath('data.replayed', true)
            ->assertJsonPath('data.vendor.id', $vendorId);

        self::assertSame(1, DB::table('vendors')->where('id', $vendorId)->count());
        self::assertSame(
            1,
            DB::table('audit_events')
                ->where('target_type', 'vendor')
                ->where('target_id', $vendorId)
                ->where('event_type', 'VENDOR_CREATED')
                ->count(),
            'An idempotent replay must not append a second audit event.',
        );

        $event = DB::table('audit_events')
            ->where('target_id', $vendorId)
            ->where('event_type', 'VENDOR_CREATED')
            ->first();
        self::assertNotNull($event);
        self::assertNull($event->before_json);
        self::assertSame($payload['name'], json_decode((string) $event->after_json, true)['vendor']['name']);
    }

    public function test_vendor_names_are_case_insensitive_and_inactive_names_remain_reserved(): void
    {
        $payload = $this->validVendorPayload([
            'name' => 'Dormant Parts Supplier',
            'defaultCategory' => '',
            'defaultPaymentMethod' => '',
        ]);
        $created = $this->withRoleSession('manager')
            ->postJson('/api/v1/vendors', $payload, ['Idempotency-Key' => 'vendor-dormant-create'])
            ->assertCreated();
        $vendorId = (string) $created->json('data.vendor.id');

        $this->withLegacySession()
            ->postJson('/api/v1/vendors/'.$vendorId.'/active', ['active' => false], [
                'Idempotency-Key' => 'vendor-dormant-off',
            ])
            ->assertOk()
            ->assertJsonPath('data.vendor.active', false);

        $duplicate = $this->withLegacySession()
            ->postJson('/api/v1/vendors', array_merge($payload, ['name' => 'dormant parts supplier']), [
                'Idempotency-Key' => 'vendor-dormant-duplicate',
            ]);

        $duplicate->assertStatus(409)
            ->assertJsonPath('error.code', 'VENDOR_DUPLICATE');
        self::assertSame(
            1,
            DB::table('vendors')->whereRaw('LOWER(display_name) = ?', ['dormant parts supplier'])->count(),
        );
    }

    public function test_vendor_rename_does_not_rewrite_historical_voucher_snapshot(): void
    {
        $payload = $this->validVendorPayload([
            'name' => 'Original Heritage Supplier',
            'defaultCategory' => '',
            'defaultPaymentMethod' => '',
        ]);
        $created = $this->withRoleSession('manager')
            ->postJson('/api/v1/vendors', $payload, ['Idempotency-Key' => 'vendor-rename-create'])
            ->assertCreated();
        $vendorId = (string) $created->json('data.vendor.id');

        $voucherId = $this->insertVoucherFixture($this->userId, 'Original Heritage Supplier', 12500);
        DB::table('vouchers')->where('id', $voucherId)->update([
            'vendor_id' => $vendorId,
            'vendor_type' => 'REGISTERED',
        ]);

        $update = $this->withLegacySession()
            ->patchJson('/api/v1/vendors/'.$vendorId, [
                'name' => 'Rebranded Heritage Supplier',
                'company' => 'New Company',
                'mobile' => '9876543210',
                'defaultCategory' => 'Other',
                'defaultPaymentMethod' => 'BANK_TRANSFER',
            ], ['Idempotency-Key' => 'vendor-rename-update']);

        $update->assertOk()
            ->assertJsonPath('data.vendor.name', 'Rebranded Heritage Supplier')
            ->assertJsonPath('data.vendor.company', 'New Company');

        self::assertSame(
            'Original Heritage Supplier',
            DB::table('vouchers')->where('id', $voucherId)->value('vendor_name_snapshot'),
            'Vendor maintenance must not rewrite the immutable voucher payee snapshot.',
        );

        $event = DB::table('audit_events')
            ->where('target_id', $vendorId)
            ->where('event_type', 'VENDOR_UPDATED')
            ->first();
        self::assertNotNull($event);
        self::assertSame(
            'Original Heritage Supplier',
            json_decode((string) $event->before_json, true)['name'],
        );
        self::assertSame(
            'Rebranded Heritage Supplier',
            json_decode((string) $event->after_json, true)['vendor']['name'],
        );
    }

    public function test_vendor_listing_hides_inactive_rows_unless_requested(): void
    {
        $name = 'Filter Inactive '.bin2hex(random_bytes(5));
        $created = $this->withRoleSession('owner')
            ->postJson('/api/v1/vendors', $this->validVendorPayload([
                'name' => $name,
                'defaultCategory' => '',
                'defaultPaymentMethod' => '',
            ]), ['Idempotency-Key' => 'vendor-filter-create-'.bin2hex(random_bytes(4))])
            ->assertCreated();
        $vendorId = (string) $created->json('data.vendor.id');

        $this->withLegacySession()
            ->postJson('/api/v1/vendors/'.$vendorId.'/active', ['active' => false], [
                'Idempotency-Key' => 'vendor-filter-off-'.bin2hex(random_bytes(4)),
            ])
            ->assertOk();

        $this->withLegacySession()
            ->getJson('/api/v1/vendors?q='.rawurlencode($name))
            ->assertOk()
            ->assertJsonPath('data.totalCount', 0)
            ->assertJsonPath('data.items', []);

        $this->withLegacySession()
            ->getJson('/api/v1/vendors?includeInactive=true&q='.rawurlencode($name))
            ->assertOk()
            ->assertJsonPath('data.totalCount', 1)
            ->assertJsonPath('data.items.0.active', false);
    }

    public function test_legacy_duplicate_active_vendor_blocks_reactivation(): void
    {
        $name = 'Ambiguous Legacy Vendor '.bin2hex(random_bytes(3));
        $activeId = $this->insertVendorFixture($name, true);
        $inactiveId = $this->insertVendorFixture($name, false);

        $this->withRoleSession('manager')
            ->postJson('/api/v1/vendors/'.$inactiveId.'/active', ['active' => true], [
                'Idempotency-Key' => 'vendor-legacy-reactivate-'.bin2hex(random_bytes(4)),
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'VENDOR_NAME_AMBIGUOUS');

        self::assertSame(1, DB::table('vendors')->where('id', $activeId)->value('is_active'));
        self::assertSame(0, DB::table('vendors')->where('id', $inactiveId)->value('is_active'));
    }

    public function test_invalid_vendor_name_mobile_and_default_category_fail_closed(): void
    {
        $this->withRoleSession('manager')
            ->postJson('/api/v1/vendors', $this->validVendorPayload(['name' => '=Injected Formula']), [
                'Idempotency-Key' => 'vendor-invalid-name',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'VENDOR_NAME_INVALID');

        $this->withLegacySession()
            ->postJson('/api/v1/vendors', $this->validVendorPayload([
                'name' => 'Valid Name For Mobile Test',
                'mobile' => '12345',
            ]), ['Idempotency-Key' => 'vendor-invalid-mobile'])
            ->assertUnprocessable();

        $this->withLegacySession()
            ->postJson('/api/v1/vendors', $this->validVendorPayload([
                'name' => 'Valid Name For Category Test',
                'defaultCategory' => 'Unconfigured Category',
            ]), ['Idempotency-Key' => 'vendor-invalid-category'])
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'VENDOR_CATEGORY_INVALID');

        self::assertSame(
            0,
            DB::table('vendors')->whereIn('display_name', [
                '=Injected Formula',
                'Valid Name For Mobile Test',
                'Valid Name For Category Test',
            ])->count(),
            'Invalid vendor data must not be persisted.',
        );
    }

    public function test_same_idempotency_key_with_changed_vendor_payload_conflicts(): void
    {
        $payload = $this->validVendorPayload();
        $key = 'vendor-conflict-'.bin2hex(random_bytes(5));
        $this->withRoleSession('manager')
            ->postJson('/api/v1/vendors', $payload, ['Idempotency-Key' => $key])
            ->assertCreated();

        $changed = $payload;
        $changed['company'] = 'Changed Company';
        $this->withLegacySession()
            ->postJson('/api/v1/vendors', $changed, ['Idempotency-Key' => $key])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'IDEMPOTENCY_CONFLICT');

        self::assertSame(1, DB::table('vendors')->where('display_name', $payload['name'])->count());
    }

    /** @param array<string, mixed> $overrides @return array<string, mixed> */
    private function validVendorPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Vendor '.bin2hex(random_bytes(5)),
            'company' => 'Supplier Group',
            'mobile' => '+91 98765 43210',
            'defaultCategory' => 'Other',
            'defaultPaymentMethod' => 'UPI',
        ], $overrides);
    }
}
