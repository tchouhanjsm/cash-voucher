<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class VoucherImportApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Keep the shared test database's sequence above historical numeric fixtures.
        foreach (['PAYMENT', 'RECEIPT'] as $type) {
            $sequence = DB::table('voucher_number_sequences')
                ->where('voucher_type', $type)
                ->value('next_number');
            if ($sequence === null) {
                continue;
            }
            $maxIssued = DB::table('vouchers')
                ->where('voucher_type', $type)
                ->where('voucher_number', '<>', '')
                ->whereRaw('voucher_number NOT REGEXP ?', ['[^0-9]'])
                ->selectRaw('COALESCE(MAX(CAST(voucher_number AS UNSIGNED)), 0) AS max_number')
                ->value('max_number');
            $safeNext = (int) $maxIssued + 1;
            if ((int) $sequence < $safeNext) {
                DB::table('voucher_number_sequences')
                    ->where('voucher_type', $type)
                    ->update([
                        'next_number' => $safeNext,
                        'updated_at_utc' => DB::raw('UTC_TIMESTAMP(6)'),
                    ]);
            }
        }
    }

    public function test_manager_import_is_repeatable_by_batch_and_source_record_identity(): void
    {
        $manager = $this->withRoleSession('manager');
        $sourceId = 'legacy-voucher-'.bin2hex(random_bytes(5));
        $batchId = 'import-batch-'.bin2hex(random_bytes(5));
        $payload = $this->manifest($batchId, [
            $this->row($sourceId, [
                'vendor' => 'Repeatable Import Supplier',
                'amount' => '425.75',
            ]),
        ]);

        $first = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);
        $first->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.reconciliation.importedCount', 1)
            ->assertJsonPath('data.reconciliation.replayedCount', 0)
            ->assertJsonPath('data.reconciliation.quarantinedCount', 0)
            ->assertJsonPath('data.reconciliation.pendingCount', 0)
            ->assertJsonPath('data.reconciliation.variancePaise', 0)
            ->assertJsonPath('data.reconciliation.balanced', true)
            ->assertJsonPath('data.rows.0.status', 'IMPORTED');

        $voucherId = (string) $first->json('data.rows.0.voucherId');
        self::assertSame(
            'manual-csv:'.$sourceId,
            DB::table('vouchers')->where('id', $voucherId)->value('source_legacy_id'),
        );
        self::assertSame(1, DB::table('vouchers')->where('source_legacy_id', 'manual-csv:'.$sourceId)->count());

        $replay = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);
        $replay->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.reconciliation.importedCount', 1)
            ->assertJsonPath('data.reconciliation.replayedCount', 0)
            ->assertJsonPath('data.rows.0.voucherId', $voucherId);

        self::assertSame(
            1,
            DB::table('vouchers')->where('source_legacy_id', 'manual-csv:'.$sourceId)->count(),
            'The same batch retry must not create a second voucher.',
        );
        self::assertSame(
            1,
            DB::table('audit_events')
                ->where('target_id', $voucherId)
                ->where('event_type', 'VOUCHER_CREATED')
                ->count(),
            'A replay must not append a second voucher-created event.',
        );
    }

    public function test_same_source_id_with_changed_content_is_quarantined_without_a_second_voucher(): void
    {
        $manager = $this->withRoleSession('manager');
        $sourceId = 'source-conflict-'.bin2hex(random_bytes(5));
        $firstBatchId = 'source-first-'.bin2hex(random_bytes(5));
        $firstPayload = $this->manifest($firstBatchId, [
            $this->row($sourceId, ['vendor' => 'Source Conflict Supplier', 'amount' => '210.00']),
        ]);
        $first = $manager->postJson('/api/v1/imports/vouchers', $firstPayload, [
            'Idempotency-Key' => $firstBatchId,
        ]);
        $first->assertOk()->assertJsonPath('data.reconciliation.importedCount', 1);

        $secondBatchId = 'source-second-'.bin2hex(random_bytes(5));
        $secondPayload = $this->manifest($secondBatchId, [
            $this->row($sourceId, ['vendor' => 'Source Conflict Supplier', 'amount' => '211.00']),
        ]);
        $second = $manager->postJson('/api/v1/imports/vouchers', $secondPayload, [
            'Idempotency-Key' => $secondBatchId,
        ]);
        $second->assertOk()
            ->assertJsonPath('data.status', 'RECONCILIATION_REQUIRED')
            ->assertJsonPath('data.reconciliation.importedCount', 0)
            ->assertJsonPath('data.reconciliation.quarantinedCount', 1)
            ->assertJsonPath('data.reconciliation.variancePaise', 0)
            ->assertJsonPath('data.reconciliation.balanced', true)
            ->assertJsonPath('data.rows.0.status', 'QUARANTINED')
            ->assertJsonPath('data.rows.0.errorCode', 'SOURCE_ID_CONFLICT');

        self::assertSame(
            1,
            DB::table('vouchers')->where('source_legacy_id', 'manual-csv:'.$sourceId)->count(),
            'Changed financial content under an already-used source ID must never create a second voucher.',
        );
    }

    public function test_import_recovers_a_committed_source_voucher_when_the_import_row_update_was_interrupted(): void
    {
        $manager = $this->withRoleSession('manager');
        $sourceId = 'recovery-source-'.bin2hex(random_bytes(5));
        $sourceLegacyId = 'manual-csv:'.$sourceId;
        $voucherId = $this->insertVoucherFixture(
            $this->userId,
            'Voucher Import Supplier',
            12550,
        );
        DB::table('vouchers')->where('id', $voucherId)->update([
            'source_legacy_id' => $sourceLegacyId,
            'notes' => 'Repeatable import fixture',
        ]);

        $batchId = 'recovery-batch-'.bin2hex(random_bytes(5));
        $payload = $this->manifest($batchId, [$this->row($sourceId)]);
        $response = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.reconciliation.importedCount', 0)
            ->assertJsonPath('data.reconciliation.replayedCount', 1)
            ->assertJsonPath('data.reconciliation.quarantinedCount', 0)
            ->assertJsonPath('data.reconciliation.balanced', true)
            ->assertJsonPath('data.rows.0.status', 'REPLAYED')
            ->assertJsonPath('data.rows.0.voucherId', $voucherId);

        self::assertSame(
            1,
            DB::table('vouchers')->where('source_legacy_id', $sourceLegacyId)->count(),
            'Recovery must reconcile the already-committed voucher instead of creating a second one.',
        );
    }

    public function test_an_authorized_operator_can_resume_an_immutable_batch_after_a_retryable_blocker_is_removed(): void
    {
        $manager = $this->withRoleSession('manager');
        $sourceId = 'resume-source-'.bin2hex(random_bytes(5));
        $batchId = 'resume-batch-'.bin2hex(random_bytes(5));
        $payload = $this->manifest($batchId, [$this->row($sourceId)]);
        $this->insertCashCloseFixture($this->userId, $this->businessDate);

        $blocked = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);
        $blocked->assertOk()
            ->assertJsonPath('data.status', 'RECONCILIATION_REQUIRED')
            ->assertJsonPath('data.reconciliation.quarantinedCount', 1)
            ->assertJsonPath('data.rows.0.errorCode', 'CASH_CLOSE_DATE_LOCKED');

        $removeClose = $this->migrationPdo()->prepare(
            'DELETE FROM cash_closes WHERE business_date = :business_date'
        );
        $removeClose->execute(['business_date' => $this->businessDate]);

        $owner = $this->withRoleSession('owner');
        $resumed = $owner->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);
        $resumed->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.reconciliation.importedCount', 1)
            ->assertJsonPath('data.reconciliation.quarantinedCount', 0)
            ->assertJsonPath('data.reconciliation.pendingCount', 0)
            ->assertJsonPath('data.reconciliation.balanced', true)
            ->assertJsonPath('data.rows.0.status', 'IMPORTED');

        self::assertSame(
            1,
            DB::table('audit_events')
                ->where('event_type', 'VOUCHER_IMPORT_BATCH_RESUMED')
                ->where('target_id', $resumed->json('data.batchRecordId'))
                ->count(),
            'Cross-operator resumption must be visible in the audit trail.',
        );
        self::assertSame(
            1,
            DB::table('vouchers')->where('source_legacy_id', 'manual-csv:'.$sourceId)->count(),
        );
    }

    public function test_legacy_historical_state_and_receipts_are_quarantined_not_discarded(): void
    {
        $manager = $this->withRoleSession('manager');
        $batchId = 'legacy-quarantine-'.bin2hex(random_bytes(5));
        $payload = $this->manifest($batchId, [
            $this->row('legacy-cancelled-'.bin2hex(random_bytes(4)), [
                'sourceSystem' => 'apps-script-vouchers',
                'sourceStatus' => 'CANCELLED',
            ]),
            $this->row('legacy-receipts-'.bin2hex(random_bytes(4)), [
                'sourceSystem' => 'apps-script-vouchers',
                'sourceReceipts' => 'drive-file-id-001,drive-file-id-002',
            ]),
        ], 'apps-script-vouchers');

        $response = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);
        $response->assertOk()
            ->assertJsonPath('data.status', 'RECONCILIATION_REQUIRED')
            ->assertJsonPath('data.reconciliation.importedCount', 0)
            ->assertJsonPath('data.reconciliation.quarantinedCount', 2)
            ->assertJsonPath('data.rows.0.errorCode', 'SOURCE_STATUS_REQUIRES_RECONCILIATION')
            ->assertJsonPath('data.rows.1.errorCode', 'SOURCE_RECEIPTS_REQUIRE_PRIVATE_MIGRATION');
        self::assertSame(0, DB::table('vouchers')->where('source_legacy_id', 'like', 'apps-script-vouchers:%')->count());
    }

    public function test_only_manager_and_owner_can_import_and_manifest_identity_is_required(): void
    {
        $staff = $this->withRoleSession('staff');
        $batchId = 'role-import-'.bin2hex(random_bytes(5));
        $payload = $this->manifest($batchId, [
            $this->row('staff-source-'.bin2hex(random_bytes(4))),
        ]);
        $staff->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ])->assertForbidden();

        $owner = $this->withRoleSession('owner');
        $owner->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => 'different-idempotency-key',
        ])->assertUnprocessable()
            ->assertJsonPath('error.code', 'IDEMPOTENCY_KEY_REQUIRED');
        self::assertSame(0, DB::table('voucher_import_batches')->where('source_batch_id', $batchId)->count());
    }

    public function test_original_source_row_numbers_survive_chunking_and_are_part_of_the_immutable_manifest(): void
    {
        $manager = $this->withRoleSession('manager');
        $batchId = 'source-row-map-'.bin2hex(random_bytes(5));
        $first = $this->row('source-row-first-'.bin2hex(random_bytes(4)));
        $first['sourceRowNumber'] = 121;
        $second = $this->row('source-row-second-'.bin2hex(random_bytes(4)), [
            'vendor' => 'Second source row supplier',
            'amount' => '126.75',
        ]);
        $second['sourceRowNumber'] = 245;

        $payload = $this->manifest($batchId, [$first, $second]);
        $response = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.rows.0.rowNumber', 121)
            ->assertJsonPath('data.rows.1.rowNumber', 245)
            ->assertJsonPath('data.reconciliation.balanced', true);

        $stored = DB::table('voucher_import_rows')
            ->where('batch_id', $response->json('data.batchRecordId'))
            ->orderBy('source_row_number')
            ->pluck('source_row_number')
            ->map(static fn ($value): int => (int) $value)
            ->all();
        self::assertSame([121, 245], $stored);

        $changedPosition = $payload;
        $changedPosition['rows'][0]['sourceRowNumber'] = 122;
        $manager->postJson('/api/v1/imports/vouchers', $changedPosition, [
            'Idempotency-Key' => $batchId,
        ])->assertConflict()
            ->assertJsonPath('error.code', 'IMPORT_BATCH_CONFLICT');
    }

    public function test_stale_voucher_number_sequence_is_quarantined_and_resumes_after_reconciliation(): void
    {
        $manager = $this->withRoleSession('manager');
        $sequence = (int) DB::table('voucher_number_sequences')->where('voucher_type', 'PAYMENT')->value('next_number');
        $issuedNumber = $sequence + 100;
        $fixtureVoucher = $this->insertVoucherFixture($this->userId, 'Pre-existing high-number supplier', 10000);
        DB::table('vouchers')->where('id', $fixtureVoucher)->update(['voucher_number' => (string) $issuedNumber]);

        $batchId = 'stale-sequence-'.bin2hex(random_bytes(5));
        $sourceId = 'stale-sequence-source-'.bin2hex(random_bytes(4));
        $payload = $this->manifest($batchId, [
            $this->row($sourceId, [
                'vendor' => 'Stale Sequence Import Supplier',
                'amount' => '225.00',
            ]),
        ]);

        $blocked = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);
        $blocked->assertOk()
            ->assertJsonPath('data.status', 'RECONCILIATION_REQUIRED')
            ->assertJsonPath('data.reconciliation.importedCount', 0)
            ->assertJsonPath('data.reconciliation.quarantinedCount', 1)
            ->assertJsonPath('data.rows.0.status', 'QUARANTINED')
            ->assertJsonPath('data.rows.0.errorCode', 'VOUCHER_SEQUENCE_RECONCILIATION_REQUIRED');

        self::assertSame(0, DB::table('vouchers')->where('source_legacy_id', 'manual-csv:'.$sourceId)->count());

        // Simulate the Owner reconciling the sequence through the authorized settings workflow.
        DB::table('voucher_number_sequences')->where('voucher_type', 'PAYMENT')->update([
            'next_number' => $issuedNumber + 1,
            'updated_at_utc' => DB::raw('UTC_TIMESTAMP(6)'),
        ]);
        $resumed = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);
        $resumed->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.reconciliation.importedCount', 1)
            ->assertJsonPath('data.reconciliation.quarantinedCount', 0)
            ->assertJsonPath('data.reconciliation.pendingCount', 0)
            ->assertJsonPath('data.reconciliation.balanced', true)
            ->assertJsonPath('data.rows.0.status', 'IMPORTED');

        self::assertSame(1, DB::table('vouchers')->where('source_legacy_id', 'manual-csv:'.$sourceId)->count());
        self::assertSame(
            (string) ($issuedNumber + 2),
            (string) DB::table('voucher_number_sequences')->where('voucher_type', 'PAYMENT')->value('next_number'),
        );
    }

    public function test_invalid_original_source_row_numbers_fail_before_batch_creation(): void
    {
        $manager = $this->withRoleSession('manager');
        foreach ([0, 1_000_001] as $sourceRowNumber) {
            $batchId = 'invalid-source-row-'.bin2hex(random_bytes(5));
            $row = $this->row('source-row-invalid-'.bin2hex(random_bytes(4)));
            $row['sourceRowNumber'] = $sourceRowNumber;
            $manager->postJson(
                '/api/v1/imports/vouchers',
                $this->manifest($batchId, [$row]),
                ['Idempotency-Key' => $batchId],
            )->assertUnprocessable();

            self::assertSame(
                0,
                DB::table('voucher_import_batches')->where('source_batch_id', $batchId)->count(),
                'Invalid source row positions must fail before an import batch is written.',
            );
        }
        $duplicateBatchId = 'duplicate-source-row-'.bin2hex(random_bytes(5));
        $first = $this->row('duplicate-row-source-a-'.bin2hex(random_bytes(3)));
        $first['sourceRowNumber'] = 55;
        $second = $this->row('duplicate-row-source-b-'.bin2hex(random_bytes(3)));
        $second['sourceRowNumber'] = 55;
        $manager->postJson(
            '/api/v1/imports/vouchers',
            $this->manifest($duplicateBatchId, [$first, $second]),
            ['Idempotency-Key' => $duplicateBatchId],
        )->assertUnprocessable()
            ->assertJsonPath('error.code', 'IMPORT_ROW_NUMBER_DUPLICATE');
        self::assertSame(
            0,
            DB::table('voucher_import_batches')->where('source_batch_id', $duplicateBatchId)->count(),
            'Duplicate source row positions must be rejected before batch persistence.',
        );
    }

    public function test_duplicate_source_ids_in_one_manifest_fail_before_batch_creation(): void
    {
        $manager = $this->withRoleSession('manager');
        $batchId = 'duplicate-source-'.bin2hex(random_bytes(5));
        $sourceId = 'same-source-'.bin2hex(random_bytes(4));
        $payload = $this->manifest($batchId, [
            $this->row($sourceId),
            $this->row($sourceId, ['amount' => '126.00']),
        ]);
        $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ])->assertUnprocessable()
            ->assertJsonPath('error.code', 'IMPORT_SOURCE_ID_DUPLICATE');
        self::assertSame(0, DB::table('voucher_import_batches')->where('source_batch_id', $batchId)->count());
    }

    /** @param list<array<string,mixed>> $rows @return array<string,mixed> */
    private function manifest(string $batchId, array $rows, string $sourceSystem = 'manual-csv'): array
    {
        return [
            'sourceSystem' => $sourceSystem,
            'batchId' => $batchId,
            'rows' => $rows,
        ];
    }

    /** @param array<string,mixed> $overrides @return array<string,mixed> */
    private function row(string $sourceRecordId, array $overrides = []): array
    {
        $sourceSystem = (string) ($overrides['sourceSystem'] ?? 'manual-csv');
        unset($overrides['sourceSystem']);
        $voucher = array_merge([
            'date' => $this->businessDate,
            'vendor' => 'Voucher Import Supplier',
            'amount' => '125.50',
            'category' => 'Other',
            'notes' => 'Repeatable import fixture',
            'type' => 'PAYMENT',
            'cashImpact' => 'CASH_OUT',
            'paymentMethod' => 'CASH',
            'sourceStatus' => '',
            'sourceApprovalStatus' => '',
            'sourceVoucherNo' => '',
            'sourceReceipts' => '',
        ], $overrides);

        return [
            'sourceRecordId' => $sourceRecordId,
            'voucher' => $voucher,
        ];
    }
}
])
                ->selectRaw('COALESCE(MAX(CAST(voucher_number AS UNSIGNED)), 0) AS max_number')
                ->value('max_number');
            $safeNext = (int) $maxIssued + 1;
            if ((int) $sequence < $safeNext) {
                DB::table('voucher_number_sequences')->where('voucher_type', $type)->update([
                    'next_number' => $safeNext,
                    'updated_at_utc' => DB::raw('UTC_TIMESTAMP(6)'),
                ]);
            }
        }
    }

    public function test_manager_import_is_repeatable_by_batch_and_source_record_identity(): void
    {
        $manager = $this->withRoleSession('manager');
        $sourceId = 'legacy-voucher-'.bin2hex(random_bytes(5));
        $batchId = 'import-batch-'.bin2hex(random_bytes(5));
        $payload = $this->manifest($batchId, [
            $this->row($sourceId, [
                'vendor' => 'Repeatable Import Supplier',
                'amount' => '425.75',
            ]),
        ]);

        $first = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);
        $first->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.reconciliation.importedCount', 1)
            ->assertJsonPath('data.reconciliation.replayedCount', 0)
            ->assertJsonPath('data.reconciliation.quarantinedCount', 0)
            ->assertJsonPath('data.reconciliation.pendingCount', 0)
            ->assertJsonPath('data.reconciliation.variancePaise', 0)
            ->assertJsonPath('data.reconciliation.balanced', true)
            ->assertJsonPath('data.rows.0.status', 'IMPORTED');

        $voucherId = (string) $first->json('data.rows.0.voucherId');
        self::assertSame(
            'manual-csv:'.$sourceId,
            DB::table('vouchers')->where('id', $voucherId)->value('source_legacy_id'),
        );
        self::assertSame(1, DB::table('vouchers')->where('source_legacy_id', 'manual-csv:'.$sourceId)->count());

        $replay = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);
        $replay->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.reconciliation.importedCount', 1)
            ->assertJsonPath('data.reconciliation.replayedCount', 0)
            ->assertJsonPath('data.rows.0.voucherId', $voucherId);

        self::assertSame(
            1,
            DB::table('vouchers')->where('source_legacy_id', 'manual-csv:'.$sourceId)->count(),
            'The same batch retry must not create a second voucher.',
        );
        self::assertSame(
            1,
            DB::table('audit_events')
                ->where('target_id', $voucherId)
                ->where('event_type', 'VOUCHER_CREATED')
                ->count(),
            'A replay must not append a second voucher-created event.',
        );
    }

    public function test_same_source_id_with_changed_content_is_quarantined_without_a_second_voucher(): void
    {
        $manager = $this->withRoleSession('manager');
        $sourceId = 'source-conflict-'.bin2hex(random_bytes(5));
        $firstBatchId = 'source-first-'.bin2hex(random_bytes(5));
        $firstPayload = $this->manifest($firstBatchId, [
            $this->row($sourceId, ['vendor' => 'Source Conflict Supplier', 'amount' => '210.00']),
        ]);
        $first = $manager->postJson('/api/v1/imports/vouchers', $firstPayload, [
            'Idempotency-Key' => $firstBatchId,
        ]);
        $first->assertOk()->assertJsonPath('data.reconciliation.importedCount', 1);

        $secondBatchId = 'source-second-'.bin2hex(random_bytes(5));
        $secondPayload = $this->manifest($secondBatchId, [
            $this->row($sourceId, ['vendor' => 'Source Conflict Supplier', 'amount' => '211.00']),
        ]);
        $second = $manager->postJson('/api/v1/imports/vouchers', $secondPayload, [
            'Idempotency-Key' => $secondBatchId,
        ]);
        $second->assertOk()
            ->assertJsonPath('data.status', 'RECONCILIATION_REQUIRED')
            ->assertJsonPath('data.reconciliation.importedCount', 0)
            ->assertJsonPath('data.reconciliation.quarantinedCount', 1)
            ->assertJsonPath('data.reconciliation.variancePaise', 0)
            ->assertJsonPath('data.reconciliation.balanced', true)
            ->assertJsonPath('data.rows.0.status', 'QUARANTINED')
            ->assertJsonPath('data.rows.0.errorCode', 'SOURCE_ID_CONFLICT');

        self::assertSame(
            1,
            DB::table('vouchers')->where('source_legacy_id', 'manual-csv:'.$sourceId)->count(),
            'Changed financial content under an already-used source ID must never create a second voucher.',
        );
    }

    public function test_import_recovers_a_committed_source_voucher_when_the_import_row_update_was_interrupted(): void
    {
        $manager = $this->withRoleSession('manager');
        $sourceId = 'recovery-source-'.bin2hex(random_bytes(5));
        $sourceLegacyId = 'manual-csv:'.$sourceId;
        $voucherId = $this->insertVoucherFixture(
            $this->userId,
            'Voucher Import Supplier',
            12550,
        );
        DB::table('vouchers')->where('id', $voucherId)->update([
            'source_legacy_id' => $sourceLegacyId,
            'notes' => 'Repeatable import fixture',
        ]);

        $batchId = 'recovery-batch-'.bin2hex(random_bytes(5));
        $payload = $this->manifest($batchId, [$this->row($sourceId)]);
        $response = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.reconciliation.importedCount', 0)
            ->assertJsonPath('data.reconciliation.replayedCount', 1)
            ->assertJsonPath('data.reconciliation.quarantinedCount', 0)
            ->assertJsonPath('data.reconciliation.balanced', true)
            ->assertJsonPath('data.rows.0.status', 'REPLAYED')
            ->assertJsonPath('data.rows.0.voucherId', $voucherId);

        self::assertSame(
            1,
            DB::table('vouchers')->where('source_legacy_id', $sourceLegacyId)->count(),
            'Recovery must reconcile the already-committed voucher instead of creating a second one.',
        );
    }

    public function test_an_authorized_operator_can_resume_an_immutable_batch_after_a_retryable_blocker_is_removed(): void
    {
        $manager = $this->withRoleSession('manager');
        $sourceId = 'resume-source-'.bin2hex(random_bytes(5));
        $batchId = 'resume-batch-'.bin2hex(random_bytes(5));
        $payload = $this->manifest($batchId, [$this->row($sourceId)]);
        $this->insertCashCloseFixture($this->userId, $this->businessDate);

        $blocked = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);
        $blocked->assertOk()
            ->assertJsonPath('data.status', 'RECONCILIATION_REQUIRED')
            ->assertJsonPath('data.reconciliation.quarantinedCount', 1)
            ->assertJsonPath('data.rows.0.errorCode', 'CASH_CLOSE_DATE_LOCKED');

        $removeClose = $this->migrationPdo()->prepare(
            'DELETE FROM cash_closes WHERE business_date = :business_date'
        );
        $removeClose->execute(['business_date' => $this->businessDate]);

        $owner = $this->withRoleSession('owner');
        $resumed = $owner->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);
        $resumed->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.reconciliation.importedCount', 1)
            ->assertJsonPath('data.reconciliation.quarantinedCount', 0)
            ->assertJsonPath('data.reconciliation.pendingCount', 0)
            ->assertJsonPath('data.reconciliation.balanced', true)
            ->assertJsonPath('data.rows.0.status', 'IMPORTED');

        self::assertSame(
            1,
            DB::table('audit_events')
                ->where('event_type', 'VOUCHER_IMPORT_BATCH_RESUMED')
                ->where('target_id', $resumed->json('data.batchRecordId'))
                ->count(),
            'Cross-operator resumption must be visible in the audit trail.',
        );
        self::assertSame(
            1,
            DB::table('vouchers')->where('source_legacy_id', 'manual-csv:'.$sourceId)->count(),
        );
    }

    public function test_legacy_historical_state_and_receipts_are_quarantined_not_discarded(): void
    {
        $manager = $this->withRoleSession('manager');
        $batchId = 'legacy-quarantine-'.bin2hex(random_bytes(5));
        $payload = $this->manifest($batchId, [
            $this->row('legacy-cancelled-'.bin2hex(random_bytes(4)), [
                'sourceSystem' => 'apps-script-vouchers',
                'sourceStatus' => 'CANCELLED',
            ]),
            $this->row('legacy-receipts-'.bin2hex(random_bytes(4)), [
                'sourceSystem' => 'apps-script-vouchers',
                'sourceReceipts' => 'drive-file-id-001,drive-file-id-002',
            ]),
        ], 'apps-script-vouchers');

        $response = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);
        $response->assertOk()
            ->assertJsonPath('data.status', 'RECONCILIATION_REQUIRED')
            ->assertJsonPath('data.reconciliation.importedCount', 0)
            ->assertJsonPath('data.reconciliation.quarantinedCount', 2)
            ->assertJsonPath('data.rows.0.errorCode', 'SOURCE_STATUS_REQUIRES_RECONCILIATION')
            ->assertJsonPath('data.rows.1.errorCode', 'SOURCE_RECEIPTS_REQUIRE_PRIVATE_MIGRATION');
        self::assertSame(0, DB::table('vouchers')->where('source_legacy_id', 'like', 'apps-script-vouchers:%')->count());
    }

    public function test_only_manager_and_owner_can_import_and_manifest_identity_is_required(): void
    {
        $staff = $this->withRoleSession('staff');
        $batchId = 'role-import-'.bin2hex(random_bytes(5));
        $payload = $this->manifest($batchId, [
            $this->row('staff-source-'.bin2hex(random_bytes(4))),
        ]);
        $staff->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ])->assertForbidden();

        $owner = $this->withRoleSession('owner');
        $owner->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => 'different-idempotency-key',
        ])->assertUnprocessable()
            ->assertJsonPath('error.code', 'IDEMPOTENCY_KEY_REQUIRED');
        self::assertSame(0, DB::table('voucher_import_batches')->where('source_batch_id', $batchId)->count());
    }

    public function test_original_source_row_numbers_survive_chunking_and_are_part_of_the_immutable_manifest(): void
    {
        $manager = $this->withRoleSession('manager');
        $batchId = 'source-row-map-'.bin2hex(random_bytes(5));
        $first = $this->row('source-row-first-'.bin2hex(random_bytes(4)));
        $first['sourceRowNumber'] = 121;
        $second = $this->row('source-row-second-'.bin2hex(random_bytes(4)), [
            'vendor' => 'Second source row supplier',
            'amount' => '126.75',
        ]);
        $second['sourceRowNumber'] = 245;

        $payload = $this->manifest($batchId, [$first, $second]);
        $response = $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.rows.0.rowNumber', 121)
            ->assertJsonPath('data.rows.1.rowNumber', 245)
            ->assertJsonPath('data.reconciliation.balanced', true);

        $stored = DB::table('voucher_import_rows')
            ->where('batch_id', $response->json('data.batchRecordId'))
            ->orderBy('source_row_number')
            ->pluck('source_row_number')
            ->map(static fn ($value): int => (int) $value)
            ->all();
        self::assertSame([121, 245], $stored);

        $changedPosition = $payload;
        $changedPosition['rows'][0]['sourceRowNumber'] = 122;
        $manager->postJson('/api/v1/imports/vouchers', $changedPosition, [
            'Idempotency-Key' => $batchId,
        ])->assertConflict()
            ->assertJsonPath('error.code', 'IMPORT_BATCH_CONFLICT');
    }

    public function test_invalid_original_source_row_numbers_fail_before_batch_creation(): void
    {
        $manager = $this->withRoleSession('manager');
        foreach ([0, 1_000_001] as $sourceRowNumber) {
            $batchId = 'invalid-source-row-'.bin2hex(random_bytes(5));
            $row = $this->row('source-row-invalid-'.bin2hex(random_bytes(4)));
            $row['sourceRowNumber'] = $sourceRowNumber;
            $manager->postJson(
                '/api/v1/imports/vouchers',
                $this->manifest($batchId, [$row]),
                ['Idempotency-Key' => $batchId],
            )->assertUnprocessable();

            self::assertSame(
                0,
                DB::table('voucher_import_batches')->where('source_batch_id', $batchId)->count(),
                'Invalid source row positions must fail before an import batch is written.',
            );
        }
        $duplicateBatchId = 'duplicate-source-row-'.bin2hex(random_bytes(5));
        $first = $this->row('duplicate-row-source-a-'.bin2hex(random_bytes(3)));
        $first['sourceRowNumber'] = 55;
        $second = $this->row('duplicate-row-source-b-'.bin2hex(random_bytes(3)));
        $second['sourceRowNumber'] = 55;
        $manager->postJson(
            '/api/v1/imports/vouchers',
            $this->manifest($duplicateBatchId, [$first, $second]),
            ['Idempotency-Key' => $duplicateBatchId],
        )->assertUnprocessable()
            ->assertJsonPath('error.code', 'IMPORT_ROW_NUMBER_DUPLICATE');
        self::assertSame(
            0,
            DB::table('voucher_import_batches')->where('source_batch_id', $duplicateBatchId)->count(),
            'Duplicate source row positions must be rejected before batch persistence.',
        );
    }

    public function test_duplicate_source_ids_in_one_manifest_fail_before_batch_creation(): void
    {
        $manager = $this->withRoleSession('manager');
        $batchId = 'duplicate-source-'.bin2hex(random_bytes(5));
        $sourceId = 'same-source-'.bin2hex(random_bytes(4));
        $payload = $this->manifest($batchId, [
            $this->row($sourceId),
            $this->row($sourceId, ['amount' => '126.00']),
        ]);
        $manager->postJson('/api/v1/imports/vouchers', $payload, [
            'Idempotency-Key' => $batchId,
        ])->assertUnprocessable()
            ->assertJsonPath('error.code', 'IMPORT_SOURCE_ID_DUPLICATE');
        self::assertSame(0, DB::table('voucher_import_batches')->where('source_batch_id', $batchId)->count());
    }

    /** @param list<array<string,mixed>> $rows @return array<string,mixed> */
    private function manifest(string $batchId, array $rows, string $sourceSystem = 'manual-csv'): array
    {
        return [
            'sourceSystem' => $sourceSystem,
            'batchId' => $batchId,
            'rows' => $rows,
        ];
    }

    /** @param array<string,mixed> $overrides @return array<string,mixed> */
    private function row(string $sourceRecordId, array $overrides = []): array
    {
        $sourceSystem = (string) ($overrides['sourceSystem'] ?? 'manual-csv');
        unset($overrides['sourceSystem']);
        $voucher = array_merge([
            'date' => $this->businessDate,
            'vendor' => 'Voucher Import Supplier',
            'amount' => '125.50',
            'category' => 'Other',
            'notes' => 'Repeatable import fixture',
            'type' => 'PAYMENT',
            'cashImpact' => 'CASH_OUT',
            'paymentMethod' => 'CASH',
            'sourceStatus' => '',
            'sourceApprovalStatus' => '',
            'sourceVoucherNo' => '',
            'sourceReceipts' => '',
        ], $overrides);

        return [
            'sourceRecordId' => $sourceRecordId,
            'voucher' => $voucher,
        ];
    }
}
