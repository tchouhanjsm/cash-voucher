# Versioned PHP API — Phase 14 foundation

## Status

The PHP API is an isolated scaffold only. The current PWA still calls the Apps Script API, and Apps Script + Sheets + Drive remain the single authoritative production writer. The PHP endpoints in this phase do not create or mutate vouchers.

## Implemented routes

| Method | Path | Behavior |
|---|---|---|
| GET | /api/v1/health/live | Process liveness; does not require a database |
| GET | /api/v1/health/ready | Verifies the runtime DB account can connect, read schema_migrations, and sees schema version 0004 |
| GET | /api/v1/meta | Returns API version, isolated rollout state, business timezone, integer currency unit and legacy role keys |

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

[api/v1/legacy-action-map.json](../api/v1/legacy-action-map.json) maps every action currently registered in backend/99-routes.gs, plus the separately handled public login action, to a proposed versioned route and required access scope. The PHP integration suite compares this map against the real Apps Script registry so an existing action cannot silently disappear from the migration plan. All entries remain planned until a tested handler is implemented.

## Deliberately not implemented yet

Login/session creation, CSRF validation, password import/rehash, financial handlers, reports, receipt upload/download, owner recovery, backups, export/import, offline queue switching and customer/tenant provisioning are not exposed. The schema is a reviewed engineering starting point, not a production import schema. Build these as separate tested vertical slices after the hosting preflight and field-by-field legacy contract inventory.

## Configuration

The PHP runtime reads environment variables directly; it does not parse .env. Use the local .env.example as a checklist only. Web workers receive the runtime account. The DDL-capable migration account must be available only to an operator's CLI environment. Database credentials must remain outside the public document root.
