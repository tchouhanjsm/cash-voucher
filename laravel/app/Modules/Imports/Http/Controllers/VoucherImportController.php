<?php

declare(strict_types=1);

namespace App\Modules\Imports\Http\Controllers;

use App\Modules\Identity\RoleCapabilities;
use App\Modules\Imports\Actions\VoucherImportService;
use App\Modules\Imports\Http\Requests\VoucherImportRequest;
use App\Modules\Shared\ApiResponse;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

final class VoucherImportController
{
    public function store(VoucherImportRequest $request, VoucherImportService $action): JsonResponse
    {
        $principal = $request->attributes->get('principal');
        if (! is_array($principal) || ! isset($principal['id'], $principal['role'], $principal['email'])) {
            throw new ApiException(401, 'SESSION_REQUIRED', 'Sign in to continue.');
        }

        RoleCapabilities::require($principal, 'create');
        RoleCapabilities::require($principal, 'bulk');

        $batchId = (string) $request->validated()['batchId'];
        $idempotencyKey = (string) $request->header('Idempotency-Key', '');
        if (! hash_equals($batchId, $idempotencyKey)) {
            throw new ApiException(422, 'IDEMPOTENCY_KEY_REQUIRED', 'The Idempotency-Key must match the stable import batch ID.');
        }

        $result = $action->execute(
            DB::connection()->getPdo(),
            $request->validated(),
            $principal,
        );

        return ApiResponse::success(
            $result,
            (string) $request->attributes->get('request_id'),
        );
    }
}
