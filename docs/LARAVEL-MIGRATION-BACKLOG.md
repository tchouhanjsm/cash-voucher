# Laravel migration phased backlog

**PR #282 implementation update:** local-shadow receipt transport is wired through the PWA; the browser adapter supports private receipt attach/download and Register receipt IDs. New Entry now connects the existing `checkPaymentDuplicates` review to the authenticated Laravel duplicate-check endpoint, checking each batch row against persisted active payment history and returning the role-filtered matches plus a short-lived, entry-bound HMAC confirmation token. Duplicate checks are read-only; the token is stable within its ten-minute review window. The UI still requires the existing review-then-save-again interaction. Laravel-shadow voucher creation remains fail-closed and unsupported. Read-only entry suggestions remain advisory and user-selected. Apps Script remains the sole production financial authority; outbox replay and cutover remain gated.

**Current integration status:** PR #273 (sequence-safe bootstrap), PR #275 (vendor write transport), PR #276 (Laravel-shadow Dashboard/Admin reads), PR #278 (novice-first New Entry) and PR #280 (Dashboard/Admin workspace consolidation) are merged into `client-main`. PR #282 remains open and adds private receipt browser transport, deterministic entry suggestions and the existing New Entry duplicate-review interaction through authenticated Laravel-shadow calls. The duplicate check is read-only, role-scoped and limited to persisted active PAYMENT matches on exact payee/date/amount; same-batch unsaved-row matching is not included. Laravel-shadow voucher creation, customer endpoint routing and IndexedDB outbox replay remain disabled. Host qualification, owner-local walkthrough, historical import/reconciliation, backup/restore proof and cutover remain open. Apps Script remains the sole production financial writer.

**Status:** PR #273 is merged into `client-main` at `650dc586e11f32d3eea488b30de28518f7c9a58c`; local bootstrap/login/settings now work with uninitialized voucher sequences and do not guess counters. PR #275 adds the next CVL-031 slice: opt-in Laravel transport for vendor create/update/active-state actions; exact-head CI and Browser E2E are pending. Customer builds still use Apps Script, and the IndexedDB outbox is not connected to Laravel. Full register/dashboard parity, voucher writes, receipt transfer, outbox replay, hosting qualification, historical import/reconciliation, backup/restore proof and cutover remain open. Apps Script remains the sole production financial writer.

## CVL-031 vendor write transport slice — 8 November 2026

**Branch:** `feat/laravel-vendor-transport-clean-20261108`, based on the merged PR #273 integration head.

The opt-in local Laravel adapter now supports the existing Vendor UI's create, update and explicit active-state operations. It maps to the existing Laravel vendor routes, sends the in-memory CSRF token and a cryptographically random idempotency key on every write, and preserves the HttpOnly session cookie. The Vendor UI sends the desired active state explicitly. Unsupported actions continue to fail closed without Apps Script fallback. Transport tests cover request method/path/body, CSRF and idempotency headers, invalid payload rejection and unsupported-action behavior.

This is not production routing. Customer builds remain Apps Script-only; the IndexedDB outbox remains untouched. Exact-head CI and Browser E2E are required before merge.

**Delivery principle:** small vertical slices; no destructive work; one writer at all times.

## CVL-031 first compatibility slice — bootstrap read (7 November 2026)

Branch: `feat/laravel-bootstrap-compat-20261107`, based on the Composer-reproducibility branch for PR #270.

The first slice introduces an authenticated, read-only `GET /api/v1/bootstrap` route matching the existing PWA bootstrap response shape. It returns current user identity and capabilities, property settings, at most 200 recent vouchers, vendor metadata, and the permitted email/name directory. Staff rows remain creator-scoped; Manager/Owner see property-wide vouchers and names; Accountant receives no voucher or vendor records. The opening-balance setting is visible only to view-all roles and is masked for Staff/Accountant. Inactive vendors remain visible as metadata, as they are in the legacy bootstrap. The route advertises its availability in `/meta` and has explicit API-surface and role-scope feature tests. Those tests also cover opening-balance redaction and legacy normalization of invalid cash-impact/approval states, vendor-type defaults and formula-safe mobile display. A CI failure caused by `$this` inside a static collection closure was corrected; the corrected exact-head workflow is pending.

The same CVL-031 slice now adds a local-only same-origin cookie transport. The readable CSRF value is verified by middleware and returned in login/current-session JSON; the session token remains Secure/HttpOnly and is never exposed to JavaScript. The adapter keeps CSRF in memory, restores it via current-session on reload, and supports only login, restore, logout, password change, bootstrap, dashboard summary and an unfiltered/date/type/status register read. All unmapped actions fail closed. Search/facets/totals parity, dashboard daily-operations action, duplicate-check, all voucher/vendor/user/settings/audit/cash-close writes, receipts, bulk and queue-drain/replay tests remain open. The IndexedDB schema, leases, retry/rejection and export/recovery behavior and configured Apps Script endpoint remain unchanged.

## P0 — decision and qualification

| ID      | Work                                                                                                                                | Dependencies                                 | Exit evidence                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| CVL-001 | Confirm integration base and freeze PHP/schema baseline on `client-main`                                                            | Branch governance                            | SHA-pinned baseline, source test run, code-owner review   |
| CVL-002 | Qualify host against Laravel 13/PHP/Composer/public-root/DB/cron/private storage/backups matrix                                     | Host account details                         | Completed evidence sheet; all critical gates pass         |
| CVL-003 | Architecture review: Laravel 13 modular monolith; single-property DB; no dual write                                                 | CVL-002                                      | Owner-approved ADR                                        |
| CVL-004 | Inventory source sheets/tabs/formulas/scripts/properties/triggers and Drive receipt/backups metadata (no production extraction yet) | Owner-approved read-only access; backup plan | Data dictionary and source manifest design                |
| CVL-005 | Freeze action registry and API v1 response/authorization contract                                                                   | CVL-001                                      | Contract tests compare all registry actions to action map |

## PR #269 implementation progress — merged Laravel feature slices

| Work item                            | Current evidence                                                                                                                                                          | Remaining                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| CVL-010 Laravel scaffold             | Isolated Laravel 13 app, modular directories, API bootstrap and MySQL-only config merged in PR #268                                                                       | Commit CI-resolved Composer lockfile; clean install and audit must use the tracked lock |
| CVL-012 API contract adapter         | JSON envelope, request IDs, no-store headers and error mapping implemented                                                                                                | Golden comparison against PHP response edge cases                                       |
| CVL-013 Authentication compatibility | PR #269 reuses existing auth primitives for login/current/logout/password; exact MySQL matrix covers legacy upgrade, forced PIN, CSRF, rate limits, logout and revoke-all | Hosting secrets review and cutover remain gated                                         |
| CVL-014 Financial primitives         | Reuses existing PDO row-locked allocator, canonical idempotency unit of work and append-only audit writer                                                                 | MySQL CI concurrency/replay/rollback evidence                                           |
| CVL-015 First voucher slice          | Merged in PR #268; creator-scoped list/create, duplicate review, sequence/idempotency/audit and approval safeguards                                                       | Continue contract parity as lifecycle routes expand                                     |

CVL-013, CVL-020, CVL-021, CVL-022, CVL-023, CVL-024, CVL-025 and CVL-030 are implemented in PR #269. CVL-025 includes Owner-only user administration, property settings, audit browsing and password reset. Exact-head CI #4230 passed with 86 PHPUnit tests / 679 assertions; Browser E2E #3891 and Autonomous Development Monitor #1028 also passed. The route inventory test keeps `/meta` capabilities synchronized with actual registered routes, and cash-close tests verify carry-forward parent/date/amount integrity. The tracked Composer lockfile, human review and hosting qualification remain gates. Schema-baseline adoption, historical import, PWA/outbox transport and production use remain blocked. The shadow API is not routed from the PWA.

**Historical PR #269 exact-head evidence (7 November 2026):** [CI #4230](https://github.com/tchouhanjsm/cash-voucher/actions/runs/42351148083) passed with `OK (86 tests, 679 assertions)` on disposable MySQL; [Browser E2E #3891](https://github.com/tchouhanjsm/cash-voucher/actions/runs/42351147996) and [Autonomous Development Monitor #1028](https://github.com/tchouhanjsm/cash-voucher/actions/runs/42351148082) passed. The later dependency reproducibility work is tracked separately in [PR #270](https://github.com/tchouhanjsm/cash-voucher/pull/270): the reviewed lockfile, deterministic Composer install/validation/audit, Laravel lint and PHPUnit on isolated MySQL 8.0, plus passing Browser E2E and Monitor. PR #270 remains open for review.

## P1 — Laravel foundation and parity

| ID      | Work                                                                                             | Dependencies              | Exit evidence                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| CVL-010 | Create Laravel 13 scaffold in isolated `laravel/`; lock dependencies; local/test config only     | CVL-002, CVL-003          | PR #270 supplies tracked Composer lock and deterministic install; clean install/audit and health checks pass in CI                                |
| CVL-011 | Adopt existing migration history/schema baseline without re-running 0001–0004                    | CVL-010                   | Schema diff and migration adoption tests; checksums verified                                                                                      |
| CVL-012 | Port API envelope, request IDs, no-store, same-origin routing and exception mapping              | CVL-005, CVL-010          | Golden contract tests pass                                                                                                                        |
| CVL-013 | Port legacy password verification/upgrade, session lifecycle, CSRF, throttling and role policies | CVL-011                   | PR #269 reuses current PHP security services; Laravel auth tests cover login, legacy upgrade, forced PIN, CSRF, rate limit, logout and revoke-all |
| CVL-014 | Port voucher allocator, idempotency service and audit writer                                     | CVL-011                   | MySQL concurrency, replay/conflict and rollback tests                                                                                             |
| CVL-015 | First authenticated voucher read/create vertical slice                                           | CVL-012, CVL-013, CVL-014 | Acceptance criteria in migration ADR met                                                                                                          |

## P2 — financial parity

| ID      | Work                                                   | Dependencies     | Exit evidence                                                                                                                                                        |
| ------- | ------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CVL-020 | Voucher edit/cancel state machine                      | CVL-015          | Reasoned edit/cancel, closed-date protection, idempotency and before/after audit.                                                                                    |
| CVL-021 | Payment approval/rejection                             | CVL-020          | Pending-only decisions, no self-approval, immutable decision event and audit.                                                                                        |
| CVL-022 | Vendor catalog and immutable voucher name snapshots    | CVL-015          | Manager/Owner CRUD, unique name claims, idempotency and legacy duplicate safeguards.                                                                                 |
| CVL-023 | Daily cash-close preview, finalization and corrections | CVL-020, CVL-021 | MAIN drawer/day, carry-forward, gap opening, chronological idempotent snapshot and correction notes; parent close must be previous day with matching counted amount. |
| CVL-024 | Dashboard summary and recorded-movement reports        | CVL-020–023      | Creator-scoped dashboard, Manager/Owner team view, Accountant report-only, paginated totals and approval exclusion.                                                  |
| CVL-025 | User/admin operations, settings and audit browsing     | CVL-013          | PR #269 implements Owner-only user CRUD/reset, property settings, audit list and voucher history; role/record-scope tests pending exact-head CI.                     |

## P3 — receipts, offline and data portability

| ID      | Work                                                    | Dependencies                                      | Exit evidence                                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CVL-030 | Private receipt upload/download and metadata integrity  | CVL-015, host private path                        | Implemented in PR #269; MySQL feature tests pass on exact head `b880b55`; actual host private-path qualification remains open                                                                                                        |
| CVL-031 | PWA transport adapter and Laravel API compatibility     | CVL-015, API golden contract                      | Partial: role-scoped bootstrap plus local-only same-origin cookie/CSRF adapter (login/session/logout/password, dashboard summary, basic register read); filters, action/write parity, receipt transfer and outbox replay remain open |
| CVL-032 | Read-only export manifest for Sheets/Drive              | Owner-approved source read access; backup/restore | Deterministic export, redacted secret inventory                                                                                                                                                                                      |
| CVL-033 | Repeatable staging importer and exception ledger        | CVL-032, schema field mapping                     | Idempotent rerun, source-ID uniqueness, conflict quarantine                                                                                                                                                                          |
| CVL-034 | Shadow import and full financial/receipt reconciliation | CVL-033                                           | Zero unexplained variance; owner/accountant approval                                                                                                                                                                                 |

## P4 — operational proof and cutover

| ID      | Work                                                        | Dependencies                   | Exit evidence                                                      |
| ------- | ----------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| CVL-040 | Encrypted backup automation and isolated restore tooling    | Host cron/CLI/off-host storage | Scheduled backups, checksums, two successful restores              |
| CVL-041 | Offline queue drain/replay and stale-client freeze strategy | CVL-031, CVL-034               | Zero unresolved outbox records; no old writer traffic              |
| CVL-042 | Cutover runbook, monitoring, support and rollback rehearsal | CVL-034, CVL-040, CVL-041      | Tabletop + rehearsal evidence and named owner                      |
| CVL-043 | Owner-authorized single-writer cutover                      | All P0–P4                      | Laravel is sole writer; Apps Script frozen read-only               |
| CVL-044 | Pilot and recovery review                                   | CVL-043                        | Defined observation window passed; RPO/RTO met; Hansei report      |
| CVL-045 | Google dependency retirement                                | CVL-044, retention approvals   | No active consumer/deployment/trigger; archive and access reviewed |

## Cross-cutting blockers

1. Actual hosting account plan/runtime capabilities are unverified; Laravel 13 is conditional until proven.
2. No complete field-by-field mapping from Sheets/formulas/Script Properties to the SQL model has been approved.
3. Current PHP API has no financial HTTP action wired; allocator/idempotency/audit are internal primitives.
4. The exact offline outbox pending-item and replay semantics must be tested against current PWA builds.
5. Receipt files and backup archives have not been copied/hash-verified in a staging target.
6. No production export, final delta or separate restore has been authorized/performed.
7. RPO/RTO, retention, pilot length and rollback decision owner must be agreed.
8. No dual financial write; cutover must freeze one writer before enabling the other.

## First implementation PR — phase 1 acceptance criteria

The first implementation PR is limited to an **isolated local/test Laravel vertical slice**, not production migration. The intentionally reduced first slice is:

- Laravel 13 scaffold isolated under `laravel/`; root PWA and custom PHP API untouched.
- Health/live, health/ready and meta routes; readiness is read-only and verifies existing schema version 0004.
- API v1 JSON envelope, request ID, no-store headers and normalized errors.
- Existing role grants and shared session/CSRF digest contract; inactive, unknown-role and must-change sessions fail closed. Login issuance and password upgrade remain with existing PHP API for now.
- MySQL integration tests use the existing four root SQL migrations on a dedicated disposable Laravel CI database, isolated from the PHP integration suite's seeded data. No Laravel destructive migrations, `migrate:fresh`, `DROP` or `TRUNCATE`.
- Creator-scoped voucher list, duplicate-check and single voucher create. Bulk, non-empty receipts, edit/cancel, approval actions and cash close are explicit follow-on slices.
- Voucher create reuses the PDO allocator, IdempotencyService and AuditWriter. A missing sequence fails closed; a create transaction includes voucher, audit and idempotency result.
- Same key/same payload replays; same key/different payload conflicts; client ID collisions conflict; duplicate payment candidates require a short-lived HMAC confirmation token.
- Preserve the individual and per-payee/day cumulative ₹10,000 approval threshold and cash-closed date prohibition.
- Tests cover staff record scope, accountant denial, CSRF, idempotency, duplicate review, approval threshold, closed-date rejection and missing-sequence safety on MySQL.
- No production credentials, Google, cPanel, customer DB, import data, endpoint switch, dual write or production deployment.
- A committed Composer lockfile, Composer audit, PHP lint, Laravel MySQL feature suite and all existing JS/PHP quality checks are required before PR can be marked ready.

**PR is accepted only when all criteria pass on a clean CI run.** A green SQLite-only suite is insufficient for locking and MariaDB behavior. Do not wire the production PWA endpoint or deploy to customer hosting in this PR.

## Vendor catalog implementation — next isolated slice

**Branch:** `feat/laravel-vendor-management-20261106`  
**Status:** Implementation prepared; exact-head CI and review are pending. This is not production authorization.

The slice adds manager/owner-only Laravel vendor listing, creation, editing and desired active-state operations; it uses the shared idempotency transaction and append-only audit writer. Migration 0005 adds the unique case-insensitive vendor-name claim required to prevent concurrent duplicate creation. Tests cover authorization, replay/audit, inactive-name reservation, legacy-name ambiguity, rename snapshot preservation, invalid defaults and one-time payee classification. See [LARAVEL-VENDOR-INVENTORY.md](LARAVEL-VENDOR-INVENTORY.md) for the source field mapping.

**Open gates:** the committed Composer lockfile defect from PR #268 remains unresolved; a CI artifact is not a substitute for a tracked lockfile. Actual PHP/Laravel/MySQL hosting qualification still needs the real hosting plan/account evidence. The vendor creator-email snapshot gap and the remaining non-vendor financial action/field inventory must be resolved before historical import. Apps Script remains the only production financial writer.
