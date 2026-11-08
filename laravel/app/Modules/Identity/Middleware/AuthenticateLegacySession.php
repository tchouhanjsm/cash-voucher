<?php

namespace App\Modules\Identity\Middleware;

use CashVoucher\Api\Security\Role;
use CashVoucher\Api\Support\ApiException;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

final class AuthenticateLegacySession
{
    public function handle(Request $request, Closure $next, string $mode = ''): Response
    {
        $sessionToken = $request->cookie('cv_session');

        if (! is_string($sessionToken) || ! preg_match('/^[a-f0-9]{64}$/D', $sessionToken)) {
            throw new ApiException(401, 'SESSION_REQUIRED', 'Sign in to continue.');
        }

        $session = DB::table('user_sessions as s')
            ->join('users as u', 'u.id', '=', 's.user_id')
            ->where('s.session_token_hash', hash('sha256', $sessionToken))
            ->whereNull('s.revoked_at_utc')
            ->where('s.expires_at_utc', '>', DB::raw('UTC_TIMESTAMP(6)'))
            ->select([
                's.id as session_id',
                's.csrf_token_hash',
                's.last_seen_at_utc',
                'u.id',
                'u.full_name',
                'u.email',
                'u.role',
                'u.is_active',
                'u.must_change_password',
            ])
            ->first();

        if ($session === null || (int) $session->is_active !== 1 || ! Role::isKnown((string) $session->role)) {
            if ($session !== null) {
                DB::table('user_sessions')
                    ->where('user_id', $session->id)
                    ->whereNull('revoked_at_utc')
                    ->update(['revoked_at_utc' => DB::raw('UTC_TIMESTAMP(6)')]);
            }

            throw new ApiException(
                401,
                'SESSION_EXPIRED',
                'Your session is no longer valid. Sign in again.',
            );
        }

        $mustChangePassword = (int) $session->must_change_password === 1;
        $allowMustChange = $mode === 'allow-must-change';
        if ($mustChangePassword && ! $allowMustChange) {
            throw new ApiException(
                403,
                'PASSWORD_CHANGE_REQUIRED',
                'Change your temporary password before using financial features.',
            );
        }

        if (in_array($request->method(), ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            $csrfCookie = $request->cookie('cv_csrf');
            $csrfHeader = $request->header('X-CSRF-Token');

            if (
                ! is_string($csrfCookie)
                || ! preg_match('/^[a-f0-9]{64}$/D', $csrfCookie)
                || ! is_string($csrfHeader)
                || ! hash_equals($csrfCookie, $csrfHeader)
                || ! hash_equals((string) $session->csrf_token_hash, hash('sha256', $csrfHeader))
            ) {
                throw new ApiException(
                    403,
                    'CSRF_INVALID',
                    'The security token is missing or invalid. Refresh and try again.',
                );
            }
        }

        if (strtotime((string) $session->last_seen_at_utc) < time() - 300) {
            DB::table('user_sessions')
                ->where('id', $session->session_id)
                ->whereNull('revoked_at_utc')
                ->update(['last_seen_at_utc' => DB::raw('UTC_TIMESTAMP(6)')]);
        }

        $csrfCookie = $request->cookie('cv_csrf');
        if (
            is_string($csrfCookie)
            && preg_match('/^[a-f0-9]{64}$/D', $csrfCookie)
            && hash_equals((string) $session->csrf_token_hash, hash('sha256', $csrfCookie))
        ) {
            // A CSRF token is intentionally readable by same-origin application code.
            // The session credential remains HttpOnly and is never exposed in JSON.
            $request->attributes->set('csrf_token', $csrfCookie);
        }

        $request->attributes->set('principal', [
            'id' => (string) $session->id,
            'name' => (string) $session->full_name,
            'email' => (string) $session->email,
            'role' => (string) $session->role,
            'mustChangePassword' => $mustChangePassword,
            'sessionId' => (string) $session->session_id,
        ]);

        return $next($request);
    }
}
