<?php

declare(strict_types=1);

namespace App\Modules\Vendors\Http\Controllers;

use App\Modules\Identity\RoleCapabilities;
use App\Modules\Shared\ApiResponse;
use App\Modules\Vendors\Actions\VendorCatalog;
use App\Modules\Vendors\Http\Requests\SaveVendorRequest;
use App\Modules\Vendors\Http\Requests\SetVendorActiveRequest;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class VendorController
{
    public function index(Request $request): JsonResponse
    {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'vendors');

        $limit = filter_var($request->query('limit', 100), FILTER_VALIDATE_INT);
        $offset = filter_var($request->query('offset', 0), FILTER_VALIDATE_INT);
        if ($limit === false || $limit < 1 || $limit > 100 || $offset === false || $offset < 0 || $offset > 1_000_000) {
            throw new ApiException(422, 'PAGE_INVALID', 'Vendor page limit or offset is invalid.');
        }

        $includeInactiveRaw = $request->query('includeInactive', 'false');
        if (! in_array($includeInactiveRaw, ['true', 'false', '1', '0', 1, 0, true, false], true)) {
            throw new ApiException(422, 'FILTER_INVALID', 'The includeInactive filter is invalid.');
        }
        $includeInactive = filter_var($includeInactiveRaw, FILTER_VALIDATE_BOOLEAN);

        $search = trim((string) $request->query('q', ''));
        if (mb_strlen($search, 'UTF-8') > 80) {
            throw new ApiException(422, 'FILTER_INVALID', 'Vendor search must not exceed 80 characters.');
        }

        $query = DB::table('vendors');
        if (! $includeInactive) {
            $query->where('is_active', 1);
        }
        if ($search !== '') {
            $query->where('display_name', 'like', '%'.$search.'%');
        }

        $totalCount = (clone $query)->count();
        $rows = $query
            ->orderBy('display_name')
            ->orderBy('id')
            ->offset($offset)
            ->limit($limit)
            ->get([
                'id', 'display_name', 'company_name', 'mobile', 'is_active',
                'default_category', 'default_payment_method', 'created_at_utc', 'updated_at_utc',
            ]);

        $items = $rows->map(static fn (object $row): array => [
            'id' => (string) $row->id,
            'name' => (string) $row->display_name,
            'company' => (string) $row->company_name,
            'mobile' => (string) $row->mobile,
            'active' => (int) $row->is_active === 1,
            'defaultCategory' => (string) $row->default_category,
            'defaultPaymentMethod' => (string) $row->default_payment_method,
            'createdAt' => (string) $row->created_at_utc,
            'updatedAt' => (string) $row->updated_at_utc,
        ])->all();

        return ApiResponse::success([
            'items' => $items,
            'offset' => $offset,
            'limit' => $limit,
            'totalCount' => $totalCount,
            'hasMore' => $offset + count($items) < $totalCount,
            'includesInactive' => $includeInactive,
        ], (string) $request->attributes->get('request_id'));
    }

    public function store(SaveVendorRequest $request, VendorCatalog $action): JsonResponse
    {
        return $this->save($request, $action, null, 201);
    }

    public function update(SaveVendorRequest $request, VendorCatalog $action, string $vendorId): JsonResponse
    {
        return $this->save($request, $action, $vendorId, 200);
    }

    public function setActive(
        SetVendorActiveRequest $request,
        VendorCatalog $action,
        string $vendorId,
    ): JsonResponse {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'vendors');

        $result = $action->setActive(
            DB::connection()->getPdo(),
            $vendorId,
            $request->boolean('active'),
            $principal,
            $this->idempotencyKey($request),
        );

        return ApiResponse::success([
            'vendor' => $result['data']['vendor'],
            'replayed' => $result['replayed'],
        ], (string) $request->attributes->get('request_id'), $result['replayed'] ? 200 : 200);
    }

    private function save(
        SaveVendorRequest $request,
        VendorCatalog $action,
        ?string $vendorId,
        int $createdStatus,
    ): JsonResponse {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'vendors');

        $result = $action->save(
            DB::connection()->getPdo(),
            $request->validated(),
            $principal,
            $this->idempotencyKey($request),
            $vendorId,
        );

        return ApiResponse::success([
            'vendor' => $result['data']['vendor'],
            'replayed' => $result['replayed'],
        ], (string) $request->attributes->get('request_id'), $result['replayed'] ? 200 : $createdStatus);
    }

    private function idempotencyKey(Request $request): string
    {
        $key = (string) $request->header('Idempotency-Key', '');
        if (! preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $key)) {
            throw new ApiException(
                422,
                'IDEMPOTENCY_KEY_REQUIRED',
                'Send a valid Idempotency-Key header for every vendor write request.',
            );
        }

        return $key;
    }

    /** @return array{id:string,name:string,email:string,role:string,mustChangePassword:bool,sessionId:string} */
    private function principal(Request $request): array
    {
        $principal = $request->attributes->get('principal');
        if (! is_array($principal) || ! isset($principal['id'], $principal['role'], $principal['email'])) {
            throw new ApiException(401, 'SESSION_REQUIRED', 'Sign in to continue.');
        }

        return $principal;
    }
}
