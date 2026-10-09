# Engineering Handoff

**Updated:** 2026-10-09  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified main SHA:** `b716217f1e89bdbabe87ae9b2b9e426e8a3a3a69`  
**Source of truth:** live GitHub refs and exact-head workflow runs. PR descriptions hold the authoritative current CI/E2E links.

## Product and architecture

Cash Voucher is a single-property cash-voucher PWA backed by Google Apps Script, Google Sheets and Drive. `index.html` loads `frontend/main.js`; `frontend/core/` owns shared infrastructure; `frontend/features/` owns feature behavior; `backend/Code.gs` is the API source. Root `app.js` is legacy and is not loaded by `index.html`.

Server-side authorization is authoritative. Browser-local offline entries are not centrally backed up until synchronized. Recorded backup status does not prove snapshot completeness or restoreability. Daily cash close remains design-only until the owner approves the decisions in `docs/DAILY-CASH-CLOSE-DESIGN.md`.

## Current PR state

- PR #46 is merged to `main`; backup failure cleanup, lock safety, and removal of the arbitrary commit-count ceiling are in the integration history. Its mock tests do not prove live Drive/restore behavior.
- PR #47 is closed without merge to avoid stacking; its formatting correction was included in #46.
- PR #48 is the only active review target: [UI contrast and financial readability](https://github.com/tchouhanjsm/cash-voucher/pull/48), branch `ui/mobile-accessibility-foundation`.
- Exact-head CI/E2E evidence is maintained in PR #48's live description. Before owner review, verify both linked runs target the current head SHA and passed; any further commit requires re-verification.
- No Apps Script production deployment, live backup/restore, or production-data operation has been performed.

## Process decisions

- No hard commit-count ceiling; judge coherence, reviewability, final diff and evidence.
- No history rewrite or force-push. Avoid stacked PRs; fold safe corrections into the active PR.
- Every PR requires `docs/pr-handoffs/PR-<number>.md` and an updated `docs/HANDOFF.md`.
- The owner reviews and merges. Do not merge, deploy Apps Script, or mutate production data on the owner's behalf.
- Local repository synchronization is the owner's post-approval step; do not ask for a local sync while the PR is under review.

## Current batch: PR #48

Scope: shared muted-text contrast, tabular financial figures, mobile horizontal-overflow assertion, and documentation updates. No backend/API, permission, voucher schema, or accounting semantics changed.

Next steps:

1. Wait for CI and Browser E2E on the live PR #48 head.
2. If either fails, diagnose and fix on the same branch; do not create a stacked PR.
3. Review the final diff and exact-head evidence, then leave PR #48 for owner review/merge.
4. Continue UI/UX work with broader viewport, contrast, keyboard and assisted-technology checks after this foundation batch.

## Operational gates still open

- Live Drive permissions, scheduled trigger behavior, backup completeness and restore into a separate Sheet/folder are unverified.
- Real Apps Script lock contention and Google service quotas/timeouts are not proven by mocks.
- Daily cash close semantics/schema remain unapproved.
- Real-device PWA install/update, formal accessibility evaluation and hotel pilot remain outstanding.
