<?php
declare(strict_types=1);

namespace CashVoucher\Api\Http;

use CashVoucher\Api\Support\ApiException;
use JsonException;

final class Response
{
    /** @param array<string, mixed> $body
     *  @param list<array{name:string,value:string}> $headers
     */
    private function __construct(
        private readonly int $status,
        private readonly array $body,
        private readonly string $requestId,
        private readonly array $headers = []
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

    public function withHeader(string $name, string $value): self
    {
        if (!preg_match('/^[A-Za-z0-9-]{1,64}$/D', $name)
            || str_contains($value, "\r")
            || str_contains($value, "\n")
            || strlen($value) > 4096
        ) {
            throw new \InvalidArgumentException('Response header is invalid.');
        }

        $headers = $this->headers;
        $headers[] = ['name' => $name, 'value' => $value];
        return new self($this->status, $this->body, $this->requestId, $headers);
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

    /** @return list<string> */
    public function headerValues(string $name): array
    {
        return array_values(array_map(
            static fn (array $header): string => $header['value'],
            array_filter($this->headers, static fn (array $header): bool => strcasecmp($header['name'], $name) === 0)
        ));
    }

    public function send(): never
    {
        http_response_code($this->status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: no-referrer');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
        header('X-Request-Id: ' . $this->requestId);

        foreach ($this->headers as $header) {
            header($header['name'] . ': ' . $header['value'], false);
        }

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
