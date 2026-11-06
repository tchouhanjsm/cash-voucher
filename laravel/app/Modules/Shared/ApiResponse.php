<?php

namespace App\Modules\Shared;

use Illuminate\Http\JsonResponse;

final class ApiResponse
{
    /**
     * @param array<string, mixed> $data
     */
    public static function success(
        array $data,
        string $requestId,
        int $status = 200,
    ): JsonResponse {
        return response()->json([
            'ok' => true,
            'data' => $data,
            'meta' => [
                'apiVersion' => 'v1',
                'requestId' => $requestId,
            ],
        ], $status, self::headers($requestId));
    }

    /**
     * @param array<string, mixed>|null $details
     */
    public static function failure(
        int $status,
        string $code,
        string $message,
        string $requestId,
        ?array $details = null,
    ): JsonResponse {
        $body = [
            'ok' => false,
            'error' => [
                'code' => $code,
                'message' => $message,
            ],
            'meta' => [
                'apiVersion' => 'v1',
                'requestId' => $requestId,
            ],
        ];

        if ($details !== null) {
            $body['error']['details'] = $details;
        }

        return response()->json($body, $status, self::headers($requestId));
    }

    /**
     * @return array<string, string>
     */
    private static function headers(string $requestId): array
    {
        return [
            'Cache-Control' => 'no-store, private',
            'Pragma' => 'no-cache',
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'DENY',
            'Referrer-Policy' => 'no-referrer',
            'X-Request-Id' => $requestId,
        ];
    }
}
