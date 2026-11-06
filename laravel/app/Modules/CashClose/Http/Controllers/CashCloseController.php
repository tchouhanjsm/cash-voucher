<?php

declare(strict_types=1);

namespace App\Modules\CashClose\Http\Controllers;

use App\Modules\CashClose\Actions\CashCloseService;
use App\Modules\CashClose\Http\Requests\CreateCashCloseRequest;
use App\Modules\CashClose\Http\Requests\RecordCashCloseCorrectionRequest;
use App\Modules\Identity\RoleCapabilities;
use App\Modules\Shared\ApiResponse;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class CashCloseController
{
    public function preview(Request $request, CashCloseService $action): JsonResponse
    {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'cashClose');

        $date = $request->query('date');
        $openingCash = $request->query('openingCash');
        $openingReason = $request->query('openingReason', '');

        if ($date !== null && ! is_string($date)) {
            throw new ApiException(422, 'BUSINESS_DATE_INVALID', 'Business date must be text.');
        }
        if ($openingCash !== null && ! is_string($openingCash)) {
            throw new ApiException(422, 'CASH_AMOUNT_INVALID', 'Opening cash must be a decimal string.');
        }
        if (! is_string($openingReason)) {
            throw new ApiException(422, 'CASH_CLOSE_REASON_INVALID', 'Opening reason must be text.');
        }

        $result = $action->preview(
            DB::connection()->getPdo(),
            $date,
            $openingCash,
            $openingReason,
        );

        return ApiResponse::success($result, (string) $request->attributes->get('request_id'));
    }

    public function create(CreateCashCloseRequest $request, CashCloseService $action): JsonResponse
    {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'cashClose');
        $result = $action->create(
            DB::connection()->getPdo(),
            $request->validated(),
            $principal,
            $this->idempotencyKey($request),
        );

        return ApiResponse::success([
            'close' => $result['data']['close'],
            'replayed' => $result['replayed'],
        ], (string) $request->attributes->get('request_id'), $result['replayed'] ? 200 : 201);
    }

    public function recordCorrection(
        RecordCashCloseCorrectionRequest $request,
        CashCloseService $action,
        string $closeId,
    ): JsonResponse {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'cashClose');
        $result = $action->recordCorrection(
            DB::connection()->getPdo(),
            $closeId,
            $request->validated(),
            $principal,
            $this->idempotencyKey($request),
        );

        return ApiResponse::success([
            'correction' => $result['data']['correction'],
            'replayed' => $result['replayed'],
        ], (string) $request->attributes->get('request_id'), $result['replayed'] ? 200 : 201);
    }

    private function idempotencyKey(Request $request): string
    {
        $key = (string) $request->header('Idempotency-Key', '');
        if (! preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $key)) {
            throw new ApiException(
                422,
                'IDEMPOTENCY_KEY_REQUIRED',
                'Send a valid Idempotency-Key header for every cash-close mutation request.',
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
