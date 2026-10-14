# Engineering Handoff

**Updated:** 14 October 2026  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified `main` SHA:** `6320be4293b9f3f91005a25b7207dd686cbaf7c9` (PR #121 merge)  
**Current batch:** UI shell phases 7–8 — administration and diagnostic loading/error/retry states, branch `feature/admin-state-recovery-phases-7-8`  
**Rule:** the GitHub PR page is authoritative for current head SHA and checks; this handoff commit itself changes the branch head.

## Current phase — UI shell phases 7–8

PR #121 merged at `6320be4293b9f3f91005a25b7207dd686cbaf7c9`. Phases 4–6 delivered the warm-neutral/navy/gold token palette, system-aware dark mode with a persistent explicit choice, selected contrast checks for both themes, theme-independent A5 voucher print styling, and PWA launch metadata/cache alignment.

The current batch addresses two connected admin UX phases: (7) distinguish Users/Vendors/Audit/Backup-status loading, error, invalid-response and empty states; (8) provide direct, accessible retry paths for transient failures. User-list retries call `listUsers` again without reloading the app; audit retry reopens the audit read; backup status retries in place without resetting Settings fields. No finance rules, backend contracts, roles or schema are changed.

The current branch starts from verified main SHA `6320be4293b9f3f91005a25b7207dd686cbaf7c9`. All code changes must pass CI, Browser E2E and Full Flight Test on the same exact final head. Physical-device, assistive-technology, live Apps Script/Sheets, backup/restore and controlled pilot checks remain independent operational gates.

## Most recently completed — PR #121: themed UI shell, print and PWA polish

PR #121 merged at `6320be4293b9f3f91005a25b7207dd686cbaf7c9`. Its tested PR head `f1b7942995becb81abf83651582680a415531582` passed CI, Browser E2E (308 checks, zero failures), and Full Flight Test (245 backend checks, 38 documented contrast-pair checks across both palettes, and 308 browser checks).

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
