<?php

declare(strict_types=1);

namespace App\Modules\Operations\Http\Controllers;

use App\Modules\Identity\RoleCapabilities;
use App\Modules\Operations\Actions\OperationsService;
use App\Modules\Shared\ApiResponse;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

final class OperationsController
{
    public function backupStatus(Request $request, OperationsService $service): JsonResponse
    {
        $this->settingsPrincipal($request);
        return $this->ok($request, $service->backupStatus());
    }

    public function backupIntegrity(Request $request, OperationsService $service): JsonResponse
    {
        $this->settingsPrincipal($request);
        return $this->ok($request, $service->backupIntegrityReport());
    }

    public function readiness(Request $request, OperationsService $service): JsonResponse
    {
        $this->settingsPrincipal($request);
        return $this->ok($request, $service->deploymentReadiness(DB::connection()->getPdo()));
    }

    public function dataQuality(Request $request, OperationsService $service): JsonResponse
    {
        $this->settingsPrincipal($request);
        return $this->ok($request, $service->dataQualityReport(DB::connection()->getPdo()));
    }

    public function onboardingState(Request $request, OperationsService $service): JsonResponse
    {
        $this->settingsPrincipal($request);
        $input = Validator::make($request->query(), [
            'environment' => ['required', 'in:staging,production'],
            'deploymentId' => ['sometimes', 'string', 'max:128'],
        ])->validate();
        return $this->ok($request, $service->onboardingState(
            DB::connection()->getPdo(),
            (string) $input['environment'],
            isset($input['deploymentId']) ? (string) $input['deploymentId'] : null,
        ));
    }

    public function onboardingConfirm(Request $request, OperationsService $service): JsonResponse
    {
        $principal = $this->ownerPrincipal($request);
        $input = Validator::make($request->all(), [
            'environment' => ['required', 'in:staging,production'],
            'deploymentId' => ['sometimes', 'string', 'max:128'],
            'stepId' => ['required', 'string', 'max:64'],
            'status' => ['required', 'in:pass,fail'],
            'evidence' => ['required', 'string', 'min:12', 'max:500'],
        ])->validate();
        return $this->ok($request, $service->onboardingConfirm(DB::connection()->getPdo(), $principal, $input));
    }

    public function onboardingAdvance(Request $request, OperationsService $service): JsonResponse
    {
        $principal = $this->ownerPrincipal($request);
        $input = Validator::make($request->all(), [
            'environment' => ['required', 'in:staging,production'],
            'deploymentId' => ['sometimes', 'string', 'max:128'],
        ])->validate();
        return $this->ok($request, $service->onboardingAdvance(
            DB::connection()->getPdo(),
            $principal,
            (string) $input['environment'],
            isset($input['deploymentId']) ? (string) $input['deploymentId'] : null,
        ));
    }

    public function reportIssue(Request $request, OperationsService $service): JsonResponse
    {
        $principal = $request->attributes->get('principal');
        if (! is_array($principal) || ! isset($principal['id'], $principal['email'], $principal['role'])) {
            throw new ApiException(401, 'SESSION_REQUIRED', 'Sign in to continue.');
        }
        $input = Validator::make($request->all(), [
            'category' => ['sometimes', 'nullable', 'string', 'max:16'],
            'subject' => ['required', 'string', 'min:3', 'max:100'],
            'message' => ['required', 'string', 'min:10', 'max:2000'],
            'context' => ['sometimes', 'nullable', 'string', 'max:300'],
            'environment' => ['sometimes', 'nullable', 'in:staging,production'],
        ])->validate();
        return $this->ok($request, $service->reportIssue(DB::connection()->getPdo(), $principal, $input));
    }

    /** @return array<string,mixed> */
    private function settingsPrincipal(Request $request): array
    {
        $principal = $request->attributes->get('principal');
        if (! is_array($principal) || ! isset($principal['id'], $principal['role'])) {
            throw new ApiException(401, 'SESSION_REQUIRED', 'Sign in to continue.');
        }
        RoleCapabilities::require($principal, 'settings');
        return $principal;
    }

    /** @return array<string,mixed> */
    private function ownerPrincipal(Request $request): array
    {
        $principal = $this->settingsPrincipal($request);
        if ((string) $principal['role'] !== 'owner') {
            throw new ApiException(403, 'FORBIDDEN', 'Only the property owner can record onboarding evidence or advance a stage.');
        }
        return $principal;
    }

    private function ok(Request $request, array $data): JsonResponse
    {
        return ApiResponse::success($data, (string) $request->attributes->get('request_id'));
    }
}
