<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class VoucherLifecycleTest extends TestCase
{
    public function test_manager_can_edit_active_voucher_and_append_a_before_after_audit(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Lifecycle Supplier', 12500);

        $response = $this->withRoleSession('manager')
            ->patchJson('/api/v1/vouchers/'.$voucherId, [
                'fields' => [
                    'amount' => '850.25',
                    'notes' => 'Corrected after invoice review',
                    'paymentMethod' => 'UPI',
                ],
                'reason' => 'Invoice amount corrected',
            ], ['Idempotency-Key' => 'voucher-edit-'.bin2hex(random_bytes(5))]);

        $response->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('data.replayed', false)
            ->assertJsonPath('data.voucher.amount', '850.25')
            ->assertJsonPath('data.voucher.notes', 'Corrected after invoice review')
            ->assertJsonPath('data.voucher.paymentMethod', 'UPI');

        self::assertSame(85025, (int) DB::table('vouchers')->where('id', $voucherId)->value('amount_paise'));
        self::assertSame(
            'UPI',
            DB::table('vouchers')->where('id', $voucherId)->value('payment_method'),
        );

        $event = DB::table('audit_events')
            ->where('target_type', 'voucher')
            ->where('target_id', $voucherId)
            ->where('event_type', 'VOUCHER_UPDATED')
            ->first();

        self::assertNotNull($event);
        self::assertSame('Invoice amount corrected', $event->reason);
        self::assertSame(
            12500,
            json_decode((string) $event->before_json, true)['voucher']['amountPaise'],
        );
        self::assertSame(
            85025,
            json_decode((string) $event->after_json, true)['voucher']['amountPaise'],
        );
    }

    public function test_voucher_edit_requires_a_real_change_and_a_correction_reason(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Reason Supplier', 10000);

        $this->withRoleSession('manager')
            ->patchJson('/api/v1/vouchers/'.$voucherId, [
                'fields' => ['notes' => 'Updated note'],
            ], ['Idempotency-Key' => 'voucher-edit-no-reason'])
            ->assertUnprocessable();

        $this->withLegacySession()
            ->patchJson('/api/v1/vouchers/'.$voucherId, [
                'fields' => ['category' => 'Other'],
                'reason' => 'No actual change',
            ], ['Idempotency-Key' => 'voucher-edit-noop'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'NO_CHANGES');

        self::assertSame('', DB::table('vouchers')->where('id', $voucherId)->value('notes'));
        self::assertSame(0, DB::table('audit_events')->where('target_id', $voucherId)->where('event_type', 'VOUCHER_UPDATED')->count());
    }

    public function test_edit_is_blocked_when_the_original_or_new_business_date_is_closed(): void
    {
        $originalDateVoucher = $this->insertVoucherFixture($this->userId, 'Closed Original Supplier', 10000);
        $this->insertCashCloseFixture($this->userId, $this->businessDate);

        $this->withRoleSession('manager')
            ->patchJson('/api/v1/vouchers/'.$originalDateVoucher, [
                'fields' => ['notes' => 'Try to edit a closed date'],
                'reason' => 'Closed date correction',
            ], ['Idempotency-Key' => 'voucher-closed-original'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'CASH_CLOSE_DATE_LOCKED');

        $otherDate = (new \DateTimeImmutable('-2 days', new \DateTimeZone('Asia/Kolkata')))->format('Y-m-d');
        $targetDateVoucher = $this->insertVoucherFixture($this->userId, 'Closed Target Supplier', 10000, $otherDate);
        $this->insertCashCloseFixture($this->userId, $otherDate);

        $this->withLegacySession()
            ->patchJson('/api/v1/vouchers/'.$targetDateVoucher, [
                'fields' => ['date' => $this->businessDate],
                'reason' => 'Move to closed day',
            ], ['Idempotency-Key' => 'voucher-closed-target'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'CASH_CLOSE_DATE_LOCKED');

        self::assertSame($otherDate, DB::table('vouchers')->where('id', $targetDateVoucher)->value('business_date'));
    }

    public function test_cancelled_vouchers_cannot_be_edited(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Already Cancelled Supplier', 10000);
        DB::table('vouchers')->where('id', $voucherId)->update([
            'status' => 'CANCELLED',
            'cancel_reason' => 'Existing reason',
        ]);

        $this->withRoleSession('manager')
            ->patchJson('/api/v1/vouchers/'.$voucherId, [
                'fields' => ['notes' => 'Attempted edit'],
                'reason' => 'Correct an old voucher',
            ], ['Idempotency-Key' => 'voucher-edit-cancelled'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'VOUCHER_NOT_EDITABLE');
    }

    public function test_non_material_edit_preserves_approval_but_material_edit_recalculates_it(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Approval Recheck Supplier', 1_200_000);
        DB::table('vouchers')->where('id', $voucherId)->update([
            'approval_status' => 'APPROVED',
            'approved_by_user_id' => $this->userId,
            'approved_at_utc' => now('UTC')->format('Y-m-d H:i:s'),
            'approval_reason' => '',
        ]);

        $this->withRoleSession('manager')
            ->patchJson('/api/v1/vouchers/'.$voucherId, [
                'fields' => ['category' => 'Maintenance'],
                'reason' => 'Correct expense category',
            ], ['Idempotency-Key' => 'voucher-category-only'])
            ->assertOk()
            ->assertJsonPath('data.voucher.approvalStatus', 'APPROVED');

        $this->withLegacySession()
            ->patchJson('/api/v1/vouchers/'.$voucherId, [
                'fields' => ['amount' => '9000.00'],
                'reason' => 'Invoice corrected below threshold',
            ], ['Idempotency-Key' => 'voucher-approval-reset'])
            ->assertOk()
            ->assertJsonPath('data.voucher.approvalStatus', 'NOT_REQUIRED');

        $row = DB::table('vouchers')->where('id', $voucherId)->first();
        self::assertSame('NOT_REQUIRED', $row->approval_status);
        self::assertNull($row->approved_by_user_id);
        self::assertNull($row->approved_at_utc);
        self::assertSame('', $row->approval_reason);
    }

    public function test_material_edit_that_crosses_approval_threshold_returns_to_pending(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Approval Threshold Supplier', 950000);

        $this->withRoleSession('manager')
            ->patchJson('/api/v1/vouchers/'.$voucherId, [
                'fields' => ['amount' => '10000.00'],
                'reason' => 'Final invoice increased the amount',
            ], ['Idempotency-Key' => 'voucher-cross-threshold'])
            ->assertOk()
            ->assertJsonPath('data.voucher.approvalStatus', 'PENDING');

        self::assertSame('PENDING', DB::table('vouchers')->where('id', $voucherId)->value('approval_status'));
    }

    public function test_cancellation_requires_reason_updates_status_and_audits(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Cancel Supplier', 12345);

        $this->withRoleSession('manager')
            ->postJson('/api/v1/vouchers/'.$voucherId.'/cancel', [], [
                'Idempotency-Key' => 'voucher-cancel-no-reason',
            ])
            ->assertUnprocessable();

        $response = $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/cancel', [
                'reason' => 'Duplicate invoice entry',
            ], ['Idempotency-Key' => 'voucher-cancel-'.bin2hex(random_bytes(4))]);

        $response->assertOk()
            ->assertJsonPath('data.voucher.status', 'CANCELLED')
            ->assertJsonPath('data.voucher.cancelReason', 'Duplicate invoice entry');

        self::assertSame('CANCELLED', DB::table('vouchers')->where('id', $voucherId)->value('status'));
        self::assertSame(
            1,
            DB::table('audit_events')
                ->where('target_id', $voucherId)
                ->where('event_type', 'VOUCHER_CANCELLED')
                ->count(),
        );
    }

    public function test_cancellation_is_idempotent_and_conflicts_on_changed_reason(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Cancel Replay Supplier', 10000);
        $key = 'voucher-cancel-replay-'.bin2hex(random_bytes(4));
        $payload = ['reason' => 'Supplier invoice voided'];

        $this->withRoleSession('manager')
            ->postJson('/api/v1/vouchers/'.$voucherId.'/cancel', $payload, ['Idempotency-Key' => $key])
            ->assertOk()
            ->assertJsonPath('data.replayed', false);

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/cancel', $payload, ['Idempotency-Key' => $key])
            ->assertOk()
            ->assertJsonPath('data.replayed', true);

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/cancel', ['reason' => 'Different reason'], [
                'Idempotency-Key' => $key,
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'IDEMPOTENCY_CONFLICT');

        self::assertSame(
            1,
            DB::table('audit_events')->where('target_id', $voucherId)->where('event_type', 'VOUCHER_CANCELLED')->count(),
        );
    }

    public function test_cancellation_is_blocked_after_cash_close(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Closed Cancel Supplier', 10000);
        $this->insertCashCloseFixture($this->userId, $this->businessDate);

        $this->withRoleSession('manager')
            ->postJson('/api/v1/vouchers/'.$voucherId.'/cancel', [
                'reason' => 'Attempt after cash close',
            ], ['Idempotency-Key' => 'voucher-cancel-closed'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'CASH_CLOSE_DATE_LOCKED');

        self::assertSame('ACTIVE', DB::table('vouchers')->where('id', $voucherId)->value('status'));
    }

    public function test_manager_approval_is_idempotent_and_persisted_as_append_only_event(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Awaiting Approval Supplier', 1_000_000);
        DB::table('vouchers')->where('id', $voucherId)->update(['approval_status' => 'PENDING']);
        $key = 'voucher-approve-'.bin2hex(random_bytes(4));

        $first = $this->withRoleSession('manager')
            ->postJson('/api/v1/vouchers/'.$voucherId.'/approval', [], ['Idempotency-Key' => $key]);
        $first->assertOk()
            ->assertJsonPath('data.replayed', false)
            ->assertJsonPath('data.voucher.approvalStatus', 'APPROVED');

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/approval', [], ['Idempotency-Key' => $key])
            ->assertOk()
            ->assertJsonPath('data.replayed', true);

        self::assertSame(
            1,
            DB::table('voucher_approval_events')->where('voucher_id', $voucherId)->where('decision', 'APPROVE')->count(),
        );
        self::assertSame(
            1,
            DB::table('audit_events')->where('target_id', $voucherId)->where('event_type', 'PAYMENT_VOUCHER_APPROVED')->count(),
        );
    }

    public function test_creator_cannot_approve_their_own_payment(): void
    {
        $principal = $this->withRoleSession('manager');
        $voucherId = $this->insertVoucherFixture($this->userId, 'Self Approval Supplier', 1_000_000);
        DB::table('vouchers')->where('id', $voucherId)->update([
            'approval_status' => 'PENDING',
            'created_by_email_snapshot' => 'laravel-'.str_replace('-', '', $this->userId).'@example.test',
        ]);

        $principal->postJson('/api/v1/vouchers/'.$voucherId.'/approval', [], [
            'Idempotency-Key' => 'voucher-self-approve',
        ])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'FORBIDDEN');

        self::assertSame('PENDING', DB::table('vouchers')->where('id', $voucherId)->value('approval_status'));
        self::assertSame(0, DB::table('voucher_approval_events')->where('voucher_id', $voucherId)->count());
    }

    public function test_rejection_requires_reason_and_writes_decision_event(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Reject Supplier', 1_000_000);
        DB::table('vouchers')->where('id', $voucherId)->update(['approval_status' => 'PENDING']);

        $this->withRoleSession('manager')
            ->postJson('/api/v1/vouchers/'.$voucherId.'/rejection', [], [
                'Idempotency-Key' => 'voucher-reject-missing-reason',
            ])
            ->assertUnprocessable();

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/rejection', [
                'reason' => 'Supporting document missing',
            ], ['Idempotency-Key' => 'voucher-reject-'.bin2hex(random_bytes(4))])
            ->assertOk()
            ->assertJsonPath('data.voucher.approvalStatus', 'REJECTED')
            ->assertJsonPath('data.voucher.approvalReason', 'Supporting document missing');

        $event = DB::table('voucher_approval_events')
            ->where('voucher_id', $voucherId)
            ->where('decision', 'REJECT')
            ->first();
        self::assertNotNull($event);
        self::assertSame('PENDING', $event->previous_status);
        self::assertSame('REJECTED', $event->next_status);
        self::assertSame('Supporting document missing', $event->reason);
    }

    public function test_staff_cannot_edit_cancel_or_approve_payment_vouchers(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Staff Guard Supplier', 1_000_000);
        DB::table('vouchers')->where('id', $voucherId)->update(['approval_status' => 'PENDING']);

        $this->withLegacySession()
            ->patchJson('/api/v1/vouchers/'.$voucherId, [
                'fields' => ['notes' => 'Not permitted'],
                'reason' => 'Attempt from staff role',
            ], ['Idempotency-Key' => 'voucher-staff-edit'])
            ->assertForbidden();

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/cancel', [
                'reason' => 'Attempt from staff role',
            ], ['Idempotency-Key' => 'voucher-staff-cancel'])
            ->assertForbidden();

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/approval', [], [
                'Idempotency-Key' => 'voucher-staff-approve',
            ])
            ->assertForbidden();

        self::assertSame('ACTIVE', DB::table('vouchers')->where('id', $voucherId)->value('status'));
        self::assertSame('PENDING', DB::table('vouchers')->where('id', $voucherId)->value('approval_status'));
    }
}
