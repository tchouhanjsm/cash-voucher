<?php

declare(strict_types=1);

namespace App\Modules\Imports\Actions;

use CashVoucher\Api\Financial\AuditWriter;
use CashVoucher\Api\Support\ApiException;
use CashVoucher\Api\Support\Money;
use CashVoucher\Api\Support\Uuid;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\Storage;
use PDO;
use PDOException;
use Throwable;

final class HistoricalMigrationService
{
    private const SOURCE = 'apps-script-vouchers';
    private const MAX_RECEIPT_BYTES = 1600000;
    private const MIME = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

    public function stage(PDO $pdo, array $input, array $principal): array
    {
        if (($input['sourceSystem'] ?? '') !== self::SOURCE || (int) ($input['contractVersion'] ?? 0) !== 1) {
            throw new ApiException(422, 'HISTORICAL_CONTRACT_UNSUPPORTED', 'Historical migration contract is unsupported.');
        }
        $batchKey = (string) ($input['batchId'] ?? '');
        if (! preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $batchKey)) {
            throw new ApiException(422, 'HISTORICAL_BATCH_ID_INVALID', 'Historical batch ID is invalid.');
        }
        $extractedAt = $this->utc($input['sourceExtractedAtUtc'] ?? null);
        $rows = $this->prepareRows($input);
        $voucherRows = array_values(array_filter($rows, static fn (array $row): bool => $row['type'] === 'VOUCHER'));
        if ($voucherRows === [] || count($voucherRows) > 100 || count($rows) > 3300) {
            throw new ApiException(422, 'HISTORICAL_BATCH_LIMIT', 'Batch size must be 1–100 vouchers and no more than 3,300 total source records.');
        }

        $manifest = $this->canonicalize([
            'contractVersion' => 1, 'sourceSystem' => self::SOURCE, 'batchId' => $batchKey,
            'sourceExtractedAtUtc' => $extractedAt,
            'rows' => array_map(static fn (array $r): array => [
                'type' => $r['type'], 'sourceRecordId' => $r['sourceRecordId'],
                'voucherSourceRecordId' => $r['voucherSourceRecordId'],
                'payload' => $r['payload'], 'sha256' => $r['sha256'],
            ], $rows),
        ]);
        $manifestHash = hash('sha256', json_encode($manifest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        $counts = [
            'vouchers' => count($voucherRows),
            'approvals' => count(array_filter($rows, static fn (array $r): bool => $r['type'] === 'APPROVAL')),
            'audits' => count(array_filter($rows, static fn (array $r): bool => $r['type'] === 'AUDIT')),
            'receipts' => count(array_filter($rows, static fn (array $r): bool => $r['type'] === 'RECEIPT')),
        ];
        $sourceTotal = array_sum(array_map(static fn (array $r): int => $r['type'] === 'VOUCHER' ? $r['amountPaise'] : 0, $rows));

        $pdo->beginTransaction();
        try {
            $existingQuery = $pdo->prepare('SELECT id, manifest_sha256 FROM historical_import_batches WHERE source_system = :source AND source_batch_id = :batch LIMIT 1 FOR UPDATE');
            $existingQuery->execute(['source' => self::SOURCE, 'batch' => $batchKey]);
            $existing = $existingQuery->fetch(PDO::FETCH_ASSOC);
            if (is_array($existing)) {
                if (! hash_equals((string) $existing['manifest_sha256'], $manifestHash)) {
                    throw new ApiException(409, 'HISTORICAL_BATCH_CONFLICT', 'This historical batch ID is already reserved by different source content.');
                }
                $id = (string) $existing['id'];
                $pdo->commit();
                return $this->status($pdo, $id);
            }

            $id = Uuid::v4();
            $pdo->prepare(
                'INSERT INTO historical_import_batches (
                    id, source_system, source_batch_id, contract_version, source_extracted_at_utc,
                    manifest_sha256, status, voucher_count, approval_count, audit_event_count, receipt_count,
                    source_total_paise, imported_total_paise, variance_paise, created_by_user_id,
                    created_at_utc, updated_at_utc
                 ) VALUES (
                    :id, :source, :batch, 1, :extracted, :hash, "STAGED", :vouchers, :approvals,
                    :audits, :receipts, :total, 0, 0, :creator, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
                 )'
            )->execute([
                'id' => $id, 'source' => self::SOURCE, 'batch' => $batchKey, 'extracted' => $extractedAt,
                'hash' => $manifestHash, 'vouchers' => $counts['vouchers'], 'approvals' => $counts['approvals'],
                'audits' => $counts['audits'], 'receipts' => $counts['receipts'], 'total' => $sourceTotal,
                'creator' => (string) $principal['id'],
            ]);
            $insert = $pdo->prepare(
                'INSERT INTO historical_import_rows (
                    id, batch_id, source_system, record_type, source_record_id, voucher_source_record_id,
                    row_sha256, payload_json, storage_key, status, target_record_id, error_code,
                    created_at_utc, updated_at_utc
                 ) VALUES (
                    :id, :batch, :source, :type, :source_id, :voucher_source, :hash, :payload, NULL,
                    "STAGED", NULL, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
                 )'
            );
            foreach ($rows as $row) {
                $insert->execute([
                    'id' => Uuid::v4(), 'batch' => $id, 'source' => self::SOURCE,
                    'type' => $row['type'], 'source_id' => $row['sourceRecordId'],
                    'voucher_source' => $row['voucherSourceRecordId'], 'hash' => $row['sha256'],
                    'payload' => json_encode($row['payload'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                ]);
            }
            AuditWriter::append($pdo, (string) $principal['id'], (string) $principal['email'], [
                'eventType' => 'HISTORICAL_IMPORT_STAGED',
                'targetType' => 'historical_import_batch',
                'targetId' => $id,
                'reason' => 'Versioned historical evidence staged; no voucher or number-sequence records were changed.',
                'after' => ['sourceSystem' => self::SOURCE, 'batchId' => $batchKey, 'contractVersion' => 1, 'manifestSha256' => $manifestHash, 'sourceExtractedAtUtc' => $extractedAt, 'sourceTotalPaise' => $sourceTotal, ...$counts],
            ]);
            $pdo->commit();
            return $this->status($pdo, $id);
        } catch (PDOException $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ((string) $exception->getCode() === '23000') {
                throw new ApiException(409, 'HISTORICAL_SOURCE_ID_RESERVED', 'A source record ID is already reserved by another historical batch.');
            }
            throw $exception;
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exception;
        }
    }

    public function status(PDO $pdo, string $batchId): array
    {
        $batch = $this->batch($pdo, $batchId);
        $q = $pdo->prepare('SELECT record_type, status, COUNT(*) AS row_count FROM historical_import_rows WHERE batch_id = :id GROUP BY record_type, status ORDER BY record_type, status');
        $q->execute(['id' => $batchId]);
        return [
            'batchRecordId' => (string) $batch['id'], 'batchId' => (string) $batch['source_batch_id'],
            'sourceSystem' => (string) $batch['source_system'], 'contractVersion' => (int) $batch['contract_version'],
            'sourceExtractedAtUtc' => (string) $batch['source_extracted_at_utc'], 'status' => (string) $batch['status'],
            'manifestSha256' => (string) $batch['manifest_sha256'],
            'counts' => [
                'vouchers' => (int) $batch['voucher_count'], 'approvals' => (int) $batch['approval_count'],
                'auditEvents' => (int) $batch['audit_event_count'], 'receipts' => (int) $batch['receipt_count'],
                'rows' => array_map(static fn (array $r): array => ['type' => $r['record_type'], 'status' => $r['status'], 'count' => (int) $r['row_count']], $q->fetchAll(PDO::FETCH_ASSOC)),
            ],
            'sourceTotalPaise' => (int) $batch['source_total_paise'],
            'importedTotalPaise' => (int) $batch['imported_total_paise'],
            'variancePaise' => (int) $batch['variance_paise'],
            'validatedAtUtc' => $batch['validated_at_utc'] === null ? null : (string) $batch['validated_at_utc'],
            'committedAtUtc' => $batch['committed_at_utc'] === null ? null : (string) $batch['committed_at_utc'],
        ];
    }

    public function validateBatch(PDO $pdo, string $batchId): array
    {
        $batch = $this->batch($pdo, $batchId);
        if (in_array((string) $batch['status'], ['COMMITTED', 'RECONCILIATION_REQUIRED'], true)) {
            return [...$this->status($pdo, $batchId), 'canCommit' => $batch['status'] === 'COMMITTED', 'blockers' => []];
        }
        $q = $pdo->prepare('SELECT * FROM historical_import_rows WHERE batch_id = :id ORDER BY record_type, source_record_id');
        $q->execute(['id' => $batchId]);
        $rows = $q->fetchAll(PDO::FETCH_ASSOC);
        $voucherMap = $numberMap = $receiptCount = $legacyFileIds = [];
        $blockers = [];

        foreach ($rows as $row) {
            if ($row['record_type'] !== 'VOUCHER') continue;
            $payload = $this->payload((string) $row['payload_json']);
            $sourceId = (string) $row['source_record_id'];
            $voucherMap[$sourceId] = true;
            $numberKey = $payload['type'].':'.$payload['voucherNo'];
            if (isset($numberMap[$numberKey])) $blockers[] = ['code' => 'VOUCHER_NUMBER_DUPLICATE_IN_BATCH', 'sourceRecordId' => $sourceId];
            $numberMap[$numberKey] = true;
            $s = $pdo->prepare('SELECT id FROM vouchers WHERE source_legacy_id = :source LIMIT 1');
            $s->execute(['source' => self::SOURCE.':'.$sourceId]);
            if ($s->fetchColumn() !== false) $blockers[] = ['code' => 'VOUCHER_SOURCE_ALREADY_IMPORTED', 'sourceRecordId' => $sourceId];
            $n = $pdo->prepare('SELECT id FROM vouchers WHERE voucher_type = :type AND voucher_number = :number LIMIT 1');
            $n->execute(['type' => $payload['type'], 'number' => $payload['voucherNo']]);
            if ($n->fetchColumn() !== false) $blockers[] = ['code' => 'VOUCHER_NUMBER_ALREADY_ISSUED', 'sourceRecordId' => $sourceId];
        }
        foreach ($rows as $row) {
            $type = (string) $row['record_type'];
            $sourceId = (string) $row['source_record_id'];
            $voucherSource = (string) $row['voucher_source_record_id'];
            if (in_array($type, ['APPROVAL', 'AUDIT', 'RECEIPT'], true) && ! isset($voucherMap[$voucherSource])) {
                $blockers[] = ['code' => 'VOUCHER_REFERENCE_MISSING', 'recordType' => $type, 'sourceRecordId' => $sourceId];
            }
            if ($type !== 'RECEIPT') continue;
            $receiptCount[$voucherSource] = ($receiptCount[$voucherSource] ?? 0) + 1;
            if ($receiptCount[$voucherSource] > 3) $blockers[] = ['code' => 'RECEIPT_LIMIT_EXCEEDED', 'sourceRecordId' => $sourceId];
            $payload = $this->payload((string) $row['payload_json']);
            $fileId = (string) $payload['originalFileId'];
            if (isset($legacyFileIds[$fileId])) $blockers[] = ['code' => 'LEGACY_RECEIPT_ID_DUPLICATE', 'sourceRecordId' => $sourceId];
            $legacyFileIds[$fileId] = true;
            $fileQuery = $pdo->prepare('SELECT id FROM voucher_receipts WHERE legacy_drive_file_id = :file LIMIT 1');
            $fileQuery->execute(['file' => $fileId]);
            if ($fileQuery->fetchColumn() !== false) $blockers[] = ['code' => 'LEGACY_RECEIPT_ALREADY_LINKED', 'sourceRecordId' => $sourceId];
            $key = (string) ($row['storage_key'] ?? '');
            if ($key === '' || ! Storage::disk('private')->exists($key)) {
                $blockers[] = ['code' => 'RECEIPT_BYTES_MISSING', 'sourceRecordId' => $sourceId];
                continue;
            }
            try { $bytes = Storage::disk('private')->get($key); } catch (Throwable) { $bytes = ''; }
            if (strlen($bytes) !== (int) $payload['byteSize'] || ! hash_equals((string) $payload['sha256'], hash('sha256', $bytes)) || $this->mime($bytes) !== $payload['contentType']) {
                $blockers[] = ['code' => 'RECEIPT_INTEGRITY_FAILED', 'sourceRecordId' => $sourceId];
            }
        }
        $status = $blockers === [] ? 'READY' : 'BLOCKED';
        $pdo->prepare('UPDATE historical_import_batches SET status = :status, validation_json = :json, validated_at_utc = UTC_TIMESTAMP(6), updated_at_utc = UTC_TIMESTAMP(6) WHERE id = :id')
            ->execute(['status' => $status, 'json' => json_encode(['canCommit' => $blockers === [], 'blockers' => $blockers], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), 'id' => $batchId]);
        return [...$this->status($pdo, $batchId), 'canCommit' => $blockers === [], 'blockers' => $blockers];
    }

    public function uploadReceipt(PDO $pdo, string $batchId, string $sourceRecordId, array $input): array
    {
        $this->batch($pdo, $batchId);
        $q = $pdo->prepare("SELECT id, payload_json, storage_key, status FROM historical_import_rows WHERE batch_id = :batch AND record_type = 'RECEIPT' AND source_record_id = :source LIMIT 1");
        $q->execute(['batch' => $batchId, 'source' => $sourceRecordId]);
        $row = $q->fetch(PDO::FETCH_ASSOC);
        if (! is_array($row)) throw new ApiException(404, 'HISTORICAL_RECEIPT_NOT_FOUND', 'The receipt is not present in this manifest.');
        if ($row['status'] === 'COMMITTED') throw new ApiException(409, 'HISTORICAL_BATCH_COMMITTED', 'A committed receipt cannot be changed.');
        $payload = $this->payload((string) $row['payload_json']);
        $mime = $input['mime'] ?? null;
        $encoded = $input['data'] ?? null;
        if (! is_string($mime) || ! isset(self::MIME[$mime]) || $mime !== $payload['contentType']) throw new ApiException(422, 'HISTORICAL_RECEIPT_MIME_INVALID', 'Receipt MIME does not match source metadata.');
        if (! is_string($encoded) || $encoded === '' || strlen($encoded) > 2200000 || ! preg_match('/^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$/D', $encoded)) throw new ApiException(422, 'HISTORICAL_RECEIPT_DATA_INVALID', 'Receipt data is invalid or too large.');
        $bytes = base64_decode($encoded, true);
        if (! is_string($bytes) || $bytes === '' || strlen($bytes) > self::MAX_RECEIPT_BYTES || strlen($bytes) !== (int) $payload['byteSize'] || ! hash_equals((string) $payload['sha256'], hash('sha256', $bytes)) || $this->mime($bytes) !== $mime) throw new ApiException(422, 'HISTORICAL_RECEIPT_INTEGRITY_FAILED', 'Receipt bytes do not match source size, MIME and SHA-256.');
        $key = 'receipts/historical/'.substr(hash('sha256', $batchId), 0, 12).'/'.hash('sha256', $sourceRecordId).'.'.self::MIME[$mime];
        try {
            if (Storage::disk('private')->exists($key)) {
                $existing = Storage::disk('private')->get($key);
                if (! hash_equals(hash('sha256', $bytes), hash('sha256', $existing))) throw new ApiException(409, 'HISTORICAL_RECEIPT_STORAGE_CONFLICT', 'A different object is already staged for this receipt identity.');
            } elseif (! Storage::disk('private')->put($key, $bytes)) {
                throw new \RuntimeException('Private receipt storage failed.');
            }
        } catch (ApiException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            report($exception);
            throw new ApiException(503, 'HISTORICAL_RECEIPT_STORAGE_UNAVAILABLE', 'Private receipt storage is unavailable.');
        }
        $update = $pdo->prepare("UPDATE historical_import_rows SET storage_key = :key, updated_at_utc = UTC_TIMESTAMP(6) WHERE id = :id AND status = 'STAGED'");
        $update->execute(['key' => $key, 'id' => $row['id']]);
        if ($update->rowCount() !== 1 && (string) ($row['storage_key'] ?? '') !== $key) throw new ApiException(409, 'HISTORICAL_ROW_STATE_CHANGED', 'Receipt row changed during upload.');
        return ['sourceRecordId' => $sourceRecordId, 'uploaded' => true, 'storage' => 'private-staging', 'byteSize' => strlen($bytes), 'sha256' => hash('sha256', $bytes)];
    }

    public function commit(PDO $pdo, string $batchId, array $principal): array
    {
        $pdo->beginTransaction();
        try {
            $q = $pdo->prepare('SELECT * FROM historical_import_batches WHERE id = :id LIMIT 1 FOR UPDATE');
            $q->execute(['id' => $batchId]);
            $batch = $q->fetch(PDO::FETCH_ASSOC);
            if (! is_array($batch)) throw new ApiException(404, 'HISTORICAL_BATCH_NOT_FOUND', 'Historical batch was not found.');
            if (in_array($batch['status'], ['COMMITTED', 'RECONCILIATION_REQUIRED'], true)) {
                $pdo->commit();
                return $this->status($pdo, $batchId);
            }
            if ($batch['status'] !== 'READY') throw new ApiException(409, 'HISTORICAL_BATCH_NOT_READY', 'Validate the manifest and upload every receipt before committing.');
            $q = $pdo->prepare('SELECT * FROM historical_import_rows WHERE batch_id = :id ORDER BY record_type, source_record_id FOR UPDATE');
            $q->execute(['id' => $batchId]);
            $rows = $q->fetchAll(PDO::FETCH_ASSOC);
            $voucherIds = [];
            $maxima = ['PAYMENT' => 0, 'RECEIPT' => 0];
            $imported = 0;

            foreach ($rows as $row) {
                if ($row['record_type'] !== 'VOUCHER') continue;
                $payload = $this->payload((string) $row['payload_json']);
                $sourceId = (string) $row['source_record_id'];
                $sourceLegacyId = self::SOURCE.':'.$sourceId;
                $q = $pdo->prepare('SELECT id FROM vouchers WHERE source_legacy_id = :id LIMIT 1 FOR UPDATE');
                $q->execute(['id' => $sourceLegacyId]);
                if ($q->fetchColumn() !== false) throw new ApiException(409, 'HISTORICAL_SOURCE_ALREADY_IMPORTED', 'A voucher with this source ID already exists.');
                $q = $pdo->prepare('SELECT id FROM vouchers WHERE voucher_type = :type AND voucher_number = :number LIMIT 1 FOR UPDATE');
                $q->execute(['type' => $payload['type'], 'number' => $payload['voucherNo']]);
                if ($q->fetchColumn() !== false) throw new ApiException(409, 'HISTORICAL_NUMBER_ALREADY_ISSUED', 'The original voucher number has already been issued.');

                $voucherId = Uuid::v4();
                $amount = Money::toPaise((string) $payload['amount']);
                $pdo->prepare(
                    'INSERT INTO vouchers (
                        id, voucher_type, voucher_number, business_date, vendor_name_snapshot, vendor_id,
                        vendor_type, amount_paise, category, notes, status, cash_impact, approval_status,
                        approval_reason, payment_method, cancel_reason, client_id, source_legacy_id,
                        created_by_user_id, created_by_email_snapshot, updated_by_user_id, approved_by_user_id,
                        created_at_utc, updated_at_utc, approved_at_utc
                     ) VALUES (
                        :id, :type, :number, :date, :vendor, :vendor_id, :vendor_type, :amount, :category,
                        :notes, :status, :cash, :approval, :approval_reason, :payment_method, :cancel_reason,
                        NULL, :source, :creator, :creator_email, :updater, :approver, :created, :updated, :approved
                     )'
                )->execute([
                    'id' => $voucherId, 'type' => $payload['type'], 'number' => $payload['voucherNo'],
                    'date' => $this->businessDate($payload['date']), 'vendor' => $payload['vendor'],
                    'vendor_id' => $this->vendorIdForSource($pdo, $payload['vendorSourceId'] ?? null),
                    'vendor_type' => (string) ($payload['vendorType'] ?? 'UNVERIFIED'), 'amount' => $amount,
                    'category' => $payload['category'], 'notes' => (string) ($payload['notes'] ?? ''),
                    'status' => $payload['status'], 'cash' => $payload['cashImpact'], 'approval' => $payload['approvalStatus'],
                    'approval_reason' => (string) ($payload['approvalReason'] ?? ''), 'payment_method' => (string) ($payload['paymentMethod'] ?? ''),
                    'cancel_reason' => (string) ($payload['cancelReason'] ?? ''), 'source' => $sourceLegacyId,
                    'creator' => $this->userIdForEmail($pdo, $payload['createdByEmail'] ?? null),
                    'creator_email' => (string) ($payload['createdByEmail'] ?? ''),
                    'updater' => $this->userIdForEmail($pdo, $payload['updatedByEmail'] ?? null),
                    'approver' => $this->userIdForEmail($pdo, $payload['approvedByEmail'] ?? null),
                    'created' => $this->utc($payload['createdAtUtc']), 'updated' => $this->utc($payload['updatedAtUtc']),
                    'approved' => empty($payload['approvedAtUtc']) ? null : $this->utc($payload['approvedAtUtc']),
                ]);
                $voucherIds[$sourceId] = $voucherId;
                $imported += $amount;
                if (ctype_digit((string) $payload['voucherNo'])) $maxima[$payload['type']] = max($maxima[$payload['type']], (int) $payload['voucherNo']);
                $this->markCommitted($pdo, (string) $row['id'], $voucherId);
            }

            foreach ($rows as $row) {
                $type = (string) $row['record_type'];
                if ($type === 'VOUCHER') continue;
                $payload = $this->payload((string) $row['payload_json']);
                $voucherId = $voucherIds[(string) $row['voucher_source_record_id']] ?? null;
                if (! is_string($voucherId)) throw new ApiException(409, 'HISTORICAL_VOUCHER_REFERENCE_INVALID', 'A historical child row references a voucher outside this batch.');
                if ($type === 'APPROVAL') {
                    $target = $this->insertApproval($pdo, $voucherId, (string) $row['source_record_id'], $payload);
                } elseif ($type === 'AUDIT') {
                    $target = $this->insertAudit($pdo, $voucherId, (string) $row['source_record_id'], $payload);
                } else {
                    $target = $this->insertReceipt($pdo, $voucherId, $row, $payload);
                }
                $this->markCommitted($pdo, (string) $row['id'], $target);
            }

            $this->advanceSequences($pdo, $maxima);
            $sourceTotal = (int) $batch['source_total_paise'];
            $variance = $sourceTotal - $imported;
            $status = $variance === 0 ? 'COMMITTED' : 'RECONCILIATION_REQUIRED';
            $pdo->prepare(
                'UPDATE historical_import_batches SET status = :status, imported_total_paise = :imported,
                 variance_paise = :variance, committed_at_utc = UTC_TIMESTAMP(6), updated_at_utc = UTC_TIMESTAMP(6) WHERE id = :id'
            )->execute(['status' => $status, 'imported' => $imported, 'variance' => $variance, 'id' => $batchId]);
            AuditWriter::append($pdo, (string) $principal['id'], (string) $principal['email'], [
                'eventType' => 'HISTORICAL_IMPORT_COMMITTED', 'targetType' => 'historical_import_batch',
                'targetId' => $batchId, 'reason' => 'Owner-validated historical records and their source relationships were committed atomically.',
                'after' => ['sourceTotalPaise' => $sourceTotal, 'importedTotalPaise' => $imported, 'variancePaise' => $variance, 'balanced' => $variance === 0],
            ]);
            $pdo->commit();
            return $this->status($pdo, $batchId);
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exception;
        }
    }

    private function insertApproval(PDO $pdo, string $voucherId, string $sourceId, array $payload): string
    {
        $id = Uuid::v4();
        $pdo->prepare(
            'INSERT INTO historical_approval_events (
                id, source_system, source_event_id, voucher_id, decision, previous_status, next_status,
                reason, actor_source_id, actor_email_snapshot, occurred_at_utc, payload_json
             ) VALUES (:id, :source, :event, :voucher, :decision, :previous, :next, :reason, :actor_id, :email, :occurred, :payload)'
        )->execute([
            'id' => $id, 'source' => self::SOURCE, 'event' => $sourceId, 'voucher' => $voucherId,
            'decision' => (string) $payload['decision'], 'previous' => (string) ($payload['previousStatus'] ?? ''),
            'next' => (string) ($payload['nextStatus'] ?? ''), 'reason' => (string) ($payload['reason'] ?? ''),
            'actor_id' => (string) ($payload['actorSourceId'] ?? ''), 'email' => (string) ($payload['actorEmail'] ?? ''),
            'occurred' => $this->utc($payload['occurredAtUtc']),
            'payload' => json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
        $this->insertAudit($pdo, $voucherId, 'historical-approval:'.$sourceId, [
            'eventType' => 'HISTORICAL_APPROVAL_'.strtoupper((string) $payload['decision']),
            'actorSourceId' => $payload['actorSourceId'] ?? '', 'actorEmail' => $payload['actorEmail'] ?? '',
            'occurredAtUtc' => $payload['occurredAtUtc'], 'reason' => $payload['reason'] ?? '',
            'before' => ['approvalStatus' => $payload['previousStatus'] ?? ''],
            'after' => ['approvalStatus' => $payload['nextStatus'] ?? '', 'sourceEventId' => $sourceId],
        ]);
        return $id;
    }

    private function insertAudit(PDO $pdo, string $voucherId, string $sourceId, array $payload): string
    {
        $id = Uuid::v4();
        $event = preg_replace('/[^A-Z0-9_]/', '_', strtoupper((string) $payload['eventType'])) ?? 'LEGACY_EVENT';
        $pdo->prepare(
            'INSERT INTO audit_events (
                id, actor_user_id, actor_email_snapshot, actor_source_id, event_type, target_type,
                target_id, before_json, after_json, reason, occurred_at_utc, source_system, source_event_id
             ) VALUES (:id, :actor, :email, :actor_source, :event, :target_type, :target_id,
                :before, :after, :reason, :occurred, :source, :source_event)'
        )->execute([
            'id' => $id, 'actor' => $this->userIdForEmail($pdo, $payload['actorEmail'] ?? null),
            'email' => (string) ($payload['actorEmail'] ?? ''), 'actor_source' => (string) ($payload['actorSourceId'] ?? ''),
            'event' => 'LEGACY_'.substr($event, 0, 70), 'target_type' => 'voucher', 'target_id' => $voucherId,
            'before' => isset($payload['before']) && $payload['before'] !== null ? json_encode($payload['before'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) : null,
            'after' => isset($payload['after']) && $payload['after'] !== null ? json_encode($payload['after'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) : null,
            'reason' => mb_substr((string) ($payload['reason'] ?? ''), 0, 500, 'UTF-8'),
            'occurred' => $this->utc($payload['occurredAtUtc']), 'source' => self::SOURCE, 'source_event' => $sourceId,
        ]);
        return $id;
    }

    private function insertReceipt(PDO $pdo, string $voucherId, array $row, array $payload): string
    {
        $key = (string) ($row['storage_key'] ?? '');
        if ($key === '' || ! Storage::disk('private')->exists($key)) throw new ApiException(409, 'HISTORICAL_RECEIPT_BYTES_MISSING', 'Staged receipt is missing.');
        $bytes = Storage::disk('private')->get($key);
        if (strlen($bytes) !== (int) $payload['byteSize'] || ! hash_equals((string) $payload['sha256'], hash('sha256', $bytes)) || $this->mime($bytes) !== (string) $payload['contentType']) throw new ApiException(409, 'HISTORICAL_RECEIPT_INTEGRITY_FAILED', 'Staged receipt no longer matches its source metadata.');
        $id = Uuid::v4();
        $pdo->prepare(
            'INSERT INTO voucher_receipts (
                id, voucher_id, storage_key, legacy_drive_file_id, content_type, byte_size, sha256,
                created_by_user_id, created_at_utc
             ) VALUES (:id, :voucher, :key, :legacy, :mime, :size, :sha, :creator, :created)'
        )->execute([
            'id' => $id, 'voucher' => $voucherId, 'key' => $key, 'legacy' => (string) $payload['originalFileId'],
            'mime' => (string) $payload['contentType'], 'size' => (int) $payload['byteSize'], 'sha' => (string) $payload['sha256'],
            'creator' => $this->userIdForEmail($pdo, $payload['createdByEmail'] ?? null), 'created' => $this->utc($payload['createdAtUtc']),
        ]);
        return $id;
    }

    private function prepareRows(array $input): array
    {
        $out = [];
        $seen = [];
        foreach (['vouchers' => 'VOUCHER', 'approvals' => 'APPROVAL', 'auditEvents' => 'AUDIT', 'receipts' => 'RECEIPT'] as $key => $type) {
            foreach (($input[$key] ?? []) as $item) {
                if (! is_array($item) || ! is_string($item['sourceRecordId'] ?? null)) throw new ApiException(422, 'HISTORICAL_SOURCE_ID_REQUIRED', 'Every source record needs a sourceRecordId.');
                $sourceId = (string) $item['sourceRecordId'];
                if (! preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/D', $sourceId)) throw new ApiException(422, 'HISTORICAL_SOURCE_ID_INVALID', 'A source record ID is invalid.');
                if (isset($seen[$type.':'.$sourceId])) throw new ApiException(422, 'HISTORICAL_SOURCE_ID_DUPLICATE', 'Source IDs must be unique within a record type.');
                $seen[$type.':'.$sourceId] = true;
                if ($type === 'VOUCHER') {
                    $payload = $item['voucher'] ?? null;
                    if (! is_array($payload)) throw new ApiException(422, 'HISTORICAL_VOUCHER_INVALID', 'Voucher payload must be an object.');
                    $this->validateVoucher($payload);
                    $voucherSource = $sourceId;
                } else {
                    $payload = $item;
                    $voucherSource = (string) ($item['voucherSourceRecordId'] ?? '');
                    if (! preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/D', $voucherSource)) throw new ApiException(422, 'HISTORICAL_VOUCHER_REFERENCE_INVALID', 'Child record must reference a voucher source ID.');
                    $this->validateChild($type, $payload);
                }
                $payload = $this->canonicalize($payload);
                $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR);
                $out[] = [
                    'type' => $type, 'sourceRecordId' => $sourceId, 'voucherSourceRecordId' => $voucherSource,
                    'payload' => $payload, 'sha256' => hash('sha256', $type.':'.$sourceId.':'.$json),
                    'amountPaise' => $type === 'VOUCHER' ? Money::toPaise((string) $payload['amount']) : 0,
                ];
            }
        }
        return $out;
    }

    private function validateVoucher(array $p): void
    {
        foreach (['voucherNo','date','type','vendor','amount','category','status','cashImpact','approvalStatus','createdAtUtc','updatedAtUtc'] as $field) {
            if (! array_key_exists($field, $p)) throw new ApiException(422, 'HISTORICAL_VOUCHER_FIELD_REQUIRED', 'Missing source voucher field: '.$field.'.');
        }
        if (! is_string($p['voucherNo']) || trim($p['voucherNo']) === '' || mb_strlen($p['voucherNo'], 'UTF-8') > 32) throw new ApiException(422, 'HISTORICAL_VOUCHER_NUMBER_INVALID', 'Original voucher number is invalid.');
        if (! in_array($p['type'], ['PAYMENT','RECEIPT'], true) || ! in_array($p['status'], ['ACTIVE','CANCELLED'], true)) throw new ApiException(422, 'HISTORICAL_VOUCHER_STATE_INVALID', 'Original voucher type/status is unsupported.');
        if (! in_array($p['cashImpact'], ['CASH_IN','CASH_OUT','NO_CASH','UNCLASSIFIED'], true) || ! in_array($p['approvalStatus'], ['NOT_REQUIRED','PENDING','APPROVED','REJECTED'], true)) throw new ApiException(422, 'HISTORICAL_VOUCHER_STATE_INVALID', 'Original cash/approval state is unsupported.');
        if (! is_string($p['vendor']) || trim($p['vendor']) === '' || mb_strlen($p['vendor'], 'UTF-8') > 200) throw new ApiException(422, 'HISTORICAL_VENDOR_INVALID', 'Original vendor snapshot is invalid.');
        if (! is_string($p['category']) || trim($p['category']) === '' || mb_strlen($p['category'], 'UTF-8') > 80) throw new ApiException(422, 'HISTORICAL_CATEGORY_INVALID', 'Original category is invalid.');
        Money::toPaise((string) $p['amount']);
        $this->businessDate($p['date']); $this->utc($p['createdAtUtc']); $this->utc($p['updatedAtUtc']);
        if (! empty($p['approvedAtUtc'])) $this->utc($p['approvedAtUtc']);
        if (mb_strlen((string) ($p['notes'] ?? ''), 'UTF-8') > 1000) throw new ApiException(422, 'HISTORICAL_NOTES_INVALID', 'Original notes are too long.');
    }

    private function validateChild(string $type, array $p): void
    {
        if ($type === 'APPROVAL') {
            $this->utc($p['occurredAtUtc'] ?? null);
            if (! preg_match('/^[A-Z][A-Z0-9_]{1,23}$/D', strtoupper((string) ($p['decision'] ?? '')))) throw new ApiException(422, 'HISTORICAL_APPROVAL_INVALID', 'Original approval decision is invalid.');
        } elseif ($type === 'AUDIT') {
            $this->utc($p['occurredAtUtc'] ?? null);
            if (! preg_match('/^[A-Za-z][A-Za-z0-9_]{1,79}$/D', (string) ($p['eventType'] ?? ''))) throw new ApiException(422, 'HISTORICAL_AUDIT_INVALID', 'Original audit event type is invalid.');
            foreach (['before','after'] as $key) if (isset($p[$key]) && $p[$key] !== null && ! is_array($p[$key])) throw new ApiException(422, 'HISTORICAL_AUDIT_INVALID', 'Audit snapshots must be JSON objects.');
        } else {
            if (! is_string($p['originalFileId'] ?? null) || trim($p['originalFileId']) === '' || strlen($p['originalFileId']) > 160) throw new ApiException(422, 'HISTORICAL_RECEIPT_METADATA_INVALID', 'Original Drive file ID is required.');
            if (! is_string($p['name'] ?? null) || mb_strlen($p['name'], 'UTF-8') > 255) throw new ApiException(422, 'HISTORICAL_RECEIPT_METADATA_INVALID', 'Original receipt filename is invalid.');
            if (! isset(self::MIME[$p['contentType'] ?? '']) || ! is_int($p['byteSize'] ?? null) || $p['byteSize'] < 1 || $p['byteSize'] > self::MAX_RECEIPT_BYTES || ! is_string($p['sha256'] ?? null) || ! preg_match('/^[a-f0-9]{64}$/D', $p['sha256'])) throw new ApiException(422, 'HISTORICAL_RECEIPT_METADATA_INVALID', 'Receipt MIME, size and digest are invalid.');
            $this->utc($p['createdAtUtc'] ?? null);
        }
    }

    private function batch(PDO $pdo, string $id): array
    {
        if (! preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $id)) throw new ApiException(422, 'HISTORICAL_BATCH_ID_INVALID', 'Historical batch ID is invalid.');
        $q = $pdo->prepare('SELECT * FROM historical_import_batches WHERE id = :id LIMIT 1'); $q->execute(['id' => $id]);
        $row = $q->fetch(PDO::FETCH_ASSOC);
        if (! is_array($row)) throw new ApiException(404, 'HISTORICAL_BATCH_NOT_FOUND', 'Historical batch was not found.');
        return $row;
    }

    private function markCommitted(PDO $pdo, string $rowId, string $targetId): void
    {
        $q = $pdo->prepare("UPDATE historical_import_rows SET status = 'COMMITTED', target_record_id = :target, updated_at_utc = UTC_TIMESTAMP(6) WHERE id = :id AND status = 'STAGED'");
        $q->execute(['target' => $targetId, 'id' => $rowId]);
        if ($q->rowCount() !== 1) throw new ApiException(409, 'HISTORICAL_ROW_STATE_CHANGED', 'Historical source row changed during commit.');
    }

    private function userIdForEmail(PDO $pdo, mixed $email): ?string
    {
        if (! is_string($email) || trim($email) === '') return null;
        $q = $pdo->prepare('SELECT id FROM users WHERE email_normalized = :email AND is_active = 1 LIMIT 1');
        $q->execute(['email' => strtolower(trim($email))]); $id = $q->fetchColumn();
        return is_string($id) ? $id : null;
    }

    private function vendorIdForSource(PDO $pdo, mixed $source): ?string
    {
        if (! is_string($source) || trim($source) === '') return null;
        $q = $pdo->prepare('SELECT id FROM vendors WHERE source_legacy_id = :source LIMIT 1');
        $q->execute(['source' => self::SOURCE.':'.trim($source)]); $id = $q->fetchColumn();
        return is_string($id) ? $id : null;
    }

    private function advanceSequences(PDO $pdo, array $maxima): void
    {
        foreach (['PAYMENT','RECEIPT'] as $type) {
            $max = (int) ($maxima[$type] ?? 0); if ($max < 1) continue;
            $q = $pdo->prepare('SELECT next_number FROM voucher_number_sequences WHERE voucher_type = :type LIMIT 1 FOR UPDATE');
            $q->execute(['type' => $type]); $current = $q->fetchColumn(); $next = $max + 1;
            if ($current === false) {
                $pdo->prepare('INSERT INTO voucher_number_sequences (voucher_type, next_number, updated_at_utc) VALUES (:type, :next, UTC_TIMESTAMP(6))')->execute(['type' => $type, 'next' => $next]);
            } elseif ((int) $current < $next) {
                $pdo->prepare('UPDATE voucher_number_sequences SET next_number = :next, updated_at_utc = UTC_TIMESTAMP(6) WHERE voucher_type = :type')->execute(['next' => $next, 'type' => $type]);
            }
        }
    }

    private function detectMime(string $bytes): string
    {
        return (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: '';
    }

    private function payload(string $json): array
    {
        try { $p = json_decode($json, true, 64, JSON_THROW_ON_ERROR); }
        catch (Throwable) { throw new ApiException(503, 'HISTORICAL_PAYLOAD_INVALID', 'Staged source payload is malformed.'); }
        if (! is_array($p)) throw new ApiException(503, 'HISTORICAL_PAYLOAD_INVALID', 'Staged source payload is malformed.');
        return $p;
    }

    private function businessDate(mixed $value): string
    {
        if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) throw new ApiException(422, 'HISTORICAL_DATE_INVALID', 'Business date must use YYYY-MM-DD.');
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('Asia/Kolkata'));
        $errors = DateTimeImmutable::getLastErrors();
        if ($date === false || (is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) || $date->format('Y-m-d') !== $value) throw new ApiException(422, 'HISTORICAL_DATE_INVALID', 'Business date is invalid.');
        return $value;
    }

    private function utc(mixed $value): string
    {
        if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/D', $value)) throw new ApiException(422, 'HISTORICAL_TIMESTAMP_INVALID', 'Timestamp must be explicit UTC ending in Z.');
        try { $date = new DateTimeImmutable($value, new DateTimeZone('UTC')); }
        catch (Throwable) { throw new ApiException(422, 'HISTORICAL_TIMESTAMP_INVALID', 'Timestamp is invalid.'); }
        return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
    }

    private function mime(string $bytes): string
    {
        return (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: '';
    }

    private function canonicalize(array $value): array
    {
        foreach ($value as $key => $item) {
            if (! is_array($item)) continue;
            $value[$key] = array_is_list($item)
                ? array_map(fn ($v) => is_array($v) && ! array_is_list($v) ? $this->canonicalize($v) : $v, $item)
                : $this->canonicalize($item);
        }
        if (! array_is_list($value)) ksort($value, SORT_STRING);
        return $value;
    }
}
