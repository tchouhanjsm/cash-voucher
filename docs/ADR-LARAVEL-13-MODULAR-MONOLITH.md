# ADR — Laravel 13 modular monolith for Cash Voucher

- **Date:** 6 November 2026
- **Status:** Proposed; pending hosting qualification and architecture approval
- **Decision owner:** Product owner
- **Related:** [Platform migration ADR](APP-PLATFORM-MIGRATION-ADR-2026-11-04.md), [API v1 contract](API-V1-CONTRACT.md), [PHP session auth](PHP-SESSION-AUTH.md)

## Context

The current isolated backend is a custom PHP/PDO API with real security and persistence foundations, not a Laravel application. It has routes for liveness/readiness/meta and session lifecycle; it does not yet expose financial business routes. SQL migrations 0001–0004 establish identity/catalog, ledger/approval/receipt/cash-close, sessions/audit/idempotency and voucher-number sequences. The action registry and JSON action map describe the legacy API parity scope.

The existing architecture decision favored a small PHP API if the cPanel plan passes. The requested Laravel target changes the framework choice but not the data-integrity rules or hosting gate. The current account has not been qualified for Laravel 13. This ADR therefore selects Laravel as the target architecture, not as permission to deploy it.

## Decision

Build one Laravel 13 application as a modular monolith, MySQL/MariaDB as the only transactional ledger, and preserve the static PWA/IndexedDB outbox. Maintain one database/instance per customer until shared tenancy is deliberately designed. Keep `/api/v1` and its response/role/date/money/idempotency semantics stable.

### Module boundaries

- Identity: password/session/account lifecycle.
- Vendors: vendor catalog and snapshot support.
- Vouchers: voucher commands, reads and numbering.
- Approvals: immutable decision events.
- CashClose: close snapshots and append-only corrections.
- Receipts: private object storage and authorized streaming.
- Reporting: tested read models.
- Audit: append-only attributable event log.
- ImportExport: source manifests, staging imports and reconciliation.
- Operations: health/readiness, backup/restore evidence and deployment metadata.

HTTP controllers and Form Requests stay thin. Use explicit Actions/use cases, DTOs/value objects, repositories only where they isolate meaningful persistence/domain rules, policies/Gates for authorization, and Resources for stable response envelopes. Avoid generic service layers and unnecessary packages.

## Reuse and porting decisions

Port the existing `Role` capability map into Laravel Gates/Policies with exhaustive parity tests. Port the exact legacy HMAC password verifier/upgrade process, rate limits and session controls; prefer Laravel primitives only when their behavior is demonstrably equivalent. Port the row-locked per-type voucher sequence allocator, canonical-payload idempotency service and append-only audit writer as transaction-bound domain/application services. Preserve SQL columns, unique constraints and FK semantics. The current SQL migrations remain the immutable baseline; Laravel migration adoption must recognize existing schema versions/checksums and not re-run DDL.

Retire the custom PHP HTTP kernel, request/response/router and custom migration CLI only after equivalent Laravel routes/middleware/Artisan commands are tested and the Laravel runtime is the sole replacement implementation. Keep original code and tests until parity and cutover retention sign-off.

## Database strategy

Use MySQL/MariaDB InnoDB and the existing 0001–0004 model. Validate actual production compatibility with the chosen server version. Store canonical amounts as integer paise (BIGINT), business date as explicit Asia/Kolkata DATE, event timestamps as UTC DATETIME(6). Never use floating-point financial values. Financial writes must be one DB transaction containing domain row(s), number allocation, audit event and idempotency completion. No production destructive schema operations. New migrations are forward-only and checksum-controlled; production changes require reviewed backup/restore and release window.

## Authentication and API

Keep roles staff/manager/owner/accountant and creator-bound staff scope. Owner/manager view-all and accountant report-only are server-side. Maintain Secure/HttpOnly/SameSite cookies, CSRF on cookie-authenticated writes, six-hour absolute expiry, session revocation, no-store responses and HMAC-keyed login throttles. Legacy PEPPER is a temporary secret and is never committed.

Preserve API v1 JSON envelope, request IDs, errors, no-store, same-origin deployment and action map parity. Implement first vertical slice as authenticated scoped voucher list/create with money/date validation, idempotency conflict/replay, row-locked numbering and atomic audit. Do not open more financial endpoints until this slice passes its acceptance suite.

## Hosting gate

Verify exact Laravel 13 PHP/runtime requirements, Composer/CLI, public document-root isolation, extensions, DB engine/version, resource quotas, cron, storage outside web root, environment secret handling, private receipt delivery and off-host restore. The host must run Laravel securely without exposing application source or .env. If it cannot, stop and re-decide platform/budget; do not deploy a crippled Laravel application.

## Consequences

Positive: framework-standard HTTP/security/testing conventions, one application lifecycle, modular code ownership, minimal operational components, gradual reuse of proven core behavior.

Costs/risks: Composer/vendor footprint and Laravel runtime overhead may exceed a constrained shared-host plan; porting custom session semantics needs careful verification; Laravel migration bookkeeping must be aligned with existing SQL history; framework convenience can hide transaction boundaries unless explicit. These are measured in host qualification and first implementation PR.

## Rejected alternatives

- Keep custom PHP forever: lower immediate cost but conflicts with the selected Laravel target.
- Rewrite all security/schema from scratch: wastes validated work and creates avoidable regression risk.
- Microservices: excessive deployment, network and operational complexity for one customer/property ledger.
- Dual-write Sheets + SQL: cannot guarantee atomic commit across stores and risks split-brain financial records.
- Shared multi-tenant database now: outside current product model and complicates record scope/import/cutover.
