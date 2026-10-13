# Engineering Handoff

**Updated:** 13 October 2026  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified `main` SHA:** `db1c3cfee6b3f3e1fb127d61c4ea58a8bf7fa592` (PR #107 merge)  
**Purpose:** current state, active work, release boundaries and next action. Recheck live GitHub refs and exact-head workflows each session.

**Working rules:** read `docs/FOUNDER-MODE.md` first. New AI chat? Use `docs/NEW-CHAT-PROMPT.md`.

## Current phase — PR #108: Inspect device-local queued entries

**Branch:** `feature/offline-queue-review`  
**Base:** `db1c3cfee6b3f3e1fb127d61c4ea58a8bf7fa592`

The banner currently shows only an aggregate pending count while rejected entries receive individual review rows. This batch makes pending/sending records inspectable without making them removable or treating them as server-confirmed. Show account/endpoint-owned entries only, at most five in the banner disclosure, with type, safe vendor text, amount, date, queue status and receipt count. Export remains the recovery path for full details; rejected-entry removal continues to require export-first confirmation.

**Acceptance gate:** the exact final PR head passes CI, Browser E2E and Full Flight Test. Verify current-account scoping, receipt-count rendering, long-list disclosure, escaping of tampered IndexedDB text, and no change to upload/authentication gates. Owner review/merge remains required; no deployment or production mutation.

## Last completed — PR #107

[PR #107: Complete offline unlock to voucher sync workflow](https://github.com/tchouhanjsm/cash-voucher/pull/107) merged at `db1c3cfee6b3f3e1fb127d61c4ea58a8bf7fa592`. Exact tested head `639fb982e00e3139a9d969128bf960c2c32007e4` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38291708608), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38291708626) (**260 checks**), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38291708773) (**129 backend + 260 browser checks**). The local-only offline unlock can save to the account-bound queue without a server create request; sync waits for online authentication and successful bootstrap.

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
