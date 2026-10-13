# Engineering Handoff

**Updated:** 13 October 2026  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified PR base / `main` SHA:** `34589cbf708dbcba4a5e731b34e77c56e9a63cba` (PR #113 merge)  
**Active branch:** `feature/payment-approval-workflow`  
**Purpose:** current state, active batch, durable constraints and independent release gates. Recheck live GitHub refs and workflow results each session.

**Working rules:** read `docs/FOUNDER-MODE.md` first. Use `docs/NEW-CHAT-PROMPT.md` for a new engineering session.

## Current batch — owner-approved high-value payment approval

**Owner policy confirmed 13 October 2026:**

- New `PAYMENT` vouchers with amount **greater than or equal to ₹10,000** require approval. Receipts are outside this threshold workflow.
- Existing owner/manager roles may approve, but never their own voucher. Backend authorization is authoritative.
- Rejections require an attributable reason; approval/rejection status and actor/time/reason are audited.
- Pending, rejected or malformed approval-state payments are excluded from approved payment totals and block final cash close until approved or cancelled/resolved.
- Existing blank approval values mean `NOT_REQUIRED`; historical records are not backfilled. New approval metadata is additive in columns R:U after the existing CashImpact column Q.
- A material edit to an approval-managed voucher returns it to pending approval. A legacy blank status is not retroactively changed merely because it is edited.

The active feature branch is implementing backend enforcement, the Register review workflow, Dashboard/Reports visibility and totals, the Daily Cash Close blocker, Browser E2E/backend regressions, and release/design documentation in one PR. Verify the live PR and exact workflow head after opening; owner review and merge remain required.

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
2. After explicit release authorization and a verified backup, perform the guarded schema operations in the runbook: CashImpact Q if needed, approval fields R:U, then cash-close tabs. Do not run them from this PR.
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
