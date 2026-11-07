# Cash Voucher Laravel API

This is an isolated Laravel 13 modular-monolith implementation under active migration. It does not replace the existing Apps Script writer, custom PHP API, PWA endpoint or IndexedDB queue.

## Runtime boundary

- Laravel 13 API routes live under /api/v1 when served from laravel/public.
- Laravel login, current-session restoration, logout and password change reuse the existing AuthenticationService, PasswordVerifier, AuthenticationRateLimiter and SessionService from api/v1/src. The custom PHP API remains unchanged; both implementations use the same hashed cv_session/cv_csrf database contract. These Laravel routes are isolated shadow endpoints, and the PWA continues to use Apps Script.
- MySQL/MariaDB must already contain the reviewed root SQL schema versions 0001–0005.
- Laravel never runs schema migrations automatically. Do not run artisan migrate, migrate:fresh, db:wipe, or schema-changing commands from this project.
- The first financial write uses the existing PDO voucher-number allocator, idempotency unit of work and audit writer from api/v1/src.
- Voucher creation fails closed when the PAYMENT/RECEIPT number sequence is absent. It never guesses a historical next number.
- The PWA still calls the existing Apps Script endpoint. No production endpoint has been switched.

## Local development

Use a disposable local MySQL database and a least-privilege runtime account. Apply the existing root schema migrations only to that disposable database:

    CV_APP_ENV=local CV_ALLOW_SCHEMA_MIGRATIONS=true php ../bin/migrate.php --apply

From this directory, install dependencies, copy .env.example to .env, and set only local disposable database credentials:

    composer install
    cp .env.example .env
    php artisan key:generate
    php artisan serve --host=127.0.0.1 --port=8000

Set CV_DUPLICATE_CONFIRMATION_KEY to an independent random value of at least 32 characters. Do not copy production secrets into local files, CI, or this project.

The APP_KEY is used by Laravel's encryption services; this API does not use Laravel cookie sessions. The browser authentication contract remains cv_session plus cv_csrf.

## Local verification and browser smoke test

Use Node 22 for the repository checks (`.nvmrc`). On the development Mac, invoke MacPorts PHP explicitly: `php` may still resolve to XAMPP PHP 8.2.4, while Laravel requires PHP 8.3 or newer.

From the repository root:

```bash
nvm install 22
nvm use 22
npm ci
npm run check
```

Laravel dependency, runtime and PHP syntax checks:

```bash
cd laravel
/opt/local/bin/php83 /usr/local/bin/composer install --no-interaction --prefer-dist --no-progress
/opt/local/bin/php83 /usr/local/bin/composer validate --no-check-publish
/opt/local/bin/php83 artisan --version
find app bootstrap config public routes tests -type f -name '*.php' -print0 | xargs -0 -n1 /opt/local/bin/php83 -l
cd ..
```

For the browser smoke test, start Laravel in one terminal and the same-origin PWA proxy in another:

```bash
cd laravel
/opt/local/bin/php83 artisan serve --host=127.0.0.1 --port=8000
```

```bash
nvm use 22
npm run dev:laravel-shadow
```

Open `http://127.0.0.1:4173/?transport=laravel-shadow`. The proxy binds only to loopback, serves an allow-list of PWA assets and forwards only `/api/v1/*` to Laravel on port 8000. It preserves the session and CSRF cookies so the browser uses one origin. Do not enter production credentials or real business data. The adapter rejects financial writes and unsupported actions.

A real local login/bootstrap test requires an isolated disposable **MySQL 8.0** database with the root schema baseline applied and a test user. PHPUnit's `laravel/phpunit.xml` targets `cash_voucher_laravel_test` and its dedicated test account. XAMPP MariaDB 10.4.28 is not a substitute for the MySQL 8.0 test target; do not point the suite or migrations at XAMPP's operational database. When a separate MySQL 8.0 test instance is available, run the feature suite from `laravel/`:

```bash
cd laravel
/opt/local/bin/php83 vendor/bin/phpunit
```

Do not run `artisan migrate`, `migrate:fresh`, `db:wipe` or schema-changing commands. Apply only the reviewed root SQL baseline to a disposable local database through the guarded CLI migration runner, using a local-only DDL account and explicit `CV_APP_ENV=local` plus `CV_ALLOW_SCHEMA_MIGRATIONS=true`. The CI feature suite currently supplies the isolated MySQL 8.0 evidence when local MySQL 8.0 is unavailable.

## Implemented routes in this phase

| Method | Route                                     | Scope                                                                        |
| ------ | ----------------------------------------- | ---------------------------------------------------------------------------- |
| GET    | /api/v1/health/live                       | Public liveness, no DB dependency                                            |
| GET    | /api/v1/health/ready                      | Public DB/schema readiness check                                             |
| GET    | /api/v1/meta                              | Public rollout metadata                                                      |
| POST   | /api/v1/sessions                          | Login; legacy HMAC verification/upgrade; throttled; sets Secure cookies      |
| GET    | /api/v1/sessions/current                  | Restore session and current role                                             |
| POST   | /api/v1/sessions/current/logout           | CSRF-protected logout; revokes active session and clears cookies             |
| POST   | /api/v1/sessions/current/password         | CSRF-protected password change; revokes all sessions                         |
| GET    | /api/v1/bootstrap                         | Authenticated read-only PWA bootstrap shape; role-scoped voucher/vendor data |
| GET    | /api/v1/vouchers                          | Authenticated, creator-scoped for staff; manager/owner view-all              |
| POST   | /api/v1/vouchers/duplicate-check          | Authenticated create capability + CSRF                                       |
| POST   | /api/v1/vouchers                          | Single authenticated voucher create + CSRF + idempotency                     |
| GET    | /api/v1/vendors                           | Manager/owner vendor list; active by default                                 |
| POST   | /api/v1/vendors                           | Manager/owner vendor create + CSRF + idempotency                             |
| PATCH  | /api/v1/vendors/{vendorId}                | Manager/owner vendor update + CSRF + idempotency                             |
| POST   | /api/v1/vendors/{vendorId}/active         | Manager/owner desired active-state change + CSRF + idempotency               |
| PATCH  | /api/v1/vouchers/{voucherId}              | Manager/owner correction with reason + idempotency                           |
| POST   | /api/v1/vouchers/{voucherId}/cancel       | Manager/owner cancellation with reason + idempotency                         |
| POST   | /api/v1/vouchers/{voucherId}/approval     | Manager/owner pending-payment approval + immutable event                     |
| POST   | /api/v1/vouchers/{voucherId}/rejection    | Manager/owner pending-payment rejection + reason                             |
| POST   | /api/v1/vouchers/{voucherId}/receipts     | Staff-own or manager/owner; private image upload                             |
| GET    | /api/v1/receipts/{receiptId}              | Staff-own or manager/owner; private image retrieval                          |
| GET    | /api/v1/cash-closes/preview               | Manager/owner server-side daily cash preview                                 |
| POST   | /api/v1/cash-closes                       | Manager/owner idempotent immutable daily close                               |
| POST   | /api/v1/cash-closes/{closeId}/corrections | Manager/owner attributed correction note, append-only                        |
| GET    | /api/v1/dashboard/summary                 | Staff creator-scoped; Manager/Owner property-wide; SQL aggregates            |
| GET    | /api/v1/reports/recorded-movements        | Manager/Owner/Accountant read-only report with pagination                    |

The API preserves the existing { ok, data|error, meta } envelope, request ID, and no-store response policy. Money crosses the API boundary as a decimal string and is persisted as integer paise.

The bootstrap route is an isolated compatibility read only. It returns property settings and the initial PWA data shape with Staff creator scope, Manager/Owner property scope and an Accountant-empty voucher/vendor collection. The opening-balance setting is masked to zero for roles without view-all access. Owner onboarding checks are not yet available in Laravel. The PWA still uses its configured Apps Script endpoint; this route is not an endpoint-switch authorization.

## Browser transport experiment (local only)

The opt-in localhost flag `?transport=laravel-shadow` selects a same-origin cookie-session adapter for the limited read/auth surface described in [the API contract](../docs/API-V1-CONTRACT.md). The adapter does not expose or persist the HttpOnly `cv_session` secret. It holds only the verified CSRF value in memory and obtains a fresh value from the authenticated current-session route after reload. Cross-origin and non-HTTPS non-local hosts are rejected.

Customer builds always set `API_TRANSPORT=apps-script`. Do not add the Laravel flag to a customer URL or change the configured Apps Script endpoint. Voucher writes, receipt transfers, duplicate-check confirmation, bulk, filters/facets/totals parity and the IndexedDB outbox drain are deliberately unsupported in this adapter; unsupported actions fail closed. Do not use the Laravel browser mode for financial entry or queue replay.

## Financial invariants

- Existing roles are reused unchanged: staff, manager, owner, accountant.
- Password verification reuses the exact legacy Apps Script HMAC serialization and the existing php-sha384$ adaptive-hash format. Successful eligible legacy logins upgrade the hash in the same transaction that creates the session; plaintext passwords are never stored.
- Session tokens and CSRF tokens are 256-bit random values; only SHA-256 digests are persisted. Cookies are Secure, HttpOnly for cv_session, SameSite=Strict and scoped to /api/v1; authenticated mutations require the CSRF double-submit value.
- Login rate limits use HMAC-keyed account/composite/IP buckets. Unknown-user verification burns comparable password-hash work. Inactive and unknown-role accounts fail closed.
- A short legacy PIN is accepted only when CV_ALLOW_LEGACY_SHORT_PASSWORDS=true and must_change_password=1; such a session can only restore, sign out or change its password. A successful password change uses an 8–128 character password and revokes every session.
- Accountant has no voucher-register/create capability.
- Staff can list only their own vouchers.
- Voucher number allocation takes a per-type InnoDB row lock inside the idempotency transaction.
- Voucher + audit event + completed idempotency result commit atomically.
- Same actor/action/idempotency key and same canonical payload replays the original result. Reusing the key with different content conflicts.
- A different clientId collision conflicts instead of silently creating a duplicate.
- Possible exact payee/date/amount payment duplicates require a ten-minute HMAC-signed confirmation token; the candidates are rechecked after acquiring the series row lock.
- The ₹10,000 individual and payee/day cumulative active-payment approval threshold is preserved.
- A cash-closed business date cannot accept another voucher.
- Vendor access is manager/owner only. Inactive vendors remain available to history but are excluded from default choices; names remain reserved when deactivated.
- Vendor writes claim case-insensitive names in the same DB transaction, audit before/after snapshots and replay through actor/action/idempotency keys. Historical voucher vendor-name snapshots are never rewritten when a catalog entry changes.
- Voucher edit requires a 3–200 character correction reason; cancelled vouchers cannot be edited, and both the original and destination dates are blocked after cash close.
- Category/notes-only corrections preserve an existing approval. Material payment edits recalculate threshold eligibility and clear stale approval actor/time/reason only when the legacy workflow would do so.
- Cancellation is active-only, requires a reason, is blocked after cash close and uses idempotency.
- Approval/rejection is Manager/Owner-only, requires an active pending PAYMENT and prevents self-approval. The decision row in `voucher_approval_events`, generic audit event and replay response commit with the voucher update.
- Receipt upload accepts JPEG/PNG/WebP only, verifies the actual MIME signature, enforces 1.6 MB and three files per voucher, and requires an active voucher on an open business date.
- Receipt bytes live only on the configured private disk under a random storage key. SQL stores the key, type, byte size and SHA-256; download checks parent-voucher permission and verifies the hash before streaming with no-store headers. The key is never returned and no public storage symlink is configured.
- Dashboard summary is a read-only SQL read model. Staff see only their own records; Manager/Owner see property-wide data and team totals. Accountant does not receive dashboard or voucher-register access.
- Recorded-movement reporting requires the `reports` capability (Manager/Owner/Accountant); it is read-only, uses bounded ten-year filters and 1–200 page sizes, and returns full-set totals with decimal-string amounts. Pending/rejected payments are excluded from approved payment totals but remain visible as report rows.
- Legacy vendor-name fallback resolves a vendor ID only when the normalized name matches exactly one catalog row; ambiguous historical matches remain unresolved and are counted.
- Daily cash close is one `MAIN` drawer per Asia/Kolkata calendar day. It carries forward the previous date's accepted count; a gap requires a manual opening amount and reason. Closing is chronological and blocked by invalid vouchers, unresolved cash impact or pending/rejected payments.
- Close totals are derived from active server-side vouchers only. The immutable close stores included IDs and cash-impact snapshots, expected/count/variance, actor and time zone. Same-key retries replay; a separate correction note never edits the close or restates totals.
- Bulk voucher requests remain explicitly unsupported by this slice; they are not silently accepted.

## Tests

The CI suite runs against a dedicated `cash_voucher_laravel_test` schema on the disposable MySQL 8.0 service. Its root SQL migrations and least-privilege runtime grants are prepared separately from the PHP API integration suite, so synthetic sequences and vouchers cannot leak between test suites. The tests do not use SQLite or Laravel destructive migration helpers. They create synthetic test users, sessions and vouchers only.

    composer validate --no-check-publish
    composer install
    vendor/bin/phpunit

The tracked `laravel/composer.lock` is committed and Composer CI uses deterministic `composer install`. PR #270 merged this dependency change into `client-main`. Hosting qualification, schema-baseline adoption, PWA transport changes, exports/imports and production cutover remain separate gated work.
