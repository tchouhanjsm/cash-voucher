<?php

namespace App\Modules\Vouchers\Http\Controllers;

use App\Modules\Identity\RoleCapabilities;
use App\Modules\Shared\ApiResponse;
use App\Modules\Vouchers\Actions\StoreVoucher;
use App\Modules\Vouchers\Actions\VoucherLifecycle;
use App\Modules\Vouchers\Http\Requests\UpdateVoucherRequest;
use App\Modules\Vouchers\Http\Requests\CancelVoucherRequest;
use App\Modules\Vouchers\Http\Requests\ApproveVoucherRequest;
use App\Modules\Vouchers\Http\Requests\RejectVoucherRequest;
use App\Modules\Vouchers\Http\Requests\StoreVoucherRequest;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use PDO;

final class VoucherController
{
    public function index(Request $request): JsonResponse
    {
        $principal = $this->principal($request);
        $canViewAll = RoleCapabilities::allows($principal['role'], 'viewAll');
        if (! $canViewAll && ! RoleCapabilities::allows($principal['role'], 'viewOwn')) {
            throw new ApiException(403, 'FORBIDDEN', 'Your role cannot access the voucher register.');
        }

        $limit = filter_var($request->query('limit', 100), FILTER_VALIDATE_INT);
        $offset = filter_var($request->query('offset', 0), FILTER_VALIDATE_INT);
        if ($limit === false || $limit < 1 || $limit > 200 || $offset === false || $offset < 0 || $offset > 1_000_000) {
            throw new ApiException(422, 'PAGE_INVALID', 'Voucher page limit or offset is invalid.');
        }

        $search = $this->filterText($request, 'q', 'Search', 120);
        $vendor = $this->filterText($request, 'vendor', 'Vendor', 200);
        $category = $this->filterText($request, 'cat', 'Category', 120);
        $createdBy = strtolower($this->filterText($request, 'user', 'User', 254));
        $from = $this->filterDate($request, 'from', 'start');
        $to = $this->filterDate($request, 'to', 'end');
        $type = $this->filterText($request, 'type', 'Transaction type', 20);
        $status = $this->filterText($request, 'status', 'Status', 20) ?: 'ACTIVE';
        $approval = $this->filterText($request, 'approval', 'Approval status', 30) ?: 'ALL';
        $paymentMethod = $this->filterText($request, 'paymentMethod', 'Payment method', 20) ?: 'ALL';
        $cashImpact = $this->filterText($request, 'cashImpact', 'Physical cash movement', 20) ?: 'ALL';
        $amountValidity = $this->filterText($request, 'amountValidity', 'Amount review', 20) ?: 'ALL';

        if ($from !== '' && $to !== '' && $from > $to) {
            throw new ApiException(422, 'FILTER_INVALID', 'Start date must be on or before end date.');
        }
        if (! in_array($type, ['', 'PAYMENT', 'RECEIPT'], true)) {
            throw new ApiException(422, 'FILTER_INVALID', 'Voucher type filter is invalid.');
        }
        if (! in_array($status, ['ACTIVE', 'CANCELLED', 'ALL'], true)) {
            throw new ApiException(422, 'FILTER_INVALID', 'Voucher status filter is invalid.');
        }
        if (! in_array($approval, ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'NOT_REQUIRED', 'REVIEW_REQUIRED'], true)) {
            throw new ApiException(422, 'FILTER_INVALID', 'Approval status filter is invalid.');
        }
        if (! in_array($paymentMethod, ['ALL', 'CASH', 'UPI', 'BANK_TRANSFER', 'UNRECORDED', 'UNRECOGNIZED'], true)) {
            throw new ApiException(422, 'FILTER_INVALID', 'Payment method filter is invalid.');
        }
        if (! in_array($cashImpact, ['ALL', 'CASH_IN', 'CASH_OUT', 'NO_CASH', 'UNCLASSIFIED'], true)) {
            throw new ApiException(422, 'FILTER_INVALID', 'Physical cash movement filter is invalid.');
        }
        if (! in_array($amountValidity, ['ALL', 'VALID', 'INVALID'], true)) {
            throw new ApiException(422, 'FILTER_INVALID', 'Amount review filter is invalid.');
        }
        if ($createdBy !== '' && ! $canViewAll) {
            throw new ApiException(403, 'FORBIDDEN', 'You cannot filter other users’ vouchers.');
        }

        // Facets are derived from the caller's complete visibility scope, not the
        // current page or active filter set, matching the legacy Register contract.
        $visibilityScope = DB::table('vouchers');
        if (! $canViewAll) {
            $visibilityScope->where('created_by_user_id', $principal['id']);
        }

        $vendors = (clone $visibilityScope)
            ->whereNotNull('vendor_name_snapshot')
            ->where('vendor_name_snapshot', '<>', '')
            ->select('vendor_name_snapshot')
            ->distinct()
            ->orderBy('vendor_name_snapshot')
            ->pluck('vendor_name_snapshot')
            ->map(static fn ($value): string => (string) $value)
            ->values()
            ->all();

        $users = (clone $visibilityScope)
            ->whereNotNull('created_by_email_snapshot')
            ->where('created_by_email_snapshot', '<>', '')
            ->selectRaw('LOWER(created_by_email_snapshot) AS email')
            ->distinct()
            ->orderBy('email')
            ->pluck('email')
            ->map(static fn ($value): string => (string) $value)
            ->values()
            ->all();

        $malformedRecordCount = (clone $visibilityScope)
            ->where(function ($query): void {
                $query
                    ->whereNull('id')
                    ->orWhere('id', '')
                    ->orWhereNotIn('voucher_type', ['PAYMENT', 'RECEIPT'])
                    ->orWhereNotIn('status', ['ACTIVE', 'CANCELLED']);
            })
            ->count();

        $malformedFieldCount = (clone $visibilityScope)
            ->where(function ($query): void {
                $query
                    ->whereNull('vendor_name_snapshot')
                    ->orWhereNull('category')
                    ->orWhereNull('created_by_email_snapshot')
                    ->orWhereNull('voucher_type')
                    ->orWhereNull('status');
            })
            ->count();

        $query = (clone $visibilityScope)
            ->whereIn('voucher_type', ['PAYMENT', 'RECEIPT'])
            ->whereIn('status', ['ACTIVE', 'CANCELLED']);

        if ($from !== '') {
            $query->where('business_date', '>=', $from);
        }
        if ($to !== '') {
            $query->where('business_date', '<=', $to);
        }
        if ($type !== '') {
            $query->where('voucher_type', $type);
        }
        if ($status !== 'ALL') {
            $query->where('status', $status);
        }
        if ($vendor !== '') {
            $query->where('vendor_name_snapshot', $vendor);
        }
        if ($category !== '') {
            $query->where('category', $category);
        }
        if ($createdBy !== '') {
            $query->whereRaw('LOWER(created_by_email_snapshot) = ?', [$createdBy]);
        }
        if ($approval !== 'ALL') {
            if ($approval === 'NOT_REQUIRED') {
                $query->where(function ($builder): void {
                    $builder
                        ->where('voucher_type', 'RECEIPT')
                        ->orWhere(function ($payment): void {
                            $payment
                                ->where('voucher_type', 'PAYMENT')
                                ->where('approval_status', 'NOT_REQUIRED');
                        });
                });
            } else {
                $query
                    ->where('voucher_type', 'PAYMENT')
                    ->where('approval_status', $approval);
            }
        }
        if ($paymentMethod === 'UNRECORDED') {
            $query->whereRaw("TRIM(payment_method) = ''");
        } elseif ($paymentMethod === 'UNRECOGNIZED') {
            $query
                ->whereRaw("TRIM(payment_method) <> ''")
                ->whereRaw("TRIM(payment_method) NOT IN (?, ?, ?)", ['CASH', 'UPI', 'BANK_TRANSFER']);
        } elseif ($paymentMethod !== 'ALL') {
            $query->whereRaw('TRIM(payment_method) = ?', [$paymentMethod]);
        }

        if ($cashImpact === 'UNCLASSIFIED') {
            $query->whereNotIn('cash_impact', ['CASH_IN', 'CASH_OUT', 'NO_CASH']);
        } elseif ($cashImpact !== 'ALL') {
            $query->where('cash_impact', $cashImpact);
        }

        if ($amountValidity === 'VALID') {
            $query->whereBetween('amount_paise', [1, 1_000_000_000]);
        } elseif ($amountValidity === 'INVALID') {
            $query->where(function ($builder): void {
                $builder->where('amount_paise', '<=', 0)->orWhere('amount_paise', '>', 1_000_000_000);
            });
        }

        if ($search !== '') {
            $escaped = strtr(mb_strtolower($search, 'UTF-8'), [
                '!' => '!!',
                '%' => '!%',
                '_' => '!_',
            ]);
            $pattern = '%'.$escaped.'%';
            $query->where(function ($builder) use ($pattern): void {
                $builder
                    ->whereRaw(
                        "LOWER(CONCAT(CASE WHEN voucher_type = 'RECEIPT' THEN 'R-' ELSE '' END, voucher_number)) LIKE ? ESCAPE '!'",
                        [$pattern],
                    )
                    ->orWhereRaw("LOWER(vendor_name_snapshot) LIKE ? ESCAPE '!'", [$pattern])
                    ->orWhereRaw("LOWER(notes) LIKE ? ESCAPE '!'", [$pattern]);
            });
        }

        $totalCount = (clone $query)->count();

        // Register totals describe the entire filtered result set, not this page.
        // Invalid amounts remain visible for review but never enter financial sums.
        $activeQuery = (clone $query)->where('status', 'ACTIVE');
        $validAmountQuery = static function ($builder): void {
            $builder->whereBetween('amount_paise', [1, 1_000_000_000]);
        };
        $paidPaise = (clone $activeQuery)
            ->where('voucher_type', 'PAYMENT')
            ->whereIn('approval_status', ['NOT_REQUIRED', 'APPROVED'])
            ->where($validAmountQuery)
            ->sum('amount_paise');
        $receivedPaise = (clone $activeQuery)
            ->where('voucher_type', 'RECEIPT')
            ->where($validAmountQuery)
            ->sum('amount_paise');
        $approvalExceptionCount = (clone $activeQuery)
            ->where('voucher_type', 'PAYMENT')
            ->whereNotIn('approval_status', ['NOT_REQUIRED', 'APPROVED'])
            ->count();
        $invalidAmountCount = (clone $activeQuery)
            ->where(function ($builder): void {
                $builder->where('amount_paise', '<=', 0)->orWhere('amount_paise', '>', 1_000_000_000);
            })
            ->count();

        $rows = (clone $query)
            ->leftJoin('users as approver', 'vouchers.approved_by_user_id', '=', 'approver.id')
            ->leftJoin('users as updater', 'vouchers.updated_by_user_id', '=', 'updater.id')
            ->select([
                'vouchers.*',
                'approver.full_name as approved_by_name',
                'updater.full_name as updated_by_name',
            ])
            ->orderByDesc('vouchers.created_at_utc')
            ->orderByRaw('CAST(vouchers.voucher_number AS UNSIGNED) DESC')
            ->offset($offset)
            ->limit($limit)
            ->get();

        $receiptIdsByVoucher = [];
        if ($rows->isNotEmpty()) {
            $receiptRows = DB::table('voucher_receipts')
                ->whereIn('voucher_id', $rows->pluck('id')->map(static fn ($id): string => (string) $id)->all())
                ->orderBy('created_at_utc')
                ->orderBy('id')
                ->get(['voucher_id', 'id']);

            foreach ($receiptRows as $receiptRow) {
                $receiptIdsByVoucher[(string) $receiptRow->voucher_id][] = (string) $receiptRow->id;
            }
        }

        $items = $rows->map(function (object $row) use ($receiptIdsByVoucher): array {
            $paise = (int) $row->amount_paise;

            return [
                'id' => (string) $row->id,
                'voucherNo' => (string) $row->voucher_number,
                'date' => (string) $row->business_date,
                'vendor' => (string) $row->vendor_name_snapshot,
                'vendorId' => $row->vendor_id === null ? null : (string) $row->vendor_id,
                'vendorType' => (string) $row->vendor_type,
                'amount' => $this->formatPaise($paise),
                'amountPaise' => $paise,
                'category' => (string) $row->category,
                'notes' => (string) $row->notes,
                'type' => (string) $row->voucher_type,
                'status' => (string) $row->status,
                'cashImpact' => (string) $row->cash_impact,
                'approvalStatus' => (string) $row->approval_status,
                'approvalReason' => (string) $row->approval_reason,
                'paymentMethod' => (string) $row->payment_method,
                'cancelReason' => (string) $row->cancel_reason,
                'createdBy' => (string) $row->created_by_email_snapshot,
                'createdAt' => (string) $row->created_at_utc,
                'updatedBy' => (string) ($row->updated_by_name ?? ''),
                'updatedAt' => (string) $row->updated_at_utc,
                'approvedBy' => (string) ($row->approved_by_name ?? ''),
                'approvedAt' => $row->approved_at_utc === null ? '' : (string) $row->approved_at_utc,
                'receipts' => $receiptIdsByVoucher[(string) $row->id] ?? [],
            ];
        })->all();

        return ApiResponse::success([
            'items' => $items,
            'offset' => $offset,
            'limit' => $limit,
            'totalCount' => $totalCount,
            'hasMore' => $offset + count($items) < $totalCount,
            'totals' => [
                'paid' => $this->formatPaise((int) $paidPaise),
                'received' => $this->formatPaise((int) $receivedPaise),
                'approvalExceptionCount' => $approvalExceptionCount,
                'invalidAmountCount' => $invalidAmountCount,
                'malformedRecordCount' => $malformedRecordCount,
                'malformedFieldCount' => $malformedFieldCount,
            ],
            'facets' => [
                'vendors' => $vendors,
                'users' => $users,
            ],
        ], (string) $request->attributes->get('request_id'));
    }

    private function filterText(Request $request, string $key, string $label, int $maxLength): string
    {
        $value = $request->query($key, '');
        if ($value === null || $value === '') {
            return '';
        }
        if (! is_string($value)) {
            throw new ApiException(422, 'FILTER_INVALID', $label.' filter is invalid.');
        }

        $value = trim($value);
        if (mb_strlen($value, 'UTF-8') > $maxLength) {
            throw new ApiException(422, 'FILTER_INVALID', $label.' filter is too long.');
        }

        return $value;
    }

    private function filterDate(Request $request, string $key, string $label): string
    {
        $date = $this->filterText($request, $key, ucfirst($label).' date', 10);
        if ($date === '') {
            return '';
        }

        if (
            ! preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $date, $matches)
            || ! checkdate((int) $matches[2], (int) $matches[3], (int) $matches[1])
        ) {
            throw new ApiException(422, 'FILTER_INVALID', ucfirst($label).' date filter is invalid.');
        }

        return $date;
    }

    private function formatPaise(int $paise): string
    {
        $negative = $paise < 0;
        $absolute = abs($paise);

        return ($negative ? '-' : '')
            .intdiv($absolute, 100)
            .'.'.str_pad((string) ($absolute % 100), 2, '0', STR_PAD_LEFT);
    }

    public function duplicateCheck(StoreVoucherRequest $request, StoreVoucher $action): JsonResponse
    {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'create');

        $pdo = DB::connection()->getPdo();
        $result = $action->duplicateCheck($pdo, $request->validated(), $principal);

        return ApiResponse::success(
            $result,
            (string) $request->attributes->get('request_id'),
        );
    }

    public function store(StoreVoucherRequest $request, StoreVoucher $action): JsonResponse
    {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'create');

        if ($request->boolean('bulk')) {
            throw new ApiException(
                422,
                'BULK_NOT_IMPLEMENTED',
                'This Laravel phase accepts one voucher per request. Bulk migration will be implemented separately.',
            );
        }

        $idempotencyKey = (string) $request->header('Idempotency-Key', '');
        if (! preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $idempotencyKey)) {
            throw new ApiException(
                422,
                'IDEMPOTENCY_KEY_REQUIRED',
                'Send a valid Idempotency-Key header for every voucher creation request.',
            );
        }

        $pdo = DB::connection()->getPdo();
        $result = $action->execute($pdo, $request->validated(), $principal, $idempotencyKey);

        return ApiResponse::success([
            'voucher' => $result['data'],
            'replayed' => $result['replayed'],
        ], (string) $request->attributes->get('request_id'), $result['replayed'] ? 200 : 201);
    }

    public function update(
        UpdateVoucherRequest $request,
        VoucherLifecycle $action,
        string $voucherId,
    ): JsonResponse {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'edit');
        $validated = $request->validated();
        $result = $action->update(
            DB::connection()->getPdo(),
            $voucherId,
            $validated['fields'],
            $validated['reason'],
            $principal,
            $this->idempotencyKey($request),
        );

        return ApiResponse::success([
            'voucher' => $result['data']['voucher'],
            'replayed' => $result['replayed'],
        ], (string) $request->attributes->get('request_id'));
    }

    public function cancel(
        CancelVoucherRequest $request,
        VoucherLifecycle $action,
        string $voucherId,
    ): JsonResponse {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'cancel');
        $validated = $request->validated();
        $result = $action->cancel(
            DB::connection()->getPdo(),
            $voucherId,
            $validated['reason'],
            $principal,
            $this->idempotencyKey($request),
        );

        return ApiResponse::success([
            'voucher' => $result['data']['voucher'],
            'replayed' => $result['replayed'],
        ], (string) $request->attributes->get('request_id'));
    }

    public function approve(
        ApproveVoucherRequest $request,
        VoucherLifecycle $action,
        string $voucherId,
    ): JsonResponse {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'approvePayments');
        $result = $action->decideApproval(
            DB::connection()->getPdo(),
            $voucherId,
            'APPROVE',
            '',
            $principal,
            $this->idempotencyKey($request),
        );

        return ApiResponse::success([
            'voucher' => $result['data']['voucher'],
            'replayed' => $result['replayed'],
        ], (string) $request->attributes->get('request_id'));
    }

    public function reject(
        RejectVoucherRequest $request,
        VoucherLifecycle $action,
        string $voucherId,
    ): JsonResponse {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'approvePayments');
        $validated = $request->validated();
        $result = $action->decideApproval(
            DB::connection()->getPdo(),
            $voucherId,
            'REJECT',
            $validated['reason'],
            $principal,
            $this->idempotencyKey($request),
        );

        return ApiResponse::success([
            'voucher' => $result['data']['voucher'],
            'replayed' => $result['replayed'],
        ], (string) $request->attributes->get('request_id'));
    }

    private function idempotencyKey(Request $request): string
    {
        $key = (string) $request->header('Idempotency-Key', '');
        if (! preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $key)) {
            throw new ApiException(
                422,
                'IDEMPOTENCY_KEY_REQUIRED',
                'Send a valid Idempotency-Key header for every voucher mutation request.',
            );
        }

        return $key;
    }

    /**
     * @return array{id:string,name:string,email:string,role:string,mustChangePassword:bool,sessionId:string}
     */
    private function principal(Request $request): array
    {
        $principal = $request->attributes->get('principal');

        if (! is_array($principal) || ! isset($principal['id'], $principal['role'], $principal['email'])) {
            throw new ApiException(401, 'SESSION_REQUIRED', 'Sign in to continue.');
        }

        return $principal;
    }
}
