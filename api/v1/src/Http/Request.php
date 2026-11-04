<?php
declare(strict_types=1);

namespace CashVoucher\Api\Http;

use CashVoucher\Api\Support\ApiException;
use JsonException;
use stdClass;

final class Request
{
    public const MAX_BODY_BYTES = 1_048_576;

    /** @param array<string, string> $headers
     *  @param array<string, mixed> $json
     *  @param array<string, string> $cookies
     */
    private function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $headers,
        public readonly array $json,
        public readonly string $requestId,
        public readonly array $cookies,
        public readonly string $remoteAddress,
        public readonly bool $isSecure,
        public readonly bool $isLocalDevelopment
    ) {
    }

    public static function fromGlobals(): self
    {
        $headers = [];
        if (function_exists('getallheaders')) {
            foreach ((array) getallheaders() as $name => $value) {
                $headers[strtolower((string) $name)] = (string) $value;
            }
        }
        $serverHeaders = [
            'content-type' => 'CONTENT_TYPE',
            'cookie' => 'HTTP_COOKIE',
            'x-csrf-token' => 'HTTP_X_CSRF_TOKEN',
        ];
        foreach ($serverHeaders as $header => $serverKey) {
            if (!isset($headers[$header]) && isset($_SERVER[$serverKey])) {
                $headers[$header] = (string) $_SERVER[$serverKey];
            }
        }

        $body = file_get_contents('php://input', false, null, 0, self::MAX_BODY_BYTES + 1);
        $host = strtolower(trim((string) ($_SERVER['HTTP_HOST'] ?? '')));
        $hostName = preg_replace('/:\d+$/', '', $host) ?? $host;
        $localDevelopment = in_array($hostName, ['localhost', '127.0.0.1', '::1'], true);
        $secure = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
            || (string) ($_SERVER['SERVER_PORT'] ?? '') === '443';

        return self::fromValues(
            (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            (string) ($_SERVER['REQUEST_URI'] ?? '/'),
            $headers,
            $body === false ? '' : $body,
            (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
            $secure,
            $localDevelopment
        );
    }

    /** @param array<string, string> $headers */
    public static function fromValues(
        string $method,
        string $uri,
        array $headers = [],
        string $body = '',
        string $remoteAddress = '127.0.0.1',
        bool $isSecure = true,
        bool $isLocalDevelopment = false
    ): self {
        $requestId = bin2hex(random_bytes(16));
        if (strlen($body) > self::MAX_BODY_BYTES) {
            throw new ApiException(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
        }

        $path = parse_url($uri, PHP_URL_PATH);
        if (!is_string($path) || $path === '' || str_contains($path, "\0")) {
            throw new ApiException(400, 'INVALID_PATH', 'The request path is invalid.');
        }

        $normalizedHeaders = [];
        foreach ($headers as $name => $value) {
            $normalizedHeaders[strtolower((string) $name)] = trim((string) $value);
        }

        $cookies = self::parseCookies($normalizedHeaders['cookie'] ?? '');
        $json = [];
        if ($body !== '') {
            $contentType = strtolower($normalizedHeaders['content-type'] ?? '');
            if (!preg_match('/^application\/json(?:\s*;.*)?$/D', $contentType)) {
                throw new ApiException(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send JSON using application/json.');
            }
            try {
                $decoded = json_decode($body, false, 64, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                throw new ApiException(400, 'INVALID_JSON', 'The JSON request body is invalid.');
            }
            if (!$decoded instanceof stdClass) {
                throw new ApiException(400, 'INVALID_JSON', 'The JSON request body must be an object.');
            }
            $json = get_object_vars($decoded);
        }

        return new self(
            strtoupper(trim($method)),
            $path,
            $normalizedHeaders,
            $json,
            $requestId,
            $cookies,
            $remoteAddress,
            $isSecure,
            $isLocalDevelopment
        );
    }

    /** @return array<string, string> */
    private static function parseCookies(string $header): array
    {
        if ($header === '') {
            return [];
        }

        $cookies = [];
        foreach (explode(';', $header) as $part) {
            $pair = explode('=', trim($part), 2);
            if (count($pair) !== 2 || $pair[0] === '') {
                continue;
            }
            $name = trim($pair[0]);
            $value = trim($pair[1]);
            if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $name)
                || preg_match('/[\x00-\x20\x7f;]/', $value)
            ) {
                throw new ApiException(400, 'INVALID_COOKIE', 'The request cookie header is invalid.');
            }
            if (array_key_exists($name, $cookies)) {
                throw new ApiException(400, 'DUPLICATE_COOKIE', 'The request contains a duplicate cookie.');
            }
            $cookies[$name] = rawurldecode($value);
        }

        return $cookies;
    }
}
