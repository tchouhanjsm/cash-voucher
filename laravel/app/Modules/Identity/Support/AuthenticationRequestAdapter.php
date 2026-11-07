<?php

declare(strict_types=1);

namespace App\Modules\Identity\Support;

use CashVoucher\Api\Http\Request as LegacyRequest;
use Illuminate\Http\Request;
use JsonException;

final class AuthenticationRequestAdapter
{
    public static function fromLaravel(Request $request): LegacyRequest
    {
        try {
            // Force an object-shaped body, including for an empty JSON object.
            $body = json_encode(
                (object) $request->json()->all(),
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
            );
        } catch (JsonException $exception) {
            throw new \CashVoucher\Api\Support\ApiException(
                400,
                'INVALID_JSON',
                'The JSON request body is invalid.',
            );
        }

        $remoteAddress = (string) $request->server('REMOTE_ADDR', '');

        return LegacyRequest::fromValues(
            $request->method(),
            $request->getRequestUri(),
            ['content-type' => 'application/json'],
            $body,
            $remoteAddress,
        );
    }
}
