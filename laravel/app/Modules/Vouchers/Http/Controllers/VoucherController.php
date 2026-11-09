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

        if ($limit === false || $limit < 1 || $limit > 100 || $offset === false || $offset < 0 || $offset > 1_000_000) {
            throw new ApiException(422, 'PAGE_INVALID', 'Voucher page limit or offset is invalid.');
        }

        $query = DB::table('vouchers');
        if (! $canViewAll) {
            $query->where('created_by_user_id', $principal['id']);
        }

        $from = (string) $request->query('from', '');
        $to = (string) $request->query('to', '');
        $type = (string) $request->query('type', '');
        $status = (string) $request->query('status', 'ACTIVE');

        if ($from !== '') {
            if (! preg_match('/^\d{4}-\d{2}-\d{2}$/D', $from)) {
                throw new ApiException(422, 'FILTER_INVALID', 'Start date filter is invalid.');
            }
            $query->where('business_date', '>=', $from);
        }

        if ($to !== '') {
            if (! preg_match('/^\d{4}-\d{2}-\d{2}$/D', $to)) {
                throw new ApiException(422, 'FILTER_INVALID', 'End date filter is invalid.');
            }
            $query->where('business_date', '<=', $to);
        }

        if ($from !== '' && $to !== '' && $from > $to) {
            throw new ApiException(422, 'FILTER_INVALID', 'Start date must be on or before end date.');
        }

        if ($type !== '') {
            if (! in_array($type, ['PAYMENT', 'RECEIPT'], true)) {
                throw new ApiException(422, 'FILTER_INVALID', 'Voucher type filter is invalid.');
            }
            $query->where('voucher_type', $type);
        }

        if (! in_array($status, ['ACTIVE', 'CANCELLED', 'ALL'], true)) {
            throw new ApiException(422, 'FILTER_INVALID', 'Voucher status filter is invalid.');
        }
        if ($status !== 'ALL') {
            $query->where('status', $status);
        }

        $totalCount = (clone $query)->count();
        $rows = $query
            ->orderByDesc('business_date')
            ->orderByDesc('created_at_utc')
            ->offset($offset)
            ->limit($limit)
            ->get();

        $items = $rows->map(static function (object $row): array {
            $paise = (int) $row->amount_paise;
            $receiptIds = DB::table('voucher_receipts')
                ->where('voucher_id', (string) $row->id)
                ->orderBy('created_at_utc')
                ->orderBy('id')
                ->pluck('id')
                ->map(static fn ($id): string => (string) $id)
                ->all();

            return [
                'id' => (string) $row->id,
                'voucherNo' => (string) $row->voucher_number,
                'date' => (string) $row->business_date,
                'vendor' => (string) $row->vendor_name_snapshot,
                'vendorId' => $row->vendor_id === null ? null : (string) $row->vendor_id,
                'vendorType' => (string) $row->vendor_type,
                'amount' => intdiv($paise, 100).'.'.str_pad((string) ($paise % 100), 2, '0', STR_PAD_LEFT),
                'amountPaise' => $paise,
                'category' => (string) $row->category,
                'notes' => (string) $row->notes,
                'type' => (string) $row->voucher_type,
                'status' => (string) $row->status,
                'cashImpact' => (string) $row->cash_impact,
                'approvalStatus' => (string) $row->approval_status,
                'paymentMethod' => (string) $row->payment_method,
                'createdBy' => (string) $row->created_by_email_snapshot,
                'receipts' => $receiptIds,
            ];
        })->all();

        $requestId = (string) $request->attributes->get('request_id');
        return ApiResponse::success([
            'items' => $items,
            'offset' => $offset,
            'limit' => $limit,
            'totalCount' => $totalCount,
            'hasMore' => $offset + count($items) < $totalCount,
        ], $requestId);
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
