# Versioned PHP API — isolated replacement foundation

## Status

The PHP API is isolated from the PWA. The session-authentication routes are implemented, but Apps Script + Sheets + Drive remain the single authoritative production writer. The PHP API does not create or mutate vouchers.

## Implemented routes

| Method | Path                              | Purpose                                               |
| ------ | --------------------------------- | ----------------------------------------------------- |
| GET    | /api/v1/health/live               | Process liveness; no database required                |
| GET    | /api/v1/health/ready              | Checks database connection and schema version 0004    |
| GET    | /api/v1/meta                      | API version, rollout state, timezone, currency, roles |
| POST   | /api/v1/sessions                  | Verify credentials and issue a session                |
| GET    | /api/v1/sessions/current          | Restore active user and current role                  |
| POST   | /api/v1/sessions/current/logout   | Revoke session with CSRF validation                   |
| POST   | /api/v1/sessions/current/password | Change password and revoke all sessions               |

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

[api/v1/legacy-action-map.json](../api/v1/legacy-action-map.json) maps every action currently registered in backend/99-routes.gs, plus the separately handled public login action, to a proposed versioned route and required access scope. The PHP integration suite compares this map against the real Apps Script registry so an existing action cannot silently disappear from the migration plan. Login, logout and password change are implemented in this phase. All other financial and operational actions remain planned.

## Authentication boundary

Legacy credential compatibility is exact: Apps Script computes HMAC-SHA256 over `<salt>:<password>` with the Script Property `PEPPER`; the imported value is `legacy-hmac-sha256$<salt>$<lowercase-hex-hmac>`. A normal-length legacy credential is upgraded after successful verification. A short legacy PIN is accepted only when the explicit migration flag is enabled and the account is marked must-change; it remains in the legacy format until the user sets a compliant 8–128 character password. The existing password-change transaction then replaces the hash, clears the must-change flag and revokes all sessions. Integration tests must construct the exact serialization; the production verifier must not be weakened to accommodate malformed fixtures.

Sessions are 256-bit random tokens stored only as SHA-256 digests. The cv_session cookie is Secure, HttpOnly and SameSite=Strict; state-changing session routes additionally require the cv_csrf double-submit cookie and matching X-CSRF-Token header. Account/email, email/IP and IP-only login buckets are HMAC-keyed. Active status and current role are loaded from the database for each request. Password change and deactivation revoke all sessions. See [PHP session authentication](PHP-SESSION-AUTH.md) for environment and migration details.

## Deliberately not implemented yet

Owner-admin user CRUD/password reset, password recovery, MFA, session administration UI, financial handlers, reports, receipt upload/download, owner recovery, backups, export/import, offline queue switching and customer/tenant provisioning are not exposed. The schema is a reviewed engineering starting point, not a production import schema. Build these as separate tested vertical slices after the hosting preflight and field-by-field legacy contract inventory.

## Authentication secrets

Set CV_AUTH_RATE_LIMIT_KEY to an independent random secret of at least 32 characters. CV_LEGACY_PASSWORD_PEPPER must receive the existing Apps Script PEPPER securely while imported legacy HMAC hashes remain. CV_ALLOW_LEGACY_SHORT_PASSWORDS defaults to false and may be enabled only for the Owner-approved forced-change legacy PIN migration. See [PHP session authentication](PHP-SESSION-AUTH.md).

## Configuration

The PHP runtime reads environment variables directly; it does not parse .env. Use the local .env.example as a checklist only. Web workers receive the runtime account. The DDL-capable migration account must be available only to an operator's CLI environment. Database credentials must remain outside the public document root.
