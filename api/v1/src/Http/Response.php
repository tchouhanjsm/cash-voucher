<?php
declare(strict_types=1);

namespace CashVoucher\Api\Http;

use CashVoucher\Api\Support\ApiException;
use JsonException;

final class Response
{
    /** @param array<string, mixed> $body */
    private function __construct(
        private readonly int $status,
        private readonly array $body,
        private readonly string $requestId
    ) {
    }

    /** @param array<string, mixed> $data */
    public static function success(array $data, string $requestId, int $status = 200): self
    {
        return new self($status, [
            'ok' => true,
            'data' => $data,
            'meta' => ['apiVersion' => 'v1', 'requestId' => $requestId],
        ], $requestId);
    }

    public static function failure(ApiException $exception, string $requestId): self
    {
        return new self($exception->httpStatus, [
            'ok' => false,
            'error' => [
                'code' => $exception->errorCode,
                'message' => $exception->getMessage(),
            ],
            'meta' => ['apiVersion' => 'v1', 'requestId' => $requestId],
        ], $requestId);
    }

    public function status(): int
    {
        return $this->status;
    }

    /** @return array<string, mixed> */
    public function body(): array
    {
        return $this->body;
    }

    public function send(): never
    {
        http_response_code($this->status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: no-referrer');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
        header('X-Request-Id: ' . $this->requestId);

        try {
            echo json_encode(
                $this->body,
                JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR
            );
        } catch (JsonException) {
            http_response_code(500);
            echo '{"ok":false,"error":{"code":"SERIALIZATION_ERROR","message":"The response could not be serialized."}}';
        }
        exit;
    }
}
