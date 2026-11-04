<?php
declare(strict_types=1);

namespace CashVoucher\Api\Http;

use CashVoucher\Api\Infrastructure\Database;
use CashVoucher\Api\Security\Role;
use CashVoucher\Api\Support\ApiException;
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
                    'rolloutState' => 'isolated-foundation',
                    'businessTimeZone' => 'Asia/Kolkata',
                    'currency' => 'INR',
                    'moneyStorageUnit' => 'paise',
                    'legacyRoleKeys' => Role::keys(),
                    'implementedResources' => ['health', 'meta'],
                ], $request->requestId);
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

    private function requireMethod(Request $request, string $required): void
    {
        if ($request->method !== $required) {
            throw new ApiException(405, 'METHOD_NOT_ALLOWED', 'This API resource does not support that method.');
        }
    }
}
