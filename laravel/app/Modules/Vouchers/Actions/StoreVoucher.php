<?php

namespace App\Modules\Vouchers\Actions;

use App\Modules\Vouchers\Support\PaymentDuplicateGuard;
use CashVoucher\Api\Financial\IdempotencyService;
use CashVoucher\Api\Financial\VoucherNumberAllocator;
use CashVoucher\Api\Support\ApiException;
use CashVoucher\Api\Support\Money;
use CashVoucher\Api\Support\Uuid;
use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Throwable;

final class StoreVoucher
{
    public function __construct(
        private readonly PaymentDuplicateGuard $duplicateGuard,
    ) {
    }

    /**
     * @param array<string, mixed> $input
     * @param array<string, mixed> $principal
     * @return array<string, mixed>
     */
    public function duplicateCheck(PDO $pdo, array $input, array $principal): array
    {
        $voucher = $this->normalize($input);
        $matches = $this->duplicateGuard->candidates($pdo, $voucher);

        return $this->duplicateGuard->present($voucher, $matches, $principal);
    }

    /**
     * @param array<string, mixed> $input
     * @param array<string, mixed> $principal
     * @return array{data:array<string,mixed>,replayed:bool}
     */
    public function execute(
        PDO $pdo,
        array $input,
        array $principal,
        string $idempotencyKey,
    ): array {
        $voucher = $this->normalize($input);
        $this->assertBusinessDate($voucher['date']);

        $sequenceType = $voucher['type'];
        $sequenceStatement = $pdo->prepare(
            'SELECT next_number FROM voucher_number_sequences WHERE voucher_type = :type LIMIT 1'
        );
        $sequenceStatement->execute(['type' => $sequenceType]);
        $firstNumberRaw = $sequenceStatement->fetchColumn();

        if ($firstNumberRaw === false || ! ctype_digit((string) $firstNumberRaw) || (int) $firstNumberRaw < 1) {
            throw new ApiException(
                503,
                'VOUCHER_SEQUENCE_NOT_INITIALIZED',
                'The voucher number series has not been initialized from a reconciled source. No voucher was created.',
            );
        }

        $voucherId = Uuid::v4();
        $allocator = new VoucherNumberAllocator($pdo);
        $duplicates = $this->duplicateGuard;
        $email = (string) $principal['email'];
        $actorId = (string) $principal['id'];

        $unitOfWork = new IdempotencyService($pdo);

        return $unitOfWork->execute(
            $actorId,
            $email,
            'createVoucher',
            $idempotencyKey,
            $voucher,
            function (PDO $connection) use (
                $voucher,
                $principal,
                $actorId,
                $email,
                $voucherId,
                $firstNumberRaw,
                $allocator,
                $duplicates,
            ): array {
                // The series row lock serializes voucher writes of the same type. Duplicate
                // detection and the daily approval total run after this lock so concurrent
                // same-type creates cannot both pass stale checks.
                $number = $allocator->allocate($voucher['type'], (int) $firstNumberRaw);

                $clientQuery = $connection->prepare(
                    'SELECT id FROM vouchers WHERE client_id = :client_id LIMIT 1 FOR UPDATE'
                );
                $clientQuery->execute(['client_id' => $voucher['clientId']]);
                if ($clientQuery->fetchColumn() !== false) {
                    throw new ApiException(
                        409,
                        'CLIENT_ID_CONFLICT',
                        'This client operation ID is already associated with a voucher.',
                    );
                }

                $closed = $connection->prepare(
                    'SELECT id FROM cash_closes WHERE business_date = :business_date LIMIT 1 FOR SHARE'
                );
                $closed->execute(['business_date' => $voucher['date']]);
                if ($closed->fetchColumn() !== false) {
                    throw new ApiException(
                        409,
                        'CASH_CLOSE_DATE_LOCKED',
                        'This business date has already been closed. The voucher was not created.',
                    );
                }

                $matches = $duplicates->candidates($connection, $voucher);
                $duplicates->requireConfirmation(
                    $voucher,
                    $matches,
                    $principal,
                    (string) ($voucher['duplicateConfirmationToken'] ?? ''),
                );

                [$vendorId, $vendorName, $vendorType] = $this->resolveVendor($connection, $voucher);
                $approvalStatus = $this->approvalStatus($connection, $voucher, $vendorId, $vendorName);

                $insert = $connection->prepare(
                    'INSERT INTO vouchers (
                        id, voucher_type, voucher_number, business_date,
                        vendor_name_snapshot, vendor_id, vendor_type, amount_paise,
                        category, notes, status, cash_impact, approval_status,
                        approval_reason, payment_method, cancel_reason, client_id,
                        source_legacy_id, created_by_user_id, created_by_email_snapshot,
                        updated_by_user_id, approved_by_user_id, created_at_utc,
                        updated_at_utc, approved_at_utc
                    ) VALUES (
                        :id, :voucher_type, :voucher_number, :business_date,
                        :vendor_name, :vendor_id, :vendor_type, :amount_paise,
                        :category, :notes, :status, :cash_impact, :approval_status,
                        :approval_reason, :payment_method, :cancel_reason, :client_id,
                        NULL, :created_by, :created_email,
                        NULL, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), NULL
                    )'
                );

                $insert->execute([
                    'id' => $voucherId,
                    'voucher_type' => $voucher['type'],
                    'voucher_number' => $number,
                    'business_date' => $voucher['date'],
                    'vendor_name' => $vendorName,
                    'vendor_id' => $vendorId,
                    'vendor_type' => $vendorType,
                    'amount_paise' => $voucher['amountPaise'],
                    'category' => $voucher['category'],
                    'notes' => $voucher['notes'],
                    'status' => 'ACTIVE',
                    'cash_impact' => $voucher['cashImpact'],
                    'approval_status' => $approvalStatus,
                    'approval_reason' => '',
                    'payment_method' => $voucher['paymentMethod'],
                    'cancel_reason' => '',
                    'client_id' => $voucher['clientId'],
                    'created_by' => $actorId,
                    'created_email' => $email,
                ]);

                return [
                    'id' => $voucherId,
                    'voucherNo' => $number,
                    'date' => $voucher['date'],
                    'vendor' => $vendorName,
                    'vendorId' => $vendorId,
                    'vendorType' => $vendorType,
                    'amount' => self::formatPaise($voucher['amountPaise']),
                    'amountPaise' => $voucher['amountPaise'],
                    'category' => $voucher['category'],
                    'notes' => $voucher['notes'],
                    'type' => $voucher['type'],
                    'status' => 'ACTIVE',
                    'cashImpact' => $voucher['cashImpact'],
                    'paymentMethod' => $voucher['paymentMethod'],
                    'approvalStatus' => $approvalStatus,
                    'clientId' => $voucher['clientId'],
                    'createdBy' => $email,
                ];
            },
            [
                'eventType' => 'VOUCHER_CREATED',
                'targetType' => 'voucher',
                'targetId' => $voucherId,
                'reason' => 'Voucher created through isolated Laravel API.',
            ],
        );
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    private function normalize(array $input): array
    {
        $amount = $input['amount'] ?? null;
        if (! is_string($amount)) {
            throw new ApiException(422, 'AMOUNT_INVALID', 'Amount must be sent as a decimal string.');
        }

        try {
            $amountPaise = Money::toPaise($amount);
        } catch (\InvalidArgumentException $exception) {
            throw new ApiException(422, 'AMOUNT_INVALID', $exception->getMessage());
        }

        $date = (string) ($input['date'] ?? '');
        $this->assertBusinessDate($date);

        $vendor = trim((string) ($input['vendor'] ?? ''));
        if ($vendor === '' || mb_strlen($vendor, 'UTF-8') > 200) {
            throw new ApiException(422, 'VENDOR_INVALID', 'Vendor name is required and must not exceed 200 characters.');
        }

        $clientId = (string) ($input['clientId'] ?? '');
        if (! preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $clientId)) {
            throw new ApiException(422, 'CLIENT_ID_INVALID', 'A valid client operation ID is required.');
        }

        $type = (string) ($input['type'] ?? 'PAYMENT');
        if (! in_array($type, ['PAYMENT', 'RECEIPT'], true)) {
            throw new ApiException(422, 'VOUCHER_TYPE_INVALID', 'Voucher type must be PAYMENT or RECEIPT.');
        }

        $cashImpact = (string) ($input['cashImpact'] ?? '');
        if (! in_array($cashImpact, ['CASH_IN', 'CASH_OUT', 'NO_CASH'], true)) {
            throw new ApiException(422, 'CASH_IMPACT_INVALID', 'Physical cash movement must be selected explicitly.');
        }

        $paymentMethod = (string) ($input['paymentMethod'] ?? '');
        if (! in_array($paymentMethod, ['', 'CASH', 'UPI', 'BANK_TRANSFER'], true)) {
            throw new ApiException(422, 'PAYMENT_METHOD_INVALID', 'Payment method is not supported.');
        }

        $notes = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string) ($input['notes'] ?? '')) ?? '';
        $notes = mb_substr(trim($notes), 0, 500, 'UTF-8');

        $category = trim((string) ($input['category'] ?? 'Other'));
        if ($category === '') {
            $category = 'Other';
        }
        if (mb_strlen($category, 'UTF-8') > 80) {
            throw new ApiException(422, 'CATEGORY_INVALID', 'Category must not exceed 80 characters.');
        }

        $vendorId = isset($input['vendorId']) && $input['vendorId'] !== ''
            ? (string) $input['vendorId']
            : '';

        if ($vendorId !== '' && ! preg_match('/^[0-9a-f-]{36}$/iD', $vendorId)) {
            throw new ApiException(422, 'VENDOR_ID_INVALID', 'Vendor identity is invalid.');
        }

        $duplicateToken = (string) ($input['duplicateConfirmationToken'] ?? '');

        return [
            'date' => $date,
            'vendor' => $vendor,
            'vendorId' => $vendorId,
            'amountPaise' => $amountPaise,
            'category' => $category,
            'notes' => $notes,
            'type' => $type,
            'cashImpact' => $cashImpact,
            'paymentMethod' => $paymentMethod,
            'clientId' => $clientId,
            'duplicateConfirmationToken' => $duplicateToken,
        ];
    }

    private function assertBusinessDate(string $date): void
    {
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date, new DateTimeZone('Asia/Kolkata'));
        $errors = DateTimeImmutable::getLastErrors();

        if (
            $parsed === false
            || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
            || $parsed->format('Y-m-d') !== $date
            || $date < '2000-01-01'
        ) {
            throw new ApiException(422, 'BUSINESS_DATE_INVALID', 'Business date must be a valid date from 1 January 2000 onward.');
        }

        $tomorrow = (new DateTimeImmutable('now', new DateTimeZone('Asia/Kolkata')))
            ->modify('+1 day')
            ->format('Y-m-d');

        if ($date > $tomorrow) {
            throw new ApiException(422, 'BUSINESS_DATE_INVALID', 'Business date cannot be more than one day in the future.');
        }
    }

    /**
     * @param array<string, mixed> $voucher
     * @return array{0:?string,1:string,2:string}
     */
    private function resolveVendor(PDO $pdo, array $voucher): array
    {
        $vendorId = (string) $voucher['vendorId'];
        if ($vendorId !== '') {
            $query = $pdo->prepare(
                'SELECT id, display_name FROM vendors WHERE id = :id AND is_active = 1 LIMIT 1'
            );
            $query->execute(['id' => $vendorId]);
            $vendor = $query->fetch(PDO::FETCH_ASSOC);

            if (! is_array($vendor)) {
                throw new ApiException(422, 'VENDOR_NOT_FOUND', 'The selected vendor is not active or no longer exists.');
            }

            return [(string) $vendor['id'], (string) $vendor['display_name'], 'REGISTERED'];
        }

        $normalized = self::normalizePayee((string) $voucher['vendor']);
        $query = $pdo->prepare(
            'SELECT id, display_name FROM vendors
             WHERE is_active = 1 AND LOWER(TRIM(display_name)) = :name
             LIMIT 1'
        );
        $query->execute(['name' => $normalized]);
        $vendor = $query->fetch(PDO::FETCH_ASSOC);

        if (is_array($vendor)) {
            return [(string) $vendor['id'], (string) $vendor['display_name'], 'REGISTERED'];
        }

        return [null, (string) $voucher['vendor'], 'UNVERIFIED'];
    }

    /**
     * @param array<string, mixed> $voucher
     */
    private function approvalStatus(PDO $pdo, array $voucher, ?string $vendorId, string $vendorName): string
    {
        if ($voucher['type'] !== 'PAYMENT') {
            return 'NOT_REQUIRED';
        }

        $rows = $pdo->prepare(
            'SELECT vendor_id, vendor_name_snapshot, amount_paise
             FROM vouchers
             WHERE voucher_type = :type
               AND status = :status
               AND business_date = :business_date
             FOR UPDATE'
        );
        $rows->execute([
            'type' => 'PAYMENT',
            'status' => 'ACTIVE',
            'business_date' => $voucher['date'],
        ]);

        $dailyTotal = 0;
        foreach ($rows->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $existingId = (string) ($row['vendor_id'] ?? '');
            if ($vendorId !== null && $existingId !== '') {
                $samePayee = hash_equals($vendorId, $existingId);
            } else {
                $samePayee = self::normalizePayee($vendorName)
                    === self::normalizePayee((string) $row['vendor_name_snapshot']);
            }

            if ($samePayee) {
                $dailyTotal += (int) $row['amount_paise'];
            }
        }

        $thresholdPaise = 1_000_000; // Existing policy: ₹10,000 per voucher or payee/day.
        return $voucher['amountPaise'] >= $thresholdPaise
            || ($dailyTotal + $voucher['amountPaise']) >= $thresholdPaise
            ? 'PENDING'
            : 'NOT_REQUIRED';
    }

    private static function normalizePayee(string $value): string
    {
        $normalized = preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);

        return function_exists('mb_strtolower')
            ? mb_strtolower($normalized, 'UTF-8')
            : strtolower($normalized);
    }

    private static function formatPaise(int $paise): string
    {
        return intdiv($paise, 100).'.'.str_pad((string) ($paise % 100), 2, '0', STR_PAD_LEFT);
    }
}
