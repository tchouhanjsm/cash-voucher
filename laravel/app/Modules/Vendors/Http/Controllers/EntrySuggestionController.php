<?php

declare(strict_types=1);

namespace App\Modules\Vendors\Http\Controllers;

use App\Modules\Identity\RoleCapabilities;
use App\Modules\Shared\ApiResponse;
use App\Modules\Vendors\Actions\EntrySuggestionService;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class EntrySuggestionController
{
    public function __invoke(Request $request, EntrySuggestionService $suggestions): JsonResponse
    {
        $principal = $request->attributes->get('principal');
        if (! is_array($principal) || ! isset($principal['id'], $principal['role'], $principal['email'])) {
            throw new ApiException(401, 'SESSION_REQUIRED', 'Sign in to continue.');
        }
        RoleCapabilities::require($principal, 'create');

        $vendor = $request->query('vendor');
        $type = $request->query('type', 'PAYMENT');
        if (! is_string($vendor) || ! is_string($type)) {
            throw new ApiException(422, 'SUGGESTION_QUERY_INVALID', 'Enter a valid payee name.');
        }

        $result = $suggestions->suggest(DB::connection()->getPdo(), $principal, $vendor, $type);

        return ApiResponse::success($result, (string) $request->attributes->get('request_id'));
    }
}
