# Cash Voucher platform migration — Laravel modular monolith decision

**Updated:** 6 November 2026  
**Status:** Proposed architecture; implementation and production cutover remain gated.  
**Baseline:** `client-main` at the time this plan branch was created.  
**Scope:** Replace Apps Script, Sheets and Drive as operational backend dependencies with Laravel 13 + MySQL/MariaDB, while preserving validated PHP security and database work.

## 1. Decision and non-goals

Adopt a **Laravel 13 modular monolith backed by MySQL/MariaDB**, subject to the hosting qualification gate in §2. Keep the current PWA and its IndexedDB outbox. Use one isolated database/instance per customer/property for now; do not introduce shared multi-tenancy during this migration.

The current PHP API is a custom PHP/PDO implementation, not Laravel. It already contains a versioned HTTP boundary, session authentication, role/capability logic, migration runner, schema foundation, password compatibility verifier, rate limiting, idempotency, audit writing and row-locked number allocation. These are assets to port/adapt, not reasons to retain a second permanent framework runtime.

This ADR does **not** authorize production endpoint changes, production credentials, production exports, production migrations, live data writes, dual writes, offline queue deletion, or Apps Script retirement. The existing backend remains intact and is the only production financial writer until a separately approved cutover.

### Target shape

PWA (same origin) → Laravel 13 `/api/v1` → session/authentication middleware and capability policies → application modules → MySQL/MariaDB transactional store. Receipt bytes live in private storage outside the public web root. Encrypted backups are held off-host. The browser never talks directly to SQL.

Prefer Laravel's built-in routing, request validation, middleware, authorization, database transactions, filesystem abstraction, queue/scheduler (only where host support is proven), and test tooling. Avoid a large third-party domain framework or microservices. Keep domain rules explicit and testable.

## 2. Hosting and framework qualification — hard blocker

The prior ADR's cPanel-first recommendation remains conditional. **No current evidence establishes that the actual account can run Laravel 13.** Do not select Laravel merely because PHP is available.

Before implementation is promoted beyond an isolated local/test scaffold, record and verify:

- Provider, exact plan, renewal cost, resource limits and customer deployment model.
- Supported PHP runtime satisfying Laravel 13's actual requirement, required extensions, Composer availability and ability to run optimized autoload/install on the host or build machine.
- Web server rewrite/document-root control so the Laravel public directory alone is web-accessible; application source, vendor, storage, .env and backups must not be web-readable.
- MySQL/MariaDB version, InnoDB, foreign keys, JSON behavior, transaction isolation, row locks, connection cap, database quota and import/restore duration.
- SSH/CLI access for Artisan deploy/migrate commands or a safe controlled alternative; process limits and execution timeout.
- Cron availability for scheduled backup/maintenance, without relying on an always-running queue worker unless explicitly supported.
- TLS, same-origin routing, secure environment injection, PHP upload limits, private storage location, disk/inode quota and backup path.
- Reliable off-host encrypted backup transfer, retention and a successful restore into a separate database and private-file destination.
- Measured latency and concurrency under the plan's CPU/RAM/process caps.

**Go/no-go:** all security, transactional, quota, deployment and restore controls must pass. If cPanel cannot host the Laravel runtime safely, do not contort it into a subdirectory deployment or downgrade security. Re-evaluate the explicitly budgeted alternative platform. Hosting qualification and architecture approval precede any production migration.

## 3. Existing components: reuse, port, retire

| Existing component                                                  | Disposition                                                                       | Laravel target / rule                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/v1/legacy-action-map.json` and `backend/99-routes.gs` registry | Preserve as migration contract                                                    | Use as parity inventory and route/action traceability. Extend with explicit implementation state and contract tests; do not infer coverage from route existence.                                                                                                                                                                                                     |
| `docs/API-V1-CONTRACT.md`                                           | Preserve and evolve                                                               | Keep response envelope, request ID, no-cache behavior, same-origin policy, role names, money/date semantics, idempotency/audit rules. Laravel controllers are adapters, not a reason to change the wire contract.                                                                                                                                                    |
| `Role.php`, `Authorization.php`                                     | Port with parity tests                                                            | Laravel Gate/Policies plus a domain capability map. Keep stored roles exactly `staff`, `manager`, `owner`, `accountant`; “Admin” remains presentation text, not a role.                                                                                                                                                                                              |
| `AuthenticationService.php`, `PasswordVerifier.php`                 | Port carefully                                                                    | Retain exact legacy HMAC verification and Argon/bcrypt/default-hash upgrade path. Legacy PEPPER is supplied only during migration, never committed. Short-PIN exception stays owner-approved, explicit, must-change and time-bounded.                                                                                                                                |
| `SessionService.php`, auth routes and rate limiter                  | Port/adapt                                                                        | Use Laravel session/cookie/CSRF primitives only after proving equivalent controls: 256-bit unpredictable session secret, digest-at-rest where custom opaque tokens are retained, Secure/HttpOnly/SameSite, CSRF for writes, six-hour absolute expiry, active role reload, revocation, HMAC-keyed throttles. Do not silently switch to bearer tokens or localStorage. |
| `Database.php`, `MigrationRunner.php`, `bin/migrate.php`            | Retain as provenance/reference; replace runtime migration execution under Laravel | Preserve environment gate, checksum/history invariants, migration-only credentials and non-production safeguards. Reconcile the four existing SQL files into Laravel migration history without executing their DDL twice.                                                                                                                                            |
| `0001`–`0004` SQL migrations                                        | Preserve as immutable baseline                                                    | Map exact deployed/test schema definitions to Laravel migration classes or an explicit baseline-import mechanism. Existing version/checksum records must be adopted once, with a schema diff proving no semantic drift.                                                                                                                                              |
| `VoucherNumberAllocator.php`                                        | Port as domain service/repository                                                 | Preserve per-type InnoDB row lock inside the caller transaction; allocation and voucher insert roll back together. Do not use MAX(voucher_number)+1 or a non-transactional counter.                                                                                                                                                                                  |
| `IdempotencyService.php`                                            | Port as transaction-bound application service                                     | Unique actor + action + key; canonical request hash; same-hash replay; different-hash conflict. Persist final response with the mutation atomically.                                                                                                                                                                                                                 |
| `AuditWriter.php`                                                   | Port/adapt                                                                        | Append-only financial audit; same DB transaction as the mutation and idempotency result. Corrections are compensating events. Runtime grants prohibit audit mutation/deletion.                                                                                                                                                                                       |
| Existing static PWA, service worker and IndexedDB outbox            | Reuse                                                                             | Maintain current PWA; introduce a transport adapter/API base URL behind a reversible config gate. Preserve outbox IDs, payload hashes and acknowledgement lifecycle.                                                                                                                                                                                                 |
| Apps Script business handlers                                       | Port domain behavior, not source runtime                                          | Treat each action's verified semantics, authorization and status transitions as acceptance tests. Apps Script remains read-only/export source only after final cutover.                                                                                                                                                                                              |
| Sheets                                                              | Retire as live operational store only after retention gate                        | Keep exported immutable archive until owner/accountant retention approval.                                                                                                                                                                                                                                                                                           |
| Drive receipt files/backups                                         | Migrate and then retire as operational storage                                    | Copy, hash, verify and preserve source IDs in manifest. Keep Drive source unchanged until sign-off.                                                                                                                                                                                                                                                                  |

Do not create Laravel Eloquent models that permit broad mass assignment on financial tables. Use explicit DTOs, validation and domain services. Restrict deletion paths for audit, approvals, cash closes and historical vouchers.

## 4. Laravel project structure and module boundaries

Create the Laravel application in a dedicated `laravel/` directory first, avoiding collision with the existing root PWA and custom PHP API. Deployment topology can later expose the Laravel `public/` directory as the origin's API front controller or promote it to the document root only after host proof.

Suggested structure (modular monolith, not package-per-module):

```text
laravel/
  app/
    Modules/
      Identity/       Models, Services, Policies, Actions
      Vendors/
      Vouchers/       DTOs, Actions, Queries, Policies, Models
      Approvals/
      CashClose/
      Receipts/
      Reporting/
      Audit/
      Operations/     readiness, backup metadata, migration status
      ImportExport/
    Http/
      Controllers/Api/V1/
      Middleware/
      Requests/Api/V1/
      Resources/Api/V1/
    Providers/
  bootstrap/
  config/
  database/
    migrations/
    seeders/          synthetic/local fixtures only
  routes/
    api.php
  storage/
    app/private/      never web-served
  tests/
    Feature/Api/V1/
    Unit/Modules/
    Integration/Database/
```

Module ownership:

- **Identity:** user lifecycle, credentials, sessions and role lookup.
- **Vouchers:** create/read/update/cancel and business-date/numbering invariants.
- **Approvals:** immutable decisions and permitted state transitions.
- **CashClose:** preview, close snapshot, correction events and day-close invariants.
- **Vendors:** catalog and immutable vendor-name snapshots on vouchers.
- **Receipts:** private metadata and file lifecycle.
- **Reporting:** read models that preserve financial inclusion semantics.
- **Audit:** append-only events and query scope.
- **ImportExport:** read-only source extraction, staging import, reconciliation reports.
- **Operations:** health/readiness, backup/restore evidence, deployment metadata.

Avoid circular module dependencies. Modules may share small domain value objects/contracts, but writes must flow through one application action/use-case and one database transaction.

## 5. Database and migration strategy

The existing SQL baseline defines:

- `0001`: users, vendors, settings.
- `0002`: vouchers, approval events, receipt metadata, cash closes and corrections.
- `0003`: sessions, login throttles, idempotency requests and audit events.
- `0004`: row-locked per-type voucher number sequences.

Retain InnoDB, utf8mb4, foreign keys, uniqueness and current financial columns. Amounts are integer paise in signed/unsigned appropriately bounded BIGINTs; never FLOAT/DOUBLE/DECIMAL for the canonical paise amount. API amounts remain decimal strings. Business date is an explicit DATE in Asia/Kolkata; event timestamps are UTC DATETIME(6). Preserve status, approval status, cash impact, payment method and immutable snapshots separately.

Laravel database work:
1. Generate a schema inventory from all four SQL files and compare against the latest test schema and model assumptions.
2. Add a Laravel baseline migration/adoption script that records the existing versions/checksums as already applied only after verifying the exact schema. It must not replay `CREATE TABLE` statements on a database with those tables.
3. For future changes, use new forward-only Laravel migrations, reviewed and tested on disposable MySQL/MariaDB. No automatic destructive `migrate:fresh`, no `DROP`, `TRUNCATE`, or production schema repair scripts.
4. Use separate credentials: migration DDL account exclusively for controlled CLI; runtime least-privilege account with no DDL, DROP, GRANT, FILE or delete privileges on append-only records.
5. Pin and test the target DB engine/version. CI should run the full schema against MySQL/MariaDB, not SQLite alone, because SQLite does not validate InnoDB locking, JSON/index semantics or grant behavior.
6. Add checks for migration checksum drift, duplicate series/number, orphan references and missing expected indexes.

The four current SQL migrations and database README are source-of-truth evidence. Do not rewrite migration history solely to make it look native to Laravel.

## 6. Authentication and role migration

Retain the exact existing account semantics:

- Roles: `staff`, `manager`, `owner`, `accountant`. Unknown/inactive users fail closed and their sessions are revoked.
- Staff: creator-bound record scope; manager/owner: existing view-all capabilities; accountant: reports-only.
- Role/capability is loaded server-side per request. UI workspaces are never authorization.
- Verify legacy credentials using HMAC-SHA256 over UTF-8 `salt:password` with legacy Script Property `PEPPER`; imported format `legacy-hmac-sha256$<salt>$<lowercase-hex-hmac>`. On successful normal-length login, upgrade hash using PHP password hashing in the same transaction as session creation/audit.
- Legacy short PINs are permitted only if the explicit migration flag is true and account is marked must-change; force compliant 8–128 character password, then revoke every prior session. Turn flag off after migration window.
- Current custom PHP uses 256-bit random tokens, digest-only storage, Secure/HttpOnly/SameSite=Strict cookie, CSRF double-submit, six-hour absolute expiry and HMAC-keyed login throttling. Port these controls with equivalent or stronger tests; if Laravel's session store cannot preserve digest-at-rest semantics, adapt it rather than weakening the control.
- Password change and deactivation revoke all sessions. Do not import plaintext passwords or session tokens.

The legacy PEPPER is a deployment secret, not a migration artifact. Do not copy it into GitHub Actions or local fixtures. Build synthetic test credentials and prove production-like verification using an injected ephemeral test secret only.

## 7. Financial API implementation

The frozen v1 contract and action map are authoritative. Preserve JSON envelope, request ID, non-cacheable responses, HTTP methods, scope rules and existing names/semantics. The route mapping is the compatibility layer; internal Laravel naming may differ.

Implement the first financial vertical slice before broad route coverage:
1. Authenticated scoped voucher list/read.
2. Create a single voucher using decimal string amount and explicit Asia/Kolkata business date.
3. Enforce capability and creator/view-all scope server-side.
4. Require idempotency key; canonicalize request; reject key/hash mismatch; replay original success response for same key.
5. Lock per-type number sequence using SELECT ... FOR UPDATE within DB transaction; insert voucher, audit event, idempotency result atomically.
6. Return canonical API response only after commit; test rollback leaves neither voucher, sequence advance nor success audit/idempotency result.
7. Implement reads using explicit inclusion rules; never include pending/rejected/review-required in approved payment totals.

Subsequent slices: edit/cancel with immutable history; approval/rejection; receipts; vendor catalog; cash close/corrections; reports; user/settings/audit/operations endpoints. Do not mark an action implemented until contract, authorization, failure behavior and integration tests pass. Bulk route shells without business semantics are not completion.

## 8. Receipts and private files

Use Laravel Storage abstraction with a **private local disk outside web root** initially, only if host supports reliable private paths and backup. Storage keys are opaque, random and non-guessable. Do not store public URLs. Upload pipeline: authenticate; authorize voucher scope; enforce allowlisted detected MIME, size and image/PDF constraints; generate storage key; stream to private storage; compute SHA-256; insert metadata and audit within a recoverable workflow. Avoid holding large files in memory.

Downloads must resolve metadata by receipt ID, authorize the parent voucher before streaming, set safe Content-Disposition and no-store headers, and never expose filesystem paths. Reject path traversal and client-provided storage keys. Store original Drive file ID in migration metadata for reconciliation.

File/database atomicity is not native: use a staged file write and compensating cleanup/reconciliation states so a failed DB commit cannot leave an untracked file. Never delete the Drive original as part of import. Validate file count, byte size, MIME, hash and parent voucher linkage on source vs destination before switch. Back up DB and receipt objects together under one manifest/run ID.

## 9. Offline queue compatibility

IndexedDB remains the client outbox; do not replace it with a new sync framework during backend migration. Preserve stable client operation IDs across retries and old browser builds. The new API must implement idempotent request replay and return a durable acknowledgement.

Define queue envelope contract (client operation ID, action, created-at/client business date, payload version, request hash, retry count, status). Do not mutate business dates based on server clock. Failed/ambiguous requests remain pending until server status can be resolved with the same idempotency key.

Cutover readiness requires:

- all devices online and queue drained to zero; OR a tested export/replay procedure that carries original IDs into Laravel and validates every replay response.
- no stale clients can continue posting to the old endpoint after freeze; force refresh/version gate and explicit maintenance response.
- no clearing IndexedDB to “fix” synchronization. Acknowledge only after transaction commit.
- replay of the same operation yields same voucher ID/number; changed payload with same key conflicts.

## 10. Read-only export and repeatable import

Build an owner-operated export from Apps Script/Sheets and Drive with no writes to source. Include a signed/hashed manifest containing extraction timestamp, source deployment/resource identity, tab names, headers, formulas/metadata, row counts, number ranges, settings, user-role inventory, action registry version, Drive receipt IDs and file metadata/hash. Encrypt at rest and during transfer; redact secret properties and credential material except the approved legacy password-hash form needed for seamless migration.

Exporter must be resumable, deterministic and re-runnable. Each source entity retains a stable `source_legacy_id`; imports use upsert/unique key semantics in a **staging target only**, with per-file/record checksums and import run ID. Never generate new voucher IDs or numbers for existing financial records. Do not export logs containing passwords, PEPPER, access tokens, session/CSRF tokens or raw receipt bytes.

Import must be repeatable:

- same manifest + payload is a no-op with identical counts/checksums;
- same source ID + changed payload is a quarantined conflict, not silent overwrite;
- missing source rows are reported, never inferred as deletion;
- mapping exceptions are written to an exception ledger requiring review;
- preserve historical dates/status dimensions exactly; do not recalculate approved totals or cash impact.

Only real source extraction after backup qualification and explicit owner authorization; current task does not perform it.

## 11. Reconciliation, backup and restore

Before and after each shadow import compare:

- source/destination counts by entity, status and business date;
- voucher numbers and per-type sequence next value;
- total paise, counts and signed net by date/type/status/approval/payment method/cash impact;
- vendor identities and historical name snapshots;
- approval decisions and actor/time/reason;
- cash-close snapshots, included voucher IDs, opening linkage, variances and correction events;
- users/roles/active flags and settings;
- receipt IDs, counts, bytes, MIME and SHA-256;
- audit event counts and key event sequences;
- unresolved offline outbox count and duplicate/idempotency collisions.

Zero unexplained differences is the target. Any accepted mapping adjustment must be explicitly approved, documented and reproducible.

Backup set = database dump + private files + manifest + checksums + schema/app release identifier. Encrypt off-host; retention and restore-point objective (RPO) and recovery-time objective (RTO) must be set by owner before pilot. Verify scheduled backups and execute isolated restore at least twice before cutover; test a restore after a release. Never treat the host's own backup as the only copy. Restore into a new DB/path, validate checksums, boot isolated app and run financial reconciliation. Do not restore over production as a test.

## 12. Single-writer cutover, rollback and recovery

No dual financial writes. There is no period when Apps Script and Laravel both accept authoritative mutations.

**Preconditions:** host/architecture signed off; feature parity for required roles/actions; test suite green; production export dry-run; full backup and isolated restore proven; complete shadow import and reconciliation; offline outbox drained/replayed; receipt verification complete; monitoring and support ready; owner approves exact window and rollback owner.

Cutover sequence:
1. Announce maintenance and freeze new financial writes at the existing Apps Script boundary.
2. Verify all clients are on compatible release, queues are empty, and no old API requests remain in flight.
3. Take final source Sheet/Drive export and backup; verify manifest and hashes.
4. Import final delta into Laravel target, re-run all reconciliations; require zero unexplained variance.
5. Flip the single PWA API origin/config to Laravel; keep old backend read-only. This is the **writer authority transfer**.
6. Run controlled live smoke checks for each role, one create/read/approval/cash-close path using approved test transactions only, receipt access and backup status. Reconcile test transaction and remove only by documented compensating event, never delete.
7. Keep writes disabled on Apps Script permanently after transfer. Monitor Laravel errors, duplicate conflicts, reconciliation, API latency, backups and support for defined pilot window.

**Rollback before any Laravel financial writes:** point clients back to Apps Script after proving no new writes were accepted by Laravel; Apps Script remains authoritative.  
**Recovery after Laravel has accepted writes:** do not simply switch back and re-enable Apps Script. Freeze both systems, export the Laravel delta, reconcile and choose a controlled forward repair or a separately rehearsed reverse migration with preserved source IDs and idempotency. Never dual-write or discard committed entries.

Old Apps Script resources remain preserved and read-only as a forensic/archive recovery source until owner/accountant retention and recovery approvals are complete.

## 13. Google dependency retirement

Retire only after every client has moved, the pilot passed, recovery is signed off and retention obligations are met:
1. Remove Apps Script endpoint from active client configuration and deployment rollout logic.
2. Confirm no API calls, triggers or scheduled jobs are required from Apps Script.
3. Confirm Sheets/Drive are no longer operational dependencies; retain immutable encrypted exports and original source archives.
4. Revoke/remove Script Properties and OAuth scopes only after proving no consumer uses them; rotate any shared secrets independently.
5. Disable obsolete deployments/triggers and archive source repository/build artifacts after owner sign-off.
6. Remove Google setup/onboarding flows from product only in a later cleanup release after the Laravel onboarding, backup, restore and support operations are proven.
7. Keep read-only audit/reference access according to retention policy; do not delete financial records to claim dependency retirement.

## 14. Toyota Production System / Lean controls

- **Genchi Genbutsu:** use real schemas, registries, hosting evidence and source data manifests; no guessed field mappings.
- **Muda:** one Laravel application, one authoritative database, one outbox and one writer. Avoid microservices, dual writes and redundant sync engines.
- **Jidoka:** validate money/date/state; enforce DB constraints; transactionally write voucher + audit + idempotency.
- **Poka-yoke:** unique voucher type/number, unique legacy source ID, unique actor/action/idempotency key, payload hash conflict, CSRF, private file keys and forced password change.
- **Kaizen:** vertical-slice implementation, measured pilot, forward-only migrations and small repeatable imports.
- **Hansei:** record every reconciliation variance, incident, failed restore and deployment rollback with cause, containment, countermeasure and retest evidence.
