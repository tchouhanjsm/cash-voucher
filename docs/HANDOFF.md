# Engineering Handoff

**Updated:** 14 October 2026  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified `main` SHA:** `a4be8a50e2b9cf3e356057beed537e74a9401a26` (PR #122 merge)  
**Current batch:** Daily Cash Close saved-snapshot integrity and hostile-rendering regression coverage, branch `security/cash-close-snapshot-integrity-2026-10-14`  
**Rule:** the GitHub PR page is authoritative for current head SHA and checks; this handoff commit itself changes the branch head.

## Current phase — Daily Cash Close saved-snapshot integrity

PR #122 is merged at `a4be8a50e2b9cf3e356057beed537e74a9401a26`. It completed UI shell phases 7–8: admin views distinguish loading, failed, invalid and empty states; Users, Audit and Backup status have direct retry paths; Backup retry preserves unsaved Settings values. Its reviewed head `4fe0085c3fcebcfe04667dade6c46ebf8ef0afbb` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38532473913), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38532473998) (313 checks), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38532473975) (245 backend checks, 38 documented contrast-pair checks across both themes, and 313 browser checks).

The current batch hardens the persisted Daily Cash Close response boundary. A saved close must return every included voucher record, a one-to-one ordered ID list, and the matching count. Malformed entries, duplicate/mismatched IDs, invalid amounts or cash-impact values, and count inconsistencies must raise `CASH_CLOSE_DATA`; they must not be silently filtered or presented as a complete immutable close. Browser E2E also checks that hostile API text in the Cash Close report/correction surfaces remains inert.

The current branch starts from verified main SHA `a4be8a50e2b9cf3e356057beed537e74a9401a26`. All code changes must pass CI, Browser E2E and Full Flight Test on the same exact final head. This source/test batch makes no schema, financial-policy or deployment change. Live Apps Script/Sheets, authorization, backup/restore, physical-device PWA, assistive-technology and controlled-pilot checks remain independent operational gates.

## Most recently completed — PR #122: admin read-state and recovery

PR #122 is merged at `a4be8a50e2b9cf3e356057beed537e74a9401a26`; its tested head is `4fe0085c3fcebcfe04667dade6c46ebf8ef0afbb`. The exact-head CI, Browser E2E and Full Flight Test links and results are recorded above. Merge status does not establish production deployment or live service/recovery behavior.

## Owner-approved edit policy — UAT-048, PR #118

[PR #118](https://github.com/tchouhanjsm/cash-voucher/pull/118) merged at `3ef265aa17c9687435881ab69c8219800f990b04`.
Its tested head `bda1aacbc98c93a707df972f5b2ab00055745ba4` passed CI, Browser E2E and Full Flight Test.

Owner-approved UAT-048 edit policy:

- Amount, vendor/vendor identity, date and CashImpact changes invalidate an approval-managed payment's approval.
- If the corrected amount remains at or above INR 10,000, the payment returns to `PENDING`; if below the threshold, it becomes `NOT_REQUIRED`.
- Category and notes corrections retain approval status and metadata.
- Every accepted correction requires the existing reason and records old/new field values. A material re-review event preserves the former approval attribution in audit history before current approval fields are cleared.
- Historical blank approval states are not retroactively backfilled.

The existing payment threshold remains inclusive INR 10,000 for new PAYMENT vouchers only; existing owner/manager roles approve, creators cannot self-approve, and rejections require a reason.
Unresolved approval states are excluded from approved totals and block final cash close.

## Architecture and durable boundaries

- Single-property PWA backed by Google Apps Script, Google Sheets and Drive.
- `index.html` loads `frontend/main.js`; root `app.js` is a legacy artifact, not the active entry point.
- `frontend/core/` owns shared infrastructure; `frontend/features/` owns feature behavior; `backend/*.gs` is the Apps Script API.
- Backend role checks, validation, financial totals and writes are authoritative. Hiding UI controls is not authorization.
- Daily Cash Close records an immutable per-date snapshot in source, but source/tests do not prove live deployment or live reconciliation.
- Device-local offline queue entries are not centrally backed up until synchronized. Preserve legacy/recovery data; never auto-classify historical CashImpact.
- Preserve the owner's local untracked `docs/AI-ENGINEERING-PROTOCOL.md`; never stage, overwrite or delete it.

## Independent release / operational gates still open

1. Owner verifies the intended Apps Script project, active Web App deployment/execution settings, Sheet binding and Script Properties.
2. Only after explicit release authorization and a verified backup, inspect actual headers/rows and run only required guarded migrations in order: CashImpact Q, approval fields R:U, VendorID V, then cash-close tabs. Do not migrate from a feature PR.
3. Verify live owner/manager/staff authorization, receipt access, and payment-approval behavior against the intended deployment.
4. Observe a real scheduled Drive backup; inspect workbook, receipt copies and manifest; witness restore into a separate destination and validate row counts and voucher numbering.
5. Complete real-device PWA install/update/offline/recovery checks, accessibility/assistive-technology review and a controlled hotel pilot.
6. Continue the dynamic HTML/DOM sink audit; do not claim complete XSS certification.
7. Track the documented `@google/clasp → micromatch → braces` dependency-advisory exception through its 9 November 2026 review date and the unused `backupData_` lint warning.

## Engineering and release rules

- One coherent, user-visible business outcome per PR; batch related code, tests and domain documentation.
- Run `npm run fix` before push when a local checkout is available. Do not claim local checks without evidence.
- CI, Browser E2E and Full Flight Test must all pass on the same exact final PR head.
- Owner retains review and merge authority. Never merge, deploy, run `clasp push`, run `setup()`, migrate schema, force-push, delete branches or mutate production data without explicit authorization.
- Do not create per-PR handoff files; maintain this file as the single current-state handoff and keep the GitHub PR description as the permanent change record.
