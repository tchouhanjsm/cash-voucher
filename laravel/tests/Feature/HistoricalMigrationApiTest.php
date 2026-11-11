<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class HistoricalMigrationApiTest extends TestCase
{
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');
    }

    public function test_owner_can_stage_validate_transfer_and_commit_historical_evidence(): void
    {
        $owner = $this->withRoleSession('owner');
        $voucherSource = 'legacy-voucher-'.bin2hex(random_bytes(4));
        $approvalSource = 'legacy-approval-'.bin2hex(random_bytes(4));
        $auditSource = 'legacy-audit-'.bin2hex(random_bytes(4));
        $receiptSource = 'legacy-receipt-'.bin2hex(random_bytes(4));
        $payload = $this->manifest('legacy-batch-'.bin2hex(random_bytes(5)), $voucherSource, $approvalSource, $auditSource, $receiptSource);

        $stage = $owner->postJson('/api/v1/imports/historical', $payload);
        $stage->assertCreated()->assertJsonPath('data.status', 'STAGED')->assertJsonPath('data.contractVersion', 1);
        $batchId = (string) $stage->json('data.batchRecordId');
        self::assertSame(0, DB::table('vouchers')->where('source_legacy_id', 'apps-script-vouchers:'.$voucherSource)->count());

        $blocked = $owner->postJson('/api/v1/imports/historical/'.$batchId.'/validate');
        $blocked->assertOk()->assertJsonPath('data.status', 'BLOCKED')->assertJsonPath('data.canCommit', false);
        self::assertContains('RECEIPT_BYTES_MISSING', array_column($blocked->json('data.blockers'), 'code'));

        $owner->postJson('/api/v1/imports/historical/'.$batchId.'/receipts/'.$receiptSource, ['mime' => 'image/png', 'data' => self::PNG])
            ->assertOk()->assertJsonPath('data.uploaded', true);
        $ready = $owner->postJson('/api/v1/imports/historical/'.$batchId.'/validate');
        $ready->assertOk()->assertJsonPath('data.status', 'READY')->assertJsonPath('data.canCommit', true);

        $commit = $owner->postJson('/api/v1/imports/historical/'.$batchId.'/commit');
        $commit->assertOk()->assertJsonPath('data.status', 'COMMITTED')
            ->assertJsonPath('data.sourceTotalPaise', 15250)
            ->assertJsonPath('data.importedTotalPaise', 15250)
            ->assertJsonPath('data.variancePaise', 0);

        $voucher = DB::table('vouchers')->where('source_legacy_id', 'apps-script-vouchers:'.$voucherSource)->first();
        self::assertNotNull($voucher);
        self::assertSame('84721', (string) $voucher->voucher_number);
        self::assertSame('CANCELLED', $voucher->status);
        self::assertSame('REJECTED', $voucher->approval_status);
        self::assertSame('Historical Vendor Snapshot', $voucher->vendor_name_snapshot);
        self::assertSame('ONE_TIME', $voucher->vendor_type);
        self::assertNull($voucher->created_by_user_id, 'Unknown historical actors must not be synthesized.');
        self::assertSame('2021-03-04 05:06:07.123000', (string) $voucher->created_at_utc);

        self::assertSame('legacy-user-22', DB::table('historical_approval_events')->where('source_event_id', $approvalSource)->value('actor_source_id'));
        self::assertSame('legacy-user-33', DB::table('audit_events')->where('source_event_id', $auditSource)->value('actor_source_id'));
        $receipt = DB::table('voucher_receipts')->where('legacy_drive_file_id', 'drive-file-'.$receiptSource)->first();
        self::assertNotNull($receipt);
        self::assertTrue(Storage::disk('private')->exists($receipt->storage_key));

        $owner->postJson('/api/v1/imports/historical/'.$batchId.'/commit')->assertOk()->assertJsonPath('data.status', 'COMMITTED');
        self::assertSame(1, DB::table('vouchers')->where('source_legacy_id', 'apps-script-vouchers:'.$voucherSource)->count());
    }

    public function test_only_owner_can_stage_historical_data(): void
    {
        $payload = $this->manifest('role-batch-'.bin2hex(random_bytes(4)), 'role-voucher-'.bin2hex(random_bytes(4)), 'role-approval-'.bin2hex(random_bytes(4)), 'role-audit-'.bin2hex(random_bytes(4)), 'role-receipt-'.bin2hex(random_bytes(4)));
        foreach (['staff','manager','accountant'] as $role) $this->withRoleSession($role)->postJson('/api/v1/imports/historical', $payload)->assertForbidden();
    }

    public function test_batch_and_source_ids_are_immutable(): void
    {
        $owner = $this->withRoleSession('owner');
        $sourceId = 'same-source-'.bin2hex(random_bytes(4));
        $first = $this->manifest('first-batch-'.bin2hex(random_bytes(4)), $sourceId, 'approval-1-'.bin2hex(random_bytes(2)), 'audit-1-'.bin2hex(random_bytes(2)), 'receipt-1-'.bin2hex(random_bytes(2)));
        $first['approvals'] = [];
        $first['auditEvents'] = [];
        $first['receipts'] = [];
        $owner->postJson('/api/v1/imports/historical', $first)->assertCreated();

        $changed = $first;
        $changed['vouchers'][0]['voucher']['amount'] = '999.99';
        $owner->postJson('/api/v1/imports/historical', $changed)->assertStatus(409)->assertJsonPath('error.code', 'HISTORICAL_BATCH_CONFLICT');

        $again = $first;
        $again['batchId'] = 'second-batch-'.bin2hex(random_bytes(4));
        $owner->postJson('/api/v1/imports/historical', $again)->assertStatus(409)->assertJsonPath('error.code', 'HISTORICAL_SOURCE_ID_RESERVED');
    }

    private function manifest(string $batchId, string $voucherId, string $approvalId, string $auditId, string $receiptId): array
    {
        return [
            'contractVersion' => 1,
            'sourceSystem' => 'apps-script-vouchers',
            'batchId' => $batchId,
            'sourceExtractedAtUtc' => '2026-11-11T00:00:00.000Z',
            'vouchers' => [[
                'sourceRecordId' => $voucherId,
                'voucher' => [
                    'voucherNo' => '84721', 'date' => '2021-03-04', 'type' => 'PAYMENT',
                    'vendor' => 'Historical Vendor Snapshot', 'vendorType' => 'ONE_TIME',
                    'amount' => '152.50', 'category' => 'Maintenance', 'notes' => 'Original source note',
                    'status' => 'CANCELLED', 'cashImpact' => 'CASH_OUT', 'approvalStatus' => 'REJECTED',
                    'approvalReason' => 'Original rejection', 'paymentMethod' => 'CASH', 'cancelReason' => 'Original cancellation',
                    'createdAtUtc' => '2021-03-04T05:06:07.123Z', 'updatedAtUtc' => '2021-03-05T06:07:08Z',
                    'approvedAtUtc' => '2021-03-06T07:08:09Z', 'createdByEmail' => 'unknown-creator@example.test',
                    'approvedByEmail' => 'unknown-approver@example.test', 'createdBySourceId' => 'legacy-user-11',
                    'approvedBySourceId' => 'legacy-user-22', 'extensions' => ['originalDriveRow' => 88],
                ],
            ]],
            'approvals' => [[
                'sourceRecordId' => $approvalId, 'voucherSourceRecordId' => $voucherId,
                'decision' => 'REJECT', 'previousStatus' => 'PENDING', 'nextStatus' => 'REJECTED',
                'reason' => 'Original approval history', 'actorSourceId' => 'legacy-user-22',
                'actorEmail' => 'unknown-approver@example.test', 'occurredAtUtc' => '2021-03-06T07:08:09Z',
            ]],
            'auditEvents' => [[
                'sourceRecordId' => $auditId, 'voucherSourceRecordId' => $voucherId,
                'eventType' => 'VOUCHER_UPDATED', 'actorSourceId' => 'legacy-user-33',
                'actorEmail' => 'unknown-auditor@example.test', 'reason' => 'Legacy audit reason',
                'occurredAtUtc' => '2021-03-05T06:07:08Z',
                'before' => ['vendor' => 'Old Vendor'], 'after' => ['vendor' => 'Historical Vendor Snapshot'],
            ]],
            'receipts' => [[
                'sourceRecordId' => $receiptId, 'voucherSourceRecordId' => $voucherId,
                'originalFileId' => 'drive-file-'.$receiptId, 'name' => 'original.png',
                'contentType' => 'image/png', 'byteSize' => 68,
                'sha256' => hash('sha256', base64_decode(self::PNG, true)),
                'createdAtUtc' => '2021-03-04T05:08:00Z',
            ]],
        ];
    }
}
