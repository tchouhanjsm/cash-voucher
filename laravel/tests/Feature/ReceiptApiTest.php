<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class ReceiptApiTest extends TestCase
{
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');
    }

    public function test_staff_can_attach_and_read_a_receipt_for_an_own_voucher(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Receipt Supplier', 12500);

        $response = $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/receipts', [
                'receipt' => $this->receiptPayload(),
            ], ['Idempotency-Key' => 'receipt-own-'.bin2hex(random_bytes(4))]);

        $response->assertCreated()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('data.receipt.voucherId', $voucherId)
            ->assertJsonPath('data.receipt.contentType', 'image/png')
            ->assertJsonPath('data.receipt.byteSize', 68)
            ->assertJsonPath('data.receiptCount', 1)
            ->assertJsonMissingPath('data.receipt.storageKey');

        $receiptId = (string) $response->json('data.receipt.id');
        $row = DB::table('voucher_receipts')->where('id', $receiptId)->first();
        self::assertNotNull($row);
        self::assertSame(hash('sha256', base64_decode(self::PNG, true)), $row->sha256);
        self::assertStringStartsWith('receipts/', $row->storage_key);
        self::assertTrue(Storage::disk('private')->exists($row->storage_key));

        $download = $this->withLegacySession()->get('/api/v1/receipts/'.$receiptId);
        $download->assertOk()
            ->assertHeader('Content-Type', 'image/png')
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        self::assertSame(base64_decode(self::PNG, true), $download->getContent());
    }

    public function test_manager_can_attach_receipts_to_another_users_voucher(): void
    {
        $otherUser = $this->createUser('staff');
        $voucherId = $this->insertVoucherFixture($otherUser, 'Manager Receipt Supplier', 5000);

        $this->withRoleSession('manager')
            ->postJson('/api/v1/vouchers/'.$voucherId.'/receipts', [
                'receipt' => $this->receiptPayload(),
            ], ['Idempotency-Key' => 'receipt-manager-'.bin2hex(random_bytes(4))])
            ->assertCreated()
            ->assertJsonPath('data.receiptCount', 1);
    }

    public function test_staff_cannot_attach_or_read_receipts_for_another_users_voucher(): void
    {
        $otherUser = $this->createUser('staff');
        $voucherId = $this->insertVoucherFixture($otherUser, 'Private Other Supplier', 5000);

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/receipts', [
                'receipt' => $this->receiptPayload(),
            ], ['Idempotency-Key' => 'receipt-forbidden-'.bin2hex(random_bytes(4))])
            ->assertNotFound()
            ->assertJsonPath('error.code', 'RECEIPT_NOT_FOUND');

        self::assertSame(0, DB::table('voucher_receipts')->where('voucher_id', $voucherId)->count());
        self::assertSame([], Storage::disk('private')->allFiles());
    }

    public function test_receipt_attachment_replay_does_not_duplicate_metadata_audit_or_files(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Receipt Replay Supplier', 5000);
        $payload = ['receipt' => $this->receiptPayload()];
        $key = 'receipt-replay-'.bin2hex(random_bytes(5));

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/receipts', $payload, ['Idempotency-Key' => $key])
            ->assertCreated()
            ->assertJsonPath('data.replayed', false);

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/receipts', $payload, ['Idempotency-Key' => $key])
            ->assertOk()
            ->assertJsonPath('data.replayed', true);

        self::assertSame(1, DB::table('voucher_receipts')->where('voucher_id', $voucherId)->count());
        self::assertSame(
            1,
            DB::table('audit_events')->where('target_id', $voucherId)->where('event_type', 'VOUCHER_RECEIPT_ATTACHED')->count(),
        );
        self::assertCount(1, Storage::disk('private')->allFiles());
    }

    public function test_voucher_receipt_limit_is_three_and_rejected_object_is_not_kept(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Receipt Limit Supplier', 5000);

        for ($index = 1; $index <= 3; $index++) {
            $this->withLegacySession()
                ->postJson('/api/v1/vouchers/'.$voucherId.'/receipts', [
                    'receipt' => $this->receiptPayload(),
                ], ['Idempotency-Key' => 'receipt-limit-'.$index])
                ->assertCreated()
                ->assertJsonPath('data.receiptCount', $index);
        }

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/receipts', [
                'receipt' => $this->receiptPayload(),
            ], ['Idempotency-Key' => 'receipt-limit-four'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'RECEIPT_LIMIT_REACHED');

        self::assertSame(3, DB::table('voucher_receipts')->where('voucher_id', $voucherId)->count());
        self::assertCount(3, Storage::disk('private')->allFiles());
    }

    public function test_receipt_attachment_is_blocked_for_closed_business_dates(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Closed Receipt Supplier', 5000);
        $this->insertCashCloseFixture($this->userId, $this->businessDate);

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/receipts', [
                'receipt' => $this->receiptPayload(),
            ], ['Idempotency-Key' => 'receipt-closed-'.bin2hex(random_bytes(4))])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'CASH_CLOSE_DATE_LOCKED');

        self::assertSame(0, DB::table('voucher_receipts')->where('voucher_id', $voucherId)->count());
        self::assertSame([], Storage::disk('private')->allFiles());
    }

    public function test_invalid_image_signature_and_unsupported_mime_are_rejected(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Invalid Receipt Supplier', 5000);

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/receipts', [
                'receipt' => ['mime' => 'image/png', 'data' => base64_encode('not an image')],
            ], ['Idempotency-Key' => 'receipt-invalid-bytes'])
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'RECEIPT_MIME_MISMATCH');

        $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/receipts', [
                'receipt' => ['mime' => 'image/svg+xml', 'data' => self::PNG],
            ], ['Idempotency-Key' => 'receipt-invalid-mime'])
            ->assertUnprocessable();

        self::assertSame(0, DB::table('voucher_receipts')->where('voucher_id', $voucherId)->count());
        self::assertSame([], Storage::disk('private')->allFiles());
    }

    public function test_receipt_download_fails_closed_if_private_bytes_fail_hash_check(): void
    {
        $voucherId = $this->insertVoucherFixture($this->userId, 'Receipt Integrity Supplier', 5000);
        $response = $this->withLegacySession()
            ->postJson('/api/v1/vouchers/'.$voucherId.'/receipts', [
                'receipt' => $this->receiptPayload(),
            ], ['Idempotency-Key' => 'receipt-integrity-'.bin2hex(random_bytes(4))])
            ->assertCreated();

        $receiptId = (string) $response->json('data.receipt.id');
        $storageKey = (string) DB::table('voucher_receipts')->where('id', $receiptId)->value('storage_key');
        Storage::disk('private')->put($storageKey, 'tampered bytes');

        $this->withLegacySession()
            ->getJson('/api/v1/receipts/'.$receiptId)
            ->assertStatus(503)
            ->assertJsonPath('error.code', 'RECEIPT_INTEGRITY_FAILED');
    }

    /** @return array{mime:string,data:string} */
    private function receiptPayload(): array
    {
        return ['mime' => 'image/png', 'data' => self::PNG];
    }
}
