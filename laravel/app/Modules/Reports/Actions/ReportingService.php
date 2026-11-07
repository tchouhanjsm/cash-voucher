<?php

declare(strict_types=1);

namespace App\Modules\Reports\Actions;

use App\Modules\Identity\RoleCapabilities;
use CashVoucher\Api\Support\ApiException;
use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Throwable;

final class ReportingService
{
    private const MAX_AMOUNT_PAISE = 1_000_000_000;
    private const MAX_RANGE_DAYS = 3660;
    private const PAGE_DEFAULT = 100;
    private const PAGE_MAX = 200;
    private const APPROVED_SQL = "('NOT_REQUIRED', 'APPROVED')";

    /**
     * Staff receive creator-scoped figures. Manager/Owner receive the full-property
     * model and team breakdown. Accountant is intentionally not a dashboard role.
     *
     * @param array<string, mixed> $principal
     * @return array<string, mixed>
     */
    public function dashboardSummary(PDO $pdo, array $principal, mixed $fromInput, mixed $toInput): array
    {
        $canViewAll = RoleCapabilities::allows((string) $principal['role'], 'viewAll');
        $canViewOwn = RoleCapabilities::allows((string) $principal['role'], 'viewOwn');
        if (! $canViewAll && ! $canViewOwn) {
            throw new ApiException(403, 'FORBIDDEN', 'Your role cannot access dashboard voucher data.');
        }

        [$from, $to, $periodDays] = $this->dateRange($fromInput, $toInput, 'dashboard');
        $previousFrom = $this->shiftDate($from, -$periodDays);
        $previousTo = $this->shiftDate($from, -1);
        $today = $this->today();

        $scopeSql = $canViewAll ? '' : ' AND created_by_user_id = :scope_actor';
        $scopeParams = $canViewAll ? [] : ['scope_actor' => (string) $principal['id']];

        $currentSql = 'SELECT
                SUM(CASE WHEN voucher_type = \'PAYMENT\' AND approval_status IN '.self::APPROVED_SQL.' THEN 1 ELSE 0 END) AS payment_count,
                SUM(CASE WHEN voucher_type = \'PAYMENT\' AND approval_status IN '.self::APPROVED_SQL.' AND amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.' THEN 1 ELSE 0 END) AS valid_payment_count,
                SUM(CASE WHEN voucher_type = \'PAYMENT\' AND approval_status IN '.self::APPROVED_SQL.' AND amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.' THEN amount_paise ELSE 0 END) AS paid_paise,
                SUM(CASE WHEN voucher_type = \'RECEIPT\' THEN 1 ELSE 0 END) AS receipt_count,
                SUM(CASE WHEN voucher_type = \'RECEIPT\' AND amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.' THEN amount_paise ELSE 0 END) AS received_paise
            FROM vouchers
            WHERE status = \'ACTIVE\' AND business_date BETWEEN :current_from AND :current_to'.$scopeSql;
        $current = $this->fetchOne($pdo, $currentSql, [
            'current_from' => $from,
            'current_to' => $to,
            ...$scopeParams,
        ]);

        $previousSql = 'SELECT COALESCE(SUM(amount_paise), 0) AS paid_paise
            FROM vouchers
            WHERE status = \'ACTIVE\'
              AND voucher_type = \'PAYMENT\'
              AND approval_status IN '.self::APPROVED_SQL.'
              AND amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.'
              AND business_date BETWEEN :previous_from AND :previous_to'.$scopeSql;
        $previous = $this->fetchOne($pdo, $previousSql, [
            'previous_from' => $previousFrom,
            'previous_to' => $previousTo,
            ...$scopeParams,
        ]);

        $todaySql = 'SELECT
                COUNT(*) AS payment_count,
                COALESCE(SUM(CASE WHEN amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.' THEN amount_paise ELSE 0 END), 0) AS paid_paise
            FROM vouchers
            WHERE status = \'ACTIVE\'
              AND voucher_type = \'PAYMENT\'
              AND approval_status IN '.self::APPROVED_SQL.'
              AND business_date = :today'.$scopeSql;
        $todaySummary = $this->fetchOne($pdo, $todaySql, [
            'today' => $today,
            ...$scopeParams,
        ]);

        $allSql = 'SELECT
                COALESCE(SUM(CASE WHEN voucher_type = \'PAYMENT\' AND approval_status IN '.self::APPROVED_SQL.' AND amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.' THEN amount_paise ELSE 0 END), 0) AS payment_paise,
                COALESCE(SUM(CASE WHEN voucher_type = \'RECEIPT\' AND amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.' THEN amount_paise ELSE 0 END), 0) AS receipt_paise,
                SUM(CASE WHEN amount_paise < 1 OR amount_paise > '.self::MAX_AMOUNT_PAISE.' THEN 1 ELSE 0 END) AS invalid_amount_count,
                SUM(CASE WHEN voucher_type = \'PAYMENT\' AND approval_status NOT IN '.self::APPROVED_SQL.' THEN 1 ELSE 0 END) AS approval_exception_count
            FROM vouchers
            WHERE status = \'ACTIVE\''.$scopeSql;
        $all = $this->fetchOne($pdo, $allSql, $scopeParams);

        $qualitySql = 'SELECT
                SUM(CASE WHEN id IS NULL OR TRIM(id) = \'\' OR voucher_type NOT IN (\'PAYMENT\', \'RECEIPT\') OR status NOT IN (\'ACTIVE\', \'CANCELLED\') THEN 1 ELSE 0 END) AS malformed_record_count,
                SUM(CASE WHEN vendor_name_snapshot IS NULL OR category IS NULL OR created_by_email_snapshot IS NULL OR voucher_type IS NULL OR status IS NULL THEN 1 ELSE 0 END) AS malformed_field_count
            FROM vouchers'.$this->scopePredicate($canViewAll);
        $quality = $this->fetchOne($pdo, $qualitySql, $scopeParams);

        $largestSql = 'SELECT amount_paise, vendor_name_snapshot
            FROM vouchers
            WHERE status = \'ACTIVE\'
              AND voucher_type = \'PAYMENT\'
              AND approval_status IN '.self::APPROVED_SQL.'
              AND amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.'
              AND business_date BETWEEN :largest_from AND :largest_to'.$scopeSql.'
            ORDER BY amount_paise DESC, vendor_name_snapshot ASC
            LIMIT 1';
        $largest = $this->fetchOne($pdo, $largestSql, [
            'largest_from' => $from,
            'largest_to' => $to,
            ...$scopeParams,
        ], false);

        $trendMonthly = $periodDays > 62;
        $trendKey = $trendMonthly
            ? "DATE_FORMAT(business_date, '%Y-%m')"
            : 'DATE_FORMAT(business_date, \'%Y-%m-%d\')';
        $trendSql = 'SELECT '.$trendKey.' AS period_key,
                COALESCE(SUM(CASE WHEN amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.' THEN amount_paise ELSE 0 END), 0) AS amount_paise
            FROM vouchers
            WHERE status = \'ACTIVE\'
              AND voucher_type = \'PAYMENT\'
              AND approval_status IN '.self::APPROVED_SQL.'
              AND business_date BETWEEN :trend_from AND :trend_to'.$scopeSql.'
            GROUP BY period_key
            ORDER BY period_key';
        $trendRows = $this->fetchAll($pdo, $trendSql, [
            'trend_from' => $from,
            'trend_to' => $to,
            ...$scopeParams,
        ]);
        $trendMap = [];
        foreach ($trendRows as $row) {
            $trendMap[(string) $row['period_key']] = (int) $row['amount_paise'];
        }
        $trendKeys = $this->trendKeys($from, $to, $periodDays, $trendMonthly);
        $trend = [];
        foreach ($trendKeys as $key) {
            $trend[] = ['date' => $key, 'amount' => $this->formatPaise($trendMap[$key] ?? 0)];
        }

        $groupScope = 'status = \'ACTIVE\' AND voucher_type = \'PAYMENT\' AND approval_status IN '.self::APPROVED_SQL.' AND business_date BETWEEN :group_from AND :group_to'.$scopeSql;
        $groupParams = [
            'group_from' => $from,
            'group_to' => $to,
            ...$scopeParams,
        ];
        $topVendors = $this->groupRows($pdo, $groupScope, $groupParams, 'vendor_name_snapshot', 10);
        $byCategory = $this->groupRows($pdo, $groupScope, $groupParams, 'category', 10);
        $byPaymentMethod = $this->groupPaymentMethods($pdo, $groupScope, $groupParams, 5);
        $byTeamMember = $canViewAll
            ? $this->groupRows($pdo, $groupScope, $groupParams, 'created_by_email_snapshot', 10)
            : [];

        $openingBalancePaise = $canViewAll ? $this->openingBalancePaise($pdo) : 0;
        $paymentCount = (int) ($current['payment_count'] ?? 0);
        $validPaymentCount = (int) ($current['valid_payment_count'] ?? 0);

        return [
            'from' => $from,
            'to' => $to,
            'periodDays' => $periodDays,
            'trendMonthly' => $trendMonthly,
            'trend' => $trend,
            'paid' => $this->formatPaise((int) ($current['paid_paise'] ?? 0)),
            'previousPaid' => $this->formatPaise((int) ($previous['paid_paise'] ?? 0)),
            'paymentCount' => $paymentCount,
            'validPaymentCount' => $validPaymentCount,
            'largest' => is_array($largest) && isset($largest['amount_paise'])
                ? [
                    'amount' => $this->formatPaise((int) $largest['amount_paise']),
                    'vendor' => (string) ($largest['vendor_name_snapshot'] ?? ''),
                ]
                : null,
            'todayPaid' => $this->formatPaise((int) ($todaySummary['paid_paise'] ?? 0)),
            'todayPaymentCount' => (int) ($todaySummary['payment_count'] ?? 0),
            'received' => $this->formatPaise((int) ($current['received_paise'] ?? 0)),
            'receiptCount' => (int) ($current['receipt_count'] ?? 0),
            'bookBalance' => $this->formatPaise(
                $openingBalancePaise
                + (int) ($all['receipt_paise'] ?? 0)
                - (int) ($all['payment_paise'] ?? 0),
            ),
            'topVendors' => $topVendors,
            'byCategory' => $byCategory,
            'byPaymentMethod' => $byPaymentMethod,
            'byTeamMember' => $byTeamMember,
            'approvalExceptionCount' => (int) ($all['approval_exception_count'] ?? 0),
            'invalidAmountCount' => (int) ($all['invalid_amount_count'] ?? 0),
            'malformedRecordCount' => (int) ($quality['malformed_record_count'] ?? 0),
            'malformedFieldCount' => (int) ($quality['malformed_field_count'] ?? 0),
        ];
    }

    /**
     * Read-only recorded-movement report. The Accountant capability is deliberately
     * sufficient for this endpoint but does not grant voucher-register or dashboard access.
     *
     * @param array<string, mixed> $filters
     * @param array<string, mixed> $principal
     * @return array<string, mixed>
     */
    public function recordedMovementReport(PDO $pdo, array $filters, array $principal): array
    {
        RoleCapabilities::require($principal, 'reports');

        [$from, $to] = $this->dateRange($filters['from'] ?? null, $filters['to'] ?? null, 'report');
        $type = $this->enum($filters['type'] ?? 'ALL', ['ALL', 'PAYMENT', 'RECEIPT'], 'voucher type');
        $status = $this->enum($filters['status'] ?? 'ACTIVE', ['ALL', 'ACTIVE', 'CANCELLED'], 'voucher status');
        $paymentMethod = $this->enum(
            $filters['paymentMethod'] ?? 'ALL',
            ['ALL', 'CASH', 'UPI', 'BANK_TRANSFER', 'UNRECORDED', 'UNRECOGNIZED'],
            'payment method',
        );
        $offset = $this->integer($filters['offset'] ?? 0, 0, 1_000_000, 'page offset');
        $limit = $this->integer($filters['limit'] ?? self::PAGE_DEFAULT, 1, self::PAGE_MAX, 'page size');

        $where = ['v.business_date BETWEEN :from_date AND :to_date'];
        $params = ['from_date' => $from, 'to_date' => $to];
        if ($type !== 'ALL') {
            $where[] = 'v.voucher_type = :voucher_type';
            $params['voucher_type'] = $type;
        }
        if ($status !== 'ALL') {
            $where[] = 'v.status = :voucher_status';
            $params['voucher_status'] = $status;
        }
        $methodPredicate = $this->paymentMethodPredicate($paymentMethod, 'v.payment_method');
        if ($methodPredicate !== '') {
            $where[] = $methodPredicate;
        }
        $whereSql = ' WHERE '.implode(' AND ', $where);
        $vendorJoin = ' LEFT JOIN (
                SELECT LOWER(TRIM(display_name)) AS name_key,
                       COUNT(*) AS match_count,
                       MIN(id) AS only_vendor_id
                FROM vendors
                GROUP BY LOWER(TRIM(display_name))
            ) vendor_match ON vendor_match.name_key = LOWER(TRIM(v.vendor_name_snapshot)) ';

        $summarySql = 'SELECT
                COUNT(*) AS total_count,
                SUM(CASE WHEN v.status = \'ACTIVE\' THEN 1 ELSE 0 END) AS active_count,
                SUM(CASE WHEN v.status = \'CANCELLED\' THEN 1 ELSE 0 END) AS cancelled_count,
                SUM(CASE WHEN v.status = \'ACTIVE\' AND v.voucher_type = \'PAYMENT\' AND v.approval_status = \'PENDING\' THEN 1 ELSE 0 END) AS pending_approval_count,
                SUM(CASE WHEN v.status = \'ACTIVE\' AND v.voucher_type = \'PAYMENT\' AND v.approval_status NOT IN '.self::APPROVED_SQL.' THEN 1 ELSE 0 END) AS approval_exception_count,
                SUM(CASE WHEN v.amount_paise < 1 OR v.amount_paise > '.self::MAX_AMOUNT_PAISE.' THEN 1 ELSE 0 END) AS invalid_amount_count,
                SUM(CASE WHEN v.voucher_type = \'PAYMENT\' AND v.approval_status IN '.self::APPROVED_SQL.' AND v.amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.' THEN v.amount_paise ELSE 0 END) AS payment_total_paise,
                SUM(CASE WHEN v.voucher_type = \'RECEIPT\' AND v.amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.' THEN v.amount_paise ELSE 0 END) AS receipt_total_paise,
                SUM(CASE WHEN v.status = \'ACTIVE\' AND v.voucher_type = \'PAYMENT\' AND v.approval_status IN '.self::APPROVED_SQL.' AND v.amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.' THEN v.amount_paise ELSE 0 END) AS active_payment_total_paise,
                SUM(CASE WHEN v.status = \'ACTIVE\' AND v.voucher_type = \'RECEIPT\' AND v.amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.' THEN v.amount_paise ELSE 0 END) AS active_receipt_total_paise,
                SUM(CASE WHEN v.vendor_id IS NULL AND (vendor_match.match_count IS NULL OR vendor_match.match_count <> 1) AND v.vendor_name_snapshot <> \'\' THEN 1 ELSE 0 END) AS unresolved_vendor_count,
                SUM(CASE WHEN v.vendor_id IS NULL AND vendor_match.match_count > 1 AND v.vendor_name_snapshot <> \'\' THEN 1 ELSE 0 END) AS ambiguous_vendor_count,
                SUM(CASE WHEN v.vendor_id IS NULL AND vendor_match.match_count IS NULL AND v.vendor_name_snapshot <> \'\' THEN 1 ELSE 0 END) AS unmatched_vendor_count
            FROM vouchers v'.$vendorJoin.$whereSql;
        $summary = $this->fetchOne($pdo, $summarySql, $params);

        $methodSql = 'SELECT
                CASE
                    WHEN v.payment_method IS NULL OR TRIM(v.payment_method) = \'\' THEN \'Not recorded\'
                    WHEN v.payment_method = \'CASH\' THEN \'Cash\'
                    WHEN v.payment_method = \'UPI\' THEN \'UPI\'
                    WHEN v.payment_method = \'BANK_TRANSFER\' THEN \'Bank transfer\'
                    ELSE \'Unrecognized method\'
                END AS method_label,
                COUNT(*) AS row_count,
                SUM(CASE WHEN v.amount_paise BETWEEN 0 AND '.self::MAX_AMOUNT_PAISE.' THEN v.amount_paise ELSE 0 END) AS amount_paise
            FROM vouchers v'.$whereSql.'
              AND v.status = \'ACTIVE\'
              AND v.voucher_type = \'PAYMENT\'
              AND v.approval_status IN '.self::APPROVED_SQL.'
            GROUP BY method_label
            ORDER BY amount_paise DESC, method_label ASC
            LIMIT 5';
        $methodRows = $this->fetchAll($pdo, $methodSql, $params);
        $byPaymentMethod = array_map(
            fn (array $row): array => [
                'k' => (string) $row['method_label'],
                'n' => (int) $row['row_count'],
                's' => $this->formatPaise((int) $row['amount_paise']),
            ],
            $methodRows,
        );

        $pageSql = 'SELECT
                v.id, v.voucher_number, v.business_date, v.vendor_name_snapshot, v.vendor_id,
                vendor_match.match_count AS vendor_match_count,
                vendor_match.only_vendor_id AS matched_vendor_id,
                v.vendor_type, v.payment_method, v.category, v.notes, v.voucher_type,
                v.status, v.amount_paise, v.created_by_email_snapshot, v.cancel_reason,
                v.approval_status, approver.email AS approver_email, v.approved_at_utc,
                v.approval_reason, v.cash_impact
            FROM vouchers v'.$vendorJoin.'
            LEFT JOIN users approver ON approver.id = v.approved_by_user_id'.$whereSql.'
            ORDER BY v.business_date ASC, v.voucher_type ASC, CAST(v.voucher_number AS UNSIGNED) ASC, v.id ASC
            LIMIT :page_limit OFFSET :page_offset';
        $pageParams = $params;
        $pageParams['page_limit'] = $limit;
        $pageParams['page_offset'] = $offset;
        $rows = $this->fetchAll($pdo, $pageSql, $pageParams, ['page_limit', 'page_offset']);

        $items = [];
        foreach ($rows as $row) {
            $paise = $this->tryPaise($row['amount_paise'] ?? null);
            $vendorId = $row['vendor_id'] === null
                ? ((int) ($row['vendor_match_count'] ?? 0) === 1 ? (string) $row['matched_vendor_id'] : '')
                : (string) $row['vendor_id'];
            $items[] = [
                'id' => (string) $row['id'],
                'voucherNo' => (string) $row['voucher_number'],
                'date' => (string) $row['business_date'],
                'vendor' => (string) $row['vendor_name_snapshot'],
                'vendorId' => $vendorId,
                'vendorType' => (string) $row['vendor_type'],
                'paymentMethod' => (string) $row['payment_method'],
                'category' => (string) $row['category'],
                'notes' => (string) $row['notes'],
                'type' => (string) $row['voucher_type'],
                'status' => (string) $row['status'],
                'amount' => $paise === null ? null : $this->formatPaise($paise),
                'amountValid' => $paise !== null,
                'createdBy' => (string) $row['created_by_email_snapshot'],
                'cancelReason' => (string) $row['cancel_reason'],
                'approvalStatus' => (string) ($row['approval_status'] ?: 'NOT_REQUIRED'),
                'approvedBy' => (string) ($row['approver_email'] ?? ''),
                'approvedAt' => $row['approved_at_utc'] === null ? '' : (string) $row['approved_at_utc'],
                'approvalReason' => (string) $row['approval_reason'],
                'cashImpact' => (string) $row['cash_impact'],
            ];
        }

        return [
            'generatedAt' => gmdate('Y-m-d\TH:i:s\Z'),
            'from' => $from,
            'to' => $to,
            'type' => $type,
            'status' => $status,
            'paymentMethod' => $paymentMethod,
            'count' => (int) ($summary['total_count'] ?? 0),
            'activeCount' => (int) ($summary['active_count'] ?? 0),
            'cancelledCount' => (int) ($summary['cancelled_count'] ?? 0),
            'pendingApprovalCount' => (int) ($summary['pending_approval_count'] ?? 0),
            'unmatchedVendorCount' => (int) ($summary['unmatched_vendor_count'] ?? 0),
            'ambiguousVendorCount' => (int) ($summary['ambiguous_vendor_count'] ?? 0),
            'approvalExceptionCount' => (int) ($summary['approval_exception_count'] ?? 0),
            'invalidAmountCount' => (int) ($summary['invalid_amount_count'] ?? 0),
            'paymentTotal' => $this->formatPaise((int) ($summary['payment_total_paise'] ?? 0)),
            'receiptTotal' => $this->formatPaise((int) ($summary['receipt_total_paise'] ?? 0)),
            'activePaymentTotal' => $this->formatPaise((int) ($summary['active_payment_total_paise'] ?? 0)),
            'activeReceiptTotal' => $this->formatPaise((int) ($summary['active_receipt_total_paise'] ?? 0)),
            'byPaymentMethod' => $byPaymentMethod,
            'offset' => $offset,
            'limit' => $limit,
            'totalCount' => (int) ($summary['total_count'] ?? 0),
            'hasMore' => $offset + count($items) < (int) ($summary['total_count'] ?? 0),
            'items' => $items,
        ];
    }

    private function scopePredicate(bool $canViewAll): string
    {
        return $canViewAll ? '' : ' WHERE created_by_user_id = :scope_actor';
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function fetchOne(PDO $pdo, string $sql, array $params, bool $required = true): array
    {
        $statement = $pdo->prepare($sql);
        $this->bindValues($statement, $params);
        $statement->execute();
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if (! is_array($row)) {
            if (! $required) {
                return [];
            }
            throw new \RuntimeException('Reporting query did not return an aggregate row.');
        }

        return $row;
    }

    /**
     * @param array<string, mixed> $params
     * @param list<string> $integerParams
     * @return list<array<string, mixed>>
     */
    private function fetchAll(PDO $pdo, string $sql, array $params, array $integerParams = []): array
    {
        $statement = $pdo->prepare($sql);
        $this->bindValues($statement, $params, $integerParams);
        $statement->execute();

        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * @param array<string, mixed> $params
     * @param list<string> $integerParams
     */
    private function bindValues(\PDOStatement $statement, array $params, array $integerParams = []): void
    {
        foreach ($params as $key => $value) {
            $type = in_array((string) $key, $integerParams, true)
                ? PDO::PARAM_INT
                : (is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
            $statement->bindValue(':'.$key, $value, $type);
        }
    }

    /**
     * @param array<string, mixed> $params
     * @return list<array<string, mixed>>
     */
    private function groupRows(PDO $pdo, string $where, array $params, string $column, int $limit): array
    {
        $allowed = [
            'vendor_name_snapshot',
            'category',
            'created_by_email_snapshot',
        ];
        if (! in_array($column, $allowed, true)) {
            throw new \LogicException('Unsupported reporting group dimension.');
        }
        $sql = 'SELECT COALESCE(NULLIF(TRIM('.$column.'), \'\'), \'Other\') AS group_key,
                COUNT(*) AS row_count,
                SUM(CASE WHEN amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.' THEN amount_paise ELSE 0 END) AS amount_paise
            FROM vouchers WHERE '.$where.'
            GROUP BY group_key
            ORDER BY amount_paise DESC, group_key ASC
            LIMIT '.(int) $limit;
        $rows = $this->fetchAll($pdo, $sql, $params);

        return array_map(
            fn (array $row): array => [
                'k' => (string) $row['group_key'],
                'n' => (int) $row['row_count'],
                's' => $this->formatPaise((int) $row['amount_paise']),
            ],
            $rows,
        );
    }

    /**
     * @param array<string, mixed> $params
     * @return list<array<string, mixed>>
     */
    private function groupPaymentMethods(PDO $pdo, string $where, array $params, int $limit): array
    {
        $label = "CASE
            WHEN payment_method IS NULL OR TRIM(payment_method) = '' THEN 'Not recorded'
            WHEN payment_method = 'CASH' THEN 'Cash'
            WHEN payment_method = 'UPI' THEN 'UPI'
            WHEN payment_method = 'BANK_TRANSFER' THEN 'Bank transfer'
            ELSE 'Unrecognized method'
        END";
        $sql = 'SELECT '.$label.' AS group_key,
                COUNT(*) AS row_count,
                SUM(CASE WHEN amount_paise BETWEEN 1 AND '.self::MAX_AMOUNT_PAISE.' THEN amount_paise ELSE 0 END) AS amount_paise
            FROM vouchers WHERE '.$where.'
            GROUP BY group_key
            ORDER BY amount_paise DESC, group_key ASC
            LIMIT '.(int) $limit;
        $rows = $this->fetchAll($pdo, $sql, $params);

        return array_map(
            fn (array $row): array => [
                'k' => (string) $row['group_key'],
                'n' => (int) $row['row_count'],
                's' => $this->formatPaise((int) $row['amount_paise']),
            ],
            $rows,
        );
    }

    private function openingBalancePaise(PDO $pdo): int
    {
        $query = $pdo->prepare('SELECT value_json FROM settings WHERE setting_key = :key LIMIT 1');
        $query->execute(['key' => 'openingBalance']);
        $raw = $query->fetchColumn();
        if (! is_string($raw) || $raw === '') {
            return 0;
        }
        try {
            $decoded = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            return 0;
        }
        if (! is_numeric($decoded)) {
            return 0;
        }
        $number = (float) $decoded;
        if (! is_finite($number) || abs($number) > 1_000_000_000) {
            return 0;
        }

        return (int) round($number * 100);
    }

    private function paymentMethodPredicate(string $filter, string $column): string
    {
        return match ($filter) {
            'ALL' => '',
            'CASH', 'UPI', 'BANK_TRANSFER' => $column.' = \''.$filter.'\'',
            'UNRECORDED' => '('.$column.' IS NULL OR TRIM('.$column.') = \'\')',
            'UNRECOGNIZED' => '('.$column.' IS NOT NULL AND TRIM('.$column.') <> \'\' AND '.$column.' NOT IN (\'CASH\', \'UPI\', \'BANK_TRANSFER\'))',
            default => throw new ApiException(422, 'REPORT_FILTER_INVALID', 'Payment method filter is invalid.'),
        };
    }

    private function enum(mixed $value, array $allowed, string $label): string
    {
        if (! is_string($value) || ! in_array($value, $allowed, true)) {
            throw new ApiException(422, 'REPORT_FILTER_INVALID', 'Choose a valid '.$label.'.');
        }

        return $value;
    }

    private function integer(mixed $value, int $minimum, int $maximum, string $label): int
    {
        if (is_string($value) && preg_match('/^-?\d+$/D', $value)) {
            $value = (int) $value;
        }
        if (! is_int($value) || $value < $minimum || $value > $maximum) {
            throw new ApiException(422, 'REPORT_PAGE_INVALID', 'The '.$label.' is outside the supported range.');
        }

        return $value;
    }

    /** @return array{0:string,1:string,2:int} */
    private function dateRange(mixed $fromValue, mixed $toValue, string $label): array
    {
        if (! is_string($fromValue) || ! is_string($toValue) || ! $this->isDate($fromValue) || ! $this->isDate($toValue) || $fromValue > $toValue) {
            throw new ApiException(422, 'REPORT_DATE_INVALID', 'Choose a valid '.$label.' date range.');
        }
        $start = new DateTimeImmutable($fromValue.' 00:00:00', new DateTimeZone('UTC'));
        $end = new DateTimeImmutable($toValue.' 00:00:00', new DateTimeZone('UTC'));
        $days = (int) $start->diff($end)->format('%a') + 1;
        if ($days < 1 || $days > self::MAX_RANGE_DAYS) {
            throw new ApiException(422, 'REPORT_RANGE_TOO_LARGE', 'The reporting range cannot exceed ten years.');
        }

        return [$fromValue, $toValue, $days];
    }

    private function isDate(string $value): bool
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) {
            return false;
        }
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('Asia/Kolkata'));
        $errors = DateTimeImmutable::getLastErrors();

        return $date !== false
            && ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0))
            && $date->format('Y-m-d') === $value;
    }

    private function shiftDate(string $date, int $days): string
    {
        return (new DateTimeImmutable($date.' 00:00:00', new DateTimeZone('UTC')))
            ->modify(($days >= 0 ? '+' : '').$days.' days')->format('Y-m-d');
    }

    private function today(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('Asia/Kolkata')))->format('Y-m-d');
    }

    /** @param list<string> $keys @return list<string> */
    private function trendKeys(string $from, string $to, int $periodDays, bool $monthly): array
    {
        $keys = [];
        if ($monthly) {
            $cursor = new DateTimeImmutable(substr($from, 0, 7).'-01 00:00:00', new DateTimeZone('UTC'));
            $finalMonth = substr($to, 0, 7);
            while ($cursor->format('Y-m') <= $finalMonth) {
                $keys[] = $cursor->format('Y-m');
                $cursor = $cursor->modify('+1 month');
            }

            return $keys;
        }

        $cursor = new DateTimeImmutable($from.' 00:00:00', new DateTimeZone('UTC'));
        for ($index = 0; $index < $periodDays; $index++) {
            $keys[] = $cursor->format('Y-m-d');
            $cursor = $cursor->modify('+1 day');
        }

        return $keys;
    }

    private function tryPaise(mixed $value): ?int
    {
        if (! is_numeric($value) || ! preg_match('/^-?\d+$/D', (string) $value)) {
            return null;
        }
        $paise = (int) $value;
        if ($paise < 1 || $paise > self::MAX_AMOUNT_PAISE) {
            return null;
        }

        return $paise;
    }

    private function formatPaise(int $paise): string
    {
        $negative = $paise < 0 ? '-' : '';
        $absolute = abs($paise);

        return $negative.intdiv($absolute, 100).'.'.str_pad((string) ($absolute % 100), 2, '0', STR_PAD_LEFT);
    }
}
