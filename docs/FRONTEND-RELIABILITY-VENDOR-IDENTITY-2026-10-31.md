# Cash Voucher — Frontend reliability and vendor identity batch

**Date:** 31 October 2026  
**Integration base:** `client-main` at `12fbea69ff4df6728651d772d264411942367de1`  
**Feature branch:** `client/frontend-reliability-vendor-identity-20261031`

## Confirmed source findings

- New Entry built recent-payee and datalist suggestions from historical voucher text and cached names, so malformed historical text could reappear as a trusted-looking suggestion.
- Vendor lookup by name did not enforce active vendor status, and the voucher record did not distinguish a registered vendor from a one-time payee.
- Duplicate confirmation was represented as a row boolean and the client inspected only its currently loaded voucher collection. A second user or a concurrent save could change the authoritative ledger without invalidating that boolean.
- Startup hid the boot screen immediately after launching the asynchronous navigation/session bootstrap, allowing a blank view while the bootstrap request was outstanding.
- The existing service worker already limited the HTML fallback to navigation requests and only cached the explicit public app shell. The Register already used server-side filter/pagination and server-wide filtered totals; those implementations are intentionally preserved.

## Implementation decisions

### Vendor identity

- `REGISTERED` vouchers carry both `VendorID` and `VendorType`; the server validates that the ID exists, is unambiguous, active, and matches the supplied display name.
- `ONE_TIME` vouchers carry no master ID and remain valid without creating a permanent vendor record.
- The active vendor master is now the only source for selectable vendor names and recent verified payee chips. Historical one-time/free-text voucher labels no longer become registered suggestions.
- The new `VendorType` field is appended in Vouchers column X. Historical rows are not inferred, renamed, or backfilled; blank values are returned as `UNVERIFIED`.
- Offline entry and recovery validation preserve valid vendor ID/type values. Legacy recovery records without those fields remain accepted.

### Duplicate payment review

- The authenticated `checkPaymentDuplicates` read endpoint scans the authoritative voucher ledger and returns a limited set of visible matching references plus a hidden-match count.
- The confirmation token is short-lived and HMAC-signed using the configured server pepper. It binds the current payment fields and the complete set of matching vouchers, including their relevant date, vendor identity, amount, status and voucher number.
- The create endpoint rechecks the candidate set under the existing write lock. A concurrent create, candidate removal, or material edit requires the user to review the updated match set again.
- Exact retries with an already committed client transaction ID remain idempotent and are resolved before duplicate confirmation; duplicate detection and idempotency remain separate protections.

### Startup and PWA

- Session restoration is awaited. The boot status remains visible until the app, login, or a defined recovery state is ready.
- The public shell cache advances to `cv2-v42`, so the app shell and the updated existing JavaScript modules are re-precached. IndexedDB/offline queue storage is not cleared.
- Navigation-only HTML fallback and exact static-asset handling remain unchanged.

## Deployment gate

This is a coordinated frontend/backend change. Before deploying the matching Apps Script code:

1. Run and verify the normal full backup.
2. Confirm the Vouchers sheet has the reviewed A:W schema including `PaymentMethod`.
3. Run `migrateVoucherVendorTypeField()` once from the Apps Script editor.
4. Verify that X1 is `VendorType` and that historical X cells are blank.
5. Deploy the backend route and frontend bundle together, then perform staging UAT for new entries, one-time payees, duplicate-review flows, offline retry and recovery import.

No spreadsheet migration, production data correction, production deployment, or staging deployment is performed by this source change. Do not manually correct historical payee names without supporting source records and the audited correction workflow.

## Scope boundaries

The Register's established server-side pagination and totals are retained rather than replaced. The service-worker fallback implementation is retained. This batch does not claim that every HTML sink, every screen's WCAG conformance, or the full production Lighthouse matrix has been independently verified; those need the full browser/device and deployed-environment QA gates.
