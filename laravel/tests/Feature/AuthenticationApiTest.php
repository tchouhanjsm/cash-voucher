<?php

declare(strict_types=1);

namespace Tests\Feature;

use CashVoucher\Api\Security\PasswordVerifier;
use Illuminate\Testing\TestResponse;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class AuthenticationApiTest extends TestCase
{
    private array $originalEnvironment = [];

    protected function setUp(): void
    {
        parent::setUp();

        foreach ([
            'CV_AUTH_RATE_LIMIT_KEY' => 'cash-voucher-laravel-auth-test-rate-key-32chars',
            'CV_LEGACY_PASSWORD_PEPPER' => 'cash-voucher-laravel-auth-test-pepper',
            'CV_ALLOW_LEGACY_SHORT_PASSWORDS' => 'false',
        ] as $key => $value) {
            $this->originalEnvironment[$key] = getenv($key);
            putenv($key.'='.$value);
        }
    }

    protected function tearDown(): void
    {
        foreach ($this->originalEnvironment as $key => $value) {
            if ($value === false) {
                putenv($key);
            } else {
                putenv($key.'='.$value);
            }
        }

        parent::tearDown();
    }

    public function test_password_login_issues_hashed_session_and_csrf_cookies_and_current_session_restores_user(): void
    {
        $password = 'Normal-Password-2026!';
        [$userId, $email] = $this->createCredentialUser('staff', $password);

        $login = $this->postJson('/api/v1/sessions', [
            'email' => $email,
            'password' => $password,
        ]);

        $cookies = $this->cookieValues($login);

        $login->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('data.user.id', $userId)
            ->assertJsonPath('data.user.email', $email)
            ->assertJsonPath('data.user.role', 'staff')
            ->assertJsonPath('data.user.mustChangePassword', false)
            ->assertJsonMissingPath('data.sessionToken')
            ->assertJsonMissingPath('data.user.sessionToken')
            ->assertJsonPath('data.csrfToken', $cookies['cv_csrf']);

        self::assertSame(64, strlen($cookies['cv_session']));
        self::assertSame(64, strlen($cookies['cv_csrf']));

        $session = DB::table('user_sessions')
            ->where('user_id', $userId)
            ->orderByDesc('created_at_utc')
            ->first();

        self::assertNotNull($session);
        self::assertSame(hash('sha256', $cookies['cv_session']), $session->session_token_hash);
        self::assertSame(hash('sha256', $cookies['cv_csrf']), $session->csrf_token_hash);
        self::assertStringNotContainsString($cookies['cv_session'], (string) $session->session_token_hash);

        $setCookies = $login->headers->all('set-cookie');
        self::assertCount(2, $setCookies);
        $normalizedCookieHeaders = strtolower(implode(';', $setCookies));
        self::assertStringContainsString('secure', $normalizedCookieHeaders);
        self::assertStringContainsString('samesite=strict', $normalizedCookieHeaders);
        self::assertStringContainsString('httponly', strtolower($setCookies[0]));
        self::assertStringNotContainsString('httponly', strtolower($setCookies[1]));

        $current = $this->withSessionCookies($cookies)
            ->getJson('/api/v1/sessions/current');

        $current->assertOk()
            ->assertJsonPath('data.user.id', $userId)
            ->assertJsonPath('data.user.name', 'Laravel Test staff')
            ->assertJsonPath('data.user.role', 'staff')
            ->assertJsonPath('data.user.mustChangePassword', false)
            ->assertJsonPath('data.csrfToken', $cookies['cv_csrf'])
            ->assertJsonMissingPath('data.user.sessionId');
    }

    public function test_successful_legacy_hmac_login_upgrades_hash_in_the_session_transaction(): void
    {
        $password = 'Legacy-Password-2026!';
        [$userId, $email] = $this->createCredentialUser('manager', $password);
        $salt = 'legacy-salt-'.bin2hex(random_bytes(8));
        $legacyHash = hash_hmac(
            'sha256',
            $salt.':'.$password,
            (string) getenv('CV_LEGACY_PASSWORD_PEPPER'),
        );
        $storedLegacy = 'legacy-hmac-sha256$'.$salt.'$'.$legacyHash;

        DB::table('users')->where('id', $userId)->update([
            'password_hash' => $storedLegacy,
            'must_change_password' => 0,
        ]);

        $login = $this->postJson('/api/v1/sessions', [
            'email' => $email,
            'password' => $password,
        ]);

        $login->assertOk()
            ->assertJsonPath('data.user.id', $userId)
            ->assertJsonPath('data.user.mustChangePassword', false);

        $upgraded = (string) DB::table('users')->where('id', $userId)->value('password_hash');
        self::assertStringStartsWith('php-sha384$', $upgraded);
        self::assertNotSame($storedLegacy, $upgraded);
        self::assertTrue((new PasswordVerifier())->verify($upgraded, $password, false)['valid']);

        self::assertSame(
            1,
            DB::table('audit_events')
                ->where('actor_user_id', $userId)
                ->where('event_type', 'AUTH_LOGIN_SUCCESS')
                ->count(),
        );
    }

    public function test_forced_change_legacy_pin_can_only_restore_session_sign_out_or_change_password(): void
    {
        putenv('CV_ALLOW_LEGACY_SHORT_PASSWORDS=true');

        $pin = '4821';
        [$userId, $email] = $this->createCredentialUser('manager', 'Fixture-Temporary-Password-2026!', true);
        $salt = 'forced-pin-'.bin2hex(random_bytes(8));
        $legacyHash = hash_hmac(
            'sha256',
            $salt.':'.$pin,
            (string) getenv('CV_LEGACY_PASSWORD_PEPPER'),
        );
        $storedLegacy = 'legacy-hmac-sha256$'.$salt.'$'.$legacyHash;
        DB::table('users')->where('id', $userId)->update([
            'password_hash' => $storedLegacy,
            'must_change_password' => 1,
        ]);

        $firstLogin = $this->postJson('/api/v1/sessions', [
            'email' => $email,
            'password' => $pin,
        ]);
        $firstLogin->assertOk()
            ->assertJsonPath('data.user.mustChangePassword', true);
        $firstCookies = $this->cookieValues($firstLogin);

        $secondLogin = $this->postJson('/api/v1/sessions', [
            'email' => $email,
            'password' => $pin,
        ]);
        $secondLogin->assertOk()
            ->assertJsonPath('data.user.mustChangePassword', true);
        $secondCookies = $this->cookieValues($secondLogin);

        self::assertSame(
            $storedLegacy,
            (string) DB::table('users')->where('id', $userId)->value('password_hash'),
            'A short forced-change PIN must not be rehashed as a normal password.',
        );

        $current = $this->withSessionCookies($firstCookies)
            ->getJson('/api/v1/sessions/current');
        $current->assertOk()->assertJsonPath('data.user.mustChangePassword', true);

        $this->withSessionCookies($firstCookies)
            ->getJson('/api/v1/vendors')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'PASSWORD_CHANGE_REQUIRED');

        $newPassword = 'New-Password-After-Reset-2026!';
        $change = $this->withSessionCookies($firstCookies)
            ->postJson('/api/v1/sessions/current/password', [
                'oldPassword' => $pin,
                'newPassword' => $newPassword,
            ]);
        $change->assertOk()
            ->assertJsonPath('data.passwordChanged', true)
            ->assertJsonPath('data.sessionRevoked', true)
            ->assertJsonPath('data.requiresSignIn', true);

        self::assertSame(0, (int) DB::table('users')->where('id', $userId)->value('must_change_password'));
        $updatedHash = (string) DB::table('users')->where('id', $userId)->value('password_hash');
        self::assertStringStartsWith('php-sha384$', $updatedHash);
        self::assertTrue((new PasswordVerifier())->verify($updatedHash, $newPassword, false)['valid']);
        self::assertSame(
            2,
            DB::table('user_sessions')->where('user_id', $userId)->whereNotNull('revoked_at_utc')->count(),
        );

        $secondSessionCheck = $this->withSessionCookies($secondCookies)
            ->getJson('/api/v1/sessions/current');
        $secondSessionCheck->assertUnauthorized()
            ->assertJsonPath('error.code', 'SESSION_EXPIRED');

        $clearHeaders = $change->headers->all('set-cookie');
        self::assertCount(2, $clearHeaders);
        self::assertStringContainsString('Max-Age=0', implode(';', $clearHeaders));

        $relogin = $this->postJson('/api/v1/sessions', [
            'email' => $email,
            'password' => $newPassword,
        ]);
        $relogin->assertOk()->assertJsonPath('data.user.mustChangePassword', false);
    }

    public function test_invalid_login_is_generic_and_rate_limited_without_creating_sessions(): void
    {
        $password = 'Correct-Password-2026!';
        [$userId, $email] = $this->createCredentialUser('staff', $password);

        for ($attempt = 1; $attempt <= 4; $attempt++) {
            $this->postJson('/api/v1/sessions', [
                'email' => $email,
                'password' => 'incorrect-password',
            ])->assertUnauthorized()
                ->assertJsonPath('error.code', 'AUTH_FAILED');
        }

        $this->postJson('/api/v1/sessions', [
            'email' => $email,
            'password' => 'incorrect-password',
        ])->assertStatus(429)
            ->assertJsonPath('error.code', 'AUTH_RATE_LIMITED');

        $this->postJson('/api/v1/sessions', [
            'email' => $email,
            'password' => $password,
        ])->assertStatus(429)
            ->assertJsonPath('error.code', 'AUTH_RATE_LIMITED');

        self::assertSame(0, DB::table('user_sessions')->where('user_id', $userId)->count());
        self::assertGreaterThan(
            0,
            DB::table('audit_events')->where('actor_user_id', $userId)->where('event_type', 'AUTH_LOGIN_FAILED')->count(),
        );
    }

    public function test_logout_revokes_session_and_clears_both_cookies(): void
    {
        $password = 'Logout-Password-2026!';
        [$userId, $email] = $this->createCredentialUser('staff', $password);
        $login = $this->postJson('/api/v1/sessions', [
            'email' => $email,
            'password' => $password,
        ])->assertOk();
        $cookies = $this->cookieValues($login);

        $logout = $this->withSessionCookies($cookies)
            ->postJson('/api/v1/sessions/current/logout', []);
        $logout->assertOk()->assertJsonPath('data.signedOut', true);

        self::assertNotNull(
            DB::table('user_sessions')->where('user_id', $userId)->value('revoked_at_utc'),
        );
        self::assertSame(2, count($logout->headers->all('set-cookie')));
        self::assertStringContainsString('Max-Age=0', implode(';', $logout->headers->all('set-cookie')));

        $this->withSessionCookies($cookies)
            ->getJson('/api/v1/sessions/current')
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'SESSION_EXPIRED');
    }

    public function test_password_change_requires_valid_csrf_and_a_different_strong_password(): void
    {
        $password = 'Current-Password-2026!';
        [$userId, $email] = $this->createCredentialUser('staff', $password);
        $login = $this->postJson('/api/v1/sessions', [
            'email' => $email,
            'password' => $password,
        ])->assertOk();
        $cookies = $this->cookieValues($login);

        $this->withCredentials()
            ->withUnencryptedCookies($cookies)
            ->withHeaders(['X-CSRF-Token' => str_repeat('a', 64)])
            ->postJson('/api/v1/sessions/current/password', [
                'oldPassword' => $password,
                'newPassword' => 'New-Password-2026!',
            ])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'CSRF_INVALID');

        $this->withSessionCookies($cookies)
            ->postJson('/api/v1/sessions/current/password', [
                'oldPassword' => 'wrong-password',
                'newPassword' => 'New-Password-2026!',
            ])
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'CURRENT_PASSWORD_INVALID');

        self::assertSame(0, (int) DB::table('users')->where('id', $userId)->value('must_change_password'));
    }

    /** @return array{0:string,1:string} */
    private function createCredentialUser(string $role, string $password, bool $mustChange = false): array
    {
        $userId = $this->createUser($role);
        $email = (string) DB::table('users')->where('id', $userId)->value('email');
        $hash = (new PasswordVerifier())->hash($password);
        DB::table('users')->where('id', $userId)->update([
            'password_hash' => $hash,
            'must_change_password' => $mustChange ? 1 : 0,
        ]);

        return [$userId, $email];
    }

    /** @return array{cv_session:string,cv_csrf:string} */
    private function cookieValues(TestResponse $response): array
    {
        $values = [];
        foreach ($response->headers->all('set-cookie') as $header) {
            $pair = explode('=', explode(';', $header, 2)[0], 2);
            if (count($pair) === 2) {
                $values[trim($pair[0])] = trim($pair[1]);
            }
        }

        self::assertArrayHasKey('cv_session', $values);
        self::assertArrayHasKey('cv_csrf', $values);

        return [
            'cv_session' => $values['cv_session'],
            'cv_csrf' => $values['cv_csrf'],
        ];
    }

    /** @param array{cv_session:string,cv_csrf:string} $cookies */
    private function withSessionCookies(array $cookies): static
    {
        return $this->withCredentials()
            ->withUnencryptedCookies($cookies)
            ->withHeaders(['X-CSRF-Token' => $cookies['cv_csrf']]);
    }
}
