<?php

declare(strict_types=1);

namespace App\Modules\Imports\Http\Controllers;

use App\Modules\Imports\Actions\HistoricalMigrationService;
use App\Modules\Imports\Http\Requests\HistoricalMigrationRequest;
use App\Modules\Imports\Http\Requests\HistoricalReceiptRequest;
use App\Modules\Shared\ApiResponse;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class HistoricalMigrationController
{
    public function store(HistoricalMigrationRequest $request, HistoricalMigrationService $service): JsonResponse
    {
        $principal = $this->owner($request);
        return ApiResponse::success($service->stage(DB::connection()->getPdo(), $request->validated(), $principal), (string) $request->attributes->get('request_id'), 201);
    }

    public function show(Request $request, string $batchId, HistoricalMigrationService $service): JsonResponse
    {
        $this->owner($request);
        return ApiResponse::success($service->status(DB::connection()->getPdo(), $batchId), (string) $request->attributes->get('request_id'));
    }

    public function validateBatch(Request $request, string $batchId, HistoricalMigrationService $service): JsonResponse
    {
        $this->owner($request);
        return ApiResponse::success($service->validateBatch(DB::connection()->getPdo(), $batchId), (string) $request->attributes->get('request_id'));
    }

    public function uploadReceipt(HistoricalReceiptRequest $request, string $batchId, string $sourceRecordId, HistoricalMigrationService $service): JsonResponse
    {
        $this->owner($request);
        return ApiResponse::success($service->uploadReceipt(DB::connection()->getPdo(), $batchId, $sourceRecordId, $request->validated()), (string) $request->attributes->get('request_id'));
    }

    public function commit(Request $request, string $batchId, HistoricalMigrationService $service): JsonResponse
    {
        $principal = $this->owner($request);
        return ApiResponse::success($service->commit(DB::connection()->getPdo(), $batchId, $principal), (string) $request->attributes->get('request_id'));
    }

    private function owner(Request $request): array
    {
        $principal = $request->attributes->get('principal');
        if (! is_array($principal) || ! isset($principal['id'], $principal['email'], $principal['role'])) throw new ApiException(401, 'SESSION_REQUIRED', 'Sign in to continue.');
        if ((string) $principal['role'] !== 'owner') throw new ApiException(403, 'FORBIDDEN', 'Only the property owner can run historical migration.');
        return $principal;
    }
}
