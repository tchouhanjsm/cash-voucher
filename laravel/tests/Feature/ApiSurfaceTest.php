<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Routing\Route as LaravelRoute;
use Tests\TestCase;

final class ApiSurfaceTest extends TestCase
{
    public function test_meta_advertises_the_implemented_shadow_resources(): void
    {
        $response = $this->getJson('/api/v1/meta');

        $response->assertOk()
            ->assertJsonPath('data.rolloutState', 'isolated-shadow')
            ->assertJsonPath('data.authentication', 'shared-cv_session-cv_csrf');

        $resources = $response->json('data.implementedResources');
        self::assertIsArray($resources);

        foreach ([
            'health',
            'meta',
            'sessions:login',
            'sessions:current',
            'sessions:logout',
            'sessions:change-password',
            'vouchers:list',
            'vouchers:duplicate-check',
            'vouchers:create',
            'vouchers:update',
            'vouchers:cancel',
            'vouchers:approve',
            'vouchers:reject',
            'receipts:attach',
            'receipts:read',
            'cash-close:preview',
            'cash-close:create',
            'cash-close:corrections',
            'dashboard:summary',
            'reports:recorded-movements',
            'vendors:list',
            'vendors:create',
            'vendors:update',
            'vendors:active-state',
            'users:list',
            'users:create',
            'users:update',
            'users:password-reset',
            'settings:read',
            'settings:update',
            'audit:list',
            'audit:voucher-history',
        ] as $resource) {
            self::assertContains($resource, $resources, 'Missing implemented resource: '.$resource);
        }
    }

    public function test_shadow_route_inventory_matches_registered_methods_and_paths(): void
    {
        $routes = app('router')->getRoutes()->getRoutes();

        $expected = [
            ['GET', 'api/v1/health/live'],
            ['GET', 'api/v1/health/ready'],
            ['GET', 'api/v1/meta'],
            ['POST', 'api/v1/sessions'],
            ['GET', 'api/v1/sessions/current'],
            ['POST', 'api/v1/sessions/current/logout'],
            ['POST', 'api/v1/sessions/current/password'],
            ['GET', 'api/v1/vouchers'],
            ['POST', 'api/v1/vouchers/duplicate-check'],
            ['POST', 'api/v1/vouchers'],
            ['PATCH', 'api/v1/vouchers/{voucherId}'],
            ['POST', 'api/v1/vouchers/{voucherId}/cancel'],
            ['POST', 'api/v1/vouchers/{voucherId}/approval'],
            ['POST', 'api/v1/vouchers/{voucherId}/rejection'],
            ['POST', 'api/v1/vouchers/{voucherId}/receipts'],
            ['GET', 'api/v1/receipts/{receiptId}'],
            ['GET', 'api/v1/vendors'],
            ['POST', 'api/v1/vendors'],
            ['PATCH', 'api/v1/vendors/{vendorId}'],
            ['POST', 'api/v1/vendors/{vendorId}/active'],
            ['GET', 'api/v1/cash-closes/preview'],
            ['POST', 'api/v1/cash-closes'],
            ['POST', 'api/v1/cash-closes/{closeId}/corrections'],
            ['GET', 'api/v1/dashboard/summary'],
            ['GET', 'api/v1/reports/recorded-movements'],
            ['GET', 'api/v1/users'],
            ['POST', 'api/v1/users'],
            ['PATCH', 'api/v1/users/{userId}'],
            ['POST', 'api/v1/users/{userId}/password-reset'],
            ['GET', 'api/v1/settings'],
            ['PUT', 'api/v1/settings'],
            ['GET', 'api/v1/audit-events'],
            ['GET', 'api/v1/vouchers/{voucherId}/history'],
        ];

        foreach ($expected as [$method, $uri]) {
            $registered = array_filter(
                $routes,
                static fn (LaravelRoute $route): bool => $route->uri() === $uri
                    && in_array($method, $route->methods(), true),
            );

            self::assertNotEmpty($registered, $method.' '.$uri.' must be registered.');
        }
    }
}
