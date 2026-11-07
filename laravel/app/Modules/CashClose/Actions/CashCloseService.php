<?php

declare(strict_types=1);

namespace App\Modules\CashClose\Actions;

use CashVoucher\Api\Financial\IdempotencyService;
use CashVoucher\Api\Support\ApiException;
use CashVoucher\Api\Support\Uuid;
use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Throwable;

final class CashCloseService
{
    private const TIME_ZONE = 'Asia/Kolkata';
    private const DRAWER_KEY = 'MAIN';
    private const MAX_AMOUNT_PAISE = 1_000_000_000;
    private const MAX_SNAPSHOT_BYTES = 45_000;
    private const CORRECTION_TYPES = ['VOUCHER', 'CASH_COUNT', 'OPENING_CASH', 'OTHER'];
    private const CASH_IMPACTS = ['CASH_IN', 'CASH_OUT', 'NO_CASH'];

    /**
     * @param array<string, mixed> $principal
     * @return array<string, mixed>
     */
    public function preview(
        PDO $pdo,
        ?string $requestedDate,
        mixed $openingCashInput = null,
        mixed $openingReasonInput = '',
    ): array {
        $date = $this->businessDate($requestedDate ?: $this->today());
        if ($date > $this->today()) {
            throw new ApiException(422, 'BUSINESS_DATE_INVALID', 'Choose a business date that is not in the future.');
        }

        // Fetch only the selected day, exact prior day, first later day and ten latest
        // closes. Do not load an unbounded history table for a preview.
        $selected = $this->findCloseByDate($pdo, $date);
        $previous = $this->findCloseByDate($pdo, $this->previousDate($date));
        $later = $this->findFirstLaterClose($pdo, $date);
        $recent = $this->loadRecentCloses($pdo);
        $recentCloses = array_map(
            fn (array $row): array => $this->closeWithCorrections($pdo, $row),
            $recent,
        );

        if (is_array($selected)) {
            return [
                'date' => $date,
                'today' => $this->today(),
                'drawerKey' => self::DRAWER_KEY,
                'closed' => true,
                'close' => $this->closeWithCorrections($pdo, $selected),
                'recentCloses' => $recentCloses,
                'timeZone' => self::TIME_ZONE,
            ];
        }

        $rows = $this->loadVouchersForDate($pdo, $date, false);
        $period = $this->calculatePeriod($rows, $date);

        $openingPaise = null;
        $openingSource = '';
        $openingReason = '';
        $openingCloseId = '';
        $openingReady = false;
        if (is_array($previous)) {
            $openingPaise = $this->storedNonNegativePaise($previous['counted_cash_paise'] ?? null, 'prior counted cash');
            $openingSource = 'PREVIOUS_CLOSE';
            $openingCloseId = (string) $previous['id'];
            $openingReady = true;
        } elseif ($openingCashInput !== null && $openingCashInput !== '') {
            $openingPaise = $this->amountPaise($openingCashInput, 'opening cash');
            $openingReason = $this->reasonOptional($openingReasonInput, 'opening/gap');
            $openingSource = 'MANUAL';
            $openingReady = mb_strlen($openingReason, 'UTF-8') >= 3;
        }

        $expectedPaise = $openingPaise === null
            ? null
            : $openingPaise + $period['cashInPaise'] - $period['cashOutPaise'];
        $blocked = $period['pendingApprovals'] !== []
            || $period['unclassified'] !== []
            || $period['invalidVouchers'] !== [];
        $expectedValid = $expectedPaise !== null && $expectedPaise >= 0 && $expectedPaise <= PHP_INT_MAX;

        return [
            'date' => $date,
            'today' => $this->today(),
            'drawerKey' => self::DRAWER_KEY,
            'closed' => false,
            'blockedByLaterClose' => $later !== null,
            'laterCloseDate' => $later === null ? '' : (string) $later['business_date'],
            'requiresManualOpening' => $previous === null,
            'previousClose' => $previous === null ? null : $this->presentClose($pdo, $previous),
            'openingCash' => $openingPaise === null ? null : $this->formatPaise($openingPaise),
            'openingSource' => $openingSource,
            'openingCloseId' => $openingCloseId,
            'openingReason' => $openingReason,
            'openingReady' => $openingReady,
            'cashInTotal' => $this->formatPaise($period['cashInPaise']),
            'cashOutTotal' => $this->formatPaise($period['cashOutPaise']),
            'noCashCount' => $period['noCashCount'],
            'activeVoucherCount' => count($period['items']) + count($period['pendingApprovals']),
            'includedVouchers' => $period['items'],
            'pendingApprovals' => $period['pendingApprovals'],
            'unclassified' => $period['unclassified'],
            'invalidVouchers' => $period['invalidVouchers'],
            'expectedCash' => $expectedValid && !$blocked && $openingReady
                ? $this->formatPaise((int) $expectedPaise)
                : null,
            'readyToClose' => $expectedValid && !$blocked && $openingReady && $later === null,
            'expectedInvalid' => $expectedPaise !== null && $expectedPaise < 0,
            'recentCloses' => $recentCloses,
            'timeZone' => self::TIME_ZONE,
        ];
    }

    /**
     * @param array<string, mixed> $input
     * @param array<string, mixed> $principal
     * @return array{data:array<string,mixed>,replayed:bool}
     */
    public function create(
        PDO $pdo,
        array $input,
        array $principal,
        string $idempotencyKey,
    ): array {
        $date = $this->businessDate($input['date'] ?? null);
        if ($date > $this->today()) {
            throw new ApiException(422, 'BUSINESS_DATE_INVALID', 'Choose a business date that is not in the future.');
        }
        $countedCash = $this->amountPaise($input['countedCash'] ?? null, 'counted cash');
        $openingCashInput = $input['openingCash'] ?? null;
        $openingCash = $openingCashInput === null || $openingCashInput === ''
            ? null
            : $this->amountPaise($openingCashInput, 'opening cash');
        $openingReason = $this->reasonOptional($input['openingReason'] ?? '', 'opening/gap');
        $varianceReason = $this->reasonOptional($input['varianceReason'] ?? '', 'variance');

        $payload = [
            'date' => $date,
            'openingCash' => $openingCash === null ? null : $this->formatPaise($openingCash),
            'openingReason' => $openingReason,
            'countedCash' => $this->formatPaise($countedCash),
            'varianceReason' => $varianceReason,
        ];
        $actorId = (string) $principal['id'];
        $actorEmail = (string) $principal['email'];

        // Serialize all close attempts for the single MAIN drawer. Per-type voucher sequence
        // locks then serialize the close snapshot against concurrent voucher creation.
        $lockName = 'cash_voucher_cash_close_main';
        $lock = $pdo->prepare('SELECT GET_LOCK(:lock_name, 10)');
        $lock->execute(['lock_name' => $lockName]);
        if ((int) $lock->fetchColumn() !== 1) {
            throw new ApiException(503, 'CASH_CLOSE_LOCK_UNAVAILABLE', 'The cash-close lock is unavailable. Retry safely.');
        }

        try {
            return (new IdempotencyService($pdo))->execute(
                $actorId,
                $actorEmail,
                'createCashClose',
                $idempotencyKey,
                $payload,
                function (PDO $connection) use (
                    $date,
                    $countedCash,
                    $openingCash,
                    $openingReason,
                    $varianceReason,
                    $principal,
                    $payload,
                    $actorId,
                ): array {
                    $this->lockVoucherSequences($connection);

                    if ($this->findCloseByDate($connection, $date) !== null) {
                        throw new ApiException(409, 'CASH_CLOSE_EXISTS', 'This business date is already closed. The original close cannot be overwritten.');
                    }

                    $laterQuery = $connection->prepare(
                        'SELECT business_date FROM cash_closes
                         WHERE drawer_key = :drawer AND business_date > :date
                         ORDER BY business_date ASC LIMIT 1'
                    );
                    $laterQuery->execute(['drawer' => self::DRAWER_KEY, 'date' => $date]);
                    $laterDate = $laterQuery->fetchColumn();
                    if (is_string($laterDate) && $laterDate !== '') {
                        throw new ApiException(
                            409,
                            'CASH_CLOSE_OUT_OF_ORDER',
                            'Cannot close '.$date.' because the later business date '.$laterDate.' is already closed. Finalize dates in chronological order.',
                        );
                    }

                    $previous = $this->findCloseByDate($connection, $this->previousDate($date));
                    $openingCloseId = null;
                    $resolvedOpeningReason = '';
                    if (is_array($previous)) {
                        $this->presentClose($connection, $previous);
                        $openingPaise = $this->storedNonNegativePaise($previous['counted_cash_paise'] ?? null, 'prior counted cash');
                        $openingSource = 'PREVIOUS_CLOSE';
                        $openingCloseId = (string) $previous['id'];
                    } else {
                        if ($openingCash === null) {
                            throw new ApiException(422, 'OPENING_CASH_REQUIRED', 'No accepted close exists for the previous day. Enter the manual opening cash.');
                        }
                        if (mb_strlen($openingReason, 'UTF-8') < 3) {
                            throw new ApiException(422, 'OPENING_REASON_REQUIRED', 'Explain the manual opening amount or gap in at least 3 characters.');
                        }
                        $openingPaise = $openingCash;
                        $openingSource = 'MANUAL';
                        $resolvedOpeningReason = $openingReason;
                    }

                    $voucherRows = $this->loadVouchersForDate($connection, $date, true);
                    $period = $this->calculatePeriod($voucherRows, $date);

                    if ($period['pendingApprovals'] !== []) {
                        throw new ApiException(
                            409,
                            'CASH_CLOSE_APPROVAL_PENDING',
                            count($period['pendingApprovals']).' active payment voucher(s) are not approved. Approve, reject/cancel or correct them before closing.',
                            ['items' => $period['pendingApprovals']],
                        );
                    }
                    if ($period['unclassified'] !== []) {
                        throw new ApiException(
                            409,
                            'CASH_CLOSE_UNCLASSIFIED',
                            count($period['unclassified']).' active voucher(s) have unresolved physical-cash impact. Classify them before closing.',
                            ['items' => $period['unclassified']],
                        );
                    }
                    if ($period['invalidVouchers'] !== []) {
                        throw new ApiException(
                            409,
                            'CASH_CLOSE_DATA',
                            count($period['invalidVouchers']).' voucher row(s) have invalid status, type, identity, number or amount data.',
                            ['items' => $period['invalidVouchers']],
                        );
                    }

                    $expectedPaise = $openingPaise + $period['cashInPaise'] - $period['cashOutPaise'];
                    if ($expectedPaise < 0 || $expectedPaise > PHP_INT_MAX) {
                        throw new ApiException(409, 'CASH_CLOSE_DATA', 'Expected cash is negative or outside the supported integer range.');
                    }
                    $variancePaise = $countedCash - $expectedPaise;
                    if ($variancePaise !== 0 && mb_strlen($varianceReason, 'UTF-8') < 3) {
                        throw new ApiException(422, 'VARIANCE_REASON_REQUIRED', 'Explain a non-zero cash variance in at least 3 characters.');
                    }

                    $includedIds = array_map(static fn (array $item): string => $item['id'], $period['items']);
                    $snapshot = json_encode($period['items'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                    $idsJson = json_encode($includedIds, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
                    if (strlen($snapshot) > self::MAX_SNAPSHOT_BYTES || strlen($idsJson) > self::MAX_SNAPSHOT_BYTES) {
                        throw new ApiException(422, 'CASH_CLOSE_DATA', 'This date has too many voucher details for one close snapshot. No close was saved.');
                    }

                    $closeId = Uuid::v4();
                    $requestId = Uuid::v4();
                    $requestHash = hash('sha256', $this->canonicalJson($payload));
                    $insert = $connection->prepare(
                        'INSERT INTO cash_closes (
                            id, business_date, drawer_key, opening_cash_paise, opening_source,
                            opening_close_id, opening_reason, cash_in_total_paise, cash_out_total_paise,
                            expected_cash_paise, counted_cash_paise, variance_paise, variance_reason,
                            included_voucher_count, included_voucher_ids, included_voucher_snapshot,
                            created_by_user_id, created_at_utc, time_zone, request_id, request_payload_hash
                        ) VALUES (
                            :id, :date, :drawer, :opening, :opening_source,
                            :opening_close, :opening_reason, :cash_in, :cash_out,
                            :expected, :counted, :variance, :variance_reason,
                            :voucher_count, :voucher_ids, :voucher_snapshot,
                            :actor, UTC_TIMESTAMP(6), :timezone, :request_id, :request_hash
                        )'
                    );
                    $insert->execute([
                        'id' => $closeId,
                        'date' => $date,
                        'drawer' => self::DRAWER_KEY,
                        'opening' => $openingPaise,
                        'opening_source' => $openingSource,
                        'opening_close' => $openingCloseId,
                        'opening_reason' => $resolvedOpeningReason,
                        'cash_in' => $period['cashInPaise'],
                        'cash_out' => $period['cashOutPaise'],
                        'expected' => $expectedPaise,
                        'counted' => $countedCash,
                        'variance' => $variancePaise,
                        'variance_reason' => $varianceReason,
                        'voucher_count' => count($period['items']),
                        'voucher_ids' => $idsJson,
                        'voucher_snapshot' => $snapshot,
                        'actor' => $actorId,
                        'timezone' => self::TIME_ZONE,
                        'request_id' => $requestId,
                        'request_hash' => $requestHash,
                    ]);

                    $row = $this->findCloseById($connection, $closeId);
                    if (! is_array($row)) {
                        throw new \RuntimeException('The saved close record could not be reloaded.');
                    }
                    $present = $this->presentClose($connection, $row);

                    return [
                        'close' => $present,
                        '_audit' => [
                            'eventType' => 'DAILY_CASH_CLOSE_FINALIZED',
                            'targetType' => 'cashClose',
                            'targetId' => $closeId,
                            'reason' => $varianceReason !== '' ? $varianceReason : ($resolvedOpeningReason ?: 'Daily cash close finalized.'),
                            'before' => null,
                        ],
                    ];
                },
                [
                    'eventType' => 'DAILY_CASH_CLOSE_FINALIZED',
                    'targetType' => 'cashClose',
                    'targetId' => Uuid::v4(),
                    'reason' => 'Daily cash close finalized.',
                ],
            );
        } finally {
            try {
                $release = $pdo->prepare('SELECT RELEASE_LOCK(:lock_name)');
                $release->execute(['lock_name' => $lockName]);
            } catch (Throwable) {
                // MySQL releases the advisory lock when the connection closes.
            }
        }
    }

    /**
     * @param array<string, mixed> $input
     * @param array<string, mixed> $principal
     * @return array{data:array<string,mixed>,replayed:bool}
     */
    public function recordCorrection(
        PDO $pdo,
        string $closeId,
        array $input,
        array $principal,
        string $idempotencyKey,
    ): array {
        $this->requireUuid($closeId, 'CASH_CLOSE_ID_INVALID');
        $type = strtoupper(trim((string) ($input['type'] ?? '')));
        if (! in_array($type, self::CORRECTION_TYPES, true)) {
            throw new ApiException(422, 'CORRECTION_TYPE_INVALID', 'Choose a valid cash-close correction type.');
        }
        $details = $this->text($input['details'] ?? null, 'correction details', 500, true);
        $reason = $this->text($input['reason'] ?? null, 'correction reason', 200, true);
        $voucherId = trim((string) ($input['voucherId'] ?? ''));
        if ($voucherId !== '') {
            $this->requireUuid($voucherId, 'VOUCHER_ID_INVALID');
        }

        return (new IdempotencyService($pdo))->execute(
            (string) $principal['id'],
            (string) $principal['email'],
            'recordCashCloseCorrection',
            $idempotencyKey,
            [
                'closeId' => $closeId,
                'type' => $type,
                'details' => $details,
                'reason' => $reason,
                'voucherId' => $voucherId,
            ],
            function (PDO $connection) use ($closeId, $type, $details, $reason, $voucherId, $principal): array {
                $select = $connection->prepare('SELECT * FROM cash_closes WHERE id = :id LIMIT 1 FOR SHARE');
                $select->execute(['id' => $closeId]);
                $close = $select->fetch(PDO::FETCH_ASSOC);
                if (! is_array($close)) {
                    throw new ApiException(404, 'CASH_CLOSE_NOT_FOUND', 'The saved cash close could not be found.');
                }
                $snapshot = $this->presentClose($connection, $close);
                if ($voucherId !== '' && ! in_array($voucherId, $snapshot['includedVoucherIds'], true)) {
                    throw new ApiException(
                        422,
                        'VOUCHER_NOT_IN_CLOSE',
                        'The linked voucher is not part of this immutable close snapshot.',
                    );
                }

                $correctionId = Uuid::v4();
                $insert = $connection->prepare(
                    'INSERT INTO cash_close_corrections (
                        id, cash_close_id, business_date, voucher_id, correction_type,
                        details, reason, created_by_user_id, created_at_utc
                    ) VALUES (
                        :id, :close_id, :date, :voucher_id, :type,
                        :details, :reason, :actor, UTC_TIMESTAMP(6)
                    )'
                );
                $insert->execute([
                    'id' => $correctionId,
                    'close_id' => $closeId,
                    'date' => (string) $close['business_date'],
                    'voucher_id' => $voucherId === '' ? null : $voucherId,
                    'type' => $type,
                    'details' => $details,
                    'reason' => $reason,
                    'actor' => (string) $principal['id'],
                ]);

                $correction = [
                    'id' => $correctionId,
                    'closeId' => $closeId,
                    'date' => (string) $close['business_date'],
                    'voucherId' => $voucherId,
                    'type' => $type,
                    'details' => $details,
                    'reason' => $reason,
                    'createdByUserId' => (string) $principal['id'],
                    'createdAtUtc' => gmdate('Y-m-d H:i:s'),
                ];

                return [
                    'correction' => $correction,
                    '_audit' => [
                        'eventType' => 'CASH_CLOSE_CORRECTION_RECORDED',
                        'targetType' => 'cashClose',
                        'targetId' => $closeId,
                        'reason' => $reason,
                        'before' => null,
                    ],
                ];
            },
            [
                'eventType' => 'CASH_CLOSE_CORRECTION_RECORDED',
                'targetType' => 'cashClose',
                'targetId' => $closeId,
                'reason' => $reason,
            ],
        );
    }

    /** @return array<string, mixed>|null */
    private function findFirstLaterClose(PDO $pdo, string $date): ?array
    {
        $query = $pdo->prepare(
            'SELECT * FROM cash_closes
             WHERE drawer_key = :drawer AND business_date > :date
             ORDER BY business_date ASC LIMIT 1'
        );
        $query->execute(['drawer' => self::DRAWER_KEY, 'date' => $date]);
        $row = $query->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    /** @return list<array<string, mixed>> */
    private function loadRecentCloses(PDO $pdo): array
    {
        $query = $pdo->prepare(
            'SELECT * FROM cash_closes
             WHERE drawer_key = :drawer
             ORDER BY business_date DESC LIMIT 10'
        );
        $query->execute(['drawer' => self::DRAWER_KEY]);

        return $query->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return array<string, mixed>|null */
    private function findCloseByDate(PDO $pdo, string $date): ?array
    {
        $query = $pdo->prepare(
            'SELECT * FROM cash_closes
             WHERE business_date = :date AND drawer_key = :drawer
             LIMIT 1'
        );
        $query->execute(['date' => $date, 'drawer' => self::DRAWER_KEY]);
        $row = $query->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    /** @return array<string, mixed>|null */
    private function findCloseById(PDO $pdo, string $id): ?array
    {
        $query = $pdo->prepare('SELECT * FROM cash_closes WHERE id = :id LIMIT 1');
        $query->execute(['id' => $id]);
        $row = $query->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    /** @return list<array<string, mixed>> */
    private function loadVouchersForDate(PDO $pdo, string $date, bool $lock): array
    {
        $sql = 'SELECT * FROM vouchers WHERE business_date = :date ORDER BY voucher_type, voucher_number';
        if ($lock) {
            $sql .= ' FOR UPDATE';
        }
        $query = $pdo->prepare($sql);
        $query->execute(['date' => $date]);

        return $query->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return array{items:list<array<string,mixed>>,unclassified:list<array<string,mixed>>,invalidVouchers:list<array<string,mixed>>,pendingApprovals:list<array<string,mixed>>,cashInPaise:int,cashOutPaise:int,noCashCount:int} */
    private function calculatePeriod(array $rows, string $date): array
    {
        $items = [];
        $unclassified = [];
        $invalid = [];
        $pending = [];
        $cashIn = 0;
        $cashOut = 0;
        $noCash = 0;

        foreach ($rows as $row) {
            $status = (string) ($row['status'] ?? '');
            if ($status === 'CANCELLED') {
                continue;
            }

            $type = (string) ($row['voucher_type'] ?? '');
            $id = (string) ($row['id'] ?? '');
            $rawNumber = (string) ($row['voucher_number'] ?? '');
            $numberValid = preg_match('/^[1-9][0-9]{0,15}$/D', $rawNumber) === 1;
            if (
                $status !== 'ACTIVE'
                || ! in_array($type, ['PAYMENT', 'RECEIPT'], true)
                || ! $this->isUuid($id)
                || ! $numberValid
            ) {
                $invalid[] = [
                    'id' => $id,
                    'voucherNo' => ($type === 'RECEIPT' ? 'R-' : 'P-').($rawNumber !== '' ? $rawNumber : 'UNKNOWN'),
                    'vendor' => (string) ($row['vendor_name_snapshot'] ?? ''),
                    'amount' => (string) ($row['amount_paise'] ?? ''),
                    'reason' => $status !== 'ACTIVE'
                        ? 'Voucher status is missing or unsupported.'
                        : (! in_array($type, ['PAYMENT', 'RECEIPT'], true)
                            ? 'Voucher type is missing or unsupported.'
                            : (!$this->isUuid($id)
                                ? 'Voucher ID is missing or invalid.'
                                : 'Voucher number is missing or invalid.')),
                ];
                continue;
            }

            $approvalStatus = (string) ($row['approval_status'] ?? '');
            if ($type === 'PAYMENT' && ! in_array($approvalStatus, ['NOT_REQUIRED', 'APPROVED'], true)) {
                $pending[] = [
                    'id' => $id,
                    'voucherNo' => 'P-'.$rawNumber,
                    'date' => $date,
                    'vendor' => (string) ($row['vendor_name_snapshot'] ?? ''),
                    'amount' => $this->tryFormatPaise($row['amount_paise'] ?? null),
                    'approvalStatus' => $approvalStatus !== '' ? $approvalStatus : 'REVIEW_REQUIRED',
                    'reason' => $approvalStatus === 'PENDING'
                        ? 'Payment approval is required.'
                        : ($approvalStatus === 'REJECTED'
                            ? 'Payment was rejected; cancel or correct it before closing.'
                            : 'Approval state is invalid and needs review.'),
                ];
                continue;
            }

            $rawPaise = $row['amount_paise'] ?? null;
            $amountPaise = $this->tryPaise($rawPaise);
            $amountValid = $amountPaise !== null && $amountPaise > 0 && $amountPaise <= self::MAX_AMOUNT_PAISE;
            $impact = (string) ($row['cash_impact'] ?? '');
            $impactValid = in_array($impact, self::CASH_IMPACTS, true);
            $item = [
                'id' => $id,
                'voucherNo' => ($type === 'RECEIPT' ? 'R-' : 'P-').$rawNumber,
                'date' => $date,
                'vendor' => (string) ($row['vendor_name_snapshot'] ?? ''),
                'paymentMethod' => (string) ($row['payment_method'] ?? ''),
                'amount' => $amountValid ? $this->formatPaise((int) $amountPaise) : null,
                'amountPaise' => $amountValid ? (int) $amountPaise : null,
                'cashImpact' => $impactValid ? $impact : 'UNCLASSIFIED',
            ];
            $items[] = $item;

            if (! $amountValid) {
                $invalid[] = [
                    'id' => $id,
                    'voucherNo' => $item['voucherNo'],
                    'vendor' => $item['vendor'],
                    'amount' => (string) ($rawPaise ?? ''),
                    'reason' => 'Amount is missing, invalid, zero, or outside the supported range.',
                ];
            }
            if (! $impactValid) {
                $unclassified[] = [
                    'id' => $id,
                    'voucherNo' => $item['voucherNo'],
                    'date' => $date,
                    'vendor' => $item['vendor'],
                    'amount' => $item['amount'],
                    'reason' => 'Physical cash impact is unresolved.',
                ];
            }
            if (! $amountValid || ! $impactValid) {
                continue;
            }

            if ($impact === 'CASH_IN') {
                $cashIn += (int) $amountPaise;
            } elseif ($impact === 'CASH_OUT') {
                $cashOut += (int) $amountPaise;
            } elseif ($impact === 'NO_CASH') {
                $noCash++;
            }
            if ($cashIn > PHP_INT_MAX || $cashOut > PHP_INT_MAX) {
                throw new ApiException(409, 'CASH_CLOSE_DATA', 'Voucher totals exceed the supported integer range.');
            }
        }

        return [
            'items' => $items,
            'unclassified' => $unclassified,
            'invalidVouchers' => $invalid,
            'pendingApprovals' => $pending,
            'cashInPaise' => $cashIn,
            'cashOutPaise' => $cashOut,
            'noCashCount' => $noCash,
        ];
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function closeWithCorrections(PDO $pdo, array $row): array
    {
        $close = $this->presentClose($pdo, $row);
        $query = $pdo->prepare(
            'SELECT id, cash_close_id, business_date, voucher_id, correction_type,
                    details, reason, created_by_user_id, created_at_utc
             FROM cash_close_corrections
             WHERE cash_close_id = :close_id
             ORDER BY created_at_utc DESC
             LIMIT 100'
        );
        $query->execute(['close_id' => (string) $row['id']]);
        $corrections = $query->fetchAll(PDO::FETCH_ASSOC);
        $corrections = array_reverse($corrections);
        $close['corrections'] = array_map(
            static fn (array $item): array => [
                'id' => (string) $item['id'],
                'closeId' => (string) $item['cash_close_id'],
                'date' => (string) $item['business_date'],
                'voucherId' => $item['voucher_id'] === null ? '' : (string) $item['voucher_id'],
                'type' => (string) $item['correction_type'],
                'details' => (string) $item['details'],
                'reason' => (string) $item['reason'],
                'createdByUserId' => (string) $item['created_by_user_id'],
                'createdAtUtc' => (string) $item['created_at_utc'],
            ],
            $corrections,
        );

        return $close;
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function presentClose(PDO $pdo, array $row): array
    {
        try {
            $ids = json_decode((string) $row['included_voucher_ids'], true, 64, JSON_THROW_ON_ERROR);
            $snapshot = json_decode((string) $row['included_voucher_snapshot'], true, 64, JSON_THROW_ON_ERROR);
        } catch (Throwable $exception) {
            throw new ApiException(503, 'CASH_CLOSE_DATA', 'The saved cash-close snapshot is invalid.');
        }
        if (! is_array($ids) || ! array_is_list($ids) || ! is_array($snapshot) || ! array_is_list($snapshot)) {
            throw new ApiException(503, 'CASH_CLOSE_DATA', 'The saved cash-close snapshot is invalid.');
        }
        if (
            count(array_filter($ids, static fn (mixed $id): bool => is_string($id) && $id !== '')) !== count($ids)
            || count(array_unique($ids, SORT_STRING)) !== count($ids)
        ) {
            throw new ApiException(503, 'CASH_CLOSE_DATA', 'The saved cash-close voucher IDs are invalid or duplicated.');
        }

        $date = (string) ($row['business_date'] ?? '');
        if (
            ! $this->isUuid((string) ($row['id'] ?? ''))
            || ! $this->isDate($date)
            || (string) ($row['drawer_key'] ?? '') !== self::DRAWER_KEY
            || ! in_array((string) ($row['opening_source'] ?? ''), ['MANUAL', 'PREVIOUS_CLOSE'], true)
            || (string) ($row['time_zone'] ?? '') !== self::TIME_ZONE
            || ! $this->isUuid((string) ($row['request_id'] ?? ''))
            || ! preg_match('/^[a-f0-9]{64}$/D', (string) ($row['request_payload_hash'] ?? ''))
            || ! $this->isUuid((string) ($row['created_by_user_id'] ?? ''))
            || ! preg_match('/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?$/D', (string) ($row['created_at_utc'] ?? ''))
            || count($ids) !== count($snapshot)
            || (int) ($row['included_voucher_count'] ?? -1) !== count($snapshot)
        ) {
            throw new ApiException(503, 'CASH_CLOSE_DATA', 'The saved cash-close identity or counts are invalid.');
        }

        $cashIn = 0;
        $cashOut = 0;
        foreach ($snapshot as $index => $item) {
            if (
                ! is_array($item)
                || ! $this->isUuid((string) ($item['id'] ?? ''))
                || ! is_string($ids[$index] ?? null)
                || ! hash_equals((string) $ids[$index], (string) $item['id'])
                || ! in_array($item['cashImpact'] ?? null, self::CASH_IMPACTS, true)
                || ! is_int($item['amountPaise'] ?? null)
                || $item['amountPaise'] < 1
                || $item['amountPaise'] > self::MAX_AMOUNT_PAISE
                || (string) ($item['date'] ?? '') !== $date
                || ! is_string($item['vendor'] ?? null)
            ) {
                throw new ApiException(503, 'CASH_CLOSE_DATA', 'The saved cash-close voucher snapshot is invalid.');
            }
            if ($item['cashImpact'] === 'CASH_IN') {
                $cashIn += $item['amountPaise'];
            } elseif ($item['cashImpact'] === 'CASH_OUT') {
                $cashOut += $item['amountPaise'];
            }
        }

        $opening = $this->storedNonNegativePaise($row['opening_cash_paise'] ?? null, 'opening cash');
        $cashInSaved = $this->storedNonNegativePaise($row['cash_in_total_paise'] ?? null, 'cash-in total');
        $cashOutSaved = $this->storedNonNegativePaise($row['cash_out_total_paise'] ?? null, 'cash-out total');
        $expected = $this->storedNonNegativePaise($row['expected_cash_paise'] ?? null, 'expected cash');
        $counted = $this->storedNonNegativePaise($row['counted_cash_paise'] ?? null, 'counted cash');
        $varianceRaw = $row['variance_paise'] ?? null;
        if (! is_numeric($varianceRaw) || ! preg_match('/^-?[0-9]+$/D', (string) $varianceRaw)) {
            throw new ApiException(503, 'CASH_CLOSE_DATA', 'The saved cash-close variance is invalid.');
        }
        $variance = (int) $varianceRaw;
        $openingSource = (string) $row['opening_source'];
        $openingCloseId = $row['opening_close_id'] === null ? '' : (string) $row['opening_close_id'];
        if ($openingSource === 'MANUAL') {
            if ($openingCloseId !== '' || mb_strlen((string) ($row['opening_reason'] ?? ''), 'UTF-8') < 3) {
                throw new ApiException(503, 'CASH_CLOSE_DATA', 'The saved manual opening source is inconsistent with its reason or previous-close reference.');
            }
        } else {
            if (! $this->isUuid($openingCloseId)) {
                throw new ApiException(503, 'CASH_CLOSE_DATA', 'The saved previous-close reference is invalid.');
            }
            $previousQuery = $pdo->prepare(
                'SELECT business_date, drawer_key, counted_cash_paise
                 FROM cash_closes
                 WHERE id = :id
                 LIMIT 1'
            );
            $previousQuery->execute(['id' => $openingCloseId]);
            $previousRow = $previousQuery->fetch(PDO::FETCH_ASSOC);
            if (
                ! is_array($previousRow)
                || (string) $previousRow['business_date'] !== $this->previousDate($date)
                || (string) $previousRow['drawer_key'] !== self::DRAWER_KEY
                || $this->storedNonNegativePaise($previousRow['counted_cash_paise'] ?? null, 'previous close counted cash') !== $opening
            ) {
                throw new ApiException(503, 'CASH_CLOSE_DATA', 'The saved carry-forward link does not point to the immediately preceding MAIN drawer close with the same counted amount.');
            }
        }

        if (
            $cashIn !== $cashInSaved
            || $cashOut !== $cashOutSaved
            || $expected !== $opening + $cashIn - $cashOut
            || $variance !== $counted - $expected
            || ($variance !== 0 && mb_strlen((string) ($row['variance_reason'] ?? ''), 'UTF-8') < 3)
        ) {
            throw new ApiException(503, 'CASH_CLOSE_DATA', 'The saved cash-close totals do not reconcile with its immutable snapshot.');
        }

        return [
            'id' => (string) $row['id'],
            'date' => $date,
            'drawerKey' => self::DRAWER_KEY,
            'openingCash' => $this->formatPaise($opening),
            'openingSource' => $openingSource,
            'openingCloseId' => $openingCloseId,
            'openingReason' => (string) ($row['opening_reason'] ?? ''),
            'cashInTotal' => $this->formatPaise($cashInSaved),
            'cashOutTotal' => $this->formatPaise($cashOutSaved),
            'expectedCash' => $this->formatPaise($expected),
            'countedCash' => $this->formatPaise($counted),
            'variance' => $this->formatPaise($variance),
            'varianceReason' => (string) ($row['variance_reason'] ?? ''),
            'includedVoucherCount' => count($snapshot),
            'includedVoucherIds' => $ids,
            'includedVouchers' => $snapshot,
            'createdByUserId' => (string) $row['created_by_user_id'],
            'createdAtUtc' => (string) $row['created_at_utc'],
            'timeZone' => self::TIME_ZONE,
        ];
    }

    /** @return list<array<string, mixed>> */
    private function lockVoucherSequences(PDO $pdo): void
    {
        foreach (['PAYMENT', 'RECEIPT'] as $type) {
            $query = $pdo->prepare(
                'SELECT next_number FROM voucher_number_sequences WHERE voucher_type = :type FOR UPDATE'
            );
            $query->execute(['type' => $type]);
            $query->fetchColumn();
        }
    }

    private function amountPaise(mixed $value, string $label): int
    {
        if (! is_string($value) || ! preg_match('/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/D', $value)) {
            throw new ApiException(422, 'CASH_AMOUNT_INVALID', 'Enter a valid '.$label.' amount using up to two decimal places.');
        }
        $parts = explode('.', $value, 2);
        $rupees = (int) $parts[0];
        $paise = isset($parts[1]) ? (int) str_pad($parts[1], 2, '0') : 0;
        $total = $rupees * 100 + $paise;
        if ($total > self::MAX_AMOUNT_PAISE) {
            throw new ApiException(422, 'CASH_AMOUNT_INVALID', ucfirst($label).' is outside the supported amount range.');
        }

        return $total;
    }

    private function storedNonNegativePaise(mixed $value, string $label): int
    {
        if (! is_numeric($value) || ! preg_match('/^[0-9]+$/D', (string) $value)) {
            throw new ApiException(503, 'CASH_CLOSE_DATA', 'Saved '.$label.' is invalid. Stop and inspect the close record.');
        }
        $number = (int) $value;
        if ($number < 0) {
            throw new ApiException(503, 'CASH_CLOSE_DATA', 'Saved '.$label.' is negative. Stop and inspect the close record.');
        }

        return $number;
    }

    private function tryPaise(mixed $value): ?int
    {
        if (! is_numeric($value) || ! preg_match('/^[0-9]+$/D', (string) $value)) {
            return null;
        }
        $number = (int) $value;
        return $number >= 1 && $number <= self::MAX_AMOUNT_PAISE ? $number : null;
    }

    private function tryFormatPaise(mixed $value): ?string
    {
        $paise = $this->tryPaise($value);

        return $paise === null ? null : $this->formatPaise($paise);
    }

    private function formatPaise(int $paise): string
    {
        $negative = $paise < 0 ? '-' : '';
        $absolute = abs($paise);

        return $negative.intdiv($absolute, 100).'.'.str_pad((string) ($absolute % 100), 2, '0', STR_PAD_LEFT);
    }

    private function reasonOptional(mixed $value, string $label): string
    {
        if ($value === null) {
            return '';
        }
        if (! is_string($value)) {
            throw new ApiException(422, 'CASH_CLOSE_REASON_INVALID', ucfirst($label).' reason must be text.');
        }
        $reason = trim($value);
        if (mb_strlen($reason, 'UTF-8') > 200) {
            throw new ApiException(422, 'CASH_CLOSE_REASON_INVALID', ucfirst($label).' reason must not exceed 200 characters.');
        }

        return $reason;
    }

    private function text(mixed $value, string $label, int $max, bool $required): string
    {
        if (! is_string($value)) {
            throw new ApiException(422, 'CASH_CLOSE_CORRECTION_INVALID', ucfirst($label).' must be text.');
        }
        $text = trim($value);
        if (($required && mb_strlen($text, 'UTF-8') < 3) || mb_strlen($text, 'UTF-8') > $max) {
            throw new ApiException(422, 'CASH_CLOSE_CORRECTION_INVALID', ucfirst($label).' must contain 3 to '.$max.' characters.');
        }

        return $text;
    }

    private function businessDate(mixed $value): string
    {
        if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) {
            throw new ApiException(422, 'BUSINESS_DATE_INVALID', 'Business date must use YYYY-MM-DD.');
        }
        if (! $this->isDate($value)) {
            throw new ApiException(422, 'BUSINESS_DATE_INVALID', 'Business date must be a valid Asia/Kolkata calendar date.');
        }

        return $value;
    }

    private function isDate(string $value): bool
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone(self::TIME_ZONE));
        $errors = DateTimeImmutable::getLastErrors();

        return $date !== false
            && ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0))
            && $date->format('Y-m-d') === $value
            && $value >= '2000-01-01';
    }

    private function today(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone(self::TIME_ZONE)))->format('Y-m-d');
    }

    private function previousDate(string $date): string
    {
        return (new DateTimeImmutable($date.' 00:00:00', new DateTimeZone(self::TIME_ZONE)))
            ->modify('-1 day')->format('Y-m-d');
    }

    private function canonicalJson(array $payload): string
    {
        ksort($payload, SORT_STRING);

        return json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR);
    }

    private function requireUuid(string $value, string $code): void
    {
        if (! $this->isUuid($value)) {
            throw new ApiException(422, $code, 'The identifier is invalid.');
        }
    }

    private function isUuid(string $value): bool
    {
        return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $value) === 1;
    }
}
