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

        $ownEmail = 'fixture-'.$this->userId.'@example.test';
        $response = $this->withLegacySession()->getJson('/api/v1/vouchers');

        $response->assertOk()
            ->assertJsonPath('data.totalCount', 1)
            ->assertJsonPath('data.items.0.vendor', 'Own vendor')
            ->assertJsonPath('data.facets.vendors', ['Own vendor'])
            ->assertJsonPath('data.facets.users', [$ownEmail]);
    }

    public function test_register_filters_search_totals_and_facets_match_the_legacy_contract(): void
    {
        $this->withRoleSession('manager');
        $otherUser = $this->createUser('staff');

        $paymentId = $this->insertVoucherFixture($this->userId, 'Acme Steel', 12550);
        $receiptId = $this->insertVoucherFixture($otherUser, 'Acme Return', 4500);
        $pendingId = $this->insertVoucherFixture($this->userId, 'Pending Supplier', 0);
        $cancelledId = $this->insertVoucherFixture($otherUser, 'Cancelled Supplier', 6000);

        DB::table('vouchers')->where('id', $paymentId)->update([
            'voucher_type' => 'PAYMENT',
            'voucher_number' => '501',
            'category' => 'Travel',
            'notes' => 'Trip note Jaipur',
            'cash_impact' => 'CASH_OUT',
            'approval_status' => 'APPROVED',
            'payment_method' => 'UPI',
        ]);
        DB::table('vouchers')->where('id', $receiptId)->update([
            'voucher_type' => 'RECEIPT',
            'voucher_number' => '502',
            'category' => 'Guest Advance',
            'notes' => 'Refund received',
            'cash_impact' => 'CASH_IN',
            'approval_status' => 'NOT_REQUIRED',
            'payment_method' => 'CASH',
        ]);
        DB::table('vouchers')->where('id', $pendingId)->update([
            'voucher_type' => 'PAYMENT',
            'voucher_number' => '503',
            'category' => 'Travel',
            'notes' => 'Waiting for approval',
            'cash_impact' => 'UNCLASSIFIED',
            'approval_status' => 'PENDING',
            'payment_method' => '',
        ]);
        DB::table('vouchers')->where('id', $cancelledId)->update([
            'voucher_type' => 'PAYMENT',
            'voucher_number' => '504',
            'category' => 'Maintenance',
            'notes' => 'Cancelled supplier payment',
            'status' => 'CANCELLED',
            'cash_impact' => 'CASH_OUT',
            'approval_status' => 'NOT_REQUIRED',
            'payment_method' => 'BANK_TRANSFER',
        ]);

        $managerEmail = 'fixture-'.$this->userId.'@example.test';
        $otherEmail = 'fixture-'.$otherUser.'@example.test';

        $all = $this->withLegacySession()->getJson('/api/v1/vouchers?'.http_build_query([
            'status' => 'ALL',
            'offset' => 0,
            'limit' => 2,
        ]));
        $all->assertOk()
            ->assertJsonPath('data.totalCount', 4)
            ->assertJsonPath('data.limit', 2)
            ->assertJsonPath('data.hasMore', true)
            ->assertJsonPath('data.totals.paid', '125.50')
            ->assertJsonPath('data.totals.received', '45.00')
            ->assertJsonPath('data.totals.approvalExceptionCount', 1)
            ->assertJsonPath('data.totals.invalidAmountCount', 1)
            ->assertJsonPath('data.totals.malformedRecordCount', 0)
            ->assertJsonPath('data.totals.malformedFieldCount', 0)
            ->assertJsonPath('data.facets.vendors', [
                'Acme Return',
                'Acme Steel',
                'Cancelled Supplier',
                'Pending Supplier',
            ])
            ->assertJsonPath('data.facets.users', [$managerEmail, $otherEmail]);

        $exportPage = $this->withLegacySession()->getJson('/api/v1/vouchers?'.http_build_query([
            'status' => 'ALL',
            'offset' => 0,
            'limit' => 200,
        ]));
        $exportPage->assertOk()
            ->assertJsonPath('data.limit', 200)
            ->assertJsonPath('data.totalCount', 4)
            ->assertJsonPath('data.hasMore', false);

        $searchByReceiptNumber = $this->withLegacySession()->getJson('/api/v1/vouchers?'.http_build_query([
            'q' => 'r-502',
        ]));
        $searchByReceiptNumber->assertOk()
            ->assertJsonPath('data.totalCount', 1)
            ->assertJsonPath('data.items.0.type', 'RECEIPT')
            ->assertJsonPath('data.items.0.voucherNo', '502');

        $searchByNote = $this->withLegacySession()->getJson('/api/v1/vouchers?'.http_build_query([
            'q' => 'jaipur',
        ]));
        $searchByNote->assertOk()
            ->assertJsonPath('data.totalCount', 1)
            ->assertJsonPath('data.items.0.vendor', 'Acme Steel');

        $combinedFilters = $this->withLegacySession()->getJson('/api/v1/vouchers?'.http_build_query([
            'q' => 'trip note',
            'vendor' => 'Acme Steel',
            'cat' => 'Travel',
            'user' => $managerEmail,
            'type' => 'PAYMENT',
            'status' => 'ACTIVE',
            'approval' => 'APPROVED',
            'paymentMethod' => 'UPI',
            'cashImpact' => 'CASH_OUT',
            'amountValidity' => 'VALID',
            'from' => $this->businessDate,
            'to' => $this->businessDate,
            'limit' => 100,
        ]));
        $combinedFilters->assertOk()
            ->assertJsonPath('data.totalCount', 1)
            ->assertJsonPath('data.items.0.id', $paymentId)
            ->assertJsonPath('data.totals.paid', '125.50')
            ->assertJsonPath('data.totals.received', '0.00');

        $pendingExceptions = $this->withLegacySession()->getJson('/api/v1/vouchers?'.http_build_query([
            'approval' => 'PENDING',
            'paymentMethod' => 'UNRECORDED',
            'cashImpact' => 'UNCLASSIFIED',
            'amountValidity' => 'INVALID',
        ]));
        $pendingExceptions->assertOk()
            ->assertJsonPath('data.totalCount', 1)
            ->assertJsonPath('data.items.0.id', $pendingId)
            ->assertJsonPath('data.totals.invalidAmountCount', 1)
            ->assertJsonPath('data.totals.approvalExceptionCount', 1);

        $unfilteredPaymentMethod = $this->withLegacySession()->getJson('/api/v1/vouchers?'.http_build_query([
            'paymentMethod' => 'UNRECOGNIZED',
        ]));
        $unfilteredPaymentMethod->assertOk()
            ->assertJsonPath('data.totalCount', 0);

        $invalidFilter = $this->withLegacySession()->getJson('/api/v1/vouchers?approval=WAITING');
        $invalidFilter->assertUnprocessable()
            ->assertJsonPath('error.code', 'FILTER_INVALID');
    }

    public function test_staff_cannot_filter_other_users_and_facets_remain_creator_scoped(): void
    {
        $otherUser = $this->createUser('staff');
        $this->insertVoucherFixture($this->userId, 'Own visible supplier', 10000);
        $this->insertVoucherFixture($otherUser, 'Hidden supplier', 20000);

        $forbidden = $this->withLegacySession()->getJson('/api/v1/vouchers?'.http_build_query([
            'user' => 'fixture-'.$otherUser.'@example.test',
        ]));
        $forbidden->assertForbidden()->assertJsonPath('error.code', 'FORBIDDEN');

        $ownEmail = 'fixture-'.$this->userId.'@example.test';
        $visible = $this->withLegacySession()->getJson('/api/v1/vouchers');
        $visible->assertOk()
            ->assertJsonPath('data.totalCount', 1)
            ->assertJsonPath('data.facets.vendors', ['Own visible supplier'])
            ->assertJsonPath('data.facets.users', [$ownEmail]);
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

        $this->withCredentials()
            ->withUnencryptedCookies([
                'cv_session' => $token,
                'cv_csrf' => $csrf,
            ])
            ->getJson('/api/v1/vouchers')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'FORBIDDEN');
    }

    public function test_state_changing_request_requires_csrf_header(): void
    {
        $payload = $this->validPayload();

        $this->withCredentials()
            ->withUnencryptedCookies([
                'cv_session' => $this->sessionToken,
                'cv_csrf' => $this->csrfToken,
            ])
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

    public function test_create_retry_ignores_a_refreshed_duplicate_confirmation_token(): void
    {
        $this->insertVoucherFixture($this->userId, 'Delayed retry supplier', 45000);
        $payload = $this->validPayload([
            'vendor' => 'Delayed retry supplier',
            'amount' => '450.00',
            'clientId' => 'delayed-retry-client-'.bin2hex(random_bytes(5)),
        ]);
        $token = $this->withLegacySession()
            ->postJson('/api/v1/vouchers/duplicate-check', $payload)
            ->assertOk()
            ->json('data.confirmationToken');
        self::assertNotSame('', $token);
        $payload['duplicateConfirmationToken'] = $token;
        $key = 'delayed-retry-'.bin2hex(random_bytes(8));

        $first = $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $payload, ['Idempotency-Key' => $key]);
        $first->assertCreated()->assertJsonPath('data.replayed', false);
        $voucherId = (string) $first->json('data.voucher.id');

        // Model the token having expired between an unknown-outcome response and retry.
        // The voucher payload and client operation identity are unchanged.
        $payload['duplicateConfirmationToken'] = 'expired-review-token-replaced';
        $retry = $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $payload, ['Idempotency-Key' => $key]);

        $retry->assertOk()
            ->assertJsonPath('data.replayed', true)
            ->assertJsonPath('data.voucher.id', $voucherId);
        self::assertSame(
            1,
            DB::table('vouchers')->where('client_id', $payload['clientId'])->count(),
        );
        self::assertSame(
            1,
            DB::table('audit_events')
                ->where('target_id', $voucherId)
                ->where('event_type', 'VOUCHER_CREATED')
                ->count(),
            'Refreshing an ephemeral duplicate token must not create another voucher or audit event.',
        );
    }

    public function test_duplicate_check_reuses_a_stable_token_for_the_review_window_without_writing(): void
    {
        $this->insertVoucherFixture($this->userId, 'Review window supplier', 45000);
        $payload = $this->validPayload([
            'vendor' => 'Review window supplier',
            'amount' => '450.00',
        ]);
        $beforeCount = DB::table('vouchers')->count();

        $first = $this->withLegacySession()
            ->postJson('/api/v1/vouchers/duplicate-check', $payload);
        $second = $this->withLegacySession()
            ->postJson('/api/v1/vouchers/duplicate-check', $payload);

        $first->assertOk()->assertJsonPath('data.duplicateCount', 1);
        $second->assertOk()->assertJsonPath('data.duplicateCount', 1);
        self::assertNotSame('', $first->json('data.confirmationToken'));
        self::assertSame(
            $first->json('data.confirmationToken'),
            $second->json('data.confirmationToken'),
            'A stable candidate snapshot must keep one review token throughout its ten-minute window.',
        );
        self::assertSame(
            $beforeCount,
            DB::table('vouchers')->count(),
            'Duplicate review must not create or mutate vouchers.',
        );
    }

    public function test_duplicate_review_ignores_the_same_client_operation_after_a_create(): void
    {
        $payload = $this->validPayload([
            'vendor' => 'Replay-safe supplier',
            'amount' => '325.00',
            'clientId' => 'replay-safe-client-'.bin2hex(random_bytes(5)),
        ]);

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $payload, [
                'Idempotency-Key' => 'voucher-replay-safe-'.bin2hex(random_bytes(5)),
            ])
            ->assertCreated();

        $sameOperation = $this->withLegacySession()
            ->postJson('/api/v1/vouchers/duplicate-check', $payload);
        $sameOperation->assertOk()->assertJsonPath('data.duplicateCount', 0);

        $newOperation = $payload;
        $newOperation['clientId'] = 'different-client-'.bin2hex(random_bytes(5));
        $differentOperation = $this->withLegacySession()
            ->postJson('/api/v1/vouchers/duplicate-check', $newOperation);
        $differentOperation->assertOk()->assertJsonPath('data.duplicateCount', 1);
    }

    public function test_unregistered_payee_is_recorded_as_one_time_not_unverified(): void
    {
        $name = 'One-time payee '.bin2hex(random_bytes(5));
        $payload = $this->validPayload(['vendor' => $name]);

        $response = $this->withLegacySession()
            ->postJson('/api/v1/vouchers', $payload, [
                'Idempotency-Key' => 'one-time-payee-'.bin2hex(random_bytes(8)),
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.voucher.vendorType', 'ONE_TIME')
            ->assertJsonPath('data.voucher.vendorId', null);

        self::assertSame(
            'ONE_TIME',
            DB::table('vouchers')->where('client_id', $payload['clientId'])->value('vendor_type'),
            'An unregistered new payee must preserve the legacy one-time payee classification.',
        );
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
            // Keep this date separate from the current test's synthetic close date.
            'date' => (new \DateTimeImmutable('-5 days', new \DateTimeZone('Asia/Kolkata')))->format('Y-m-d'),
            'type' => 'RECEIPT',
            'cashImpact' => 'CASH_IN',
            'vendor' => 'Receipt sequence test '.bin2hex(random_bytes(4)),
        ]);

        // Settings feature tests intentionally provision the RECEIPT series. Remove
        // it briefly with the migration identity because the runtime account must
        // never receive DELETE on voucher_number_sequences.
        $admin = $this->migrationPdo();
        $lookup = $admin->prepare(
            'SELECT next_number, updated_at_utc
             FROM voucher_number_sequences
             WHERE voucher_type = :type LIMIT 1'
        );
        $lookup->execute(['type' => 'RECEIPT']);
        $previous = $lookup->fetch();
        $delete = $admin->prepare('DELETE FROM voucher_number_sequences WHERE voucher_type = :type');
        $delete->execute(['type' => 'RECEIPT']);

        try {
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
        } finally {
            if (is_array($previous)) {
                $restore = $admin->prepare(
                    'INSERT INTO voucher_number_sequences (voucher_type, next_number, updated_at_utc)
                     VALUES (:type, :number, :updated_at)
                     ON DUPLICATE KEY UPDATE
                        next_number = VALUES(next_number),
                        updated_at_utc = VALUES(updated_at_utc)'
                );
                $restore->execute([
                    'type' => 'RECEIPT',
                    'number' => (int) $previous['next_number'],
                    'updated_at' => (string) $previous['updated_at_utc'],
                ]);
            }
        }
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
