<?php

declare(strict_types=1);

namespace App\Modules\Settings\Http\Controllers;

use App\Modules\Identity\RoleCapabilities;
use App\Modules\Settings\Actions\PropertySettings;
use App\Modules\Settings\Http\Requests\SaveSettingsRequest;
use App\Modules\Shared\ApiResponse;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class SettingsController
{
    public function show(Request $request, PropertySettings $action): JsonResponse
    {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'settings');

        return ApiResponse::success(
            $action->show(DB::connection()->getPdo()),
            (string) $request->attributes->get('request_id'),
        );
    }

    public function save(SaveSettingsRequest $request, PropertySettings $action): JsonResponse
    {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'settings');
        $result = $action->save(
            DB::connection()->getPdo(),
            $request->validated(),
            $principal,
            $this->idempotencyKey($request),
        );

        return ApiResponse::success(
            ['settings' => $result['data']['settings'], 'replayed' => $result['replayed']],
            (string) $request->attributes->get('request_id'),
        );
    }

    private function idempotencyKey(Request $request): string
    {
        $key = (string) $request->header('Idempotency-Key', '');
        if (! preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $key)) {
            throw new ApiException(
                422,
                'IDEMPOTENCY_KEY_REQUIRED',
                'Send a valid Idempotency-Key header for every settings mutation request.',
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
