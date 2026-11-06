<?php

use App\Modules\Shared\ApiResponse;
use App\Modules\Vouchers\Http\Controllers\VoucherController;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::get('/health/live', function () {
        return ApiResponse::success(
            ['status' => 'live', 'service' => 'cash-voucher-laravel-api'],
            (string) request()->attributes->get('request_id'),
        );
    });

    Route::get('/health/ready', function () {
        try {
            $latest = DB::table('schema_migrations')->orderByDesc('version')->value('version');
            if ($latest !== '0005') {
                throw new \RuntimeException('Expected schema baseline 0005 was not found.');
            }
        } catch (\Throwable $exception) {
            report($exception);
            throw new ApiException(503, 'NOT_READY', 'The isolated Laravel API is not ready for requests.');
        }

        return ApiResponse::success([
            'status' => 'ready',
            'database' => 'reachable',
            'schemaVersion' => '0005',
            'rolloutState' => 'isolated-shadow',
        ], (string) request()->attributes->get('request_id'));
    });

    Route::get('/meta', function () {
        return ApiResponse::success([
            'apiVersion' => 'v1',
            'rolloutState' => 'isolated-shadow',
            'businessTimeZone' => 'Asia/Kolkata',
            'currency' => 'INR',
            'moneyStorageUnit' => 'paise',
            'implementedResources' => [
                'health',
                'meta',
                'vouchers:list',
                'vouchers:duplicate-check',
                'vouchers:create',
                'vendors:list',
                'vendors:create',
                'vendors:update',
                'vendors:active-state',
            ],
            'authentication' => 'shared-cv_session-cv_csrf',
        ], (string) request()->attributes->get('request_id'));
    });

    Route::middleware('legacy.session')->group(function (): void {
        Route::get('/vouchers', [VoucherController::class, 'index']);
        Route::post('/vouchers/duplicate-check', [VoucherController::class, 'duplicateCheck']);
        Route::post('/vouchers', [VoucherController::class, 'store']);
    });
});
