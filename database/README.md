# Isolated MySQL/MariaDB schema foundation

These migrations define a new, empty replacement database. They do not connect to Apps Script, read Sheets/Drive data, import historic vouchers, or alter the currently deployed backend.

## Apply and inspect

The migration-only database account is used by the CLI, not by HTTP requests:

    CV_APP_ENV=local CV_ALLOW_SCHEMA_MIGRATIONS=true php bin/migrate.php --apply
    php bin/migrate.php --status

The apply command requires an explicit allow flag and a non-production environment. The CLI acquires a MySQL advisory lock. Applied migration checksums are stored in schema_migrations; editing an applied file, removing a migration, reusing a version or creating a history gap is rejected. Initial DDL statements use CREATE TABLE IF NOT EXISTS, so an interrupted migration can safely retry its incomplete statements before the version is recorded.

Migration files are immutable after application. Add the next four-digit file for every schema change. Do not create a migration from an HTTP request.

## Credentials and database grants

Use distinct accounts:

- Migration account: only the CLI receives DDL-capable credentials (CV_MIGRATION_DB_USER / CV_MIGRATION_DB_PASSWORD). Do not place them in the web process environment.
- Runtime account: the API receives CV_DB_USER / CV_DB_PASSWORD. Grant only the table-level privileges required by service handlers. It must not have CREATE, ALTER, DROP, GRANT, FILE or schema-wide administrative privileges.

Recommended runtime grants are SELECT/INSERT/UPDATE on users, vendors, settings, vouchers, sessions, login throttles and idempotency; SELECT/INSERT on approval events, cash-close rows/corrections, receipt metadata and audit events; SELECT on schema_migrations for readiness. Do not grant DELETE on ledger, audit, approval or cash-close history. Disable, cancel and compensate rather than deleting financial evidence. The PHP test grant helper demonstrates this least-privilege matrix against a disposable test database.

The API never loads a .env file. Provide environment variables through the local shell, process manager or hosting control panel. Keep secrets outside the public document root and outside Git.

## Initial table groups

| Migration | Tables | Purpose |
|---|---|---|
| 0001 | users, vendors, settings | Identity, role key compatibility, party identity and configuration |
| 0002 | vouchers, voucher_approval_events, voucher_receipts, cash_closes, cash_close_corrections | Financial records, approvals, private receipt metadata and close snapshots |
| 0003 | user_sessions, login_attempts, idempotency_requests, audit_events | Hashed sessions/CSRF state, throttling, retry safety and attributable audit events |
| 0004 | voucher_number_sequences | Independent payment/receipt counters allocated under an InnoDB row lock inside the financial transaction |

Voucher numbers are allocated from a per-type row locked by SELECT ... FOR UPDATE inside the same transaction as the voucher insert. A rollback also rolls back the counter increment. Seed the first value from the reconciled legacy next-number setting during import; never guess the historical counter. Amounts use integer paise columns, never floating-point currency columns. Business dates remain DATE values in the Asia/Kolkata business calendar; event instants are DATETIME(6) stored in UTC. Existing Drive IDs and legacy source IDs have dedicated nullable fields for later reconciliation; no importer is included.

## Receipt storage

voucher_receipts.storage_key is a private storage identifier, not a public URL. Receipt bytes must be stored outside the web root, served only after record-scope authorization, and checked by content type, byte size and SHA-256. No upload/download route is implemented in this phase.

## Import and cutover boundary

Do not run these migrations on a customer database or production cPanel account during this phase. The schema is only an isolated engineering baseline; actual Sheet headers, formulas, Script Properties, receipt manifests, numbering behavior and cash-close semantics still require owner-reviewed field mapping and shadow reconciliation. There is no dual write and no API endpoint switch.
