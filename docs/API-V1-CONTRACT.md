# Versioned API contract — legacy PHP adapter and Laravel shadow implementation

## Status

The custom PHP API under `api/v1/` remains separate from the Laravel application under `laravel/`. Both are isolated from the production PWA. Apps Script + Sheets + Drive remain the single authoritative production writer. The current custom PHP API exposes session authentication and shared financial primitives; the Laravel 13 application adds the shadow financial/operations routes listed below. Neither API is production-routed by PR #269.

## Implemented routes

| Method | Path                              | Purpose                                                          |
| ------ | --------------------------------- | ---------------------------------------------------------------- |
| GET    | /api/v1/health/live               | Process liveness; no database required                           |
| GET    | /api/v1/health/ready              | Checks database connection and schema version 0005               |
| GET    | /api/v1/meta                      | API version, rollout state, timezone, currency, roles            |
| POST   | /api/v1/sessions                  | Verify credentials and issue a session                           |
| GET    | /api/v1/sessions/current          | Restore active user and current role                             |
| POST   | /api/v1/sessions/current/logout   | Revoke session with CSRF validation                              |
| POST   | /api/v1/sessions/current/password | Change password and revoke all sessions                          |
| GET    | /api/v1/bootstrap                 | Authenticated, role-scoped read-only PWA bootstrap compatibility |

All responses use a JSON envelope with ok, data or error, and a request identifier. Responses are not cacheable. The API does not enable cross-origin access; same-origin HTTPS is the default boundary. Unknown resources return 404 and unsupported methods return 405.

## Compatibility rules frozen for later service work

- Existing stored roles remain staff, manager, owner and accountant. "Admin" is presentation text only; there is no admin role.
- Capability parity is represented in CashVoucher\\Api\\Security\\Role; service handlers must call server-side authorization for every request.
- Staff record scope is creator-bound. Manager and Owner retain existing view-all capabilities; Accountant remains report-only.
- Money values cross the service boundary as decimal strings, are converted to integer paise, and are persisted as BIGINT. Never accept a floating-point amount as the canonical representation.
- Business date is explicit and belongs to Asia/Kolkata; event timestamps are UTC.
- Mutations must use actor/action/idempotency keys. The same key with a different request hash must be rejected. The isolated IdempotencyService now implements canonical-payload hashing, safe replay and a conflict response; the voucher number allocator and audit writer participate in the same caller-owned database transaction. CI starts a second PHP process against the same series row and verifies it waits for the first transaction and receives the next unique number.
- A financial mutation, its required audit event and its idempotency result must commit atomically.
- Approval events, cash-close corrections and audit events are append-only for the normal runtime DB account.
- Receipt metadata stores private storage keys and checksums, never public Drive or filesystem URLs.

## Legacy action inventory

[api/v1/legacy-action-map.json](../api/v1/legacy-action-map.json) maps every action currently registered in backend/99-routes.gs, plus the separately handled public login action, to a proposed versioned route and required access scope. The PHP integration suite compares this map against the actual Apps Script registry so an existing action cannot silently disappear from the migration plan. This map is the migration inventory; a route appearing in the Laravel shadow table is not evidence that the custom PHP API or production PWA already routes to it.

## Authentication boundary

Legacy credential compatibility is exact: Apps Script computes HMAC-SHA256 over `<salt>:<password>` with the Script Property `PEPPER`; the imported value is `legacy-hmac-sha256$<salt>$<lowercase-hex-hmac>`. A normal-length legacy credential is upgraded after successful verification. A short legacy PIN is accepted only when the explicit migration flag is enabled and the account is marked must-change; it remains in the legacy format until the user sets a compliant 8–128 character password. The existing password-change transaction then replaces the hash, clears the must-change flag and revokes all sessions. Integration tests must construct the exact serialization; the production verifier must not be weakened to accommodate malformed fixtures.

Sessions are 256-bit random tokens stored only as SHA-256 digests. The cv_session cookie is Secure, HttpOnly and SameSite=Strict; state-changing session routes additionally require the cv_csrf double-submit cookie and matching X-CSRF-Token header. Account/email, email/IP and IP-only login buckets are HMAC-keyed. Active status and current role are loaded from the database for each request. Password change and deactivation revoke all sessions. See [PHP session authentication](PHP-SESSION-AUTH.md) for environment and migration details.

## Not yet ported / not yet qualified

The Laravel shadow API now includes the route slices in the table above. Remaining unimplemented or unqualified areas include password recovery, MFA, session-administration UI, owner recovery, automated backup/restore operations, export/import manifests, offline queue switching, customer/tenant provisioning, full historical reconciliation and production cutover. The existing SQL schema is an engineering baseline, not an approved production import schema. Build the remaining capabilities as separate tested vertical slices after hosting preflight and field-by-field legacy contract inventory.

## Authentication secrets

Set CV_AUTH_RATE_LIMIT_KEY to an independent random secret of at least 32 characters. CV_LEGACY_PASSWORD_PEPPER must receive the existing Apps Script PEPPER securely while imported legacy HMAC hashes remain. CV_ALLOW_LEGACY_SHORT_PASSWORDS defaults to false and may be enabled only for the Owner-approved forced-change legacy PIN migration. See [PHP session authentication](PHP-SESSION-AUTH.md).

## Configuration

The PHP runtime reads environment variables directly; it does not parse .env. Use the local .env.example as a checklist only. Web workers receive the runtime account. The DDL-capable migration account must be available only to an operator's CLI environment. Database credentials must remain outside the public document root.

## Laravel 13 isolated shadow implementation

The Laravel application is exercised only against a dedicated disposable CI MySQL schema. It does not replace or modify the custom PHP API routes, and the PWA continues to call Apps Script.

The authenticated bootstrap route returns the legacy PWA data shape for the signed-in principal, property settings, a bounded recent voucher collection, role-appropriate vendor records and the permitted email/name directory. Staff voucher data is creator-scoped; Manager/Owner receive property-wide voucher/name data; Accountant receives no voucher or vendor records. The opening-balance setting is returned only to view-all roles and is masked to zero for Staff/Accountant. Inactive vendors remain visible as catalog metadata, matching the legacy bootstrap behavior. Owner onboarding checks are not implemented in Laravel. This is a read-only Laravel shadow endpoint and does not switch or configure the PWA transport; Apps Script remains the only production writer.

### Laravel browser transport — limited local shadow mode

The Laravel browser adapter is an opt-in, same-origin compatibility experiment. Login and current-session responses expose only the verified readable `cv_csrf` value for the current browser session. The opaque `cv_session` remains a Secure, HttpOnly cookie and is never returned in JSON or persisted by JavaScript. The adapter sends `credentials: same-origin`, holds the CSRF value in memory, refreshes it through `GET /sessions/current` after a reload, and sends it in `X-CSRF-Token` on state-changing requests. Cross-origin and non-HTTPS non-local bases fail closed.

The first supported browser actions are login, session restore, logout, password change, bootstrap, dashboard summary and a basic unfiltered/date/type/status register read. Search/facets/totals parity, vendor filters, dashboard daily-operations reads, receipts, bulk, duplicate confirmation, voucher/vendor/user/settings/audit/cash-close writes and all other unmapped legacy actions are rejected with `API_ACTION_UNSUPPORTED`. No action falls back to Apps Script from the Laravel adapter. Customer web builds hardcode `API_TRANSPORT=apps-script`; the Laravel switch exists only for explicit localhost development. IndexedDB storage/replay remains unchanged and must not be treated as safe to drain against the Laravel adapter until write and idempotency parity is completed.


| Method | Path                                      | Shadow implementation                                                            |
| ------ | ----------------------------------------- | -------------------------------------------------------------------------------- |
| GET    | /api/v1/health/live                       | Public liveness; no database dependency                                          |
| GET    | /api/v1/health/ready                      | Public read-only schema readiness check; requires schema 0005                    |
| GET    | /api/v1/meta                              | Public rollout and implemented-resource metadata                                 |
| POST   | /api/v1/sessions                          | Existing PHP-compatible login, legacy hash upgrade and throttling                |
| GET    | /api/v1/sessions/current                  | Restore current user, role and forced-change state                               |
| POST   | /api/v1/sessions/current/logout           | CSRF-protected session revocation and cookie expiry                              |
| POST   | /api/v1/sessions/current/password         | Legacy-compatible password change and revoke-all                                 |
| GET    | /api/v1/vouchers                          | Staff creator scope; Manager/Owner view-all; Accountant denied                   |
| POST   | /api/v1/vouchers/duplicate-check          | Create capability, shared session/CSRF and short-lived HMAC confirmation         |
| POST   | /api/v1/vouchers                          | Single voucher create; shared session/CSRF and required idempotency key          |
| PATCH  | /api/v1/vouchers/{voucherId}              | Manager/Owner reasoned correction, before/after audit and closed-date protection |
| POST   | /api/v1/vouchers/{voucherId}/cancel       | Manager/Owner reasoned cancellation, close-date protection and idempotency       |
| POST   | /api/v1/vouchers/{voucherId}/approval     | Manager/Owner pending-payment approval; self-approval denied                     |
| POST   | /api/v1/vouchers/{voucherId}/rejection    | Manager/Owner pending-payment rejection; reason required                         |
| POST   | /api/v1/vouchers/{voucherId}/receipts     | Staff-own or Manager/Owner private image attachment                              |
| GET    | /api/v1/receipts/{receiptId}              | Staff-own or Manager/Owner private download with integrity verification          |
| GET    | /api/v1/vendors                           | Manager/Owner only; active by default; paginated                                 |
| POST   | /api/v1/vendors                           | Manager/Owner create; CSRF, idempotency and append-only audit                    |
| PATCH  | /api/v1/vendors/{vendorId}                | Manager/Owner catalog update; issued voucher snapshots unchanged                 |
| POST   | /api/v1/vendors/{vendorId}/active         | Manager/Owner desired active-state change; idempotent                            |
| GET    | /api/v1/cash-closes/preview               | Manager/Owner server-authoritative MAIN drawer/day preview                       |
| POST   | /api/v1/cash-closes                       | Manager/Owner chronological, idempotent immutable daily close                    |
| POST   | /api/v1/cash-closes/{closeId}/corrections | Manager/Owner append-only attributed correction note; no restatement             |
| GET    | /api/v1/dashboard/summary                 | Staff creator-scoped; Manager/Owner property-wide SQL aggregates                 |
| GET    | /api/v1/reports/recorded-movements        | Manager/Owner/Accountant read-only filtered report with pagination               |
| GET    | /api/v1/users                             | Owner-only user list                                                             |
| POST   | /api/v1/users                             | Owner-only user creation with idempotency and audit                              |
| PATCH  | /api/v1/users/{userId}                    | Owner-only user update and applicable session revocation                         |
| POST   | /api/v1/users/{userId}/password-reset     | Owner-only password reset and session revocation                                 |
| GET    | /api/v1/settings                          | Owner-only property settings                                                     |
| PUT    | /api/v1/settings                          | Owner-only settings update with sequence validation, idempotency and audit       |
| GET    | /api/v1/audit-events                      | Owner-only cursor-paginated audit browser with sensitive-key redaction           |
| GET    | /api/v1/vouchers/{voucherId}/history      | Owner-only cursor-paginated voucher audit history                                |

Laravel now exposes shadow login, current-session, logout and password-change routes by reusing the existing PHP AuthenticationService, PasswordVerifier, AuthenticationRateLimiter and SessionService; no second password format or cookie contract was introduced. Eligible legacy HMAC hashes upgrade in the login/session transaction. Only the three session-lifecycle routes accept a forced-change session; all financial and administration routes continue to reject it. The custom PHP API routes are unchanged and the PWA still calls Apps Script. Neither implementation is production-routed by this PR.

Voucher create requires an explicitly seeded PAYMENT or RECEIPT row in `voucher_number_sequences`; missing series return `VOUCHER_SEQUENCE_NOT_INITIALIZED` and do not create a voucher. The sequence row is locked inside the existing PDO idempotency transaction. Voucher, append-only audit event and replay response are committed together. Existing payee/date/amount duplicate candidates require a short-lived confirmation token. The existing individual and payee/day cumulative ₹10,000 approval threshold is preserved.

Vendor writes use the existing transaction-owning IdempotencyService. The additive `0005_vendor_name_claims.sql` migration provides a unique case-insensitive name claim; existing rows are checked before a claim is acquired so legacy duplicates fail closed. Inactive names remain reserved, and activation rejects an ambiguous active name. Vendor updates change the catalog only; issued vouchers keep their immutable `vendor_name_snapshot`. See [LARAVEL-VENDOR-INVENTORY.md](LARAVEL-VENDOR-INVENTORY.md) for the inspected source-field map and the remaining creator-email snapshot gap. These routes are isolated Laravel shadow endpoints and do not alter the Apps Script action registry or production writer.

The read-only dashboard summary uses SQL aggregates and preserves staff creator scope; Manager/Owner receive property-wide figures and a team-member breakdown. The recorded-movements report is available only to Manager/Owner/Accountant, with Accountant restricted to read-only reporting; staff cannot access it. Pending/rejected payments are excluded from approved payment totals while remaining visible in the report. Report totals cover the full filtered set and rows are paginated up to 200 per request. Business date ranges are capped at ten years, and monetary values cross the API boundary as decimal strings.

Bulk voucher create remains explicitly rejected in this slice. Voucher edit/cancellation/approval/rejection and private receipt upload/download remain isolated shadow routes. Daily cash close follows the owner-approved one-MAIN-drawer-per-Asia/Kolkata-day policy: previous-day counted cash carries forward, a date gap requires a reasoned manual opening, and unclassified vouchers, invalid amounts or unresolved payment approvals block finalization. A successful close stores the immutable voucher-ID/amount/cash-impact snapshot with expected cash, physical count and variance; finalization is chronological and idempotent. A correction is a separately attributed append-only note and never edits the close or its totals. Full export/import manifests, offline synchronization and historical data migration remain unimplemented. The receipt disk is configured as private with no public symlink; file metadata is stored in the existing `voucher_receipts` table and each download rechecks authorization, byte length, MIME signature and SHA-256. No storage key or public URL is returned. Authentication lifecycle is implemented as a Laravel shadow API, using the same cookie, hashed-session, CSRF, six-hour expiry, login throttling and legacy HMAC-to-php-sha384$ upgrade behavior as the existing PHP implementation. CV_ALLOW_LEGACY_SHORT_PASSWORDS remains false by default; when temporarily enabled for an approved migration window, short legacy PIN login requires must_change_password=1 and grants only session restoration, sign-out or password-change access. A password change revokes all sessions. The root PHP API and its route registry remain unchanged; these Laravel shadow routes are not production-routed.
