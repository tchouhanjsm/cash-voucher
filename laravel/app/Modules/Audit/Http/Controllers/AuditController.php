<?php

declare(strict_types=1);

namespace App\Modules\Audit\Http\Controllers;

use App\Modules\Audit\Actions\AuditBrowser;
use App\Modules\Audit\Http\Requests\AuditListRequest;
use App\Modules\Identity\RoleCapabilities;
use App\Modules\Shared\ApiResponse;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class AuditController
{
    public function index(AuditListRequest $request, AuditBrowser $action): JsonResponse
    {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'audit');
        $validated = $request->validated();
        $result = $action->index(
            DB::connection()->getPdo(),
            $validated['limit'] ?? null,
            $validated['cursor'] ?? null,
        );

        return ApiResponse::success($result, (string) $request->attributes->get('request_id'));
    }

    public function voucherHistory(Request $request, AuditBrowser $action, string $voucherId): JsonResponse
    {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'audit');
        $result = $action->voucherHistory(
            DB::connection()->getPdo(),
            $voucherId,
            $request->query('limit'),
            $request->query('cursor'),
            $request->query('eventCategory', 'ALL'),
        );

        return ApiResponse::success($result, (string) $request->attributes->get('request_id'));
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
