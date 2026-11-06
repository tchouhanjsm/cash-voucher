<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class VoucherApiTest extends TestCase
{
    public function test_liveness_does_not_require_authentication(): void
    {
        $this->getJson('/api/v1/health/live')
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('data.status', 'live')
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_voucher_register_rejects_missing_session(): void
    {
        $this->getJson('/api/v1/vouchers')
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'SESSION_REQUIRED');
    }

    public function test_staff_register_is_creator_scoped(): void
    {
        $otherUser = $this->createUser('staff');
        $this->insertVoucherFixture($this->userId, 'Own vendor', 10000);
        $this->insertVoucherFixture($otherUser, 'Other vendor', 20000);

        $response = $this->withLegacySession()->getJson('/api/v1/vouchers');

        $response->assertOk()
            ->assertJsonPath('data.totalCount', 1)
            ->assertJsonPath('data.items.0.vendor', 'Own vendor');
    }

    public function test_accountant_cannot_open_the_voucher_register(): void
    {
        $accountantId = $this->createUser('accountant');
        $token = bin2hex(random_bytes(32));
        $csrf = bin2hex(random_bytes(32));

        $pdo = DB::connection()->getPdo();
        $statement = $pdo->prepare(
            'INSERT INTO user_sessions (
                id, user_id, session_token_hash, csrf_token_hash,
                created_at_utc, last_seen_at_utc, expires_at_utc, revoked_at_utc
            ) VALUES (
                :id, :user, :session, :csrf,
                UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), UTC_TIMESTAMP(6) + INTERVAL 6 HOUR, NULL
            )'
        );
        $statement->execute([
            'id' => self::uuid(),
            'user' => $accountantId,
            'session' => hash('sha256', $token),
            'csrf' => hash('sha256', $csrf),
        ]);

        $this->withCookie('cv_session', $token)
            ->withCookie('cv_csrf', $csrf)
            ->getJson('/api/v1/vouchers')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'FORBIDDEN');
    }

    public function test_state_changing_request_requires_csrf_header(): void
    {
        $payload = $this->validPayload();

        $this->withCookie('cv_session', $this->sessionToken)
            ->withCookie('cv_csrf', $this->csrfToken)
            ->postJson('/api/v1/vouchers', $payload, ['Idempotency-Key' => 'csrf-test-001'])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'CSRF_INVALID');
    }

    public function test_voucher_create_is_idempotent_and_audited_atomically(): void
    {
        $payload = $this->validPayload();
        $key = 'laravel-create-'.bin2hex(random_bytes(8));

        $first = $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $payload, ['Idempotency-Key' => $key]);

        $first->assertCreated()
            ->assertJsonPath('data.replayed', false)
            ->assertJsonPath('data.voucher.date', $this->businessDate)
            ->assertJsonPath('data.voucher.amount', '125.50')
            ->assertJsonPath('data.voucher.approvalStatus', 'NOT_REQUIRED');

        $voucherId = (string) $first->json('data.voucher.id');
        $voucherNo = (string) $first->json('data.voucher.voucherNo');

        $second = $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $payload, ['Idempotency-Key' => $key]);

        $second->assertOk()
            ->assertJsonPath('data.replayed', true)
            ->assertJsonPath('data.voucher.id', $voucherId)
            ->assertJsonPath('data.voucher.voucherNo', $voucherNo);

        self::assertSame(
            1,
            DB::table('vouchers')->where('client_id', $payload['clientId'])->count(),
            'The same client operation must not create a second voucher.',
        );
        self::assertSame(
            1,
            DB::table('audit_events')->where('target_id', $voucherId)->where('event_type', 'VOUCHER_CREATED')->count(),
            'Idempotent replay must not append a second create audit event.',
        );
    }

    public function test_reusing_idempotency_key_with_different_payload_is_a_conflict(): void
    {
        $payload = $this->validPayload();
        $key = 'laravel-conflict-'.bin2hex(random_bytes(8));

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $payload, ['Idempotency-Key' => $key])
            ->assertCreated();

        $changed = $payload;
        $changed['amount'] = '126.00';

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $changed, ['Idempotency-Key' => $key])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'IDEMPOTENCY_CONFLICT');

        self::assertSame(
            1,
            DB::table('vouchers')->where('client_id', $payload['clientId'])->count(),
        );
    }

    public function test_duplicate_payment_requires_a_fresh_confirmation_token(): void
    {
        $this->insertVoucherFixture($this->userId, 'Repeated supplier', 45000);

        $payload = $this->validPayload([
            'vendor' => 'Repeated supplier',
            'amount' => '450.00',
        ]);

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $payload, [
                'Idempotency-Key' => 'duplicate-first-'.bin2hex(random_bytes(5)),
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'DUPLICATE_CONFIRMATION_REQUIRED');

        $check = $this->withLegacySession()
            ->postJson('/api/v1/vouchers/duplicate-check', $payload);

        $check->assertOk()
            ->assertJsonPath('data.duplicateCount', 1);

        $token = (string) $check->json('data.confirmationToken');
        self::assertNotSame('', $token);

        $payload['duplicateConfirmationToken'] = $token;

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $payload, [
                'Idempotency-Key' => 'duplicate-confirmed-'.bin2hex(random_bytes(5)),
            ])
            ->assertCreated();
    }

    public function test_payment_requires_approval_at_existing_ten_thousand_rupee_threshold(): void
    {
        $payload = $this->validPayload([
            'vendor' => 'Threshold supplier '.bin2hex(random_bytes(4)),
            'amount' => '10000.00',
        ]);

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $payload, [
                'Idempotency-Key' => 'threshold-'.bin2hex(random_bytes(8)),
            ])
            ->assertCreated()
            ->assertJsonPath('data.voucher.approvalStatus', 'PENDING');
    }

    public function test_cash_closed_business_date_rejects_voucher_creation(): void
    {
        $this->insertCashCloseFixture($this->userId, $this->businessDate);
        $payload = $this->validPayload([
            'vendor' => 'Closed-date vendor '.bin2hex(random_bytes(4)),
        ]);

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $payload, [
                'Idempotency-Key' => 'closed-date-'.bin2hex(random_bytes(8)),
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'CASH_CLOSE_DATE_LOCKED');

        self::assertSame(
            0,
            DB::table('vouchers')->where('client_id', $payload['clientId'])->count(),
        );
    }

    public function test_missing_receipt_sequence_fails_closed_without_guessing_a_number(): void
    {
        $payload = $this->validPayload([
            'type' => 'RECEIPT',
            'cashImpact' => 'CASH_IN',
            'vendor' => 'Receipt sequence test '.bin2hex(random_bytes(4)),
        ]);

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $payload, [
                'Idempotency-Key' => 'receipt-no-sequence-'.bin2hex(random_bytes(8)),
            ])
            ->assertStatus(503)
            ->assertJsonPath('error.code', 'VOUCHER_SEQUENCE_NOT_INITIALIZED');

        self::assertSame(
            0,
            DB::table('vouchers')->where('client_id', $payload['clientId'])->count(),
        );
    }

    public function test_non_empty_receipts_are_not_silently_discarded_in_this_phase(): void
    {
        $payload = $this->validPayload([
            'receipts' => [['mime' => 'image/png', 'data' => 'ZmFrZQ==']],
        ]);

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $payload, [
                'Idempotency-Key' => 'receipt-explicit-'.bin2hex(random_bytes(8)),
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'VALIDATION_FAILED');
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'date' => $this->businessDate,
            'vendor' => 'Test supplier '.bin2hex(random_bytes(4)),
            'amount' => '125.50',
            'category' => 'Other',
            'notes' => 'Laravel integration fixture',
            'type' => 'PAYMENT',
            'cashImpact' => 'CASH_OUT',
            'paymentMethod' => 'CASH',
            'clientId' => 'laravel-client-'.bin2hex(random_bytes(8)),
        ], $overrides);
    }
}
