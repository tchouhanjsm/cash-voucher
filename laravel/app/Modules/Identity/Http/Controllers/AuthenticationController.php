<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Support\AuthenticationRequestAdapter;
use App\Modules\Shared\ApiResponse;
use CashVoucher\Api\Security\AuthenticationService;
use CashVoucher\Api\Security\SessionService;
use CashVoucher\Api\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

final class AuthenticationController
{
    public function login(Request $request): JsonResponse
    {
        try {
            $legacyRequest = AuthenticationRequestAdapter::fromLaravel($request);
            $login = $this->service()->login($legacyRequest);
        } catch (ApiException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            report($exception);
            throw new ApiException(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
        }

        $response = ApiResponse::success([
            'user' => $login['user'],
            'csrfToken' => $login['csrfToken'],
            'expiresAtUtc' => $login['expiresAtUtc'],
        ], (string) $request->attributes->get('request_id'));

        return $this->withCookies(
            $response,
            SessionService::issueCookieHeaders($login['sessionToken'], $login['csrfToken']),
        );
    }

    public function current(Request $request): JsonResponse
    {
        $principal = $this->principal($request);
        unset($principal['sessionId']);

        return ApiResponse::success(
            [
                'user' => $principal,
                'csrfToken' => (string) $request->attributes->get('csrf_token', ''),
            ],
            (string) $request->attributes->get('request_id'),
        );
    }

    public function logout(Request $request): JsonResponse
    {
        try {
            $this->service()->logout($this->principal($request));
        } catch (ApiException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            report($exception);
            throw new ApiException(503, 'AUTH_UNAVAILABLE', 'Sign out is temporarily unavailable.');
        }

        $response = ApiResponse::success(
            ['signedOut' => true],
            (string) $request->attributes->get('request_id'),
        );

        return $this->withCookies($response, SessionService::clearCookieHeaders());
    }

    public function changePassword(Request $request): JsonResponse
    {
        try {
            $principal = $this->principal($request);
            $legacyRequest = AuthenticationRequestAdapter::fromLaravel($request);
            $this->service()->changePassword($principal, $legacyRequest);
        } catch (ApiException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            report($exception);
            throw new ApiException(503, 'AUTH_UNAVAILABLE', 'Password change is temporarily unavailable.');
        }

        $response = ApiResponse::success([
            'passwordChanged' => true,
            'sessionRevoked' => true,
            'requiresSignIn' => true,
        ], (string) $request->attributes->get('request_id'));

        return $this->withCookies($response, SessionService::clearCookieHeaders());
    }

    private function service(): AuthenticationService
    {
        try {
            return new AuthenticationService(DB::connection()->getPdo());
        } catch (Throwable $exception) {
            report($exception);
            throw new ApiException(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
        }
    }

    /** @return array{id:string,name:string,email:string,role:string,mustChangePassword:bool,sessionId:string} */
    private function principal(Request $request): array
    {
        $principal = $request->attributes->get('principal');
        if (
            ! is_array($principal)
            || ! isset($principal['id'], $principal['role'], $principal['email'], $principal['sessionId'])
        ) {
            throw new ApiException(401, 'SESSION_REQUIRED', 'Sign in to continue.');
        }

        return $principal;
    }

    /** @param array<int, string> $cookies */
    private function withCookies(JsonResponse $response, array $cookies): JsonResponse
    {
        foreach ($cookies as $cookie) {
            // Append two independent Set-Cookie headers; never collapse them into one.
            $response->headers->set('Set-Cookie', $cookie, false);
        }

        return $response;
    }
}
