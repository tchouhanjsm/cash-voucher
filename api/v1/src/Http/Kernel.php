<?php
declare(strict_types=1);

namespace CashVoucher\Api\Http;

use CashVoucher\Api\Infrastructure\Database;
use CashVoucher\Api\Security\AuthService;
use CashVoucher\Api\Security\SessionService;
use CashVoucher\Api\Security\Role;
use CashVoucher\Api\Support\ApiException;
use PDO;
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
                $pdo = $this->connectRuntime();
                try {
                    $pdo->query('SELECT 1')->fetchColumn();
                    $latestMigration = $pdo->query(
                        'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1'
                    )->fetchColumn();
                    if ($latestMigration !== '0004') {
                        throw new \RuntimeException('The expected database schema version is not applied.');
                    }
                } catch (Throwable $exception) {
                    error_log('Cash Voucher readiness probe failed: ' . get_class($exception));
                    throw new ApiException(503, 'NOT_READY', 'The service is not ready to accept requests.');
                }
                return Response::success([
                    'status' => 'ready',
                    'database' => 'reachable',
                    'schemaVersion' => '0004',
                ], $request->requestId);
            }

            if ($path === '/api/v1/meta') {
                $this->requireMethod($request, 'GET');
                return Response::success([
                    'apiVersion' => 'v1',
                    'rolloutState' => 'isolated-authentication-foundation',
                    'businessTimeZone' => 'Asia/Kolkata',
                    'currency' => 'INR',
                    'moneyStorageUnit' => 'paise',
                    'legacyRoleKeys' => Role::keys(),
                    'implementedResources' => [
                        'health',
                        'meta',
                        'sessions.login',
                        'sessions.current',
                        'sessions.logout',
                        'sessions.changePassword',
                    ],
                    'businessActionsEnabled' => false,
                ], $request->requestId);
            }

            if ($path === '/api/v1/sessions') {
                $this->requireMethod($request, 'POST');
                $this->requireSecureTransport($request);
                $email = $request->json['email'] ?? null;
                $password = $request->json['password'] ?? null;
                if (!is_string($email) || !is_string($password)) {
                    throw new ApiException(422, 'INVALID_CREDENTIALS', 'Email and password are required.');
                }

                $pdo = $this->connectRuntime();
                try {
                    $auth = AuthService::fromEnvironment($pdo);
                    $session = $auth->login($email, $password, $request->remoteAddress);
                } catch (ApiException $exception) {
                    throw $exception;
                } catch (Throwable $exception) {
                    error_log('Cash Voucher login unavailable: ' . get_class($exception));
                    throw new ApiException(503, 'AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable.');
                }

                return Response::success([
                    'user' => $session['user'],
                    'csrfToken' => $session['csrfToken'],
                    'expiresIn' => $session['expiresIn'],
                ], $request->requestId, 201)
                    ->withHeader(
                        'Set-Cookie',
                        $this->cookie(
                            SessionService::COOKIE_NAME,
                            $session['sessionToken'],
                            AuthService::SESSION_TTL_SECONDS,
                            true,
                            $request
                        )
                    )
                    ->withHeader(
                        'Set-Cookie',
                        $this->cookie(
                            SessionService::CSRF_COOKIE_NAME,
                            $session['csrfToken'],
                            AuthService::SESSION_TTL_SECONDS,
                            false,
                            $request
                        )
                    );
            }

            if ($path === '/api/v1/sessions/current') {
                $this->requireMethod($request, 'GET');
                $this->requireSecureTransport($request);
                $sessions = new SessionService($this->connectRuntime());
                $principal = $sessions->authenticate(
                    (string) ($request->cookies[SessionService::COOKIE_NAME] ?? '')
                );
                $csrfCookie = (string) ($request->cookies[SessionService::CSRF_COOKIE_NAME] ?? '');
                $sessions->assertCsrf($principal, $csrfCookie, $csrfCookie);

                return Response::success([
                    'user' => SessionService::publicUser($principal),
                    'csrfToken' => $csrfCookie,
                    'expiresAtUtc' => $principal['expiresAtUtc'],
                ], $request->requestId);
            }

            if ($path === '/api/v1/sessions/current/logout') {
                $this->requireMethod($request, 'POST');
                $this->requireSecureTransport($request);
                $sessions = new SessionService($this->connectRuntime());
                $principal = $sessions->authenticate(
                    (string) ($request->cookies[SessionService::COOKIE_NAME] ?? '')
                );
                $sessions->assertCsrf(
                    $principal,
                    (string) ($request->headers['x-csrf-token'] ?? ''),
                    (string) ($request->cookies[SessionService::CSRF_COOKIE_NAME] ?? '')
                );
                $sessions->logout($principal);

                return $this->clearSessionCookies(
                    Response::success(['signedOut' => true], $request->requestId),
                    $request
                );
            }

            if ($path === '/api/v1/sessions/current/password') {
                $this->requireMethod($request, 'POST');
                $this->requireSecureTransport($request);
                $pdo = $this->connectRuntime();
                $sessions = new SessionService($pdo);
                $principal = $sessions->authenticate(
                    (string) ($request->cookies[SessionService::COOKIE_NAME] ?? '')
                );
                $sessions->assertCsrf(
                    $principal,
                    (string) ($request->headers['x-csrf-token'] ?? ''),
                    (string) ($request->cookies[SessionService::CSRF_COOKIE_NAME] ?? '')
                );

                $currentPassword = $request->json['currentPassword'] ?? null;
                $newPassword = $request->json['newPassword'] ?? null;
                if (!is_string($currentPassword) || !is_string($newPassword)) {
                    throw new ApiException(422, 'INVALID_PASSWORD', 'Current and new passwords are required.');
                }
                try {
                    AuthService::fromEnvironment($pdo)->changePassword(
                        $principal,
                        $currentPassword,
                        $newPassword
                    );
                } catch (ApiException $exception) {
                    throw $exception;
                } catch (\InvalidArgumentException $exception) {
                    throw new ApiException(422, 'INVALID_PASSWORD', $exception->getMessage());
                } catch (Throwable $exception) {
                    error_log('Cash Voucher password update failed: ' . get_class($exception));
                    throw new ApiException(503, 'PASSWORD_UPDATE_UNAVAILABLE', 'Password update is temporarily unavailable.');
                }

                return $this->clearSessionCookies(
                    Response::success([
                        'passwordChanged' => true,
                        'signInRequired' => true,
                    ], $request->requestId),
                    $request
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

    private function connectRuntime(): PDO
    {
        try {
            return Database::connectFromEnvironment();
        } catch (Throwable $exception) {
            error_log('Cash Voucher runtime database unavailable: ' . get_class($exception));
            throw new ApiException(503, 'DATABASE_UNAVAILABLE', 'The service is temporarily unavailable.');
        }
    }

    private function requireMethod(Request $request, string $required): void
    {
        if ($request->method !== $required) {
            throw new ApiException(405, 'METHOD_NOT_ALLOWED', 'This API resource does not support that method.');
        }
    }

    private function requireSecureTransport(Request $request): void
    {
        if (!$request->isSecure && !$request->isLocalDevelopment) {
            throw new ApiException(400, 'HTTPS_REQUIRED', 'Sign-in and session requests require HTTPS.');
        }
    }

    private function cookie(
        string $name,
        string $value,
        int $maxAge,
        bool $httpOnly,
        Request $request
    ): string {
        $cookie = $name . '=' . $value
            . '; Path=/api/v1'
            . '; Max-Age=' . $maxAge
            . '; SameSite=Strict';
        if ($httpOnly) {
            $cookie .= '; HttpOnly';
        }
        if ($request->isSecure) {
            $cookie .= '; Secure';
        }
        return $cookie;
    }

    private function clearSessionCookies(Response $response, Request $request): Response
    {
        return $response
            ->withHeader(
                'Set-Cookie',
                $this->cookie(SessionService::COOKIE_NAME, '', 0, true, $request)
            )
            ->withHeader(
                'Set-Cookie',
                $this->cookie(SessionService::CSRF_COOKIE_NAME, '', 0, false, $request)
            );
    }
}
