# Phase 2 — Cross-Workflow Integrity

**Base:** `main` at `ff5a8ebde96698f15edb976c4fcd745d50085d10` (PR #127 merge)  
**Scope:** regression evidence across voucher entry, independent approval, reporting, Daily Cash Close and audit.  
**Release boundary:** automated tests use the in-memory Google services mock; this does not prove live Apps Script deployment or production Sheet behavior.

## Business outcome

A single high-value payment must retain consistent identity and financial treatment as it moves through the product. Pending approval must remain visible but excluded from approved totals and must block final cash close. After an authorized independent approval, the same voucher must appear in report totals, contribute to cash-close arithmetic, be present in the immutable close snapshot, and have attributable approval/close audit events.

## Integration path now covered

| Step | Actor | Required invariant |
| --- | --- | --- |
| Create a ₹10,000 PAYMENT | Manager | New high-value payment is PENDING; stable voucher ID and client ID persist. |
| Read movement report | Owner | Voucher is visible as pending, but excluded from active payment totals. |
| Approve payment | Owner (not creator) | Status and approval actor persist; audit event records the decision. |
| Read movement report | Accountant | Approved voucher appears exactly once in the report total; pending count is zero. |
| Preview cash close | Manager | Approved payment contributes to CASH_OUT; no approval blocker remains. |
| Finalize cash close | Manager | Expected cash is correct, variance is zero in the fixture, and snapshot count is exact. |
| Read saved close and audit | Owner | Snapshot retains voucher ID, number, amount and cash impact; approval and close events are attributable. |

The executable regression is in `test/test-backend.js` and runs through the standard `npm test` / `npm run test:flight` paths.

## Existing policies preserved

- New PAYMENT vouchers at or above ₹10,000 require an independent owner/manager approval.
- A creator cannot approve or reject their own voucher; rejection requires a reason.
- Pending, rejected or malformed approval-state payments remain excluded from approved totals and block final cash close until resolved.
- Historical blank approval values are not backfilled.
- CashImpact is explicit, and saved Daily Cash Close snapshots remain immutable.
- No production data, Apps Script deployment, schema or accounting rule is changed by this phase.

## Remaining cross-workflow risks

This integration regression is not a complete role/action matrix. Follow-on work must still test duplicate retry after an ambiguous network response, concurrent tabs, stale sessions, permission denial, offline queue recovery, and partial write/audit failure behavior. The existing Browser E2E suite covers portions of the browser/offline and role flows; its evidence remains separate from real-device and production validation.

## Acceptance and evidence

- The integrated journey asserts the same voucher ID across creation, approval, report, snapshot and audit.
- A pending record cannot enter approved totals or pass close finalization.
- The approved record enters the close snapshot exactly once with the expected cash impact.
- CI, Browser E2E and Full Flight Test must pass on the exact same final PR head.
- No PR merge is treated as production deployment or live operational sign-off.
