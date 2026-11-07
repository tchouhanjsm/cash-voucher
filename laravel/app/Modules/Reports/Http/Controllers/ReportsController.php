<?php

declare(strict_types=1);

namespace App\Modules\Reports\Http\Controllers;

use App\Modules\Identity\RoleCapabilities;
use App\Modules\Reports\Actions\ReportingService;
use App\Modules\Reports\Http\Requests\DashboardSummaryRequest;
use App\Modules\Reports\Http\Requests\RecordedMovementReportRequest;
use App\Modules\Shared\ApiResponse;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

final class ReportsController
{
    public function dashboardSummary(
        DashboardSummaryRequest $request,
        ReportingService $action,
    ): JsonResponse {
        $principal = $this->principal($request);
        if (
            ! RoleCapabilities::allows($principal['role'], 'viewAll')
            && ! RoleCapabilities::allows($principal['role'], 'viewOwn')
        ) {
            throw new ApiException(403, 'FORBIDDEN', 'Your role cannot access dashboard voucher data.');
        }

        $validated = $request->validated();
        $result = $action->dashboardSummary(
            DB::connection()->getPdo(),
            $principal,
            $validated['from'],
            $validated['to'],
        );

        return ApiResponse::success(
            $result,
            (string) $request->attributes->get('request_id'),
        );
    }

    public function recordedMovementReport(
        RecordedMovementReportRequest $request,
        ReportingService $action,
    ): JsonResponse {
        $principal = $this->principal($request);
        RoleCapabilities::require($principal, 'reports');
        $result = $action->recordedMovementReport(
            DB::connection()->getPdo(),
            $request->validated(),
            $principal,
        );

        return ApiResponse::success(
            $result,
            (string) $request->attributes->get('request_id'),
        );
    }

    /** @return array{id:string,name:string,email:string,role:string,mustChangePassword:bool,sessionId:string} */
    private function principal(DashboardSummaryRequest|RecordedMovementReportRequest $request): array
    {
        $principal = $request->attributes->get('principal');
        if (! is_array($principal) || ! isset($principal['id'], $principal['role'], $principal['email'])) {
            throw new ApiException(401, 'SESSION_REQUIRED', 'Sign in to continue.');
        }

        return $principal;
    }
}
