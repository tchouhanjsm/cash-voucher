<?php
declare(strict_types=1);

namespace CashVoucher\Api\Http;

use CashVoucher\Api\Support\ApiException;
use InvalidArgumentException;
use JsonException;

final class Response
{
    /** @param array<string, mixed> $body
     *  @param array<string, list<string>> $headers
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

    public function status(): int
    {
        return $this->status;
    }

    /** @return array<string, mixed> */
    public function body(): array
    {
        return $this->body;
    }

    public function withHeader(string $name, string $value): self
    {
        if (!preg_match('/^[A-Za-z0-9-]{1,64}$/D', $name)
            || preg_match('/[\r\n]/', $value)
        ) {
            throw new InvalidArgumentException('Response header is invalid.');
        }

        $headers = $this->headers;
        $headers[$name][] = $value;
        return new self($this->status, $this->body, $this->requestId, $headers);
    }

    /** @return array<string, list<string>> */
    public function headers(): array
    {
        return $this->headers;
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

        foreach ($this->headers as $name => $values) {
            foreach ($values as $value) {
                header($name . ': ' . $value, strtolower($name) !== 'set-cookie');
            }
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
