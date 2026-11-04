# Apps Script exit and database platform decision — 4 November 2026

## Decision status

**Proposed target; no production migration authorized or performed.**

Current deployed instances still use the Apps Script web app as the API, Google Sheets as the ledger store, Google Drive for receipts/backups, and IndexedDB for unsynchronized browser work. This decision records the preferred replacement and safe migration plan. It does not change the production endpoint or declare Apps Script retired.

## Engineering recommendation

First test the hosting account already paid for. If its cPanel plan includes a supported MySQL/MariaDB database, sufficient database/disk quota, supported PHP with PDO MySQL, SSL, scheduled jobs, and recoverable backups, use:

- the existing static PWA served from the same origin;
- a small **PHP 8.x JSON API** under a versioned `/api/v1` boundary;
- **MySQL or MariaDB** for authoritative transactional data;
- PDO prepared statements and database transactions;
- receipt files outside the public web root (or in a private storage location with authorization-checked download);
- encrypted off-host database and receipt backups with a demonstrated restore.

For the current single-property product, keep one property database/instance per customer. The app is not yet designed as a shared multi-tenant ledger; do not consolidate customer ledgers into a shared database as part of this move.

**Why this is the first candidate:** no additional managed database platform is required if the current hosting plan already includes MySQL/MariaDB. Same-origin API and database minimize moving parts, CORS/session complexity and recurring platform spend. It is not automatically free: plan limits, backup storage, offsite copies, email, domain and operator time still have costs.

## Required host preflight — before committing to MySQL

The account's exact plan and resource entitlements have not been verified. Record evidence for each item before selecting it:

- [ ] Hosting provider, exact plan and renewal price.
- [ ] PHP version and active security support; required extensions including PDO and PDO MySQL.
- [ ] MySQL/MariaDB engine and version; InnoDB transactions, foreign keys, indexes and UTF-8 support.
- [ ] Database quota, maximum database size, concurrent connections and account-level CPU/RAM/process limits.
- [ ] Disk quota and inode use after static files, database, receipt uploads and backups.
- [ ] SSH/CLI availability for repeatable migrations and controlled backup/restore; cron availability.
- [ ] SSL, same-origin routing and server-side secrets stored outside the public document root.
- [ ] Whether uploaded receipts can be stored outside web root and served only after authorization.
- [ ] Automated backup retention, downloadable backup format, and a successful restore to a separate database.
- [ ] Whether the host's backup is included in the plan or is an extra charge.

If the host fails any material durability, quota or security gate, do not force the cPanel design. Re-evaluate Cloudflare D1 or a managed Postgres plan with an explicit budget.

## Alternatives considered

Limits are provider-published plan limits observed on 4 November 2026; providers may change them. Free quotas are not service-level guarantees and do not replace independent backups.

| Platform                      | What the published free tier offers                                                                                                                | Main trade-off for this app                                                                                              | Decision                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Existing cPanel MySQL/MariaDB | Often included in existing shared hosting; actual quota and connection limits depend on plan                                                       | One host becomes both API and database failure domain; confirm actual backups and resource limits                        | **Preferred if the paid account passes the preflight**                                   |
| Cloudflare D1                 | Free tier includes 5 GB account storage, 5 million rows read/day, 100,000 rows written/day; Free databases have a 500 MB cap and 7-day Time Travel | Requires a Workers API and SQLite-compatible SQL; serverless runtime/storage differs from the current relational backend | Best zero-new-platform-cost fallback if the product fits D1 constraints                  |
| Neon Postgres                 | Free plan publishes 1 GB storage/project, 100 compute-hours/month and 5 GB transfer; compute scales to zero                                        | Compute quotas and idle wake-up behavior are additional operational variables                                            | Good Postgres developer experience; not the default authoritative ledger on a free quota |
| Supabase Postgres             | Free plan publishes 500 MB database; inactive projects may pause; automated daily backups are not included in Free                                 | Backup and availability requirements quickly push the finance workload beyond the free tier                              | Not recommended as the only free production ledger                                       |
| Railway                       | Free usage is credit-limited; Hobby has a $5/month minimum                                                                                         | Not a durable free hosting/database option                                                                               | Exclude as the zero-cost target                                                          |

Provider references:


- [GoDaddy cPanel hosting limits](https://www.godaddy.com/help/resource-limits-for-my-hosting-account-32396) and [connecting to a MySQL database](https://www.godaddy.com/help/connect-to-a-mysql-database-using-php-216).
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [limits](https://developers.cloudflare.com/d1/platform/limits/) and [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
- [Neon free plan limits](https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md).
- [Supabase pricing](https://supabase.com/pricing), [pausing projects](https://supabase.com/docs/guides/platform/going-into-prod#pausing-projects) and [database backups](https://supabase.com/docs/guides/platform/backups).
- [Railway pricing](https://railway.com/pricing).

## Target service architecture

PWA (same origin): User / Admin / Owner workspaces
→ HTTPS `/api/v1`
→ PHP middleware: session authentication, capability and record-scope authorization
→ PHP services: voucher entry, approvals, Cash Close, reports, audit and private receipt access
→ PDO transactions
→ MySQL/MariaDB tables: users, sessions, vendors, vouchers, approvals, receipts metadata, cash closes/corrections, settings, audit events and idempotency requests.

Private receipt storage and encrypted off-host backups remain separate infrastructure components. The browser must never connect directly to SQL.

## Data and security invariants for the replacement

- Store money as integer paise in `BIGINT`; do not use floating-point currency columns or recompute historic amounts during migration.
- Preserve distinct transaction type, status, approval status, cash impact and payment method. Approved-payment totals must not include pending, rejected or review-required payments.
- Store event timestamps in UTC and preserve explicit business dates in `Asia/Kolkata`. Do not derive historical business dates from a server's current timezone during import.
- Keep voucher numbers unique by the existing series/type, and enforce a unique idempotency key for each client-created operation.
- Commit a financial mutation and its required audit event in the same database transaction. Audit events are append-only to application roles; corrections are compensating events, not edits to the audit trail.
- Use foreign keys and unique constraints for relationships and numbering. All schema changes are numbered, reviewed migrations; no hand-edits to production tables.
- Enforce server-side role and record-scope authorization on every API endpoint. The frontend's User/Admin/Owner workspaces are not security controls.
- Use PHP's password hashing API (Argon2id if available and supported, otherwise bcrypt), constant-time verification, rate limiting, session rotation, secure `HttpOnly` cookies, `Secure` and appropriate `SameSite`, CSRF protection for cookie-authenticated writes, and restrictive CORS (same-origin by default).
- Never put database credentials in frontend code, static config, Git history, client storage or public web root.
- Keep receipt files private; verify voucher scope and user capability before returning a receipt.
- Keep a recoverable, separate offline outbox. A browser-local record is not a server-saved voucher until the API acknowledges it.

## Data model outline

Initial normalized tables:

- `users`, `user_sessions` and recovery/lockout state;
- `vendors`;
- `vouchers` with immutable original identity, voucher number, business date, integer paise amount and existing financial/status dimensions;
- `voucher_approvals` or an immutable approval-event table, preserving actor, decision, timestamp and reason;
- `voucher_receipts` with private storage key, content type, size and digest (not public file URLs);
- `cash_closes` and `cash_close_corrections`, preserving included voucher snapshot and original close evidence;
- `settings`;
- append-only `audit_events`;
- `idempotency_requests` for offline/retry-safe mutation acceptance.

Finalize columns and indexes only after a field-by-field inventory of the actual production Sheet data and existing Apps Script formulas is reconciled. This is a target outline, not a ready-to-run production schema.

## Migration plan — no dual-write shortcut

1. **Inventory and evidence.** Snapshot the current Sheet tabs, headers, formulas, Script Properties, Drive receipt mapping, authorization behavior, triggers and current offline queue semantics. Verify one complete backup and restore before extraction.
2. **Host qualification.** Complete the cPanel preflight above. If any critical control fails, select the fallback before building the new runtime.
3. **Contract first.** Freeze the existing action semantics as an API contract and map each action to a versioned service. Identify the writes and their idempotency behavior. No production endpoint change.
4. **Build the replacement in isolation.** Implement schema migrations, login/session security, capability checks, transactional voucher/approval/Cash Close services, audit, receipt access, reports and backup operations. Keep it on a non-production test database.
5. **Repeatable export/import.** Build an owner-run, read-only export from Apps Script/Sheets/Drive into an encrypted transfer bundle. Never log password hashes, salts, tokens, receipt contents or credentials.
6. **Shadow comparison.** Import a copy, compare row counts, voucher sequence ranges, paise totals by date/type/status/approval/payment method, vendor identities, audit events, receipt counts and hashes, Cash Close snapshots/corrections, users and settings. Investigate every discrepancy; no silent coercion.
7. **Offline queue safety.** Drain pending browser outbox entries before cutover, or export and validate them with the existing recovery procedure. Preserve original client IDs so retry semantics remain idempotent. Do not clear IndexedDB or switch the API endpoint while pending entries remain unresolved.
8. **Owner-controlled cutover.** Freeze writes for a short approved window, take and verify a final backup, import the final delta, reconcile again, change the API endpoint and complete Owner/Admin/User live acceptance checks. Keep a tested rollback path to the old deployment and its unchanged data.
9. **Operate before decommission.** Prove scheduled backups, off-host retention, separate restore, receipt retrieval, audit integrity, role denial, load/concurrency and device/offline behavior. Keep the old Apps Script deployment and Sheet read-only as an archive until the Owner signs off and the retention period is satisfied.
10. **Retire Apps Script only after evidence.** Remove old endpoints/credentials only after the replacement has run reliably, the recovery owner approves, and there is no remaining client on the old API.

No dual writes between Sheets and SQL are recommended: partial success across two stores can create divergent ledgers. Use an isolated import, shadow reconciliation and an explicit single-writer cutover instead.

## Scope of this PR

This PR may document the target architecture and separate the existing User/Admin/Owner experiences without modifying existing server role grants. It must not introduce a production SQL connection, expose credentials, create/migrate/drop a database schema, export production Sheets/Drive contents, change the live Apps Script API URL, deploy/push Apps Script, write production financial data, clear offline queues, alter backups, or claim Apps Script is already retired.

A later delivery should implement a provider-neutral API contract and SQL-backed test environment only after the host preflight and owner-approved technical decision.
