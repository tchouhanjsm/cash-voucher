<?php

use App\Modules\Shared\ApiResponse;
use App\Modules\CashClose\Http\Controllers\CashCloseController;
use App\Modules\Receipts\Http\Controllers\ReceiptController;
use App\Modules\Reports\Http\Controllers\ReportsController;
use App\Modules\Vouchers\Http\Controllers\VoucherController;
use App\Modules\Vendors\Http\Controllers\VendorController;
use App\Modules\Users\Http\Controllers\UserController;
use App\Modules\Settings\Http\Controllers\SettingsController;
use App\Modules\Audit\Http\Controllers\AuditController;
use App\Modules\Identity\Http\Controllers\AuthenticationController;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    // Login is public; all authenticated routes below reuse the shared cookie/session contract.
    Route::post('/sessions', [AuthenticationController::class, 'login']);

    // Forced-change users may only restore their session, sign out, or change password.
    // This middleware mode does not apply to financial or administration endpoints.
    Route::middleware('legacy.session:allow-must-change')->group(function (): void {
        Route::get('/sessions/current', [AuthenticationController::class, 'current']);
        Route::post('/sessions/current/logout', [AuthenticationController::class, 'logout']);
        Route::post('/sessions/current/password', [AuthenticationController::class, 'changePassword']);
    });
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
                'sessions:login',
                'sessions:current',
                'sessions:logout',
                'sessions:change-password',
                'vouchers:list',
                'vouchers:duplicate-check',
                'vouchers:create',
                'vouchers:update',
                'vouchers:cancel',
                'vouchers:approve',
                'vouchers:reject',
                'receipts:attach',
                'receipts:read',
                'cash-close:preview',
                'cash-close:create',
                'cash-close:corrections',
                'dashboard:summary',
                'reports:recorded-movements',
                'vendors:list',
                'vendors:create',
                'vendors:update',
                'vendors:active-state',
                'users:list',
                'users:create',
                'users:update',
                'users:password-reset',
                'settings:read',
                'settings:update',
                'audit:list',
                'audit:voucher-history',
            ],
            'authentication' => 'shared-cv_session-cv_csrf',
        ], (string) request()->attributes->get('request_id'));
    });

    Route::middleware('legacy.session')->group(function (): void {
        Route::get('/vouchers', [VoucherController::class, 'index']);
        Route::get('/dashboard/summary', [ReportsController::class, 'dashboardSummary']);
        Route::get('/reports/recorded-movements', [ReportsController::class, 'recordedMovementReport']);
        Route::get('/cash-closes/preview', [CashCloseController::class, 'preview']);
        Route::post('/cash-closes', [CashCloseController::class, 'create']);
        Route::post('/cash-closes/{closeId}/corrections', [CashCloseController::class, 'recordCorrection']);
        Route::post('/vouchers/duplicate-check', [VoucherController::class, 'duplicateCheck']);
        Route::post('/vouchers', [VoucherController::class, 'store']);
        Route::patch('/vouchers/{voucherId}', [VoucherController::class, 'update']);
        Route::post('/vouchers/{voucherId}/cancel', [VoucherController::class, 'cancel']);
        Route::post('/vouchers/{voucherId}/approval', [VoucherController::class, 'approve']);
        Route::post('/vouchers/{voucherId}/rejection', [VoucherController::class, 'reject']);
        Route::post('/vouchers/{voucherId}/receipts', [ReceiptController::class, 'attach']);
        Route::get('/receipts/{receiptId}', [ReceiptController::class, 'show']);
        Route::get('/vendors', [VendorController::class, 'index']);
        Route::post('/vendors', [VendorController::class, 'store']);
        Route::patch('/vendors/{vendorId}', [VendorController::class, 'update']);
        Route::post('/vendors/{vendorId}/active', [VendorController::class, 'setActive']);
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::patch('/users/{userId}', [UserController::class, 'update']);
        Route::post('/users/{userId}/password-reset', [UserController::class, 'resetPassword']);
        Route::get('/settings', [SettingsController::class, 'show']);
        Route::put('/settings', [SettingsController::class, 'save']);
        Route::get('/audit-events', [AuditController::class, 'index']);
        Route::get('/vouchers/{voucherId}/history', [AuditController::class, 'voucherHistory']);
    });
});
