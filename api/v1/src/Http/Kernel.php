<?php
declare(strict_types=1);

namespace CashVoucher\Api\Http;

use CashVoucher\Api\Infrastructure\Database;
use CashVoucher\Api\Security\AuthenticationService;
use CashVoucher\Api\Security\Role;
use CashVoucher\Api\Security\SessionService;
use CashVoucher\Api\Support\ApiException;
use RuntimeException;
use Throwable;

final class Kernel
{
    public function handle(Request $request): Response
    {
        try {
            $path = rtrim($request->path, '/') ?: '/';

            if ($path === '/api/v1/health/live') {
                $this->requireMethod($request, 'GET');
                return Response::success([
                    'status' => 'live',
                    'service' => 'cash-voucher-api',
                ], $request->requestId);
            }

            if ($path === '/api/v1/health/ready') {
                $this->requireMethod($request, 'GET');
                try {
                    $pdo = Database::connectFromEnvironment();
                    $pdo->query('SELECT 1')->fetchColumn();
                    $latestMigration = $pdo->query(
                        'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1'
                    )->fetchColumn();
                    if ($latestMigration !== '0007') {
                        throw new RuntimeException('The expected database schema version is not applied.');
                    }
                } catch (Throwable $exception) {
                    error_log('Cash Voucher readiness probe failed: ' . get_class($exception));
                    throw new ApiException(503, 'NOT_READY', 'The service is not ready to accept requests.');
                }
                return Response::success([
                    'status' => 'ready',
                    'database' => 'reachable',
                    'schemaVersion' => '0007',
                ], $request->requestId);
            }

            if ($path === '/api/v1/meta') {
                $this->requireMethod($request, 'GET');
                return Response::success([
                    'apiVersion' => 'v1',
                    'rolloutState' => 'isolated-foundation',
                    'businessTimeZone' => 'Asia/Kolkata',
                    'currency' => 'INR',
                    'moneyStorageUnit' => 'paise',
                    'legacyRoleKeys' => Role::keys(),
                    'implementedResources' => [
                        'health',
                        'meta',
                        'sessions:create',
                        'sessions:current',
                        'sessions:logout',
                        'sessions:change-password',
                    ],
                ], $request->requestId);
            }

            if ($path === '/api/v1/sessions') {
                $this->requireMethod($request, 'POST');
                $authentication = $this->authenticationService();
                try {
                    $login = $authentication->login($request);
                } catch (ApiException $exception) {
                    throw $exception;
                } catch (Throwable $exception) {
                    error_log('Cash Voucher login service unavailable: ' . get_class($exception));
                    throw new ApiException(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
                }

                $response = Response::success([
                    'user' => $login['user'],
                    'expiresAtUtc' => $login['expiresAtUtc'],
                ], $request->requestId);
                return $this->withCookies(
                    $response,
                    SessionService::issueCookieHeaders($login['sessionToken'], $login['csrfToken'])
                );
            }

            if ($path === '/api/v1/sessions/current') {
                $this->requireMethod($request, 'GET');
                try {
                    $principal = (new SessionService(Database::connectFromEnvironment()))
                        ->authenticate($request, false);
                } catch (ApiException $exception) {
                    throw $exception;
                } catch (Throwable $exception) {
                    error_log('Cash Voucher session lookup unavailable: ' . get_class($exception));
                    throw new ApiException(503, 'AUTH_UNAVAILABLE', 'Session validation is temporarily unavailable.');
                }

                unset($principal['sessionId']);
                return Response::success(['user' => $principal], $request->requestId);
            }

            if ($path === '/api/v1/sessions/current/logout') {
                $this->requireMethod($request, 'POST');
                try {
                    $pdo = Database::connectFromEnvironment();
                    $principal = (new SessionService($pdo))->authenticate($request, true);
                    $this->authenticationService($pdo)->logout($principal);
                } catch (ApiException $exception) {
                    throw $exception;
                } catch (Throwable $exception) {
                    error_log('Cash Voucher logout service unavailable: ' . get_class($exception));
                    throw new ApiException(503, 'AUTH_UNAVAILABLE', 'Sign out is temporarily unavailable.');
                }

                return $this->withCookies(
                    Response::success(['signedOut' => true], $request->requestId),
                    SessionService::clearCookieHeaders()
                );
            }

            if ($path === '/api/v1/sessions/current/password') {
                $this->requireMethod($request, 'POST');
                try {
                    $pdo = Database::connectFromEnvironment();
                    $principal = (new SessionService($pdo))->authenticate($request, true);
                    $this->authenticationService($pdo)->changePassword($principal, $request);
                } catch (ApiException $exception) {
                    throw $exception;
                } catch (Throwable $exception) {
                    error_log('Cash Voucher password-change service unavailable: ' . get_class($exception));
                    throw new ApiException(503, 'AUTH_UNAVAILABLE', 'Password change is temporarily unavailable.');
                }

                return $this->withCookies(
                    Response::success([
                        'passwordChanged' => true,
                        'sessionRevoked' => true,
                        'requiresSignIn' => true,
                    ], $request->requestId),
                    SessionService::clearCookieHeaders()
                );
            }

            throw new ApiException(404, 'NOT_FOUND', 'The requested API resource was not found.');
        } catch (ApiException $exception) {
            return Response::failure($exception, $request->requestId);
        } catch (Throwable $exception) {
            error_log('Cash Voucher API request failed: ' . get_class($exception));
            return Response::failure(
                new ApiException(500, 'INTERNAL_ERROR', 'The request could not be completed.'),
                $request->requestId
            );
        }
    }

    private function authenticationService(?\PDO $pdo = null): AuthenticationService
    {
        try {
            return new AuthenticationService($pdo ?? Database::connectFromEnvironment());
        } catch (Throwable $exception) {
            error_log('Cash Voucher authentication configuration failed: ' . get_class($exception));
            throw new ApiException(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
        }
    }

    /** @param array{0:string,1:string} $cookies */
    private function withCookies(Response $response, array $cookies): Response
    {
        foreach ($cookies as $cookie) {
            $response = $response->withHeader('Set-Cookie', $cookie);
        }
        return $response;
    }

    private function requireMethod(Request $request, string $required): void
    {
        if ($request->method !== $required) {
            throw new ApiException(405, 'METHOD_NOT_ALLOWED', 'This API resource does not support that method.');
        }
    }
}
