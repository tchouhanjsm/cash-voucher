<?php

declare(strict_types=1);

namespace Tests\Feature;

use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class CashCloseApiTest extends TestCase
{
    public function test_preview_calculates_physical_cash_from_explicit_cash_impact_only(): void
    {
        $this->withRoleSession('manager');
        $this->insertCloseVoucher('RECEIPT', 'CASH_IN', 20000);
        $this->insertCloseVoucher('PAYMENT', 'CASH_OUT', 5000);
        $this->insertCloseVoucher('PAYMENT', 'NO_CASH', 8000);

        $response = $this->getJson('/api/v1/cash-closes/preview?date='.$this->businessDate.'&openingCash=150.00&openingReason=First%20manual%20opening');

        $response->assertOk()
            ->assertJsonPath('data.closed', false)
            ->assertJsonPath('data.drawerKey', 'MAIN')
            ->assertJsonPath('data.openingSource', 'MANUAL')
            ->assertJsonPath('data.openingCash', '150.00')
            ->assertJsonPath('data.cashInTotal', '200.00')
            ->assertJsonPath('data.cashOutTotal', '50.00')
            ->assertJsonPath('data.noCashCount', 1)
            ->assertJsonPath('data.expectedCash', '300.00')
            ->assertJsonPath('data.readyToClose', true);

        self::assertCount(3, $response->json('data.includedVouchers'));
    }

    public function test_create_persists_reconciled_close_snapshot_and_idempotently_replays(): void
    {
        $this->withRoleSession('manager');
        $this->insertCloseVoucher('RECEIPT', 'CASH_IN', 5500);
        $this->insertCloseVoucher('PAYMENT', 'CASH_OUT', 2000);

        $payload = [
            'date' => $this->businessDate,
            'openingCash' => '100.00',
            'openingReason' => 'Opening float counted',
            'countedCash' => '135.00',
            'varianceReason' => '',
        ];
        $key = 'cash-close-'.bin2hex(random_bytes(5));

        $first = $this->postJson('/api/v1/cash-closes', $payload, ['Idempotency-Key' => $key]);
        $first->assertCreated()
            ->assertJsonPath('data.replayed', false)
            ->assertJsonPath('data.close.drawerKey', 'MAIN')
            ->assertJsonPath('data.close.openingCash', '100.00')
            ->assertJsonPath('data.close.cashInTotal', '55.00')
            ->assertJsonPath('data.close.cashOutTotal', '20.00')
            ->assertJsonPath('data.close.expectedCash', '135.00')
            ->assertJsonPath('data.close.countedCash', '135.00')
            ->assertJsonPath('data.close.variance', '0.00')
            ->assertJsonPath('data.close.includedVoucherCount', 2);

        $closeId = (string) $first->json('data.close.id');
        $rowBeforeReplay = DB::table('cash_closes')->where('id', $closeId)->first();
        self::assertNotNull($rowBeforeReplay);

        $this->postJson('/api/v1/cash-closes', $payload, ['Idempotency-Key' => $key])
            ->assertOk()
            ->assertJsonPath('data.replayed', true)
            ->assertJsonPath('data.close.id', $closeId);

        self::assertSame(
            1,
            DB::table('cash_closes')->where('business_date', $this->businessDate)->where('drawer_key', 'MAIN')->count(),
        );
        self::assertSame(
            1,
            DB::table('audit_events')->where('target_id', $closeId)->where('event_type', 'DAILY_CASH_CLOSE_FINALIZED')->count(),
        );
        self::assertSame(
            (string) $rowBeforeReplay->included_voucher_snapshot,
            (string) DB::table('cash_closes')->where('id', $closeId)->value('included_voucher_snapshot'),
        );
    }

    public function test_same_date_cannot_be_closed_twice_with_a_different_idempotency_key(): void
    {
        $this->withRoleSession('owner');
        $payload = [
            'date' => $this->businessDate,
            'openingCash' => '50.00',
            'openingReason' => 'Manual opening float',
            'countedCash' => '50.00',
        ];

        $this->postJson('/api/v1/cash-closes', $payload, ['Idempotency-Key' => 'cash-close-first'])
            ->assertCreated();

        $this->postJson('/api/v1/cash-closes', $payload, ['Idempotency-Key' => 'cash-close-second'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'CASH_CLOSE_EXISTS');

        self::assertSame(1, DB::table('cash_closes')->where('business_date', $this->businessDate)->where('drawer_key', 'MAIN')->count());
    }

    public function test_manual_opening_and_non_zero_variance_reasons_are_required(): void
    {
        $this->withRoleSession('manager');

        $this->postJson('/api/v1/cash-closes', [
            'date' => $this->businessDate,
            'countedCash' => '100.00',
        ], ['Idempotency-Key' => 'cash-close-no-opening'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'OPENING_CASH_REQUIRED');

        $this->postJson('/api/v1/cash-closes', [
            'date' => $this->businessDate,
            'openingCash' => '100.00',
            'openingReason' => 'Manual opening float',
            'countedCash' => '90.00',
        ], ['Idempotency-Key' => 'cash-close-no-variance-reason'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'VARIANCE_REASON_REQUIRED');

        self::assertSame(0, DB::table('cash_closes')->where('business_date', $this->businessDate)->count());
    }

    public function test_unclassified_vouchers_and_pending_payments_block_finalization(): void
    {
        $this->withRoleSession('manager');
        $unclassifiedId = $this->insertCloseVoucher('PAYMENT', 'UNCLASSIFIED', 10000);

        $this->postJson('/api/v1/cash-closes', [
            'date' => $this->businessDate,
            'openingCash' => '100.00',
            'openingReason' => 'Manual opening float',
            'countedCash' => '100.00',
        ], ['Idempotency-Key' => 'cash-close-unclassified'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'CASH_CLOSE_UNCLASSIFIED');

        DB::table('vouchers')->where('id', $unclassifiedId)->update(['cash_impact' => 'CASH_OUT']);
        $pendingId = $this->insertCloseVoucher('PAYMENT', 'CASH_OUT', 10000, 'PENDING');

        $this->postJson('/api/v1/cash-closes', [
            'date' => $this->businessDate,
            'openingCash' => '100.00',
            'openingReason' => 'Manual opening float',
            'countedCash' => '100.00',
        ], ['Idempotency-Key' => 'cash-close-pending'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'CASH_CLOSE_APPROVAL_PENDING');

        self::assertNotSame('', $pendingId);
        self::assertSame(0, DB::table('cash_closes')->where('business_date', $this->businessDate)->count());
    }

    public function test_finalization_requires_chronological_date_order(): void
    {
        $this->withRoleSession('manager');
        $laterDate = (new DateTimeImmutable($this->businessDate, new DateTimeZone('Asia/Kolkata')))
            ->modify('+2 days')->format('Y-m-d');
        $this->insertCloseRow($laterDate, 7500);

        $this->postJson('/api/v1/cash-closes', [
            'date' => $this->businessDate,
            'openingCash' => '75.00',
            'openingReason' => 'Gap opening balance',
            'countedCash' => '75.00',
        ], ['Idempotency-Key' => 'cash-close-out-of-order'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'CASH_CLOSE_OUT_OF_ORDER');

        self::assertSame(1, DB::table('cash_closes')->where('business_date', $laterDate)->where('drawer_key', 'MAIN')->count());
        self::assertSame(0, DB::table('cash_closes')->where('business_date', $this->businessDate)->where('drawer_key', 'MAIN')->count());
    }

    public function test_previous_day_count_is_the_only_automatic_opening_source(): void
    {
        $this->withRoleSession('manager');
        $previousDate = (new DateTimeImmutable($this->businessDate, new DateTimeZone('Asia/Kolkata')))
            ->modify('-1 day')->format('Y-m-d');
        $this->insertCloseRow($previousDate, 8250);

        $this->getJson('/api/v1/cash-closes/preview?date='.$this->businessDate)
            ->assertOk()
            ->assertJsonPath('data.requiresManualOpening', false)
            ->assertJsonPath('data.openingSource', 'PREVIOUS_CLOSE')
            ->assertJsonPath('data.openingCash', '82.50')
            ->assertJsonPath('data.openingReady', true);

        $this->postJson('/api/v1/cash-closes', [
            'date' => $this->businessDate,
            'countedCash' => '82.50',
        ], ['Idempotency-Key' => 'cash-close-carry-forward'])
            ->assertCreated()
            ->assertJsonPath('data.close.openingCash', '82.50')
            ->assertJsonPath('data.close.openingSource', 'PREVIOUS_CLOSE');
    }

    public function test_correction_notes_are_append_only_idempotent_and_never_restate_close_totals(): void
    {
        $this->withRoleSession('manager');
        $created = $this->postJson('/api/v1/cash-closes', [
            'date' => $this->businessDate,
            'openingCash' => '90.00',
            'openingReason' => 'Manual opening float',
            'countedCash' => '90.00',
        ], ['Idempotency-Key' => 'cash-close-correction-parent'])
            ->assertCreated();

        $closeId = (string) $created->json('data.close.id');
        $expected = (string) DB::table('cash_closes')->where('id', $closeId)->value('expected_cash_paise');
        $key = 'cash-close-correction-'.bin2hex(random_bytes(4));
        $payload = [
            'type' => 'CASH_COUNT',
            'details' => 'Recounted coins after close',
            'reason' => 'Second operator confirmed the count',
        ];

        $this->postJson('/api/v1/cash-closes/'.$closeId.'/corrections', $payload, [
            'Idempotency-Key' => $key,
        ])
            ->assertCreated()
            ->assertJsonPath('data.replayed', false)
            ->assertJsonPath('data.correction.closeId', $closeId)
            ->assertJsonPath('data.correction.type', 'CASH_COUNT');

        $this->postJson('/api/v1/cash-closes/'.$closeId.'/corrections', $payload, [
            'Idempotency-Key' => $key,
        ])
            ->assertOk()
            ->assertJsonPath('data.replayed', true);

        self::assertSame(1, DB::table('cash_close_corrections')->where('cash_close_id', $closeId)->count());
        self::assertSame($expected, (string) DB::table('cash_closes')->where('id', $closeId)->value('expected_cash_paise'));
        self::assertSame(
            1,
            DB::table('audit_events')->where('target_id', $closeId)->where('event_type', 'CASH_CLOSE_CORRECTION_RECORDED')->count(),
        );

        $this->getJson('/api/v1/cash-closes/preview?date='.$this->businessDate)
            ->assertOk()
            ->assertJsonPath('data.closed', true)
            ->assertJsonPath('data.close.id', $closeId)
            ->assertJsonPath('data.close.corrections.0.details', 'Recounted coins after close');
    }

    public function test_correction_cannot_link_a_voucher_outside_the_immutable_snapshot(): void
    {
        $this->withRoleSession('owner');
        $created = $this->postJson('/api/v1/cash-closes', [
            'date' => $this->businessDate,
            'openingCash' => '10.00',
            'openingReason' => 'Manual float',
            'countedCash' => '10.00',
        ], ['Idempotency-Key' => 'cash-close-correction-link-parent'])
            ->assertCreated();
        $closeId = (string) $created->json('data.close.id');

        $this->postJson('/api/v1/cash-closes/'.$closeId.'/corrections', [
            'type' => 'VOUCHER',
            'details' => 'Review an unrelated voucher',
            'reason' => 'This voucher was not included',
            'voucherId' => self::uuid(),
        ], ['Idempotency-Key' => 'cash-close-correction-outside'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'VOUCHER_NOT_IN_CLOSE');

        self::assertSame(0, DB::table('cash_close_corrections')->where('cash_close_id', $closeId)->count());
    }

    public function test_staff_and_accountant_cannot_preview_or_finalize_cash_close(): void
    {
        $this->withRoleSession('staff')
            ->getJson('/api/v1/cash-closes/preview?date='.$this->businessDate)
            ->assertForbidden();

        $this->withRoleSession('accountant')
            ->postJson('/api/v1/cash-closes', [
                'date' => $this->businessDate,
                'openingCash' => '10.00',
                'openingReason' => 'Manual float',
                'countedCash' => '10.00',
            ], ['Idempotency-Key' => 'cash-close-accountant'])
            ->assertForbidden();

        self::assertSame(0, DB::table('cash_closes')->where('business_date', $this->businessDate)->count());
    }

    public function test_previous_close_lineage_must_reference_the_immediately_preceding_business_date(): void
    {
        $this->withRoleSession('manager');
        $wrongPreviousDate = (new DateTimeImmutable($this->businessDate, new DateTimeZone('Asia/Kolkata')))
            ->modify('-2 days')->format('Y-m-d');
        $wrongPreviousId = $this->insertCloseRow($wrongPreviousDate, 7500);

        $created = $this->postJson('/api/v1/cash-closes', [
            'date' => $this->businessDate,
            'openingCash' => '75.00',
            'openingReason' => 'Manual opening float',
            'countedCash' => '75.00',
        ], ['Idempotency-Key' => 'cash-close-broken-carry-forward'])
            ->assertCreated();
        $closeId = (string) $created->json('data.close.id');

        $tamper = $this->migrationPdo()->prepare(
            'UPDATE cash_closes
             SET opening_source = :source, opening_close_id = :previous, opening_reason = :reason
             WHERE id = :id'
        );
        $tamper->execute([
            'source' => 'PREVIOUS_CLOSE',
            'previous' => $wrongPreviousId,
            'reason' => '',
            'id' => $closeId,
        ]);

        $this->getJson('/api/v1/cash-closes/preview?date='.$this->businessDate)
            ->assertStatus(503)
            ->assertJsonPath('error.code', 'CASH_CLOSE_DATA');
    }

    public function test_manual_opening_cannot_retain_a_previous_close_reference(): void
    {
        $this->withRoleSession('manager');
        $unrelatedCloseDate = (new DateTimeImmutable($this->businessDate, new DateTimeZone('Asia/Kolkata')))
            ->modify('-2 days')->format('Y-m-d');
        $unrelatedCloseId = $this->insertCloseRow($unrelatedCloseDate, 4500);

        $created = $this->postJson('/api/v1/cash-closes', [
            'date' => $this->businessDate,
            'openingCash' => '45.00',
            'openingReason' => 'Manual opening float',
            'countedCash' => '45.00',
        ], ['Idempotency-Key' => 'cash-close-manual-with-parent'])
            ->assertCreated();
        $closeId = (string) $created->json('data.close.id');

        $tamper = $this->migrationPdo()->prepare(
            'UPDATE cash_closes SET opening_close_id = :previous WHERE id = :id'
        );
        $tamper->execute(['previous' => $unrelatedCloseId, 'id' => $closeId]);

        $this->getJson('/api/v1/cash-closes/preview?date='.$this->businessDate)
            ->assertStatus(503)
            ->assertJsonPath('error.code', 'CASH_CLOSE_DATA');
    }

    private function insertCloseVoucher(
        string $type,
        string $cashImpact,
        int $amountPaise,
        string $approvalStatus = 'NOT_REQUIRED',
    ): string {
        $id = self::uuid();
        $number = (string) random_int(100000, 999999);
        $email = 'cash-close-fixture-'.str_replace('-', '', $this->userId).'@example.test';
        $insert = DB::connection()->getPdo()->prepare(
            'INSERT INTO vouchers (
                id, voucher_type, voucher_number, business_date,
                vendor_name_snapshot, vendor_id, vendor_type, amount_paise,
                category, notes, status, cash_impact, approval_status,
                approval_reason, payment_method, cancel_reason, client_id,
                source_legacy_id, created_by_user_id, created_by_email_snapshot,
                updated_by_user_id, approved_by_user_id, created_at_utc,
                updated_at_utc, approved_at_utc
            ) VALUES (
                :id, :type, :number, :date,
                :vendor, NULL, :vendor_type, :amount,
                :category, :notes, :status, :impact, :approval,
                :approval_reason, :method, :cancel_reason, :client_id,
                NULL, :creator, :email,
                NULL, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), NULL
            )'
        );
        $insert->execute([
            'id' => $id,
            'type' => $type,
            'number' => $number,
            'date' => $this->businessDate,
            'vendor' => 'Cash Close '.$type.' Fixture',
            'vendor_type' => 'ONE_TIME',
            'amount' => $amountPaise,
            'category' => 'Other',
            'notes' => '',
            'status' => 'ACTIVE',
            'impact' => $cashImpact,
            'approval' => $approvalStatus,
            'approval_reason' => '',
            'method' => 'CASH',
            'cancel_reason' => '',
            'client_id' => 'cash-close-fixture-'.$id,
            'creator' => $this->userId,
            'email' => $email,
        ]);

        return $id;
    }

    private function insertCloseRow(string $date, int $countedCashPaise): string
    {
        $id = self::uuid();
        $insert = DB::connection()->getPdo()->prepare(
            'INSERT INTO cash_closes (
                id, business_date, drawer_key, opening_cash_paise, opening_source,
                opening_close_id, opening_reason, cash_in_total_paise, cash_out_total_paise,
                expected_cash_paise, counted_cash_paise, variance_paise, variance_reason,
                included_voucher_count, included_voucher_ids, included_voucher_snapshot,
                created_by_user_id, created_at_utc, time_zone, request_id, request_payload_hash
            ) VALUES (
                :id, :date, :drawer, :opening, :source,
                NULL, :opening_reason, 0, 0, :expected, :counted, :variance, :variance_reason,
                0, JSON_ARRAY(), JSON_ARRAY(), :creator, UTC_TIMESTAMP(6), :timezone, :request_id, :hash
            )'
        );
        $insert->execute([
            'id' => $id,
            'date' => $date,
            'drawer' => 'MAIN',
            'opening' => $countedCashPaise,
            'source' => 'MANUAL',
            'opening_reason' => 'Manual opening float',
            'expected' => $countedCashPaise,
            'counted' => $countedCashPaise,
            'variance' => 0,
            'variance_reason' => '',
            'creator' => $this->userId,
            'timezone' => 'Asia/Kolkata',
            'request_id' => self::uuid(),
            'hash' => hash('sha256', self::uuid()),
        ]);

        return $id;
    }
}
