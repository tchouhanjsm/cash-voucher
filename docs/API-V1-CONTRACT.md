# Versioned PHP API — Phase 14–15 foundation

## Status

The PHP API is an isolated replacement foundation with a working session lifecycle only. The current PWA still calls the Apps Script API, and Apps Script + Sheets + Drive remain the single authoritative production writer. No PHP financial or business mutation route is exposed.

## Implemented routes

- `GET /api/v1/health/live` — process liveness; does not require a database.
- `GET /api/v1/health/ready` — runtime database connectivity and schema version 0004.
- `GET /api/v1/meta` — API version, rollout state, timezone, currency and legacy role keys.
- `POST /api/v1/sessions` — sign-in, legacy password upgrade and secure cookie creation.
- `GET /api/v1/sessions/current` — current-user and role revalidation plus session restore.
- `POST /api/v1/sessions/current/logout` — CSRF-protected session revocation.
- `POST /api/v1/sessions/current/password` — CSRF-protected password change and global session revocation.

All responses use a JSON envelope with ok, data or error, and a request identifier. Responses are not cacheable. The API does not enable cross-origin access; same-origin HTTPS is the default boundary. Unknown resources return 404 and unsupported methods return 405.

## Authentication and session security

- Session tokens are 256-bit random opaque values, stored only as SHA-256 hashes in user_sessions and sent in an HttpOnly, SameSite=Strict, Secure cookie on HTTPS.
- A separate random CSRF token is stored as a hash and in a SameSite=Strict cookie readable by the same-origin PWA. Every POST session mutation must send the same value in X-CSRF-Token; both cookie equality and database hash are checked.
- Sessions have a six-hour hard expiry. User active state and role are re-read on every authenticated request, so disabling a user or changing a role takes effect without waiting for token expiry.
- Login throttling uses HMAC-hashed normalized email and REMOTE_ADDR identifiers in login_attempts. Five failed attempts lock the relevant subjects for 15 minutes. Forwarded IP headers are not trusted.
- The legacy verifier supports the exact current Apps Script format HMAC-SHA256(salt + ':' + password, PEPPER). The source pepper is provided separately as CV_LEGACY_AUTH_PEPPER and is never exported automatically. A successful legacy login immediately rehashes with PHP password_hash. Short temporary credentials are accepted only when the account is marked must-change and CV_LEGACY_SHORT_CREDENTIAL_MIGRATION=PIN_TO_PASSWORD_V1 is explicitly enabled.
- Password change requires the current password and CSRF token, clears must-change, appends an audit event and revokes every active session in one database transaction.
- No token is returned in JSON. HTTPS is required outside localhost development. CORS is not enabled.

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

[api/v1/legacy-action-map.json](../api/v1/legacy-action-map.json) maps every action currently registered in backend/99-routes.gs, plus the separately handled public login action, to a proposed versioned route and required access scope. The PHP integration suite compares this map against the real Apps Script registry so an existing action cannot silently disappear from the migration plan. Only login, logout and changePassword are marked implemented. All financial, vendor, report, receipt, cash-close, backup, settings and user-management entries remain planned until a tested handler is implemented.

## Deliberately not implemented yet

Financial handlers, reports, receipt upload/download, owner recovery, backups, export/import, offline queue switching and customer/tenant provisioning are not exposed. The schema is a reviewed engineering starting point, not a production import schema. Build these as separate tested vertical slices after the hosting preflight and field-by-field legacy contract inventory.

## Configuration

The PHP runtime reads environment variables directly; it does not parse .env. Use the local .env.example as a checklist only. Web workers receive the runtime account. The DDL-capable migration account must be available only to an operator's CLI environment. Database credentials must remain outside the public document root.
