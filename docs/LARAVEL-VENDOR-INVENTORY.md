# Laravel vendor catalog — legacy contract and field inventory

**Source inspected:** `backend/60-vendors.gs`, `backend/25-helpers.gs`, `backend/00-config.gs`, `database/migrations/0001_identity_and_catalog.sql`, and `api/v1/src/Security/Role.php`.

**Purpose:** document the vendor source contract for the isolated Laravel shadow implementation. No live Sheets or Drive data was exported.

## Source fields and target mapping

- `VendorID` maps to `vendors.source_legacy_id`. It is a stable source identifier. Historical imports must retain the original ID rather than regenerate it. New Laravel catalog rows receive an internal UUID.
- `Name` maps to `vendors.display_name`. It is required Unicode text, limited to 120 characters. Input is whitespace-normalized and uses NFKC normalization when PHP intl is available. Names are case-insensitively unique across active and inactive vendors.
- `Company` maps to `vendors.company_name`. It is optional Unicode text, limited to 120 characters.
- `Mobile` maps to `vendors.mobile`. It is optional and accepts 7–15 characters from digits, plus, spaces and hyphens. Historical imports must remove only the Google Sheets formula-safety apostrophe sentinel where its use is verified.
- `Active` maps to `vendors.is_active`. New vendors default to active. Deactivation is reversible; there is no hard-delete action. Inactive vendors remain available for historical references and their names stay reserved.
- `CreatedBy` maps partially to `vendors.created_by_user_id`. The legacy field is an email snapshot, while schema 0001 has no vendor creator-email snapshot column. An unmapped historical email cannot currently be preserved in the vendor row. Historical import must not discard it; add a reviewed snapshot mapping before import.
- `CreatedAt` maps to `vendors.created_at_utc`. Apps Script writes a timezone-local ISO timestamp in Asia/Kolkata. Import must parse it in Asia/Kolkata and convert to UTC; do not reinterpret it as UTC.
- `DefaultCategory` maps to `vendors.default_category`. It is optional, limited to 40 characters, and must match configured expense or receipt categories.
- `DefaultPaymentMethod` maps to `vendors.default_payment_method`. Supported values are `CASH`, `UPI` and `BANK_TRANSFER`.

The voucher table separately stores `vendor_name_snapshot`, `vendor_id` and `vendor_type`. Vendor catalog edits must never rewrite a previously issued voucher's name snapshot.

## Authorization and lifecycle

- The source Role capability map grants `vendors` to Manager and Owner only. Staff and Accountant are denied.
- `saveVendor_` creates or updates a vendor and appends an audit event. There is no hard-delete action.
- `toggleVendor_` changes the active state and audits activation or deactivation.
- New-entry choices include active registered vendors only. Inactive vendors remain addressable by ID for history.
- Registered vendor selection requires an active ID and an exact case-insensitive name match. A one-time payee has no vendor ID and uses `vendor_type=ONE_TIME`; a registered payee uses `vendor_type=REGISTERED`.
- Duplicate name detection includes inactive rows. Ambiguous historical rows must be reconciled; migration must not silently choose one.

## Laravel implementation in this PR

- `GET /api/v1/vendors`: Manager/Owner catalog list; active-only by default; supports bounded search and pagination; `includeInactive=true` is explicit.
- `POST /api/v1/vendors`: creates a vendor and requires CSRF plus `Idempotency-Key`.
- `PATCH /api/v1/vendors/{vendorId}`: updates name, company, mobile and defaults; requires CSRF plus `Idempotency-Key`.
- `POST /api/v1/vendors/{vendorId}/active`: sets the desired active state rather than toggling it, making retries safe; requires CSRF plus `Idempotency-Key`.

Migration `0005_vendor_name_claims.sql` adds a unique normalized-name claim table. A claim is acquired in the same transaction as the vendor row, audit event and idempotency result. This closes the concurrent check-then-insert race while preserving existing rows. Before claiming a name, the application checks the original vendors table so unclaimed legacy rows still block duplicates. Activation rejects a name already held by another active legacy row.

The runtime account receives SELECT, INSERT and DELETE on `vendor_name_claims` only. Claims are released or replaced during a vendor rename inside the transaction; a failed rename rolls back both the vendor row and claim.

## Remaining inventory work

This file covers the verified vendor area only. The complete financial inventory remains open for voucher lifecycle transitions, approval/rejection, receipt metadata and Drive file IDs, cash-close snapshots and corrections, dashboard/report inclusion rules, exports, settings, offline outbox identities and historical migration source fields. Those require inspection of the actual Apps Script handlers, PWA consumers and source schemas before implementation.
