# Engineering Handoff

**Updated:** 13 October 2026  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified PR base / `main` SHA:** `34589cbf708dbcba4a5e731b34e77c56e9a63cba` (PR #113 merge)  
**Active branch:** `feature/payment-approval-workflow`  
**Purpose:** current state, active batch, durable constraints and independent release gates. Recheck live GitHub refs and workflow results each session.

**Working rules:** read `docs/FOUNDER-MODE.md` first. Use `docs/NEW-CHAT-PROMPT.md` for a new engineering session.

## Current batch — PR #114: approval plus read-only accountant export

**Owner payment-approval policy confirmed 13 October 2026:** new `PAYMENT` vouchers `>= ₹10,000` require approval by an existing owner/manager other than the creator. Rejections require a reason; unresolved approval states are excluded from approved payment totals and block final cash close. Historical blank approval values remain `NOT_REQUIRED`, with no approval backfill.

The same PR also implements the next Founder Mode slice: least-privilege read-only accountant report/CSV access and stable VendorIDs. New vouchers link to a saved VendorID only on a unique exact name match; old rows are not backfilled. Reports export generic source-voucher movement, not destination-certified accounting/tax output. Vendor master IDs are visible, unresolved rows are disclosed, and owner/accountant confirmation of the target accounting system remains open.

Active PR: [#114 — Require independent approval for payments ≥ ₹10,000](https://github.com/tchouhanjsm/cash-voucher/pull/114) on `feature/payment-approval-workflow`. It batches approval enforcement, review UI, approval-aware totals/cash close, accountant access/export, VendorID persistence/migration, regression tests and release/domain docs. Owner review and merge remain required; do not deploy or run migrations from the PR.

**Next development slice included in the same PR:** accountant report identity exceptions are now scoped to selected source rows. A duplicate vendor name is counted as ambiguous only when a selected row actually uses it; genuinely unmatched names remain a separate count, and the UI explicitly tells the accountant to reconcile ambiguous names manually. No fuzzy matching, historical backfill or tax mapping is introduced.

## Last completed — PR #113

[PR #113: Add structured audit events and paginated audit history](https://github.com/tchouhanjsm/cash-voucher/pull/113) merged at `34589cbf708dbcba4a5e731b34e77c56e9a63cba`. Exact tested PR head `612c4d029c766dca0d57b2a68b3b1f7d4204c334` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38397780126), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38397780101) (**276 checks, 0 failures**), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38397780332) on the same head. Audit writes remain best-effort and are not a transactionally coupled or tamper-evident ledger.

## Architecture and durable boundaries

- Single-property PWA backed by Google Apps Script, Google Sheets and Drive.
- `index.html` loads `frontend/main.js`; root `app.js` is a legacy artifact, not the active entry point.
- `frontend/core/` owns shared infrastructure; `frontend/features/` owns feature behavior; `backend/Code.gs` is the Apps Script API.
- Backend role checks, validation, financial totals and writes are authoritative. Hiding UI controls is not authorization.
- Device-local offline queue entries are not centrally backed up until synchronized. Preserve legacy/recovery data; never auto-classify historical CashImpact.
- Daily Cash Close exists in source (PR #111) and is immutable per business date, but this does not prove production deployment or live reconciliation.
- Preserve the owner's local untracked `docs/AI-ENGINEERING-PROTOCOL.md`; do not stage or overwrite it.

## Independent release / operational gates still open

1. Owner verifies the intended Apps Script project, active Web App deployment/execution settings, Sheet binding and Script Properties.
2. After explicit release authorization and a verified backup, perform guarded migrations in runbook order: CashImpact Q if needed, approval fields R:U, VendorID V, then cash-close tabs. Do not run them from this PR.
3. Verify live owner/manager/staff permissions, including receipt access and payment-approval behavior, against the intended deployment.
4. Observe a real scheduled Drive backup; inspect workbook, receipt copies and manifest; witness restore to a separate recovery Sheet/folder and validate row counts and voucher numbering.
5. Complete physical-device PWA install/update/offline checks, assistive-technology review and a controlled hotel pilot.
6. Continue the dynamic HTML/DOM sink audit; it is not full XSS certification.
7. Track the existing time-limited `@google/clasp → micromatch → braces` dependency-advisory exception through its 9 November 2026 review date and the documented unused `backupData_` lint warning.

## Engineering and release rules

- One coherent product outcome per PR; batch related UI, backend, tests and domain documentation.
- CI, Browser E2E and Full Flight Test must pass on the exact same final PR head before claiming ready.
- Do not claim local checks were run when no local checkout/environment was available.
- Owner retains review and merge authority. No merge, `clasp push`, schema migration, `setup()`, Web App deployment or production-data operation without explicit authorization.
- Do not create `docs/pr-handoffs/PR-<number>.md`; GitHub PR metadata is the per-change record. Keep this file as the current-state handoff.
