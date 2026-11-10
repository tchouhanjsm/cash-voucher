<?php

declare(strict_types=1);

namespace App\Modules\Imports\Actions;

use App\Modules\Vouchers\Actions\StoreVoucher;
use CashVoucher\Api\Financial\AuditWriter;
use CashVoucher\Api\Support\ApiException;
use CashVoucher\Api\Support\Money;
use CashVoucher\Api\Support\Uuid;
use PDO;
use Throwable;

final class VoucherImportService
{
    private const MAX_ROWS = 100;
    private const RETRYABLE_QUARANTINE_CODES = [
        'DUPLICATE_CONFIRMATION_REQUIRED',
        'DUPLICATE_REVIEW_LIMIT_EXCEEDED',
        'VOUCHER_SEQUENCE_NOT_INITIALIZED',
        'CASH_CLOSE_DATE_LOCKED',
        'IDEMPOTENCY_IN_PROGRESS',
    ];

    public function __construct(private readonly StoreVoucher $storeVoucher)
    {
    }

    /**
     * @param array<string,mixed> $input
     * @param array<string,mixed> $principal
     * @return array<string,mixed>
     */
    public function execute(PDO $pdo, array $input, array $principal): array
    {
        $sourceSystem = (string) ($input['sourceSystem'] ?? '');
        $sourceBatchId = (string) ($input['batchId'] ?? '');
        $rows = $input['rows'] ?? null;
        if (
            ! in_array($sourceSystem, ['apps-script-vouchers', 'manual-csv'], true)
            || ! preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $sourceBatchId)
            || ! is_array($rows)
            || $rows === []
            || count($rows) > self::MAX_ROWS
        ) {
            throw new ApiException(422, 'IMPORT_MANIFEST_INVALID', 'The voucher import manifest is invalid.');
        }

        $prepared = $this->prepareRows($sourceSystem, $rows);
        $canonicalRows = array_map(
            static fn (array $row): array => [
                'sourceRecordId' => $row['sourceRecordId'],
                'sourceRowNumber' => $row['rowNumber'],
                'voucher' => $row['canonicalVoucher'],
            ],
            $prepared,
        );
        $requestJson = json_encode(
            $this->canonicalize($canonicalRows),
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR,
        );
        $requestHash = hash('sha256', $requestJson);
        $actorId = (string) $principal['id'];
        $actorEmail = (string) $principal['email'];

        $batchId = $this->ensureBatch(
            $pdo,
            $sourceSystem,
            $sourceBatchId,
            $requestHash,
            $prepared,
            $actorId,
            $actorEmail,
        );

        $bySourceId = [];
        foreach ($prepared as $row) {
            $bySourceId[$row['sourceRecordId']] = $row;
        }

        $rowsQuery = $pdo->prepare(
            'SELECT id, source_record_id, source_legacy_id, row_sha256, status, error_code
             FROM voucher_import_rows
             WHERE batch_id = :batch_id
             ORDER BY source_row_number ASC'
        );
        $rowsQuery->execute(['batch_id' => $batchId]);

        foreach ($rowsQuery->fetchAll(PDO::FETCH_ASSOC) as $storedRow) {
            $sourceRecordId = (string) $storedRow['source_record_id'];
            $status = (string) $storedRow['status'];
            $retryableQuarantine = $status === 'QUARANTINED'
                && in_array((string) ($storedRow['error_code'] ?? ''), self::RETRYABLE_QUARANTINE_CODES, true);
            if ($status !== 'PENDING' && ! $retryableQuarantine) {
                continue;
            }

            $row = $bySourceId[$sourceRecordId] ?? null;
            if (! is_array($row) || ! hash_equals((string) $storedRow['row_sha256'], $row['rowHash'])) {
                throw new ApiException(409, 'IMPORT_ROW_CONFLICT', 'The import row content does not match the stored batch manifest.');
            }

            $this->attemptRow(
                $pdo,
                $batchId,
                (string) $storedRow['id'],
                $row,
                $sourceSystem,
                $principal,
            );
        }

        return $this->reconcile($pdo, $batchId, $sourceSystem, $sourceBatchId, $actorId, $actorEmail);
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return list<array<string,mixed>>
     */
    private function prepareRows(string $sourceSystem, array $rows): array
    {
        $prepared = [];
        $seen = [];
        foreach (array_values($rows) as $index => $row) {
            if (
                ! is_array($row)
                || array_is_list($row)
                || ! is_string($row['sourceRecordId'] ?? null)
                || ! preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/D', $row['sourceRecordId'])
                || ! is_array($row['voucher'] ?? null)
                || array_is_list($row['voucher'])
            ) {
                throw new ApiException(
                    422,
                    'IMPORT_ROW_ID_REQUIRED',
                    'Every import row must be an object with a stable sourceRecordId and voucher object. No rows were submitted.',
                );
            }

            $sourceRecordId = $row['sourceRecordId'];
            $sourceRowNumber = $row['sourceRowNumber'] ?? ($index + 1);
            if (
                ! is_int($sourceRowNumber)
                || $sourceRowNumber < 1
                || $sourceRowNumber > 1_000_000
            ) {
                throw new ApiException(
                    422,
                    'IMPORT_ROW_NUMBER_INVALID',
                    'Each source row must have a valid 1-based row number between 1 and 1,000,000.',
                );
            }
            if (isset($seen[$sourceRecordId])) {
                throw new ApiException(422, 'IMPORT_SOURCE_ID_DUPLICATE', 'Source record IDs must be unique within an import batch.');
            }
            $seen[$sourceRecordId] = true;

            $voucher = $row['voucher'];
            // A refreshed, short-lived duplicate-review token is not a source financial
            // field and must not change batch/row identity.
            unset($voucher['duplicateConfirmationToken']);
            $canonicalVoucher = $this->canonicalize($voucher);
            $rowJson = json_encode(
                ['sourceRecordId' => $sourceRecordId, 'voucher' => $canonicalVoucher],
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR,
            );
            $sourceLegacyId = $sourceSystem.':'.$sourceRecordId;
            if (strlen($sourceLegacyId) > 128) {
                throw new ApiException(422, 'IMPORT_SOURCE_ID_INVALID', 'The namespaced source record ID is too long.');
            }

            $amountPaise = null;
            if (is_string($voucher['amount'] ?? null)) {
                try {
                    $amountPaise = Money::toPaise($voucher['amount']);
                    if ($amountPaise < 1 || $amountPaise > 1_000_000_000) {
                        $amountPaise = null;
                    }
                } catch (\InvalidArgumentException) {
                    $amountPaise = null;
                }
            }

            $type = $voucher['type'] ?? 'PAYMENT';
            $prepared[] = [
                'rowNumber' => $sourceRowNumber,
                'sourceRecordId' => $sourceRecordId,
                'sourceLegacyId' => $sourceLegacyId,
                'voucher' => $voucher,
                'canonicalVoucher' => $canonicalVoucher,
                'rowHash' => hash('sha256', $rowJson),
                'voucherType' => in_array($type, ['PAYMENT', 'RECEIPT'], true) ? $type : null,
                'amountPaise' => $amountPaise,
            ];
        }

        return $prepared;
    }

    /**
     * @param list<array<string,mixed>> $rows
     */
    private function ensureBatch(
        PDO $pdo,
        string $sourceSystem,
        string $sourceBatchId,
        string $requestHash,
        array $rows,
        string $actorId,
        string $actorEmail,
    ): string {
        $pdo->beginTransaction();
        try {
            $lookup = $pdo->prepare(
                'SELECT id, request_sha256, created_by_user_id
                 FROM voucher_import_batches
                 WHERE source_system = :source_system AND source_batch_id = :source_batch_id
                 LIMIT 1 FOR UPDATE'
            );
            $lookup->execute([
                'source_system' => $sourceSystem,
                'source_batch_id' => $sourceBatchId,
            ]);
            $existing = $lookup->fetch(PDO::FETCH_ASSOC);
            if (is_array($existing)) {
                if (! hash_equals((string) $existing['request_sha256'], $requestHash)) {
                    throw new ApiException(
                        409,
                        'IMPORT_BATCH_CONFLICT',
                        'This import batch ID is already associated with different source data.',
                    );
                }
                if (! hash_equals((string) $existing['created_by_user_id'], $actorId)) {
                    AuditWriter::append($pdo, $actorId, $actorEmail, [
                        'eventType' => 'VOUCHER_IMPORT_BATCH_RESUMED',
                        'targetType' => 'voucher_import_batch',
                        'targetId' => (string) $existing['id'],
                        'reason' => 'An authorized operator resumed an immutable voucher import batch.',
                        'after' => [
                            'sourceSystem' => $sourceSystem,
                            'sourceBatchId' => $sourceBatchId,
                            'originalCreatorUserId' => (string) $existing['created_by_user_id'],
                            'resumedByUserId' => $actorId,
                        ],
                    ]);
                }
                $pdo->commit();

                return (string) $existing['id'];
            }

            $id = Uuid::v4();
            $insertBatch = $pdo->prepare(
                'INSERT INTO voucher_import_batches (
                    id, source_system, source_batch_id, request_sha256, status,
                    row_count, imported_count, replayed_count, quarantined_count,
                    pending_count, source_total_paise, imported_total_paise,
                    quarantined_total_paise, pending_total_paise, variance_paise,
                    created_by_user_id, created_at_utc, updated_at_utc
                 ) VALUES (
                    :id, :source_system, :source_batch_id, :request_sha256, :status,
                    :row_count, 0, 0, 0, :pending_count, :source_total, 0, 0,
                    :pending_total, 0, :creator, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
                 )'
            );
            $sourceTotal = array_sum(array_map(
                static fn (array $row): int => (int) ($row['amountPaise'] ?? 0),
                $rows,
            ));
            $insertBatch->execute([
                'id' => $id,
                'source_system' => $sourceSystem,
                'source_batch_id' => $sourceBatchId,
                'request_sha256' => $requestHash,
                'status' => 'PROCESSING',
                'row_count' => count($rows),
                'pending_count' => count($rows),
                'source_total' => $sourceTotal,
                'pending_total' => $sourceTotal,
                'creator' => $actorId,
            ]);

            $insertRow = $pdo->prepare(
                'INSERT INTO voucher_import_rows (
                    id, batch_id, source_record_id, source_legacy_id, source_row_number,
                    row_sha256, voucher_type, source_amount_paise, status,
                    voucher_id, error_code, error_message, attempted_count,
                    created_at_utc, updated_at_utc
                 ) VALUES (
                    :id, :batch_id, :source_record_id, :source_legacy_id, :source_row_number,
                    :row_sha256, :voucher_type, :source_amount, :status,
                    NULL, NULL, NULL, 0, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
                 )'
            );
            foreach ($rows as $row) {
                $insertRow->execute([
                    'id' => Uuid::v4(),
                    'batch_id' => $id,
                    'source_record_id' => $row['sourceRecordId'],
                    'source_legacy_id' => $row['sourceLegacyId'],
                    'source_row_number' => $row['rowNumber'],
                    'row_sha256' => $row['rowHash'],
                    'voucher_type' => $row['voucherType'],
                    'source_amount' => $row['amountPaise'],
                    'status' => 'PENDING',
                ]);
            }

            AuditWriter::append($pdo, $actorId, $actorEmail, [
                'eventType' => 'VOUCHER_IMPORT_BATCH_OPENED',
                'targetType' => 'voucher_import_batch',
                'targetId' => $id,
                'reason' => 'A repeatable voucher import batch manifest was opened.',
                'after' => [
                    'sourceSystem' => $sourceSystem,
                    'sourceBatchId' => $sourceBatchId,
                    'rowCount' => count($rows),
                    'requestSha256' => $requestHash,
                ],
            ]);
            $pdo->commit();

            return $id;
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    /**
     * @param array<string,mixed> $row
     * @param array<string,mixed> $principal
     */
    private function attemptRow(
        PDO $pdo,
        string $batchId,
        string $rowId,
        array $row,
        string $sourceSystem,
        array $principal,
    ): void {
        $claim = $pdo->prepare(
            "UPDATE voucher_import_rows
             SET attempted_count = attempted_count + 1,
                 status = 'PENDING',
                 error_code = NULL,
                 error_message = NULL,
                 updated_at_utc = UTC_TIMESTAMP(6)
             WHERE id = :id AND status IN ('PENDING', 'QUARANTINED')"
        );
        $claim->execute(['id' => $rowId]);

        $voucher = $row['voucher'];
        $allowedFields = [
            'date', 'vendor', 'vendorId', 'amount', 'category', 'notes', 'type',
            'cashImpact', 'paymentMethod', 'duplicateConfirmationToken',
            'sourceStatus', 'sourceApprovalStatus', 'sourceVoucherNo', 'sourceReceipts',
            'sourceVendorType',
        ];
        $unsupportedFields = array_values(array_diff(array_map('strval', array_keys($voucher)), $allowedFields));
        if ($unsupportedFields !== []) {
            $this->quarantine(
                $pdo,
                $rowId,
                'UNSUPPORTED_SOURCE_FIELDS',
                'The source row contains fields that are not covered by the import contract: '.implode(', ', array_slice($unsupportedFields, 0, 8)).'. No unsupported field was discarded.',
            );

            return;
        }

        $sourceStatus = $voucher['sourceStatus'] ?? '';
        unset($voucher['sourceStatus']);
        if ($sourceStatus !== null && $sourceStatus !== '' && $sourceStatus !== 'ACTIVE') {
            $this->quarantine(
                $pdo,
                $rowId,
                'SOURCE_STATUS_REQUIRES_RECONCILIATION',
                'Only active source entries can use this bulk-entry importer. Reconcile cancelled or otherwise changed vouchers through the historical migration workflow.',
            );

            return;
        }

        foreach ([
            'sourceApprovalStatus' => 'SOURCE_APPROVAL_REQUIRES_RECONCILIATION',
            'sourceVoucherNo' => 'SOURCE_VOUCHER_NUMBER_REQUIRES_RECONCILIATION',
            'sourceReceipts' => 'SOURCE_RECEIPTS_REQUIRE_PRIVATE_MIGRATION',
            'sourceVendorType' => 'SOURCE_VENDOR_TYPE_REQUIRES_RECONCILIATION',
        ] as $field => $errorCode) {
            $value = $voucher[$field] ?? '';
            if ($value !== null && $value !== '' && $value !== [] && $value !== false) {
                $this->quarantine(
                    $pdo,
                    $rowId,
                    $errorCode,
                    'This source field cannot be discarded or rewritten by the transactional bulk-entry importer. Reconcile it through the dedicated migration workflow.',
                );

                return;
            }
            unset($voucher[$field]);
        }

        $sourceLegacyId = $row['sourceLegacyId'];
        $prior = $pdo->prepare(
            "SELECT row_sha256, voucher_id
             FROM voucher_import_rows
             WHERE source_legacy_id = :source_id
               AND batch_id <> :batch_id
               AND status IN ('IMPORTED', 'REPLAYED')
             ORDER BY created_at_utc ASC
             LIMIT 1"
        );
        $prior->execute(['source_id' => $sourceLegacyId, 'batch_id' => $batchId]);
        $priorRow = $prior->fetch(PDO::FETCH_ASSOC);
        if (is_array($priorRow)) {
            if (hash_equals((string) $priorRow['row_sha256'], $row['rowHash'])) {
                $this->markReplayed($pdo, $rowId, (string) $priorRow['voucher_id']);

                return;
            }
            $this->quarantine(
                $pdo,
                $rowId,
                'SOURCE_ID_CONFLICT',
                'This source record ID was previously imported with different financial content. Reconcile the source before retrying.',
            );

            return;
        }

        // Recover the narrow crash window where the voucher transaction committed but
        // the import-row status update did not. A stable source ID is not enough by itself:
        // compare every persisted financial field before classifying the row as a replay.
        if ($this->reconcileExistingSourceVoucher($pdo, $rowId, $sourceLegacyId, $voucher)) {
            return;
        }

        $voucher['sourceLegacyId'] = $sourceLegacyId;
        $voucher['clientId'] = 'import-'.$sourceLegacyId;
        $idempotencyKey = 'import-voucher-'.hash('sha256', $sourceLegacyId.':'.$row['rowHash']);

        try {
            $result = $this->storeVoucher->execute(
                $pdo,
                $voucher,
                $principal,
                $idempotencyKey,
            );
            $status = $result['replayed'] ? 'REPLAYED' : 'IMPORTED';
            $update = $pdo->prepare(
                'UPDATE voucher_import_rows
                 SET status = :status, voucher_id = :voucher_id,
                     error_code = NULL, error_message = NULL, updated_at_utc = UTC_TIMESTAMP(6)
                 WHERE id = :id'
            );
            $update->execute([
                'status' => $status,
                'voucher_id' => $result['data']['id'],
                'id' => $rowId,
            ]);
        } catch (ApiException $exception) {
            if ($exception->errorCode === 'IDEMPOTENCY_IN_PROGRESS') {
                return;
            }
            if (
                $exception->errorCode === 'SOURCE_ID_CONFLICT'
                && $this->reconcileExistingSourceVoucher($pdo, $rowId, $sourceLegacyId, $voucher)
            ) {
                return;
            }
            $this->quarantine(
                $pdo,
                $rowId,
                $exception->errorCode,
                mb_substr($exception->getMessage(), 0, 300, 'UTF-8'),
            );
        }
    }

    private function markReplayed(PDO $pdo, string $rowId, string $voucherId): void
    {
        $update = $pdo->prepare(
            "UPDATE voucher_import_rows
             SET status = 'REPLAYED', voucher_id = :voucher_id,
                 error_code = NULL, error_message = NULL, updated_at_utc = UTC_TIMESTAMP(6)
             WHERE id = :id"
        );
        $update->execute(['voucher_id' => $voucherId, 'id' => $rowId]);
    }

    /**
     * Reconcile an already-existing voucher against the immutable source row.
     * Returns true when the existing record was either safely replayed or quarantined.
     *
     * @param array<string,mixed> $voucher
     */
    private function reconcileExistingSourceVoucher(
        PDO $pdo,
        string $rowId,
        string $sourceLegacyId,
        array $voucher,
    ): bool {
        $query = $pdo->prepare(
            'SELECT id, voucher_type, business_date, vendor_name_snapshot, vendor_id,
                    amount_paise, category, notes, status, cash_impact, payment_method
             FROM vouchers
             WHERE source_legacy_id = :source_id
             LIMIT 1'
        );
        $query->execute(['source_id' => $sourceLegacyId]);
        $existing = $query->fetch(PDO::FETCH_ASSOC);
        if (! is_array($existing)) {
            return false;
        }

        $amount = null;
        try {
            $amountInput = $voucher['amount'] ?? null;
            if (! is_string($amountInput)) {
                throw new \InvalidArgumentException('Amount must be a decimal string.');
            }
            $amount = Money::toPaise($amountInput);
        } catch (\InvalidArgumentException) {
            // Invalid input cannot match an already-committed financial record.
        }

        $vendor = trim((string) ($voucher['vendor'] ?? ''));
        $storedVendor = trim((string) $existing['vendor_name_snapshot']);
        $normalizeVendor = static function (string $value): string {
            $normalized = preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);

            return function_exists('mb_strtolower')
                ? mb_strtolower($normalized, 'UTF-8')
                : strtolower($normalized);
        };
        $requestedVendorId = (string) ($voucher['vendorId'] ?? '');
        $vendorMatches = $requestedVendorId !== ''
            ? hash_equals($requestedVendorId, (string) ($existing['vendor_id'] ?? ''))
            : hash_equals($normalizeVendor($vendor), $normalizeVendor($storedVendor));
        $category = trim((string) ($voucher['category'] ?? 'Other'));
        $category = $category === '' ? 'Other' : $category;
        $notes = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string) ($voucher['notes'] ?? '')) ?? '';
        $notes = mb_substr(trim($notes), 0, 500, 'UTF-8');

        $matches = $amount !== null
            && $amount === (int) $existing['amount_paise']
            && (string) ($voucher['date'] ?? '') === (string) $existing['business_date']
            && (string) ($voucher['type'] ?? 'PAYMENT') === (string) $existing['voucher_type']
            && $vendorMatches
            && $category === (string) $existing['category']
            && $notes === (string) $existing['notes']
            && (string) ($voucher['cashImpact'] ?? '') === (string) $existing['cash_impact']
            && (string) ($voucher['paymentMethod'] ?? '') === (string) $existing['payment_method']
            && (string) $existing['status'] === 'ACTIVE';

        if ($matches) {
            $this->markReplayed($pdo, $rowId, (string) $existing['id']);

            return true;
        }

        $this->quarantine(
            $pdo,
            $rowId,
            'SOURCE_ID_CONFLICT',
            'This source record ID already belongs to a voucher with different persisted financial fields. Reconcile the source before retrying.',
        );

        return true;
    }

    private function quarantine(PDO $pdo, string $rowId, string $code, string $message): void
    {
        $update = $pdo->prepare(
            "UPDATE voucher_import_rows
             SET status = 'QUARANTINED', error_code = :code,
                 error_message = :message, updated_at_utc = UTC_TIMESTAMP(6)
             WHERE id = :id"
        );
        $update->execute([
            'code' => mb_substr($code, 0, 80, 'UTF-8'),
            'message' => mb_substr($message, 0, 300, 'UTF-8'),
            'id' => $rowId,
        ]);
    }

    /**
     * @return array<string,mixed>
     */
    private function reconcile(
        PDO $pdo,
        string $batchId,
        string $sourceSystem,
        string $sourceBatchId,
        string $actorId,
        string $actorEmail,
    ): array {
        $rowsQuery = $pdo->prepare(
            'SELECT source_row_number, source_record_id, status, voucher_id,
                    source_amount_paise, error_code, error_message
             FROM voucher_import_rows
             WHERE batch_id = :batch_id
             ORDER BY source_row_number ASC'
        );
        $rowsQuery->execute(['batch_id' => $batchId]);
        $rows = $rowsQuery->fetchAll(PDO::FETCH_ASSOC);

        $sourceTotal = 0;
        $importedTotal = 0;
        $quarantinedTotal = 0;
        $pendingTotal = 0;
        $importedCount = 0;
        $replayedCount = 0;
        $quarantinedCount = 0;
        $pendingCount = 0;
        $unpricedCount = 0;
        $items = [];
        foreach ($rows as $row) {
            $amount = (int) ($row['source_amount_paise'] ?? 0);
            if ($row['source_amount_paise'] !== null) {
                $sourceTotal += $amount;
            } else {
                $unpricedCount++;
            }
            $status = (string) $row['status'];
            if ($status === 'IMPORTED') {
                $importedCount++;
                $importedTotal += $amount;
            } elseif ($status === 'REPLAYED') {
                $replayedCount++;
                $importedTotal += $amount;
            } elseif ($status === 'QUARANTINED') {
                $quarantinedCount++;
                $quarantinedTotal += $amount;
            } else {
                $pendingCount++;
                $pendingTotal += $amount;
            }

            $item = [
                'rowNumber' => (int) $row['source_row_number'],
                'sourceRecordId' => (string) $row['source_record_id'],
                'status' => $status,
                'voucherId' => $row['voucher_id'] === null ? null : (string) $row['voucher_id'],
                'sourceAmountPaise' => $row['source_amount_paise'] === null ? null : (int) $row['source_amount_paise'],
                'errorCode' => $row['error_code'] === null ? null : (string) $row['error_code'],
                'errorMessage' => $row['error_message'] === null ? null : (string) $row['error_message'],
            ];
            if ($item['voucherId'] !== null) {
                $item['voucher'] = $this->voucherSummary($pdo, $item['voucherId']);
            } else {
                $item['voucher'] = null;
            }
            $items[] = $item;
        }

        $variance = $sourceTotal - $importedTotal - $quarantinedTotal - $pendingTotal;
        $status = $pendingCount > 0
            ? 'PROCESSING'
            : ($quarantinedCount > 0 || $unpricedCount > 0 ? 'RECONCILIATION_REQUIRED' : 'COMPLETED');

        $pdo->beginTransaction();
        try {
            $update = $pdo->prepare(
                'UPDATE voucher_import_batches
                 SET status = :status, imported_count = :imported,
                     replayed_count = :replayed, quarantined_count = :quarantined,
                     pending_count = :pending, source_total_paise = :source_total,
                     imported_total_paise = :imported_total,
                     quarantined_total_paise = :quarantined_total,
                     pending_total_paise = :pending_total, variance_paise = :variance,
                     updated_at_utc = UTC_TIMESTAMP(6)
                 WHERE id = :id'
            );
            $update->execute([
                'status' => $status,
                'imported' => $importedCount,
                'replayed' => $replayedCount,
                'quarantined' => $quarantinedCount,
                'pending' => $pendingCount,
                'source_total' => $sourceTotal,
                'imported_total' => $importedTotal,
                'quarantined_total' => $quarantinedTotal,
                'pending_total' => $pendingTotal,
                'variance' => $variance,
                'id' => $batchId,
            ]);
            AuditWriter::append($pdo, $actorId, $actorEmail, [
                'eventType' => 'VOUCHER_IMPORT_BATCH_RECONCILED',
                'targetType' => 'voucher_import_batch',
                'targetId' => $batchId,
                'reason' => 'Voucher import batch reconciliation totals were updated.',
                'after' => [
                    'status' => $status,
                    'rowCount' => count($rows),
                    'importedCount' => $importedCount,
                    'replayedCount' => $replayedCount,
                    'quarantinedCount' => $quarantinedCount,
                    'pendingCount' => $pendingCount,
                    'unpricedCount' => $unpricedCount,
                    'sourceTotalPaise' => $sourceTotal,
                    'importedTotalPaise' => $importedTotal,
                    'quarantinedTotalPaise' => $quarantinedTotal,
                    'pendingTotalPaise' => $pendingTotal,
                    'variancePaise' => $variance,
                ],
            ]);
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }

        return [
            'batchId' => $sourceBatchId,
            'batchRecordId' => $batchId,
            'sourceSystem' => $sourceSystem,
            'status' => $status,
            'reconciliation' => [
                'rowCount' => count($rows),
                'importedCount' => $importedCount,
                'replayedCount' => $replayedCount,
                'quarantinedCount' => $quarantinedCount,
                'pendingCount' => $pendingCount,
                'unpricedCount' => $unpricedCount,
                'sourceTotalPaise' => $sourceTotal,
                'importedTotalPaise' => $importedTotal,
                'quarantinedTotalPaise' => $quarantinedTotal,
                'pendingTotalPaise' => $pendingTotal,
                'variancePaise' => $variance,
                'balanced' => $variance === 0 && $pendingCount === 0 && $unpricedCount === 0,
            ],
            'rows' => $items,
        ];
    }

    /** @return array<string,mixed>|null */
    private function voucherSummary(PDO $pdo, string $voucherId): ?array
    {
        $query = $pdo->prepare(
            'SELECT id, voucher_number, business_date, vendor_name_snapshot, vendor_id,
                    vendor_type, amount_paise, category, notes, voucher_type, status,
                    cash_impact, payment_method, approval_status, created_by_email_snapshot,
                    client_id
             FROM vouchers WHERE id = :id LIMIT 1'
        );
        $query->execute(['id' => $voucherId]);
        $voucher = $query->fetch(PDO::FETCH_ASSOC);
        if (! is_array($voucher)) {
            return null;
        }

        $paise = (int) $voucher['amount_paise'];
        return [
            'id' => (string) $voucher['id'],
            'voucherNo' => (string) $voucher['voucher_number'],
            'date' => (string) $voucher['business_date'],
            'vendor' => (string) $voucher['vendor_name_snapshot'],
            'vendorId' => $voucher['vendor_id'] === null ? null : (string) $voucher['vendor_id'],
            'vendorType' => (string) $voucher['vendor_type'],
            'amount' => intdiv($paise, 100).'.'.str_pad((string) ($paise % 100), 2, '0', STR_PAD_LEFT),
            'amountPaise' => $paise,
            'category' => (string) $voucher['category'],
            'notes' => (string) $voucher['notes'],
            'type' => (string) $voucher['voucher_type'],
            'status' => (string) $voucher['status'],
            'cashImpact' => (string) $voucher['cash_impact'],
            'paymentMethod' => (string) $voucher['payment_method'],
            'approvalStatus' => (string) $voucher['approval_status'],
            'clientId' => (string) $voucher['client_id'],
            'createdBy' => (string) $voucher['created_by_email_snapshot'],
        ];
    }

    private function canonicalize(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }
        if (array_is_list($value)) {
            return array_map(fn (mixed $item): mixed => $this->canonicalize($item), $value);
        }
        ksort($value, SORT_STRING);
        foreach ($value as $key => $item) {
            $value[$key] = $this->canonicalize($item);
        }

        return $value;
    }
}
