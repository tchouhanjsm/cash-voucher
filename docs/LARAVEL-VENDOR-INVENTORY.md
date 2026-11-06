# Laravel vendor catalog — legacy contract and field inventory

**Source inspected:** `backend/60-vendors.gs`, `backend/25-helpers.gs`, `backend/00-config.gs`, `database/migrations/0001_identity_and_catalog.sql`, `api/v1/src/Security/Role.php`.  
**Purpose:** capture the verified vendor contract for the isolated Laravel shadow implementation. No live Sheets or Drive data was exported.

## Source fields and target mapping

| Legacy Vendors field | SQL target | Contract / migration note |
| --- | --- | --- |
| `VendorID` | `vendors.source_legacy_id` | Stable source identifier. Imported IDs must be retained; do not replace them with regenerated source IDs. Laravel creates a new internal UUID for newly created catalog rows. |
| `Name` | `vendors.display_name` | Required, Unicode text, maximum 120 characters. NFKC normalization where PHP intl is available; trims and collapses whitespace. Names are case-insensitive unique across active and inactive vendors. |
| `Company` | `vendors.company_name` | Optional Unicode text, maximum 120 characters. |
| `Mobile` | `vendors.mobile` | Optional string matching `^[0-9+ -]{7,15}$`. Store the display form without the Google Sheets formula-safety apostrophe sentinel. |
| `Active` | `vendors.is_active` | New vendors default active. Deactivation is reversible; no vendor delete operation exists. Inactive vendors remain addressable for history and keep their name reserved. |
| `CreatedBy` | `vendors.created_by_user_id` (partial) | Resolve to a known SQL user when possible. **Gap:** schema 0001 has no creator-email snapshot column, so an unmapped legacy creator email cannot yet be preserved in the vendor row. Historical import must not discard it; add a reviewed snapshot mapping before import. |
| `CreatedAt` | `vendors.created_at_utc` | Legacy Apps Script writes a timezone-local ISO string in Asia/Kolkata. Import must parse it as Asia/Kolkata and convert to UTC; do not reinterpret it as UTC. |
| `DefaultCategory` | `vendors.default_category` | Optional, maximum 40 characters; must match configured expense or receipt categories. |
| `DefaultPaymentMethod` | `vendors.default_payment_method` | Optional; allowed values are `CASH`, `UPI`, `BANK_TRANSFER`. |

The voucher table separately stores `vendor_name_snapshot`, `vendor_id` and `vendor_type`. Vendor catalog edits must never rewrite a previously issued voucher's name snapshot.

## Authorization and lifecycle

- The source `Role` capability map grants `vendors` to Manager and Owner only. Staff and Accountant are denied.
- `saveVendor_` creates or updates a vendor and appends an audit event. There is no hard-delete action.
- `toggleVendor_` changes the active state and audits activation/deactivation.
- New-entry choices include active registered vendors only. Inactive vendors remain addressable by ID for history.
- Registered vendor selection requires an active ID and an exact case-insensitive name match. A one-time payee has no vendor ID and uses `vendor_type=ONE_TIME`; a registered payee uses `vendor_type=REGISTERED`.
- Duplicate name detection includes inactive rows. Ambiguous historical rows must be reconciled; the migration must not silently choose one.

## Laravel implementation in this PR

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/v1/vendors` | Manager/Owner catalog list; active-only by default; supports bounded search and pagination; `includeInactive=true` is explicit. |
| POST | `/api/v1/vendors` | Creates a vendor; requires CSRF and `Idempotency-Key`. |
| PATCH | `/api/v1/vendors/{vendorId}` | Updates name/company/mobile/defaults; requires CSRF and `Idempotency-Key`. |
| POST | `/api/v1/vendors/{vendorId}/active` | Sets the desired active state rather than toggling it, making retries safe; requires CSRF and `Idempotency-Key`. |

Migration `0005_vendor_name_claims.sql` adds a unique normalized-name claim table. The claim is acquired in the same transaction as the vendor row, audit event and idempotency result. This closes the concurrent check-then-insert race while preserving existing rows. Before claiming a name, the application also checks the original `vendors` table so pre-existing imported rows without claims still block duplicates. Activation rejects a name that is already held by another active legacy row.

The runtime account receives SELECT/INSERT/DELETE on `vendor_name_claims` only; the uniqueness guard requires no update or delete access to vendor rows beyond the existing vendor update permission. Name claims are only released/replaced during a vendor rename, inside the transaction; a failed rename rolls back both the row and claim.

## Remaining inventory work

This file covers the verified vendor area only. The complete financial inventory remains open for voucher lifecycle transitions, approval/rejection, receipt metadata and Drive file IDs, cash-close snapshots/corrections, dashboard/report inclusion rules, exports, settings, offline outbox identities and historical migration source fields. Those require inspection of their actual Apps Script handlers, PWA consumers and source schemas before implementation.
