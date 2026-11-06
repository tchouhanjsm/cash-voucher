# Laravel migration phased backlog

**Status:** Planning baseline plus first isolated Laravel implementation in progress; not production authorization. Hosting qualification remains a hard gate.  
**Delivery principle:** small vertical slices; no destructive work; one writer at all times.

## P0 — decision and qualification

| ID      | Work                                                                                                                                | Dependencies                                 | Exit evidence                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| CVL-001 | Confirm integration base and freeze PHP/schema baseline on `client-main`                                                            | Branch governance                            | SHA-pinned baseline, source test run, code-owner review   |
| CVL-002 | Qualify host against Laravel 13/PHP/Composer/public-root/DB/cron/private storage/backups matrix                                     | Host account details                         | Completed evidence sheet; all critical gates pass         |
| CVL-003 | Architecture review: Laravel 13 modular monolith; single-property DB; no dual write                                                 | CVL-002                                      | Owner-approved ADR                                        |
| CVL-004 | Inventory source sheets/tabs/formulas/scripts/properties/triggers and Drive receipt/backups metadata (no production extraction yet) | Owner-approved read-only access; backup plan | Data dictionary and source manifest design                |
| CVL-005 | Freeze action registry and API v1 response/authorization contract                                                                   | CVL-001                                      | Contract tests compare all registry actions to action map |

## Current implementation progress — branch feat/laravel-13-financial-slice-20261106

| Work item                            | Current evidence                                                                                                                     | Remaining                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| CVL-010 Laravel scaffold             | Isolated Laravel 13 app, modular directories, API bootstrap, MySQL-only config and local env example committed on the feature branch | Commit reviewed Composer lockfile; exact-head CI and review                       |
| CVL-012 API contract adapter         | JSON envelope, request IDs, no-store headers and error mapping implemented                                                           | Golden comparison against PHP response edge cases                                 |
| CVL-013 Authentication compatibility | Consumes existing hashed cv_session/cv_csrf records, role parity, inactive/unknown and must-change fail-closed                       | Port login/legacy password upgrade/password change only in a later reviewed slice |
| CVL-014 Financial primitives         | Reuses existing PDO row-locked allocator, canonical idempotency unit of work and append-only audit writer                            | MySQL CI concurrency/replay/rollback evidence                                     |
| CVL-015 First voucher slice          | Creator-scoped list, duplicate-check and single create routes; cash-close date, approval threshold and missing-sequence safeguards   | Extend contract parity and validate exact-head checks                             |

Hosting qualification, schema-baseline adoption and production use remain blocked. The shadow API is not yet routed from the PWA.

## P1 — Laravel foundation and parity

| ID      | Work                                                                                             | Dependencies              | Exit evidence                                                           |
| ------- | ------------------------------------------------------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------- |
| CVL-010 | Create Laravel 13 scaffold in isolated `laravel/`; lock dependencies; local/test config only     | CVL-002, CVL-003          | Clean Composer install/build, health route tests, no production secrets |
| CVL-011 | Adopt existing migration history/schema baseline without re-running 0001–0004                    | CVL-010                   | Schema diff and migration adoption tests; checksums verified            |
| CVL-012 | Port API envelope, request IDs, no-store, same-origin routing and exception mapping              | CVL-005, CVL-010          | Golden contract tests pass                                              |
| CVL-013 | Port legacy password verification/upgrade, session lifecycle, CSRF, throttling and role policies | CVL-011                   | Synthetic legacy credential matrix; session/CSRF/rate-limit tests       |
| CVL-014 | Port voucher allocator, idempotency service and audit writer                                     | CVL-011                   | MySQL concurrency, replay/conflict and rollback tests                   |
| CVL-015 | First authenticated voucher read/create vertical slice                                           | CVL-012, CVL-013, CVL-014 | Acceptance criteria in migration ADR met                                |

## P2 — financial parity

| ID      | Work                                                             | Dependencies     | Exit evidence                                                               |
| ------- | ---------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------- |
| CVL-020 | Voucher update/cancel state machine and history                  | CVL-015          | State-transition matrix and compensating-event tests                        |
| CVL-021 | Approval/rejection flow and pending/rejected reporting exclusion | CVL-020          | Approval actor/reason trace and aggregation tests                           |
| CVL-022 | Vendor catalog and immutable vendor name snapshot                | CVL-015          | Vendor scope, duplicate and historical snapshot tests                       |
| CVL-023 | Cash-close preview/create/corrections                            | CVL-020, CVL-021 | Snapshot reproducibility, idempotent close and correction append-only tests |
| CVL-024 | Read models, dashboard and reports                               | CVL-020–023      | Parity totals across dimensions; accountant read-only                       |
| CVL-025 | User/admin operations, settings, support and audit browsing      | CVL-013          | Role and record-scope denial matrix                                         |

## P3 — receipts, offline and data portability

| ID      | Work                                                    | Dependencies                                      | Exit evidence                                               |
| ------- | ------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| CVL-030 | Private receipt upload/download and metadata integrity  | CVL-015, host private path                        | MIME/size/hash tests, unauthorized 403/404, no public URL   |
| CVL-031 | PWA transport adapter and Laravel API compatibility     | CVL-015, API golden contract                      | Existing IndexedDB outbox unchanged; retry/replay tests     |
| CVL-032 | Read-only export manifest for Sheets/Drive              | Owner-approved source read access; backup/restore | Deterministic export, redacted secret inventory             |
| CVL-033 | Repeatable staging importer and exception ledger        | CVL-032, schema field mapping                     | Idempotent rerun, source-ID uniqueness, conflict quarantine |
| CVL-034 | Shadow import and full financial/receipt reconciliation | CVL-033                                           | Zero unexplained variance; owner/accountant approval        |

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
- MySQL integration tests use the existing four root SQL migrations on a disposable CI database. No Laravel destructive migrations, `migrate:fresh`, `DROP` or `TRUNCATE`.
- Creator-scoped voucher list, duplicate-check and single voucher create. Bulk, non-empty receipts, edit/cancel, approval actions and cash close are explicit follow-on slices.
- Voucher create reuses the PDO allocator, IdempotencyService and AuditWriter. A missing sequence fails closed; a create transaction includes voucher, audit and idempotency result.
- Same key/same payload replays; same key/different payload conflicts; client ID collisions conflict; duplicate payment candidates require a short-lived HMAC confirmation token.
- Preserve the individual and per-payee/day cumulative ₹10,000 approval threshold and cash-closed date prohibition.
- Tests cover staff record scope, accountant denial, CSRF, idempotency, duplicate review, approval threshold, closed-date rejection and missing-sequence safety on MySQL.
- No production credentials, Google, cPanel, customer DB, import data, endpoint switch, dual write or production deployment.
- A committed Composer lockfile, Composer audit, PHP lint, Laravel MySQL feature suite and all existing JS/PHP quality checks are required before PR can be marked ready.

**PR is accepted only when all criteria pass on a clean CI run.** A green SQLite-only suite is insufficient for locking and MariaDB behavior. Do not wire the production PWA endpoint or deploy to customer hosting in this PR.
