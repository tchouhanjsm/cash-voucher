<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class BootstrapApiTest extends TestCase
{
    public function test_staff_bootstrap_matches_the_legacy_shape_and_limits_vouchers_to_the_creator(): void
    {
        $this->seedReceiptSequence();
        $this->setOpeningBalance();
        $ownVoucher = $this->insertVoucherFixture($this->userId, 'Own supplier', 12550);
        DB::table('vouchers')->where('id', $ownVoucher)->update(['voucher_number' => '88001']);

        $otherUserId = $this->createUser('staff');
        $otherVoucher = $this->insertVoucherFixture($otherUserId, 'Other supplier', 22550);
        DB::table('vouchers')->where('id', $otherVoucher)->update(['voucher_number' => '88002']);

        $vendorId = $this->insertVendorFixture('Inactive supplier', false);
        DB::table('vendors')->where('id', $vendorId)->update(['mobile' => "'+91 98765 43210"]);
        DB::table('vouchers')->where('id', $ownVoucher)->update([
            'vendor_id' => $vendorId,
            'vendor_type' => '',
            'cash_impact' => 'LEGACY_INVALID',
            'approval_status' => '',
        ]);
        $email = (string) DB::table('users')->where('id', $this->userId)->value('email');

        $response = $this->withLegacySession()->getJson('/api/v1/bootstrap');

        $response->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('data.user.id', $this->userId)
            ->assertJsonPath('data.user.role', 'staff')
            ->assertJsonPath('data.user.perms.create', true)
            ->assertJsonPath('data.user.perms.viewOwn', true)
            ->assertJsonPath('data.settings.timeZone', 'Asia/Kolkata')
            ->assertJsonPath('data.settings.currency', 'INR')
            ->assertJsonPath('data.settings.openingBalance', '0.00')
            ->assertJsonPath('data.vouchers.0.id', $ownVoucher)
            ->assertJsonPath('data.vouchers.0.amount', '125.50')
            ->assertJsonPath('data.vouchers.0.vendorType', 'REGISTERED')
            ->assertJsonPath('data.vouchers.0.cashImpact', 'UNCLASSIFIED')
            ->assertJsonPath('data.vouchers.0.approvalStatus', 'NOT_REQUIRED')
            ->assertJsonPath('data.vouchers.0.receipts', [])
            ->assertJsonPath('data.onboarding', null)
            ->assertJsonCount(1, 'data.vouchers');

        $vendors = $response->json('data.vendors');
        $vendorIds = array_column($vendors, 'id');
        self::assertContains($vendorId, $vendorIds);
        $inactiveVendor = array_values(array_filter($vendors, static fn (array $vendor): bool => $vendor['id'] === $vendorId))[0];
        self::assertFalse($inactiveVendor['active']);
        self::assertSame('+91 98765 43210', $inactiveVendor['mobile']);
        self::assertArrayHasKey('onboardingError', $response->json('data'));
        self::assertSame('Laravel Test staff', $response->json('data.names')[$email]);
    }

    public function test_manager_bootstrap_includes_property_vouchers_and_user_names(): void
    {
        $this->withRoleSession('manager');
        $this->seedReceiptSequence();
        $this->setOpeningBalance();

        $managerVoucher = $this->insertVoucherFixture($this->userId, 'Manager supplier', 10000);
        DB::table('vouchers')->where('id', $managerVoucher)->update(['voucher_number' => '88101']);

        $staffId = $this->createUser('staff');
        $staffVoucher = $this->insertVoucherFixture($staffId, 'Staff supplier', 20000);
        DB::table('vouchers')->where('id', $staffVoucher)->update(['voucher_number' => '88102']);

        $managerEmail = (string) DB::table('users')->where('id', $this->userId)->value('email');
        $staffEmail = (string) DB::table('users')->where('id', $staffId)->value('email');

        $response = $this->withLegacySession()->getJson('/api/v1/bootstrap');

        $response->assertOk()
            ->assertJsonPath('data.user.role', 'manager')
            ->assertJsonPath('data.user.perms.viewAll', true)
            ->assertJsonPath('data.settings.openingBalance', '125.50');

        $names = $response->json('data.names');
        self::assertSame('Laravel Test manager', $names[$managerEmail]);
        self::assertSame('Laravel Test staff', $names[$staffEmail]);
        self::assertContains(
            $managerVoucher,
            array_column($response->json('data.vouchers'), 'id'),
        );
        self::assertContains(
            $staffVoucher,
            array_column($response->json('data.vouchers'), 'id'),
        );
    }

    public function test_accountant_bootstrap_remains_report_only_without_register_or_vendor_data(): void
    {
        $this->withRoleSession('accountant');
        $this->seedReceiptSequence();
        $this->setOpeningBalance();

        $this->insertVoucherFixture($this->userId, 'Accountant supplier', 10000);
        $this->insertVendorFixture('Accountant-visible supplier');

        $response = $this->withLegacySession()->getJson('/api/v1/bootstrap');

        $response->assertOk()
            ->assertJsonPath('data.user.role', 'accountant')
            ->assertJsonPath('data.user.perms.reports', true)
            ->assertJsonPath('data.settings.openingBalance', '0.00')
            ->assertJsonPath('data.vouchers', [])
            ->assertJsonPath('data.vendors', [])
            ->assertJsonCount(1, 'data.names');
    }

    public function test_bootstrap_normalizes_unlinked_vendor_and_unknown_approval_state(): void
    {
        $this->seedReceiptSequence();
        $voucherId = $this->insertVoucherFixture($this->userId, 'Unlinked legacy supplier', 18750);
        DB::table('vouchers')->where('id', $voucherId)->update([
            'vendor_id' => null,
            'vendor_type' => '',
            'cash_impact' => 'CASH_IN',
            'approval_status' => 'LEGACY_UNKNOWN',
        ]);

        $response = $this->withLegacySession()->getJson('/api/v1/bootstrap');

        $response->assertOk();
        $vouchers = $response->json('data.vouchers');
        $voucher = array_values(array_filter(
            $vouchers,
            static fn (array $row): bool => $row['id'] === $voucherId,
        ))[0];

        self::assertSame('UNVERIFIED', $voucher['vendorType']);
        self::assertSame('CASH_IN', $voucher['cashImpact']);
        self::assertSame('REVIEW_REQUIRED', $voucher['approvalStatus']);
    }

    public function test_bootstrap_requires_an_active_legacy_session(): void
    {
        $this->getJson('/api/v1/bootstrap')
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'SESSION_REQUIRED');
    }

    public function test_bootstrap_remains_available_when_number_sequences_are_uninitialized(): void
    {
        $pdo = $this->migrationPdo();
        $previousSequences = $pdo->query(
            "SELECT voucher_type, next_number, updated_at_utc
             FROM voucher_number_sequences
             WHERE voucher_type IN ('PAYMENT', 'RECEIPT')
             ORDER BY voucher_type"
        )->fetchAll();
        $pdo->exec("DELETE FROM voucher_number_sequences WHERE voucher_type IN ('PAYMENT', 'RECEIPT')");

        try {
            $this->withLegacySession()
                ->getJson('/api/v1/bootstrap')
                ->assertOk()
                ->assertJsonPath('data.settings.nextVoucherNo', null)
                ->assertJsonPath('data.settings.nextReceiptNo', null)
                ->assertJsonPath('data.settings.voucherNumberSequencesInitialized', false);

            self::assertSame(0, DB::table('voucher_number_sequences')->count());
        } finally {
            if ($previousSequences !== []) {
                $restore = $pdo->prepare(
                    'INSERT INTO voucher_number_sequences (voucher_type, next_number, updated_at_utc)
                     VALUES (:type, :number, :updated_at)
                     ON DUPLICATE KEY UPDATE
                        next_number = VALUES(next_number),
                        updated_at_utc = VALUES(updated_at_utc)'
                );
                foreach ($previousSequences as $row) {
                    $restore->execute([
                        'type' => (string) $row['voucher_type'],
                        'number' => (int) $row['next_number'],
                        'updated_at' => (string) $row['updated_at_utc'],
                    ]);
                }
            }
        }
    }

    private function setOpeningBalance(): void
    {
        DB::table('settings')->updateOrInsert(
            ['setting_key' => 'openingBalance'],
            [
                'value_json' => '"125.50"',
                'updated_by_user_id' => $this->userId,
                'updated_at_utc' => DB::raw('UTC_TIMESTAMP(6)'),
            ],
        );
    }

    private function seedReceiptSequence(): void
    {
        DB::table('voucher_number_sequences')->insertOrIgnore([
            'voucher_type' => 'RECEIPT',
            'next_number' => 90000,
            'updated_at_utc' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);
    }
}
