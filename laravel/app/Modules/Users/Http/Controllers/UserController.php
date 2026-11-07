<?php

declare(strict_types=1);

namespace App\Modules\Users\Http\Controllers;

use App\Modules\Identity\RoleCapabilities;
use App\Modules\Shared\ApiResponse;
use App\Modules\Users\Actions\UserAdministration;
use App\Modules\Users\Http\Requests\ResetUserPasswordRequest;
use App\Modules\Users\Http\Requests\StoreUserRequest;
use App\Modules\Users\Http\Requests\UpdateUserRequest;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class UserController
{
    public function index(Request $request, UserAdministration $action): JsonResponse
    {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'users');
        $result = $action->index(DB::connection()->getPdo());

        return ApiResponse::success($result, (string) $request->attributes->get('request_id'));
    }

    public function store(StoreUserRequest $request, UserAdministration $action): JsonResponse
    {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'users');
        $result = $action->save(
            DB::connection()->getPdo(),
            $request->validated(),
            $principal,
            $this->idempotencyKey($request),
        );

        return ApiResponse::success(
            ['user' => $result['data']['user'], 'replayed' => $result['replayed']],
            (string) $request->attributes->get('request_id'),
            $result['replayed'] ? 200 : 201,
        );
    }

    public function update(
        UpdateUserRequest $request,
        UserAdministration $action,
        string $userId,
    ): JsonResponse {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'users');
        $result = $action->save(
            DB::connection()->getPdo(),
            $request->validated(),
            $principal,
            $this->idempotencyKey($request),
            $userId,
        );

        return ApiResponse::success(
            ['user' => $result['data']['user'], 'replayed' => $result['replayed']],
            (string) $request->attributes->get('request_id'),
        );
    }

    public function resetPassword(
        ResetUserPasswordRequest $request,
        UserAdministration $action,
        string $userId,
    ): JsonResponse {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'users');
        $result = $action->resetPassword(
            DB::connection()->getPdo(),
            $userId,
            $request->validated(),
            $principal,
            $this->idempotencyKey($request),
        );

        return ApiResponse::success(
            ['user' => $result['data']['user'], 'replayed' => $result['replayed']],
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
                'Send a valid Idempotency-Key header for every user mutation request.',
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
