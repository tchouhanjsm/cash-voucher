<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class SettingsApiTest extends TestCase
{
    private int $currentPaymentSequence;

    private int $currentReceiptSequence;

    private int $safeNextPaymentSequence;

    private int $safeNextReceiptSequence;

    protected function setUp(): void
    {
        parent::setUp();

        DB::table('voucher_number_sequences')->insertOrIgnore([
            'voucher_type' => 'RECEIPT',
            'next_number' => 1,
            'updated_at_utc' => now('UTC')->format('Y-m-d H:i:s'),
        ]);

        $this->currentPaymentSequence = (int) DB::table('voucher_number_sequences')
            ->where('voucher_type', 'PAYMENT')
            ->value('next_number');
        $this->currentReceiptSequence = (int) DB::table('voucher_number_sequences')
            ->where('voucher_type', 'RECEIPT')
            ->value('next_number');
        self::assertGreaterThan(0, $this->currentPaymentSequence);
        self::assertGreaterThan(0, $this->currentReceiptSequence);

        // Some shared finance fixtures use explicit numeric voucher numbers
        // without consuming the allocator. Settings must never request a number
        // that is already issued, even in this shared disposable test database.
        $maxPaymentIssued = (int) DB::table('vouchers')
            ->where('voucher_type', 'PAYMENT')
            ->whereRaw('voucher_number REGEXP ?', ['^[0-9]+$'])
            ->selectRaw('COALESCE(MAX(CAST(voucher_number AS UNSIGNED)), 0) AS max_number')
            ->value('max_number');
        $maxReceiptIssued = (int) DB::table('vouchers')
            ->where('voucher_type', 'RECEIPT')
            ->whereRaw('voucher_number REGEXP ?', ['^[0-9]+$'])
            ->selectRaw('COALESCE(MAX(CAST(voucher_number AS UNSIGNED)), 0) AS max_number')
            ->value('max_number');

        $this->safeNextPaymentSequence = max($this->currentPaymentSequence, $maxPaymentIssued + 1);
        $this->safeNextReceiptSequence = max($this->currentReceiptSequence, $maxReceiptIssued + 1);
    }

    public function test_staff_manager_and_accountant_cannot_read_or_change_owner_settings(): void
    {
        $settingsBefore = $this->settingsSnapshot();

        foreach (['staff', 'manager', 'accountant'] as $role) {
            $this->withRoleSession($role)
                ->getJson('/api/v1/settings')
                ->assertForbidden();
        }

        $this->withRoleSession('manager')
            ->putJson('/api/v1/settings', $this->payload(), [
                'Idempotency-Key' => 'settings-manager-denied',
            ])
            ->assertForbidden();

        self::assertSame($settingsBefore, $this->settingsSnapshot());
    }

    public function test_owner_reads_safe_settings_and_sequence_values(): void
    {
        $this->withRoleSession('owner')
            ->getJson('/api/v1/settings')
            ->assertOk()
            ->assertJsonPath('data.nextVoucherNo', $this->currentPaymentSequence)
            ->assertJsonPath('data.nextReceiptNo', $this->currentReceiptSequence)
            ->assertJsonPath('data.categories.0', 'Housekeeping')
            ->assertJsonPath('data.receiptCategories.0', 'Room Revenue')
            ->assertJsonPath('data.timeZone', 'Asia/Kolkata')
            ->assertJsonPath('data.currency', 'INR');
    }

    public function test_settings_update_is_idempotent_audited_and_keeps_legacy_settings_shape(): void
    {
        $owner = $this->withRoleSession('owner');
        $payload = $this->payload();
        $key = 'settings-save-'.bin2hex(random_bytes(5));

        $first = $owner->putJson('/api/v1/settings', $payload, ['Idempotency-Key' => $key]);
        $first->assertOk()
            ->assertJsonPath('data.replayed', false)
            ->assertJsonPath('data.settings.propertyName', 'Heritage Property')
            ->assertJsonPath('data.settings.openingBalance', '125.50')
            ->assertJsonPath('data.settings.nextVoucherNo', $this->safeNextPaymentSequence)
            ->assertJsonPath('data.settings.nextReceiptNo', $this->safeNextReceiptSequence)
            ->assertJsonPath('data.settings.categories', ['Other', 'Staff Salary'])
            ->assertJsonPath('data.settings.receiptCategories', ['Room Revenue', 'Other']);

        $owner->putJson('/api/v1/settings', $payload, ['Idempotency-Key' => $key])
            ->assertOk()
            ->assertJsonPath('data.replayed', true);

        self::assertSame(
            1,
            DB::table('audit_events')
                ->where('event_type', 'PROPERTY_SETTINGS_UPDATED')
                ->where('target_id', 'property')
                ->count(),
        );
        self::assertSame(
            '"Heritage Property"',
            DB::table('settings')->where('setting_key', 'propertyName')->value('value_json'),
        );
        self::assertSame(
            '["Other", "Staff Salary"]',
            DB::table('settings')->where('setting_key', 'categories')->value('value_json'),
        );
        self::assertSame(
            (string) $this->safeNextPaymentSequence,
            (string) DB::table('voucher_number_sequences')
                ->where('voucher_type', 'PAYMENT')
                ->value('next_number'),
        );
    }

    public function test_next_voucher_number_cannot_move_backwards_or_reuse_an_issued_number(): void
    {
        $owner = $this->withRoleSession('owner');
        $settingsBefore = $this->settingsSnapshot();

        $voucherId = $this->insertVoucherFixture($this->userId, 'Settings Sequence Vendor', 10000);
        $alreadyIssuedNumber = $this->safeNextPaymentSequence + 10;
        DB::table('vouchers')->where('id', $voucherId)->update([
            'voucher_number' => (string) $alreadyIssuedNumber,
        ]);

        $payload = $this->payload(['nextVoucherNo' => $alreadyIssuedNumber]);
        $owner->putJson('/api/v1/settings', $payload, [
            'Idempotency-Key' => 'settings-reuse-issued-number',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'VOUCHER_SEQUENCE_INVALID');

        $backwards = $this->payload(['nextVoucherNo' => $this->currentPaymentSequence - 1]);
        $owner->putJson('/api/v1/settings', $backwards, [
            'Idempotency-Key' => 'settings-lower-sequence',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'VOUCHER_SEQUENCE_INVALID');

        self::assertSame(
            $this->currentPaymentSequence,
            (int) DB::table('voucher_number_sequences')
                ->where('voucher_type', 'PAYMENT')
                ->value('next_number'),
        );
        self::assertSame($settingsBefore, $this->settingsSnapshot());
    }

    public function test_invalid_categories_and_opening_balance_fail_without_partial_updates(): void
    {
        $owner = $this->withRoleSession('owner');
        $settingsBefore = $this->settingsSnapshot();

        $owner->putJson('/api/v1/settings', $this->payload(['categories' => []]), [
            'Idempotency-Key' => 'settings-empty-categories',
        ])->assertUnprocessable();

        $owner->putJson('/api/v1/settings', $this->payload(['openingBalance' => '1e8']), [
            'Idempotency-Key' => 'settings-scientific-amount',
        ])->assertUnprocessable();

        self::assertSame($settingsBefore, $this->settingsSnapshot());
    }

    /** @return list<array{setting_key:string,value_json:string}> */
    private function settingsSnapshot(): array
    {
        return DB::table('settings')
            ->select('setting_key', 'value_json')
            ->orderBy('setting_key')
            ->get()
            ->map(static fn (object $row): array => [
                'setting_key' => (string) $row->setting_key,
                'value_json' => (string) $row->value_json,
            ])
            ->all();
    }

    /** @return array<string,mixed> */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'propertyName' => 'Heritage Property',
            'propertyAddress' => 'Fort Road, Jaisalmer',
            'categories' => ['Other'],
            'receiptCategories' => ['Room Revenue', 'Other'],
            'nextVoucherNo' => $this->safeNextPaymentSequence,
            'nextReceiptNo' => $this->safeNextReceiptSequence,
            'openingBalance' => '125.50',
        ], $overrides);
    }
}
