# Laravel migration phased backlog

**Status:** PR #268 merged at `d50b75f`; PR #269 extends the isolated Laravel shadow API with vendor, voucher lifecycle/approval, private receipt and daily cash-close slices. Exact-head CI, Browser E2E and autonomous monitor passed at `2b8318b`; code review and the tracked Composer lockfile remain open. None of this authorizes production use. Hosting qualification remains a hard gate.  
**Delivery principle:** small vertical slices; no destructive work; one writer at all times.

## P0 — decision and qualification

| ID      | Work                                                                                                                                | Dependencies                                 | Exit evidence                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| CVL-001 | Confirm integration base and freeze PHP/schema baseline on `client-main`                                                            | Branch governance                            | SHA-pinned baseline, source test run, code-owner review   |
| CVL-002 | Qualify host against Laravel 13/PHP/Composer/public-root/DB/cron/private storage/backups matrix                                     | Host account details                         | Completed evidence sheet; all critical gates pass         |
| CVL-003 | Architecture review: Laravel 13 modular monolith; single-property DB; no dual write                                                 | CVL-002                                      | Owner-approved ADR                                        |
| CVL-004 | Inventory source sheets/tabs/formulas/scripts/properties/triggers and Drive receipt/backups metadata (no production extraction yet) | Owner-approved read-only access; backup plan | Data dictionary and source manifest design                |
| CVL-005 | Freeze action registry and API v1 response/authorization contract                                                                   | CVL-001                                      | Contract tests compare all registry actions to action map |

## Current implementation progress — active branch `feat/laravel-vendor-management-20261106` (PR #269)

| Work item                            | Current evidence                                                                                                    | Remaining                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| CVL-010 Laravel scaffold             | Isolated Laravel 13 app, modular directories, API bootstrap and MySQL-only config merged in PR #268                 | Commit CI-resolved Composer lockfile; clean install and audit must use the tracked lock |
| CVL-012 API contract adapter         | JSON envelope, request IDs, no-store headers and error mapping implemented                                          | Golden comparison against PHP response edge cases                                       |
| CVL-013 Authentication compatibility | Consumes existing hashed cv_session/cv_csrf records, role parity, inactive/unknown and must-change fail-closed      | Port login/legacy password upgrade/password change only in a later reviewed slice       |
| CVL-014 Financial primitives         | Reuses existing PDO row-locked allocator, canonical idempotency unit of work and append-only audit writer           | MySQL CI concurrency/replay/rollback evidence                                           |
| CVL-015 First voucher slice          | Merged in PR #268; creator-scoped list/create, duplicate review, sequence/idempotency/audit and approval safeguards | Continue contract parity as lifecycle routes expand                                     |

CVL-020, CVL-021, CVL-022, CVL-023 and CVL-030 are implemented in PR #269. Exact-head CI, Browser E2E and monitor are green; review, Composer lockfile and hosting qualification remain gates. Hosting qualification, schema-baseline adoption and production use remain blocked. The shadow API is not yet routed from the PWA.

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

| ID      | Work                                                             | Dependencies     | Exit evidence                                                                                                                                                                            |
| ------- | ---------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CVL-020 | Voucher update/cancel state machine and history                  | CVL-015          | PR #269 implements reasoned edit/cancel, closed-date protection, idempotency and before/after audit; lifecycle tests included in 54-test / 326-assertion green MySQL suite               |
| CVL-021 | Approval/rejection flow and pending/rejected reporting exclusion | CVL-020          | PR #269 implements pending-only approve/reject, no self-approval, immutable decision rows and audit; aggregation parity remains open                                                     |
| CVL-022 | Vendor catalog and immutable vendor name snapshot                | CVL-015          | PR #269 implements Manager/Owner CRUD, active state, unique name claims, idempotency and historical snapshot tests                                                                       |
| CVL-023 | Cash-close preview/create/corrections                            | CVL-020, CVL-021 | PR #269 implements one MAIN drawer/day, prior-close carry-forward, reasoned gap opening, chronological idempotent close and append-only notes; cash-close feature tests pass in CI #4152 |
| CVL-024 | Read models, dashboard and reports                               | CVL-020–023      | Parity totals across dimensions; accountant read-only                                                                                                                                    |
| CVL-025 | User/admin operations, settings, support and audit browsing      | CVL-013          | Role and record-scope denial matrix                                                                                                                                                      |

## P3 — receipts, offline and data portability

| ID      | Work                                                    | Dependencies                                      | Exit evidence                                                                                                                                            |
| ------- | ------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CVL-030 | Private receipt upload/download and metadata integrity  | CVL-015, host private path                        | PR #269 implements private storage, signature/size/hash checks, own-record scope, 3-file limit and no public URL; receipt feature tests pass in CI #4152 |
| CVL-031 | PWA transport adapter and Laravel API compatibility     | CVL-015, API golden contract                      | Existing IndexedDB outbox unchanged; retry/replay tests                                                                                                  |
| CVL-032 | Read-only export manifest for Sheets/Drive              | Owner-approved source read access; backup/restore | Deterministic export, redacted secret inventory                                                                                                          |
| CVL-033 | Repeatable staging importer and exception ledger        | CVL-032, schema field mapping                     | Idempotent rerun, source-ID uniqueness, conflict quarantine                                                                                              |
| CVL-034 | Shadow import and full financial/receipt reconciliation | CVL-033                                           | Zero unexplained variance; owner/accountant approval                                                                                                     |

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
