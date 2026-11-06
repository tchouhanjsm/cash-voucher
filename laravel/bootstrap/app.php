<?php

use App\Modules\Identity\Middleware\AuthenticateLegacySession;
use App\Modules\Shared\ApiResponse;
use App\Modules\Shared\Middleware\RequestId;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'legacy.session' => AuthenticateLegacySession::class,
        ]);
        $middleware->appendToGroup('api', RequestId::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn ($request): bool => $request->is('api/*') || $request->expectsJson(),
        );

        $exceptions->render(function (Throwable $exception, $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            $requestId = (string) $request->attributes->get('request_id', bin2hex(random_bytes(16)));

            if ($exception instanceof CashVoucher\Api\Support\ApiException) {
                return ApiResponse::failure(
                    $exception->httpStatus,
                    $exception->errorCode,
                    $exception->getMessage(),
                    $requestId,
                );
            }

            if ($exception instanceof ValidationException) {
                return ApiResponse::failure(
                    422,
                    'VALIDATION_FAILED',
                    'One or more request fields are invalid.',
                    $requestId,
                    ['fields' => $exception->errors()],
                );
            }

            if ($exception instanceof AuthenticationException) {
                return ApiResponse::failure(
                    401,
                    'AUTH_REQUIRED',
                    'Sign in to continue.',
                    $requestId,
                );
            }

            if ($exception instanceof HttpExceptionInterface) {
                $status = $exception->getStatusCode();
                $code = match ($status) {
                    404 => 'NOT_FOUND',
                    405 => 'METHOD_NOT_ALLOWED',
                    429 => 'RATE_LIMITED',
                    default => 'REQUEST_FAILED',
                };

                return ApiResponse::failure(
                    $status,
                    $code,
                    $status >= 500 ? 'The request could not be completed.' : ($exception->getMessage() ?: 'The request is invalid.'),
                    $requestId,
                );
            }

            report($exception);

            return ApiResponse::failure(
                500,
                'INTERNAL_ERROR',
                'The request could not be completed.',
                $requestId,
            );
        });
    })
    ->create();
