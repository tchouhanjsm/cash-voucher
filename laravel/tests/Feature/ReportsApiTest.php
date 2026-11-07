<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class ReportsApiTest extends TestCase
{
    public function test_staff_dashboard_is_creator_scoped_and_excludes_unapproved_payments(): void
    {
        $today = $this->businessDate;
        $this->insertVoucherFixture($this->userId, 'Own Approved Payment', 10000, $today);
        $pendingPayment = $this->insertVoucherFixture($this->userId, 'Own Pending Payment', 4000, $today);
        DB::table('vouchers')->where('id', $pendingPayment)->update(['approval_status' => 'PENDING']);
        $receipt = $this->insertVoucherFixture($this->userId, 'Own Receipt', 30000, $today);
        DB::table('vouchers')->where('id', $receipt)->update([
            'voucher_type' => 'RECEIPT',
            'cash_impact' => 'CASH_IN',
        ]);

        $otherUser = $this->createUser('staff');
        $this->insertVoucherFixture($otherUser, 'Other Staff Payment', 990000, $today);

        $response = $this->withLegacySession()
            ->getJson('/api/v1/dashboard/summary?from='.$today.'&to='.$today);

        $response->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('data.paid', '100.00')
            ->assertJsonPath('data.previousPaid', '0.00')
            ->assertJsonPath('data.paymentCount', 1)
            ->assertJsonPath('data.validPaymentCount', 1)
            ->assertJsonPath('data.received', '300.00')
            ->assertJsonPath('data.receiptCount', 1)
            ->assertJsonPath('data.approvalExceptionCount', 1)
            ->assertJsonPath('data.bookBalance', '200.00')
            ->assertJsonPath('data.byTeamMember', []);

        self::assertSame(
            [['date' => $today, 'amount' => '100.00']],
            $response->json('data.trend'),
        );
        self::assertSame(0, $response->json('data.invalidAmountCount'));
    }

    public function test_manager_dashboard_includes_team_breakdown_and_owner_configured_opening_balance(): void
    {
        $manager = $this->withRoleSession('manager');
        $today = $this->businessDate;
        $baseline = DB::selectOne(
            'SELECT
                COALESCE(SUM(CASE WHEN voucher_type = ? AND approval_status IN (?, ?) AND status = ? AND amount_paise BETWEEN 1 AND 1000000000 THEN amount_paise ELSE 0 END), 0) AS payments,
                COALESCE(SUM(CASE WHEN voucher_type = ? AND status = ? AND amount_paise BETWEEN 1 AND 1000000000 THEN amount_paise ELSE 0 END), 0) AS receipts
             FROM vouchers',
            ['PAYMENT', 'NOT_REQUIRED', 'APPROVED', 'ACTIVE', 'RECEIPT', 'ACTIVE'],
        );
        $baselineBookBalancePaise = (int) $baseline->receipts - (int) $baseline->payments;
        $this->insertVoucherFixture($this->userId, 'Manager Payment', 10000, $today);
        $receipt = $this->insertVoucherFixture($this->userId, 'Manager Receipt', 5000, $today);
        DB::table('vouchers')->where('id', $receipt)->update(['voucher_type' => 'RECEIPT']);

        DB::table('settings')->updateOrInsert(
            ['setting_key' => 'openingBalance'],
            [
                'value_json' => json_encode('1000.00', JSON_THROW_ON_ERROR),
                'updated_by_user_id' => $this->userId,
                'updated_at_utc' => now('UTC')->format('Y-m-d H:i:s'),
            ],
        );

        $response = $manager->getJson('/api/v1/dashboard/summary?from='.$today.'&to='.$today);
        $response->assertOk()
            ->assertJsonPath('data.paid', '100.00')
            ->assertJsonPath('data.received', '50.00')
            ->assertJsonPath('data.bookBalance', $this->formatPaise($baselineBookBalancePaise + 95000))
            ->assertJsonPath('data.byTeamMember.0.n', 1)
            ->assertJsonPath('data.byTeamMember.0.s', '100.00')
            ->assertJsonPath('data.byPaymentMethod.0.k', 'Cash');
    }

    public function test_accountant_can_read_recorded_movements_but_cannot_open_dashboard(): void
    {
        $today = $this->businessDate;
        $this->insertVoucherFixture($this->userId, 'Report Approved Payment', 10000, $today);

        $accountant = $this->withRoleSession('accountant');
        $accountant->getJson('/api/v1/dashboard/summary?from='.$today.'&to='.$today)
            ->assertForbidden();

        $accountant->getJson('/api/v1/reports/recorded-movements?from='.$today.'&to='.$today)
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.activePaymentTotal', '100.00');

        $this->withLegacySession()
            ->getJson('/api/v1/reports/recorded-movements?from='.$today.'&to='.$today)
            ->assertForbidden();
    }

    public function test_recorded_movement_totals_include_cancelled_rows_but_exclude_pending_payments(): void
    {
        $today = $this->businessDate;
        $this->insertVoucherFixture($this->userId, 'Approved Payment', 10000, $today);
        $pending = $this->insertVoucherFixture($this->userId, 'Pending Payment', 5000, $today);
        DB::table('vouchers')->where('id', $pending)->update(['approval_status' => 'PENDING']);
        $cancelled = $this->insertVoucherFixture($this->userId, 'Cancelled Payment', 8000, $today);
        DB::table('vouchers')->where('id', $cancelled)->update(['status' => 'CANCELLED']);
        $receipt = $this->insertVoucherFixture($this->userId, 'Recorded Receipt', 12000, $today);
        DB::table('vouchers')->where('id', $receipt)->update(['voucher_type' => 'RECEIPT']);

        $accountant = $this->withRoleSession('accountant');
        $response = $accountant->getJson(
            '/api/v1/reports/recorded-movements?from='.$today.'&to='.$today.'&status=ALL&limit=2&offset=1',
        );

        $response->assertOk()
            ->assertJsonPath('data.count', 4)
            ->assertJsonPath('data.activeCount', 3)
            ->assertJsonPath('data.cancelledCount', 1)
            ->assertJsonPath('data.pendingApprovalCount', 1)
            ->assertJsonPath('data.approvalExceptionCount', 1)
            ->assertJsonPath('data.paymentTotal', '180.00')
            ->assertJsonPath('data.receiptTotal', '120.00')
            ->assertJsonPath('data.activePaymentTotal', '100.00')
            ->assertJsonPath('data.activeReceiptTotal', '120.00')
            ->assertJsonPath('data.offset', 1)
            ->assertJsonPath('data.limit', 2)
            ->assertJsonPath('data.totalCount', 4)
            ->assertJsonPath('data.hasMore', true);

        self::assertCount(2, $response->json('data.items'));
        self::assertSame(4, $response->json('data.unmatchedVendorCount'));
    }

    public function test_recorded_movement_report_resolves_only_unique_legacy_vendor_names(): void
    {
        $today = $this->businessDate;
        $uniqueId = $this->insertVendorFixture('Unique Report Vendor');
        $uniqueVoucher = $this->insertVoucherFixture($this->userId, 'Unique Report Vendor', 10000, $today);
        $ambiguousVoucher = $this->insertVoucherFixture($this->userId, 'Legacy Duplicate Vendor', 20000, $today);
        $this->insertVendorFixture('Legacy Duplicate Vendor');
        $this->insertVendorFixture('legacy duplicate vendor');

        $response = $this->withRoleSession('accountant')->getJson(
            '/api/v1/reports/recorded-movements?from='.$today.'&to='.$today,
        );

        $response->assertOk()
            ->assertJsonPath('data.count', 2)
            ->assertJsonPath('data.ambiguousVendorCount', 1)
            ->assertJsonPath('data.unmatchedVendorCount', 0);

        $items = collect($response->json('data.items'))->keyBy('id');
        self::assertSame($uniqueId, $items[$uniqueVoucher]['vendorId']);
        self::assertSame('', $items[$ambiguousVoucher]['vendorId']);
    }

    public function test_report_filters_and_date_range_are_validated_and_paginated(): void
    {
        $today = $this->businessDate;
        $voucher = $this->insertVoucherFixture($this->userId, 'Unrecorded Method Vendor', 10000, $today);
        DB::table('vouchers')->where('id', $voucher)->update(['payment_method' => '']);

        $accountant = $this->withRoleSession('accountant');
        $accountant->getJson(
            '/api/v1/reports/recorded-movements?from='.$today.'&to='.$today.'&type=PAYMENT&paymentMethod=UNRECORDED',
        )
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.byPaymentMethod.0.k', 'Not recorded');

        $accountant->getJson(
            '/api/v1/reports/recorded-movements?from=2020-01-01&to='.$today.'&limit=201',
        )->assertUnprocessable();

        $accountant->getJson(
            '/api/v1/reports/recorded-movements?from=2026-13-01&to='.$today,
        )->assertUnprocessable();

        $accountant->getJson(
            '/api/v1/reports/recorded-movements?from='.$today.'&to='.$today.'&paymentMethod=INVALID',
        )->assertUnprocessable();
    }

    private function formatPaise(int $paise): string
    {
        $negative = $paise < 0 ? '-' : '';
        $absolute = abs($paise);

        return $negative.intdiv($absolute, 100).'.'.str_pad((string) ($absolute % 100), 2, '0', STR_PAD_LEFT);
    }
}
