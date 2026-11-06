<?php

declare(strict_types=1);

namespace App\Modules\Vouchers\Actions;

use CashVoucher\Api\Financial\IdempotencyService;
use CashVoucher\Api\Support\ApiException;
use CashVoucher\Api\Support\Money;
use CashVoucher\Api\Support\Uuid;
use DateTimeImmutable;
use DateTimeZone;
use PDO;

final class VoucherLifecycle
{
    private const PAYMENT_THRESHOLD_PAISE = 1_000_000;
    private const MAX_AMOUNT_PAISE = 1_000_000_000;

    private const PAYMENT_CATEGORIES = [
        'Housekeeping', 'Maintenance', 'Electrical', 'Plumbing', 'Kitchen',
        'Food & Beverage', 'Laundry', 'Guest Supplies', 'Transport', 'Fuel',
        'Staff Welfare', 'Staff Salary', 'Staff Advance', 'Petty Cash',
        'Local Purchase', 'Vendor Payment', 'Repairs', 'Gardening', 'Security',
        'Office Expense', 'Stationery', 'Internet / Telecom', 'Licenses',
        'Bank Charges', 'Guest Refund', 'Other',
    ];

    private const RECEIPT_CATEGORIES = [
        'Room Revenue', 'Restaurant', 'Guest Advance', 'Bank Withdrawal',
        'Refund Received', 'Owner Deposit', 'Other',
    ];

    /**
     * @param array<string, mixed> $principal
     * @param array<string, mixed> $fields
     * @return array{data:array<string,mixed>,replayed:bool}
     */
    public function update(
        PDO $pdo,
        string $voucherId,
        array $fields,
        string $reason,
        array $principal,
        string $idempotencyKey,
    ): array {
        $this->requireUuid($voucherId);
        $reason = $this->reason($reason, 'correction');

        $actorId = (string) $principal['id'];
        $email = (string) $principal['email'];
        $payload = ['voucherId' => $voucherId, 'fields' => $fields, 'reason' => $reason];

        return (new IdempotencyService($pdo))->execute(
            $actorId,
            $email,
            'updateVoucher',
            $idempotencyKey,
            $payload,
            function (PDO $connection) use ($voucherId, $fields, $reason, $principal): array {
                // Match create's lock order: PAYMENT sequence first, then voucher row.
                $typeQuery = $connection->prepare('SELECT voucher_type FROM vouchers WHERE id = :id LIMIT 1');
                $typeQuery->execute(['id' => $voucherId]);
                $type = $typeQuery->fetchColumn();
                if (! is_string($type)) {
                    throw new ApiException(404, 'VOUCHER_NOT_FOUND', 'The voucher could not be found.');
                }
                if ($type === 'PAYMENT') {
                    $sequence = $connection->prepare(
                        'SELECT next_number FROM voucher_number_sequences WHERE voucher_type = :type FOR UPDATE'
                    );
                    $sequence->execute(['type' => 'PAYMENT']);
                    // An existing ledger row can still be corrected when the sequence has
                    // not been initialized; new payment creation remains independently gated.
                    $sequence->fetchColumn();
                }

                $select = $connection->prepare('SELECT * FROM vouchers WHERE id = :id LIMIT 1 FOR UPDATE');
                $select->execute(['id' => $voucherId]);
                $row = $select->fetch(PDO::FETCH_ASSOC);
                if (! is_array($row)) {
                    throw new ApiException(404, 'VOUCHER_NOT_FOUND', 'The voucher could not be found.');
                }
                if ((string) $row['status'] !== 'ACTIVE') {
                    throw new ApiException(409, 'VOUCHER_NOT_EDITABLE', 'Cancelled vouchers cannot be edited.');
                }

                $before = $this->snapshot($row);
                $oldDate = (string) $row['business_date'];
                $this->assertDateUnlocked($connection, $oldDate);

                $changes = [];
                $patch = [];
                $nextDate = $oldDate;
                $nextVendor = (string) $row['vendor_name_snapshot'];
                $nextVendorId = $row['vendor_id'] === null ? null : (string) $row['vendor_id'];
                $nextVendorType = (string) $row['vendor_type'];
                $nextAmountPaise = (int) $row['amount_paise'];
                $nextCashImpact = (string) $row['cash_impact'];
                $nextPaymentMethod = (string) $row['payment_method'];

                if (array_key_exists('date', $fields)) {
                    $nextDate = $this->businessDate($fields['date']);
                    $this->assertDateUnlocked($connection, $nextDate);
                    $this->record($changes, $patch, 'date', 'business_date', $oldDate, $nextDate);
                }

                if (array_key_exists('vendor', $fields)) {
                    $requestedName = $this->vendorName($fields['vendor']);
                    if ($requestedName !== (string) $row['vendor_name_snapshot']) {
                        [$nextVendorId, $nextVendor, $nextVendorType] = $this->resolveVendor($connection, $requestedName);
                        $this->record($changes, $patch, 'vendor', 'vendor_name_snapshot', (string) $row['vendor_name_snapshot'], $nextVendor);
                        $this->record($changes, $patch, 'vendorId', 'vendor_id', $row['vendor_id'] === null ? null : (string) $row['vendor_id'], $nextVendorId);
                        $this->record($changes, $patch, 'vendorType', 'vendor_type', (string) $row['vendor_type'], $nextVendorType);
                    }
                }

                if (array_key_exists('amount', $fields)) {
                    if (! is_string($fields['amount'])) {
                        throw new ApiException(422, 'AMOUNT_INVALID', 'Amount must be sent as a decimal string.');
                    }
                    try {
                        $nextAmountPaise = Money::toPaise($fields['amount']);
                    } catch (\InvalidArgumentException $exception) {
                        throw new ApiException(422, 'AMOUNT_INVALID', $exception->getMessage());
                    }
                    if ($nextAmountPaise > self::MAX_AMOUNT_PAISE) {
                        throw new ApiException(422, 'AMOUNT_INVALID', 'Amount is outside the supported voucher limit.');
                    }
                    $this->record(
                        $changes,
                        $patch,
                        'amount',
                        'amount_paise',
                        (int) $row['amount_paise'],
                        $nextAmountPaise,
                    );
                }

                if (array_key_exists('category', $fields)) {
                    $nextCategory = $this->category(
                        $connection,
                        (string) $row['voucher_type'],
                        $fields['category'],
                    );
                    $this->record($changes, $patch, 'category', 'category', (string) $row['category'], $nextCategory);
                }

                if (array_key_exists('notes', $fields)) {
                    if (! is_string($fields['notes'])) {
                        throw new ApiException(422, 'NOTES_INVALID', 'Notes must be text.');
                    }
                    $nextNotes = $this->cleanNotes($fields['notes']);
                    $this->record($changes, $patch, 'notes', 'notes', (string) $row['notes'], $nextNotes);
                }

                if (array_key_exists('paymentMethod', $fields)) {
                    $nextPaymentMethod = $fields['paymentMethod'];
                    if (! is_string($nextPaymentMethod) || ! in_array($nextPaymentMethod, ['CASH', 'UPI', 'BANK_TRANSFER'], true)) {
                        throw new ApiException(422, 'PAYMENT_METHOD_INVALID', 'Payment method is not supported.');
                    }
                    $this->record($changes, $patch, 'paymentMethod', 'payment_method', (string) $row['payment_method'], $nextPaymentMethod);
                }

                if (array_key_exists('cashImpact', $fields)) {
                    $nextCashImpact = $fields['cashImpact'];
                    if (! is_string($nextCashImpact) || ! in_array($nextCashImpact, ['CASH_IN', 'CASH_OUT', 'NO_CASH'], true)) {
                        throw new ApiException(422, 'CASH_IMPACT_INVALID', 'Physical cash movement must be selected explicitly.');
                    }
                    $this->record($changes, $patch, 'cashImpact', 'cash_impact', (string) $row['cash_impact'], $nextCashImpact);
                } elseif (! in_array((string) $row['cash_impact'], ['CASH_IN', 'CASH_OUT', 'NO_CASH'], true)) {
                    throw new ApiException(
                        422,
                        'CASH_IMPACT_REQUIRED',
                        'This historical voucher has no cash-impact classification. Choose one before saving.',
                    );
                }

                if ($changes === []) {
                    throw new ApiException(422, 'NO_CHANGES', 'No changes were detected. The voucher was not updated.');
                }

                $approvalBefore = (string) $row['approval_status'];
                $materialApprovalChange = $this->hasMaterialApprovalChange($changes);
                if ((string) $row['voucher_type'] === 'PAYMENT' && $materialApprovalChange) {
                    $oldAmountPaise = (int) $row['amount_paise'];
                    $oldDayTotal = $this->payeeDayTotal(
                        $connection,
                        $oldDate,
                        $row['vendor_id'] === null ? null : (string) $row['vendor_id'],
                        (string) $row['vendor_name_snapshot'],
                        $voucherId,
                    ) + $oldAmountPaise;
                    $newDayTotal = $this->payeeDayTotal(
                        $connection,
                        $nextDate,
                        $nextVendorId,
                        $nextVendor,
                        $voucherId,
                    ) + $nextAmountPaise;

                    $needsApproval = $nextAmountPaise >= self::PAYMENT_THRESHOLD_PAISE
                        || $newDayTotal >= self::PAYMENT_THRESHOLD_PAISE;
                    $crossedThreshold = (
                        $oldAmountPaise < self::PAYMENT_THRESHOLD_PAISE
                        && $nextAmountPaise >= self::PAYMENT_THRESHOLD_PAISE
                    ) || (
                        $approvalBefore === 'NOT_REQUIRED'
                        && $oldDayTotal < self::PAYMENT_THRESHOLD_PAISE
                        && $newDayTotal >= self::PAYMENT_THRESHOLD_PAISE
                    );

                    $approvalManaged = in_array(
                        $approvalBefore,
                        ['PENDING', 'APPROVED', 'REJECTED', 'REVIEW_REQUIRED'],
                        true,
                    );
                    if (($approvalManaged && $materialApprovalChange) || $crossedThreshold) {
                        $nextApproval = $needsApproval ? 'PENDING' : 'NOT_REQUIRED';
                        if ($approvalBefore !== $nextApproval) {
                            $changes[] = ['field' => 'approvalStatus', 'before' => $approvalBefore, 'after' => $nextApproval];
                        }
                        if ((string) $row['approved_by_user_id'] !== '') {
                            $changes[] = ['field' => 'approvedBy', 'before' => (string) $row['approved_by_user_id'], 'after' => ''];
                        }
                        if ($row['approved_at_utc'] !== null) {
                            $changes[] = ['field' => 'approvedAt', 'before' => (string) $row['approved_at_utc'], 'after' => null];
                        }
                        if ((string) $row['approval_reason'] !== '') {
                            $changes[] = ['field' => 'approvalReason', 'before' => (string) $row['approval_reason'], 'after' => ''];
                        }

                        $patch['approval_status'] = $nextApproval;
                        $patch['approved_by_user_id'] = null;
                        $patch['approved_at_utc'] = null;
                        $patch['approval_reason'] = '';
                    }
                }

                $patch['updated_by_user_id'] = (string) $principal['id'];
                $patch['updated_at_utc'] = gmdate('Y-m-d H:i:s');

                $this->applyPatch($connection, $voucherId, $patch);
                $afterRow = $this->loadRow($connection, $voucherId);
                $after = $this->snapshot($afterRow);

                return [
                    'voucher' => $after,
                    '_audit' => [
                        'eventType' => 'VOUCHER_UPDATED',
                        'targetType' => 'voucher',
                        'targetId' => $voucherId,
                        'reason' => $reason,
                        'before' => $before,
                    ],
                ];
            },
            [
                'eventType' => 'VOUCHER_UPDATED',
                'targetType' => 'voucher',
                'targetId' => $voucherId,
                'reason' => $reason,
            ],
        );
    }

    /**
     * @param array<string, mixed> $principal
     * @return array{data:array<string,mixed>,replayed:bool}
     */
    public function cancel(
        PDO $pdo,
        string $voucherId,
        string $reason,
        array $principal,
        string $idempotencyKey,
    ): array {
        $this->requireUuid($voucherId);
        $reason = $this->reason($reason, 'cancellation');

        return (new IdempotencyService($pdo))->execute(
            (string) $principal['id'],
            (string) $principal['email'],
            'cancelVoucher',
            $idempotencyKey,
            ['voucherId' => $voucherId, 'reason' => $reason],
            function (PDO $connection) use ($voucherId, $reason, $principal): array {
                $row = $this->loadRowForUpdate($connection, $voucherId);
                if ((string) $row['status'] !== 'ACTIVE') {
                    throw new ApiException(409, 'VOUCHER_ALREADY_CANCELLED', 'The voucher is already cancelled.');
                }
                $this->assertDateUnlocked($connection, (string) $row['business_date']);

                $before = $this->snapshot($row);
                $patch = [
                    'status' => 'CANCELLED',
                    'cancel_reason' => $reason,
                    'updated_by_user_id' => (string) $principal['id'],
                    'updated_at_utc' => gmdate('Y-m-d H:i:s'),
                ];
                $this->applyPatch($connection, $voucherId, $patch);
                $after = $this->snapshot($this->loadRow($connection, $voucherId));

                return [
                    'voucher' => $after,
                    '_audit' => [
                        'eventType' => 'VOUCHER_CANCELLED',
                        'targetType' => 'voucher',
                        'targetId' => $voucherId,
                        'reason' => $reason,
                        'before' => $before,
                    ],
                ];
            },
            [
                'eventType' => 'VOUCHER_CANCELLED',
                'targetType' => 'voucher',
                'targetId' => $voucherId,
                'reason' => $reason,
            ],
        );
    }

    /**
     * @param array<string, mixed> $principal
     * @return array{data:array<string,mixed>,replayed:bool}
     */
    public function decideApproval(
        PDO $pdo,
        string $voucherId,
        string $decision,
        string $reason,
        array $principal,
        string $idempotencyKey,
    ): array {
        $this->requireUuid($voucherId);
        if (! in_array($decision, ['APPROVE', 'REJECT'], true)) {
            throw new ApiException(422, 'APPROVAL_DECISION_INVALID', 'Choose approve or reject.');
        }
        $reason = $decision === 'REJECT' ? $this->reason($reason, 'rejection') : '';

        return (new IdempotencyService($pdo))->execute(
            (string) $principal['id'],
            (string) $principal['email'],
            $decision === 'APPROVE' ? 'approveVoucher' : 'rejectVoucher',
            $idempotencyKey,
            ['voucherId' => $voucherId, 'decision' => $decision, 'reason' => $reason],
            function (PDO $connection) use ($voucherId, $decision, $reason, $principal): array {
                // Approval locks the payment series first, matching create/update lock ordering.
                $sequence = $connection->prepare(
                    'SELECT next_number FROM voucher_number_sequences WHERE voucher_type = :type FOR UPDATE'
                );
                $sequence->execute(['type' => 'PAYMENT']);
                $sequence->fetchColumn();

                $row = $this->loadRowForUpdate($connection, $voucherId);
                if ((string) $row['status'] !== 'ACTIVE' || (string) $row['voucher_type'] !== 'PAYMENT') {
                    throw new ApiException(409, 'APPROVAL_STATE', 'Only active payment vouchers can be approved or rejected.');
                }
                if ((string) $row['approval_status'] !== 'PENDING') {
                    throw new ApiException(409, 'APPROVAL_STATE', 'This payment is not awaiting approval.');
                }
                if ((int) $row['amount_paise'] <= 0 || (int) $row['amount_paise'] > self::MAX_AMOUNT_PAISE) {
                    throw new ApiException(409, 'APPROVAL_STATE', 'This payment does not have a valid approvable amount.');
                }
                if (mb_strtolower((string) $row['created_by_email_snapshot'], 'UTF-8') === mb_strtolower((string) $principal['email'], 'UTF-8')) {
                    throw new ApiException(403, 'FORBIDDEN', 'You cannot approve or reject a payment voucher you created.');
                }

                $previous = (string) $row['approval_status'];
                $next = $decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
                $timestamp = gmdate('Y-m-d H:i:s');
                $before = $this->snapshot($row);
                $patch = [
                    'approval_status' => $next,
                    'approved_by_user_id' => $decision === 'APPROVE' ? (string) $principal['id'] : null,
                    'approved_at_utc' => $decision === 'APPROVE' ? $timestamp : null,
                    'approval_reason' => $reason,
                    'updated_by_user_id' => (string) $principal['id'],
                    'updated_at_utc' => $timestamp,
                ];
                $this->applyPatch($connection, $voucherId, $patch);

                $event = $connection->prepare(
                    'INSERT INTO voucher_approval_events (
                        id, voucher_id, decision, previous_status, next_status, reason,
                        actor_user_id, occurred_at_utc
                    ) VALUES (
                        :id, :voucher, :decision, :previous, :next, :reason,
                        :actor, UTC_TIMESTAMP(6)
                    )'
                );
                $event->execute([
                    'id' => Uuid::v4(),
                    'voucher' => $voucherId,
                    'decision' => $decision,
                    'previous' => $previous,
                    'next' => $next,
                    'reason' => $reason,
                    'actor' => (string) $principal['id'],
                ]);

                $after = $this->snapshot($this->loadRow($connection, $voucherId));

                return [
                    'voucher' => $after,
                    '_audit' => [
                        'eventType' => $decision === 'APPROVE'
                            ? 'PAYMENT_VOUCHER_APPROVED'
                            : 'PAYMENT_VOUCHER_REJECTED',
                        'targetType' => 'voucher',
                        'targetId' => $voucherId,
                        'reason' => $reason,
                        'before' => $before,
                    ],
                ];
            },
            [
                'eventType' => $decision === 'APPROVE' ? 'PAYMENT_VOUCHER_APPROVED' : 'PAYMENT_VOUCHER_REJECTED',
                'targetType' => 'voucher',
                'targetId' => $voucherId,
                'reason' => $reason,
            ],
        );
    }

    /**
     * @param list<array<string, mixed>> $changes
     * @param array<string, mixed> $patch
     */
    private function record(array &$changes, array &$patch, string $field, string $column, mixed $before, mixed $after): void
    {
        if ($before === $after) {
            return;
        }
        $patch[$column] = $after;
        $changes[] = ['field' => $field, 'before' => $before, 'after' => $after];
    }

    /** @param list<array<string, mixed>> $changes */
    private function hasMaterialApprovalChange(array $changes): bool
    {
        foreach ($changes as $change) {
            if (in_array($change['field'], ['amount', 'vendor', 'vendorId', 'date', 'cashImpact', 'paymentMethod'], true)) {
                return true;
            }
        }

        return false;
    }

    private function payeeDayTotal(
        PDO $pdo,
        string $date,
        ?string $vendorId,
        string $vendorName,
        string $excludeId,
    ): int {
        $query = $pdo->prepare(
            'SELECT id, vendor_id, vendor_name_snapshot, amount_paise
             FROM vouchers
             WHERE voucher_type = :type AND status = :status AND business_date = :date
             FOR UPDATE'
        );
        $query->execute(['type' => 'PAYMENT', 'status' => 'ACTIVE', 'date' => $date]);

        $sum = 0;
        foreach ($query->fetchAll(PDO::FETCH_ASSOC) as $candidate) {
            if (hash_equals((string) $candidate['id'], $excludeId)) {
                continue;
            }
            $candidateId = $candidate['vendor_id'] === null ? null : (string) $candidate['vendor_id'];
            $same = $vendorId !== null && $candidateId !== null
                ? hash_equals($vendorId, $candidateId)
                : self::normalizePayee($vendorName) === self::normalizePayee((string) $candidate['vendor_name_snapshot']);
            if ($same) {
                $sum += (int) $candidate['amount_paise'];
            }
        }

        return $sum;
    }

    private function resolveVendor(PDO $pdo, string $name): array
    {
        $normalized = self::normalizePayee($name);
        $query = $pdo->prepare(
            'SELECT id, display_name FROM vendors
             WHERE is_active = 1 AND LOWER(TRIM(display_name)) = :name
             ORDER BY id LIMIT 2 FOR SHARE'
        );
        $query->execute(['name' => $normalized]);
        $matches = $query->fetchAll(PDO::FETCH_ASSOC);
        if (count($matches) > 1) {
            throw new ApiException(409, 'VENDOR_AMBIGUOUS', 'This payee matches more than one active vendor. Resolve the vendor list first.');
        }
        if (count($matches) === 1) {
            return [(string) $matches[0]['id'], (string) $matches[0]['display_name'], 'REGISTERED'];
        }

        return [null, $name, 'ONE_TIME'];
    }

    private function category(PDO $pdo, string $type, mixed $value): string
    {
        if (! is_string($value)) {
            throw new ApiException(422, 'CATEGORY_INVALID', 'Category must be text.');
        }
        $fallback = $type === 'RECEIPT' ? self::RECEIPT_CATEGORIES : self::PAYMENT_CATEGORIES;
        $key = $type === 'RECEIPT' ? 'receiptCategories' : 'categories';
        $query = $pdo->prepare('SELECT value_json FROM settings WHERE setting_key = :key LIMIT 1');
        $query->execute(['key' => $key]);
        $raw = $query->fetchColumn();
        if (is_string($raw) && $raw !== '') {
            try {
                $choices = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
                if (is_array($choices) && array_is_list($choices)) {
                    $configured = array_values(array_filter($choices, static fn ($v): bool => is_string($v) && $v !== ''));
                    if ($configured !== []) {
                        $fallback = $configured;
                    }
                }
            } catch (\JsonException) {
                // The legacy runtime falls back to its default category list on invalid JSON.
            }
        }
        if ($type === 'PAYMENT' && ! in_array('Staff Salary', $fallback, true)) {
            $fallback[] = 'Staff Salary';
        }

        $value = trim($value);
        if ($value === '') {
            return 'Other';
        }

        return in_array($value, $fallback, true) ? $value : 'Other';
    }

    private function vendorName(mixed $value): string
    {
        if (! is_string($value)) {
            throw new ApiException(422, 'VENDOR_INVALID', 'Vendor name must be text.');
        }
        $name = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
        if ($name === '' || mb_strlen($name, 'UTF-8') > 200
            || ! preg_match('/\p{L}/u', $name)
            || preg_match('/[\x00-\x1F\x7F-\x9F\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{206F}\x{FEFF}]/u', $name)
        ) {
            throw new ApiException(422, 'VENDOR_INVALID', 'Vendor name is invalid.');
        }

        return $name;
    }

    private function cleanNotes(string $value): string
    {
        $cleaned = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
        return mb_substr(trim($cleaned), 0, 500, 'UTF-8');
    }

    private function reason(string $value, string $kind): string
    {
        $reason = trim($value);
        if (mb_strlen($reason, 'UTF-8') < 3 || mb_strlen($reason, 'UTF-8') > 200) {
            throw new ApiException(422, 'REASON_INVALID', 'Please give a '.$kind.' reason of 3 to 200 characters.');
        }

        return $reason;
    }

    private function businessDate(mixed $value): string
    {
        if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) {
            throw new ApiException(422, 'BUSINESS_DATE_INVALID', 'Business date must use YYYY-MM-DD.');
        }
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('Asia/Kolkata'));
        $errors = DateTimeImmutable::getLastErrors();
        if (
            $parsed === false
            || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
            || $parsed->format('Y-m-d') !== $value
            || $value < '2000-01-01'
        ) {
            throw new ApiException(422, 'BUSINESS_DATE_INVALID', 'Business date must be a valid date from 1 January 2000 onward.');
        }
        $tomorrow = (new DateTimeImmutable('now', new DateTimeZone('Asia/Kolkata')))->modify('+1 day')->format('Y-m-d');
        if ($value > $tomorrow) {
            throw new ApiException(422, 'BUSINESS_DATE_INVALID', 'Business date cannot be more than one day in the future.');
        }

        return $value;
    }

    private function assertDateUnlocked(PDO $pdo, string $date): void
    {
        $closed = $pdo->prepare('SELECT id FROM cash_closes WHERE business_date = :date LIMIT 1 FOR SHARE');
        $closed->execute(['date' => $date]);
        if ($closed->fetchColumn() !== false) {
            throw new ApiException(409, 'CASH_CLOSE_DATE_LOCKED', 'This business date has already been closed. The voucher was not changed.');
        }
    }

    private function requireUuid(string $value): void
    {
        if (! preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $value)) {
            throw new ApiException(422, 'VOUCHER_ID_INVALID', 'Voucher identifier is invalid.');
        }
    }

    /** @param array<string, mixed> $patch */
    private function applyPatch(PDO $pdo, string $id, array $patch): void
    {
        if ($patch === []) {
            throw new \RuntimeException('Voucher update patch cannot be empty.');
        }
        $allowed = [
            'business_date', 'vendor_name_snapshot', 'vendor_id', 'vendor_type',
            'amount_paise', 'category', 'notes', 'cash_impact', 'payment_method',
            'approval_status', 'approved_by_user_id', 'approved_at_utc',
            'approval_reason', 'status', 'cancel_reason', 'updated_by_user_id', 'updated_at_utc',
        ];
        $assignments = [];
        foreach ($patch as $column => $_value) {
            if (! in_array($column, $allowed, true)) {
                throw new \RuntimeException('Unsupported voucher field in lifecycle patch.');
            }
            $assignments[] = $column.' = :'.$column;
        }
        $values = $patch;
        $values['id'] = $id;
        $update = $pdo->prepare('UPDATE vouchers SET '.implode(', ', $assignments).' WHERE id = :id');
        $update->execute($values);
        if ($update->rowCount() !== 1) {
            throw new \RuntimeException('Voucher update did not affect exactly one row.');
        }
    }

    /** @return array<string, mixed> */
    private function loadRow(PDO $pdo, string $id): array
    {
        $query = $pdo->prepare('SELECT * FROM vouchers WHERE id = :id LIMIT 1');
        $query->execute(['id' => $id]);
        $row = $query->fetch(PDO::FETCH_ASSOC);
        if (! is_array($row)) {
            throw new \RuntimeException('Voucher could not be reloaded after mutation.');
        }

        return $row;
    }

    /** @return array<string, mixed> */
    private function loadRowForUpdate(PDO $pdo, string $id): array
    {
        $query = $pdo->prepare('SELECT * FROM vouchers WHERE id = :id LIMIT 1 FOR UPDATE');
        $query->execute(['id' => $id]);
        $row = $query->fetch(PDO::FETCH_ASSOC);
        if (! is_array($row)) {
            throw new ApiException(404, 'VOUCHER_NOT_FOUND', 'The voucher could not be found.');
        }

        return $row;
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function snapshot(array $row): array
    {
        $paise = (int) $row['amount_paise'];

        return [
            'id' => (string) $row['id'],
            'voucherNo' => (string) $row['voucher_number'],
            'date' => (string) $row['business_date'],
            'vendor' => (string) $row['vendor_name_snapshot'],
            'vendorId' => $row['vendor_id'] === null ? null : (string) $row['vendor_id'],
            'vendorType' => (string) $row['vendor_type'],
            'amount' => intdiv($paise, 100).'.'.str_pad((string) ($paise % 100), 2, '0', STR_PAD_LEFT),
            'amountPaise' => $paise,
            'category' => (string) $row['category'],
            'notes' => (string) $row['notes'],
            'type' => (string) $row['voucher_type'],
            'status' => (string) $row['status'],
            'cashImpact' => (string) $row['cash_impact'],
            'paymentMethod' => (string) $row['payment_method'],
            'approvalStatus' => (string) $row['approval_status'],
            'approvalReason' => (string) $row['approval_reason'],
            'cancelReason' => (string) $row['cancel_reason'],
            'createdBy' => (string) $row['created_by_email_snapshot'],
            'updatedByUserId' => $row['updated_by_user_id'] === null ? null : (string) $row['updated_by_user_id'],
            'approvedByUserId' => $row['approved_by_user_id'] === null ? null : (string) $row['approved_by_user_id'],
            'updatedAtUtc' => (string) $row['updated_at_utc'],
        ];
    }

    private static function normalizePayee(string $value): string
    {
        $normalized = preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);

        return function_exists('mb_strtolower')
            ? mb_strtolower($normalized, 'UTF-8')
            : strtolower($normalized);
    }
}
