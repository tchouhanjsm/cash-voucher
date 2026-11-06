# Cash Voucher Laravel API

This is an isolated Laravel 13 modular-monolith implementation under active migration. It does not replace the existing Apps Script writer, custom PHP API, PWA endpoint or IndexedDB queue.

## Runtime boundary

- Laravel 13 API routes live under /api/v1 when served from laravel/public.
- Authentication reads the existing cv_session and cv_csrf session records. The existing PHP session issuer remains the only login/session issuer in this phase.
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

## Implemented routes in this phase

| Method | Route                             | Scope                                                           |
| ------ | --------------------------------- | --------------------------------------------------------------- |
| GET    | /api/v1/health/live               | Public liveness, no DB dependency                               |
| GET    | /api/v1/health/ready              | Public DB/schema readiness check                                |
| GET    | /api/v1/meta                      | Public rollout metadata                                         |
| GET    | /api/v1/vouchers                  | Authenticated, creator-scoped for staff; manager/owner view-all |
| POST   | /api/v1/vouchers/duplicate-check  | Authenticated create capability + CSRF                          |
| POST   | /api/v1/vouchers                  | Single authenticated voucher create + CSRF + idempotency        |
| GET    | /api/v1/vendors                   | Manager/owner vendor list; active by default                    |
| POST   | /api/v1/vendors                   | Manager/owner vendor create + CSRF + idempotency                |
| PATCH  | /api/v1/vendors/{vendorId}        | Manager/owner vendor update + CSRF + idempotency                |
| POST   | /api/v1/vendors/{vendorId}/active | Manager/owner desired active-state change + CSRF + idempotency  |

The API preserves the existing { ok, data|error, meta } envelope, request ID, and no-store response policy. Money crosses the API boundary as a decimal string and is persisted as integer paise.

## Financial invariants

- Existing roles are reused unchanged: staff, manager, owner, accountant.
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
- Non-empty receipts and bulk requests are explicitly not supported by this slice; no receipt is silently discarded.

## Tests

The CI suite runs against a dedicated `cash_voucher_laravel_test` schema on the disposable MySQL 8.0 service. Its root SQL migrations and least-privilege runtime grants are prepared separately from the PHP API integration suite, so synthetic sequences and vouchers cannot leak between test suites. The tests do not use SQLite or Laravel destructive migration helpers. They create synthetic test users, sessions and vouchers only.

    composer validate --no-check-publish
    composer install
    vendor/bin/phpunit

The dependency graph was resolved successfully in CI and uploaded as an artifact for review. The tracked `laravel/composer.lock` is still a merge gate; clean installs currently resolve the graph until that lockfile is committed. Hosting qualification, schema-baseline adoption, login issuance, PWA transport changes, receipts, approval actions, cash close, exports/imports and production cutover remain separate gated work.
