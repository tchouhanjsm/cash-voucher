<?php

declare(strict_types=1);

namespace App\Modules\Receipts\Http\Controllers;

use App\Modules\Receipts\Actions\ReceiptStorage;
use App\Modules\Receipts\Http\Requests\AttachReceiptRequest;
use App\Modules\Shared\ApiResponse;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

final class ReceiptController
{
    public function attach(
        AttachReceiptRequest $request,
        ReceiptStorage $action,
        string $voucherId,
    ): JsonResponse {
        $principal = $this->principal($request);
        $validated = $request->validated();
        $result = $action->attach(
            DB::connection()->getPdo(),
            $voucherId,
            $validated['receipt'],
            $principal,
            $this->idempotencyKey($request),
        );

        return ApiResponse::success([
            'receipt' => $result['data']['receipt'],
            'receiptCount' => $result['data']['receiptCount'],
            'replayed' => $result['replayed'],
        ], (string) $request->attributes->get('request_id'), $result['replayed'] ? 200 : 201);
    }

    public function show(
        Request $request,
        ReceiptStorage $action,
        string $receiptId,
    ): Response {
        $principal = $this->principal($request);
        $receipt = $action->read(DB::connection()->getPdo(), $receiptId, $principal);

        return response($receipt['bytes'], 200, [
            'Content-Type' => $receipt['contentType'],
            'Content-Length' => (string) strlen($receipt['bytes']),
            'Content-Disposition' => 'inline; filename="receipt-'.$receipt['receiptId'].'.'.$this->extension($receipt['contentType']).'"',
            'Cache-Control' => 'no-store, private',
            'Pragma' => 'no-cache',
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'DENY',
            'Referrer-Policy' => 'no-referrer',
            'X-Request-Id' => (string) $request->attributes->get('request_id'),
        ]);
    }

    private function idempotencyKey(Request $request): string
    {
        $key = (string) $request->header('Idempotency-Key', '');
        if (! preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $key)) {
            throw new ApiException(
                422,
                'IDEMPOTENCY_KEY_REQUIRED',
                'Send a valid Idempotency-Key header for every receipt attachment request.',
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

    private function extension(string $mime): string
    {
        return match ($mime) {
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'bin',
        };
    }
}
