<?php

declare(strict_types=1);

namespace App\Modules\Receipts\Actions;

use App\Modules\Identity\RoleCapabilities;
use CashVoucher\Api\Financial\IdempotencyService;
use CashVoucher\Api\Support\ApiException;
use CashVoucher\Api\Support\Uuid;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\Storage;
use PDO;
use Throwable;

final class ReceiptStorage
{
    private const MAX_RECEIPTS_PER_VOUCHER = 3;
    private const MAX_BYTES = 1_600_000;
    private const MAX_BASE64_LENGTH = 2_200_000;

    private const MIME_EXTENSIONS = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];

    /**
     * File bytes are staged in private storage before the DB transaction. The receipt row,
     * idempotency response and audit event then commit together. A definite domain rejection
     * or successful replay removes only this request's fresh staged object. An ambiguous
     * infrastructure failure leaves a private orphan rather than risking deletion of a
     * file referenced by a commit whose acknowledgement was lost.
     *
     * @param array{mime:mixed,data:mixed} $input
     * @param array<string, mixed> $principal
     * @return array{data:array<string,mixed>,replayed:bool}
     */
    public function attach(
        PDO $pdo,
        string $voucherId,
        array $input,
        array $principal,
        string $idempotencyKey,
    ): array {
        $this->requireUuid($voucherId);
        [$bytes, $mime, $sha256] = $this->decode($input);
        $receiptId = Uuid::v4();
        $extension = self::MIME_EXTENSIONS[$mime];
        $storageKey = 'receipts/'.substr(str_replace('-', '', $receiptId), 0, 2).'/'.$receiptId.'.'.$extension;

        try {
            $stored = Storage::disk('private')->put($storageKey, $bytes);
            if (! $stored) {
                throw new \RuntimeException('The private receipt object could not be stored.');
            }
        } catch (Throwable $exception) {
            report($exception);
            throw new ApiException(503, 'RECEIPT_STORAGE_UNAVAILABLE', 'The receipt could not be stored privately.');
        }

        $actorId = (string) $principal['id'];
        $actorEmail = (string) $principal['email'];
        $payload = [
            'voucherId' => $voucherId,
            'contentType' => $mime,
            'byteSize' => strlen($bytes),
            'sha256' => $sha256,
        ];

        try {
            $result = (new IdempotencyService($pdo))->execute(
                $actorId,
                $actorEmail,
                'attachReceipt',
                $idempotencyKey,
                $payload,
                function (PDO $connection) use (
                    $voucherId,
                    $principal,
                    $receiptId,
                    $storageKey,
                    $mime,
                    $bytes,
                    $sha256,
                ): array {
                    $select = $connection->prepare(
                        'SELECT id, business_date, status, created_by_user_id
                         FROM vouchers WHERE id = :id LIMIT 1 FOR UPDATE'
                    );
                    $select->execute(['id' => $voucherId]);
                    $voucher = $select->fetch(PDO::FETCH_ASSOC);
                    if (! is_array($voucher)) {
                        throw new ApiException(404, 'VOUCHER_NOT_FOUND', 'The voucher could not be found.');
                    }
                    $this->authorizeVoucher($principal, (string) $voucher['created_by_user_id']);

                    if ((string) $voucher['status'] !== 'ACTIVE') {
                        throw new ApiException(409, 'VOUCHER_NOT_ACTIVE', 'Receipts cannot be added to a cancelled voucher.');
                    }

                    $closed = $connection->prepare(
                        'SELECT id FROM cash_closes WHERE business_date = :date LIMIT 1 FOR SHARE'
                    );
                    $closed->execute(['date' => (string) $voucher['business_date']]);
                    if ($closed->fetchColumn() !== false) {
                        throw new ApiException(
                            409,
                            'CASH_CLOSE_DATE_LOCKED',
                            'This business date has already been closed. No receipt was attached.',
                        );
                    }

                    $countQuery = $connection->prepare(
                        'SELECT COUNT(*) FROM voucher_receipts WHERE voucher_id = :voucher'
                    );
                    $countQuery->execute(['voucher' => $voucherId]);
                    $currentCount = (int) $countQuery->fetchColumn();
                    if ($currentCount >= self::MAX_RECEIPTS_PER_VOUCHER) {
                        throw new ApiException(
                            409,
                            'RECEIPT_LIMIT_REACHED',
                            'A voucher can contain no more than three receipts.',
                        );
                    }

                    $insert = $connection->prepare(
                        'INSERT INTO voucher_receipts (
                            id, voucher_id, storage_key, legacy_drive_file_id,
                            content_type, byte_size, sha256, created_by_user_id, created_at_utc
                        ) VALUES (
                            :id, :voucher, :storage_key, NULL,
                            :content_type, :byte_size, :sha256, :creator, UTC_TIMESTAMP(6)
                        )'
                    );
                    $insert->execute([
                        'id' => $receiptId,
                        'voucher' => $voucherId,
                        'storage_key' => $storageKey,
                        'content_type' => $mime,
                        'byte_size' => strlen($bytes),
                        'sha256' => $sha256,
                        'creator' => (string) $principal['id'],
                    ]);

                    $updateVoucher = $connection->prepare(
                        'UPDATE vouchers
                         SET updated_by_user_id = :actor, updated_at_utc = UTC_TIMESTAMP(6)
                         WHERE id = :id'
                    );
                    $updateVoucher->execute(['actor' => (string) $principal['id'], 'id' => $voucherId]);
                    if ($updateVoucher->rowCount() !== 1) {
                        throw new \RuntimeException('The voucher receipt activity timestamp was not updated.');
                    }

                    return [
                        'receipt' => [
                            'id' => $receiptId,
                            'voucherId' => $voucherId,
                            'contentType' => $mime,
                            'byteSize' => strlen($bytes),
                            'sha256' => $sha256,
                            'createdAtUtc' => gmdate('Y-m-d H:i:s'),
                        ],
                        'receiptCount' => $currentCount + 1,
                        '_audit' => [
                            'eventType' => 'VOUCHER_RECEIPT_ATTACHED',
                            'targetType' => 'voucher',
                            'targetId' => $voucherId,
                            'reason' => 'Private receipt attached.',
                            'before' => ['receiptCount' => $currentCount],
                        ],
                    ];
                },
                [
                    'eventType' => 'VOUCHER_RECEIPT_ATTACHED',
                    'targetType' => 'voucher',
                    'targetId' => $voucherId,
                    'reason' => 'Private receipt attached.',
                ],
            );

            if ($result['replayed']) {
                Storage::disk('private')->delete($storageKey);
            }

            return $result;
        } catch (ApiException $exception) {
            // Domain/idempotency rejections are known to have rolled back before commit.
            Storage::disk('private')->delete($storageKey);
            throw $exception;
        } catch (Throwable $exception) {
            // Do not delete on an uncertain DB outcome: the private file may be referenced
            // by a committed receipt row whose commit acknowledgement was lost.
            report($exception);
            throw new ApiException(503, 'RECEIPT_ATTACH_UNAVAILABLE', 'The receipt could not be attached. Retry with the same idempotency key.');
        }
    }

    /**
     * @param array<string, mixed> $principal
     * @return array{bytes:string,contentType:string,receiptId:string}
     */
    public function read(PDO $pdo, string $receiptId, array $principal): array
    {
        $this->requireUuid($receiptId);
        $query = $pdo->prepare(
            'SELECT r.id, r.storage_key, r.content_type, r.byte_size, r.sha256,
                    v.created_by_user_id
             FROM voucher_receipts r
             INNER JOIN vouchers v ON v.id = r.voucher_id
             WHERE r.id = :id
             LIMIT 1'
        );
        $query->execute(['id' => $receiptId]);
        $row = $query->fetch(PDO::FETCH_ASSOC);
        if (! is_array($row)) {
            throw new ApiException(404, 'RECEIPT_NOT_FOUND', 'The receipt could not be found.');
        }
        $this->authorizeVoucher($principal, (string) $row['created_by_user_id']);

        $mime = (string) $row['content_type'];
        if (! isset(self::MIME_EXTENSIONS[$mime])) {
            throw new ApiException(503, 'RECEIPT_METADATA_INVALID', 'The receipt metadata is invalid.');
        }
        $key = (string) $row['storage_key'];
        if (
            $key === ''
            || str_starts_with($key, '/')
            || str_contains($key, '..')
            || ! str_starts_with($key, 'receipts/')
        ) {
            throw new ApiException(503, 'RECEIPT_METADATA_INVALID', 'The private receipt reference is invalid.');
        }

        try {
            $bytes = Storage::disk('private')->get($key);
        } catch (Throwable $exception) {
            report($exception);
            throw new ApiException(503, 'RECEIPT_UNAVAILABLE', 'The private receipt is not currently available.');
        }

        if (
            strlen($bytes) !== (int) $row['byte_size']
            || ! hash_equals((string) $row['sha256'], hash('sha256', $bytes))
            || $this->detectMime($bytes) !== $mime
        ) {
            throw new ApiException(503, 'RECEIPT_INTEGRITY_FAILED', 'The private receipt failed its integrity check.');
        }

        return [
            'bytes' => $bytes,
            'contentType' => $mime,
            'receiptId' => (string) $row['id'],
        ];
    }

    /**
     * @param array{mime:mixed,data:mixed} $input
     * @return array{0:string,1:string,2:string}
     */
    private function decode(array $input): array
    {
        $mime = $input['mime'] ?? null;
        $encoded = $input['data'] ?? null;
        if (! is_string($mime) || ! isset(self::MIME_EXTENSIONS[$mime])) {
            throw new ApiException(422, 'RECEIPT_MIME_INVALID', 'Receipt must be a JPG, PNG or WebP image.');
        }
        if (
            ! is_string($encoded)
            || $encoded === ''
            || strlen($encoded) > self::MAX_BASE64_LENGTH
            || ! preg_match('/^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$/D', $encoded)
        ) {
            throw new ApiException(422, 'RECEIPT_DATA_INVALID', 'Receipt image data is invalid or too large.');
        }
        $bytes = base64_decode($encoded, true);
        if (! is_string($bytes) || $bytes === '' || strlen($bytes) > self::MAX_BYTES) {
            throw new ApiException(422, 'RECEIPT_DATA_INVALID', 'Receipt image data is invalid or too large.');
        }
        if (! hash_equals(rtrim(base64_encode($bytes), '='), rtrim($encoded, '='))) {
            throw new ApiException(422, 'RECEIPT_DATA_INVALID', 'Receipt image data is not canonical base64.');
        }
        if ($this->detectMime($bytes) !== $mime) {
            throw new ApiException(422, 'RECEIPT_MIME_MISMATCH', 'The uploaded file content does not match its image type.');
        }

        return [$bytes, $mime, hash('sha256', $bytes)];
    }

    private function detectMime(string $bytes): string
    {
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->buffer($bytes);

        return is_string($mime) ? $mime : '';
    }

    /** @param array<string, mixed> $principal */
    private function authorizeVoucher(array $principal, string $creatorId): void
    {
        if (! RoleCapabilities::canViewVoucher($principal, $creatorId)) {
            // Conceal existence from a user who cannot view the parent voucher.
            throw new ApiException(404, 'RECEIPT_NOT_FOUND', 'The receipt could not be found.');
        }
    }

    private function requireUuid(string $value): void
    {
        if (! preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $value)) {
            throw new ApiException(422, 'RECEIPT_ID_INVALID', 'Receipt identifier is invalid.');
        }
    }
}
