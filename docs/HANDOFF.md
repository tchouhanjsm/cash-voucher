# Engineering Handoff

**Updated:** 12 October 2026  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified `main` SHA:** `e980f634242fdd549411f5c6067d0b267a3c5f22` (PR #106 merge)  
**Purpose:** current state, active work, release boundaries and next action. Recheck live GitHub refs and exact-head workflows each session.

## Current phase — PR #107: Complete offline-unlock to outbox workflow

**Branch:** `fix/offline-unlock-outbox-flow`  
**Base:** `e980f634242fdd549411f5c6067d0b267a3c5f22`

PR #106 added device-local unlock after a recent successful online sign-in. This exposed an end-to-end workflow edge: when no server token exists, New Entry must put the voucher directly in the account-bound IndexedDB outbox rather than attempt a create request and depend on a network error. The queued entry must clearly tell the user that online sign-in is required before synchronization. Outbox flush must not run while the app is in offline workspace mode or the browser reports itself offline.

**Acceptance gate:** the exact final PR head passes CI, Browser E2E and Full Flight Test. Browser coverage must prove: local save with no server create request; voucher and receipt survive in the account-bound queue; turning connectivity back on does not sync without server authentication; successful online sign-in restores the verified workspace and drains the queue. Keep the PR open for owner review; no merge, deployment or production mutation.

## Last completed — PR #106

[PR #106: Support device-local offline unlock](https://github.com/tchouhanjsm/cash-voucher/pull/106) merged at `e980f634242fdd549411f5c6067d0b267a3c5f22`. Its exact tested PR head `98324ec3084c252f458f6334cb1805d675e2dd1e` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38287916562), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38287916549) (254 checks), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38287916551) (129 backend + 254 browser checks).

## Product and architecture boundaries

- Cash Voucher is a single-property PWA backed by Google Apps Script, Google Sheets and Drive.
- `index.html` loads `frontend/main.js`; root `app.js` is a legacy artifact, not the active entry point.
- `frontend/core/` owns shared infrastructure; `frontend/features/` owns feature behavior; `backend/Code.gs` is the Apps Script API source.
- Backend role checks remain authoritative. Hiding a route is not an authorization control.
- Device-local offline unlock is not server authentication. Do not create a token locally or sync queued items until an online server session/bootstrap succeeds.
- Offline queue entries are browser-local and are not centrally backed up until synchronized.
- Dashboard balances and movement reports reflect recorded vouchers; they are not proof of physical cash, a general ledger, tax position or reconciliation.
- Daily cash close remains design-only until the owner/accountant resolves the choices in `docs/DAILY-CASH-CLOSE-DESIGN.md`.
- Preserve the owner's local untracked `docs/AI-ENGINEERING-PROTOCOL.md`; do not stage or overwrite it.

## Engineering and PR rules

- One coherent, focused feature PR at a time; batch related product behavior, regression coverage and relevant domain docs together.
- Verify live `main`, active PR/base/head SHAs, changed-file list and final workflow results. Do not infer state from prior chat.
- Apply the two-pass product/functional and security/failure/recovery review in `docs/DEVELOPMENT-WORKFLOW.md`.
- PR body must include Outcome, Acceptance criteria, Verification evidence, Security and failure review, Release boundary, and Residual risks / not verified.
- CI, Browser E2E and Full Flight Test must pass on the same exact final PR head.
- Owner retains review and merge authority. No force-push, branch deletion, `setup()`, `clasp push`, deployment or production-data mutation without explicit authorization.
- Do not create a new `docs/pr-handoffs/PR-<number>.md`; GitHub PR metadata is the permanent change record. Keep this file as current state only.

## Open release/operational gates

1. Owner verifies the intended Apps Script project, active Web App deployment/execution settings, Sheet binding and Script Properties.
2. Verify real owner/manager/staff authorization, including receipt access and staff restrictions, against the live deployment.
3. Observe a real scheduled Drive backup; inspect copied workbook, receipts and manifest; witness a restore to a separate recovery Sheet/folder and validate row counts and voucher numbering.
4. Complete physical-device PWA install/update/offline checks, assistive-technology review and a controlled hotel pilot.
5. Continue the incremental dynamic-HTML/DOM rendering audit. It is not a full XSS certification.
6. Track the existing time-limited `@google/clasp → micromatch → braces` dependency-advisory exception through its 9 November 2026 review date and the documented unused `backupData_` lint warning.
