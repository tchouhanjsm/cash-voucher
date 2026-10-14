# Engineering Handoff

**Updated:** 14 October 2026  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified `main` SHA:** `ff5a8ebde96698f15edb976c4fcd745d50085d10` (PR #127 merge)  
**Current phase:** Phase 2 — cross-workflow integrity; branch `phase-2/cross-workflow-integrity-2026-10-14`  
**Phase 1 audit:** [`docs/PHASE-1-REPOSITORY-AUDIT.md`](PHASE-1-REPOSITORY-AUDIT.md)  
**Phase 2 acceptance:** [`docs/PHASE-2-CROSS-WORKFLOW-INTEGRITY.md`](PHASE-2-CROSS-WORKFLOW-INTEGRITY.md)  
**Rule:** GitHub PR metadata and exact-head workflow results are authoritative. No merge or production deployment without owner authorization.

## Previous completed batch — Daily Cash Close preview response contract

PR #125 merged at `6dd53d3b927f184ceda8fb14916367c63199ae2d`; tested head `4e79f8bf1cc8a2c4672aebf7cc87215debb35314` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38550514761), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38550514690) (320 checks), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38550514643) (251 backend, 38 contrast, 320 browser checks).

This batch validates `cashClosePreview` response shapes and nested records before assigning view state. Malformed issue/history rows and coercion-hostile count fields must fail closed with a retryable error; a failed refresh must clear prior preview data so no stale Save action is available. This is a client boundary change, not a cash calculation or backend/API contract change.

CI, Browser E2E and Full Flight Test must pass on the same exact final PR head. Live Apps Script authorization/deployment, scheduled backup, isolated restore, physical-device/offline and assistive-technology checks remain separate release gates.

## Most recently completed — PR #126: Daily Cash Close preview response validation

PR #126 merged at `255d78ccb6a21b204d432221489114ccf514d333`. PR-head CI, Browser E2E (325 checks) and Full Flight Test passed on tested head `6c58dd1ec9913e7bffd2611caf9c11af4b6846cd`. The post-merge main CI run also passed on the exact main SHA. This does not prove production deployment or live operational readiness.

## Current implementation — Phase 2 cross-workflow integrity

PR #127 merged at `ff5a8ebde96698f15edb976c4fcd745d50085d10`. Phase 2 adds a regression journey proving one high-value payment remains consistent across creation, independent approval, accountant reporting, cash-close arithmetic/snapshot and audit. Scope and acceptance are in `docs/PHASE-2-CROSS-WORKFLOW-INTEGRITY.md`. CI, Browser E2E and Full Flight Test must pass on the same exact final PR head. No production deployment or data changes without explicit owner authorization.

## Remaining roadmap

After cross-workflow integrity: operational release proof (owner-authorized deployment/role inspection and witnessed backup/isolated restore), grouped UX completion across all screens, security/data-integrity closure, then evidence-led performance and repository hygiene. See `docs/PHASE-1-REPOSITORY-AUDIT.md` and `docs/BACKLOG.md`.

## Most recently completed — PR #125: Recorded Movement Report summary-count guard

PR #125 merged at `6dd53d3b927f184ceda8fb14916367c63199ae2d`; exact tested head `4e79f8bf1cc8a2c4672aebf7cc87215debb35314` passed CI, Browser E2E and Full Flight Test. The report now rejects malformed exception counters instead of coercing them or silently hiding exception notices.

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
