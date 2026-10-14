# Engineering Handoff

**Updated:** 14 October 2026  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified `main` SHA:** `7e604c603e12942db26a9fc49a1d46bcaa2376ea` (PR #123 merge)  
**Current batch:** Printed-voucher date-shape resilience and rendering regression coverage, branch `security/printed-voucher-date-shape-2026-10-14`  
**Rule:** the GitHub PR page is authoritative for current head SHA and checks; this handoff commit itself changes the branch head.

## Current phase — printed-voucher date-shape resilience

PR #123 merged at `7e604c603e12942db26a9fc49a1d46bcaa2376ea`. It hardened the saved Daily Cash Close response boundary: malformed voucher snapshots, inconsistent IDs and count mismatches now fail closed with `CASH_CLOSE_DATA`. Its tested PR head `c2cd661b7da34788d1f99317f7439945ce965ad3` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38538622739), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38538622731) (314 checks), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38538622741) (251 backend checks, 38 contrast-pair checks, and 314 browser checks).

The current batch addresses a remaining output-path resilience gap in `frontend/features/printing.js`. The New Entry success path stores the `createVouchers` response object in the frontend cache before a subsequent bootstrap normalization; a malformed non-string `date` can therefore reach the print renderer, where `dmy(value)` assumes a string and can throw. Print formatting must validate a strict ISO calendar date before calling the formatter and display a clear `Date unavailable` fallback for malformed dates. Regression coverage verifies both this fallback and preservation of the ordinary valid date format while retaining the hostile voucher-number print regression.

The current branch starts from verified main SHA `7e604c603e12942db26a9fc49a1d46bcaa2376ea`. CI, Browser E2E and Full Flight Test must pass on the same exact final PR head. This is a client display/resilience change only: no backend/API contract, stored record, financial policy, schema or deployment changes. The active rendering audit remains incremental, and production authorization, backup/restore, physical-device PWA and assistive-technology checks remain separate operational gates.

## Most recently completed — PR #123: Daily Cash Close snapshot integrity

PR #123 merged at `7e604c603e12942db26a9fc49a1d46bcaa2376ea`; its tested head was `c2cd661b7da34788d1f99317f7439945ce965ad3`. All three exact-head workflow results are linked above. The change does not automatically repair any pre-existing inconsistent close and does not establish production deployment.

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
