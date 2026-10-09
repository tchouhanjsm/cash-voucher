# Engineering Handoff

**Updated:** 2026-10-09  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified main SHA:** `dd70819f02c564ad4df433e27342d7a53dd004b6`  
**Source of truth:** live GitHub refs and exact-head workflow runs. PR descriptions hold the authoritative current CI/E2E links.

## Product and architecture

Cash Voucher is a single-property cash-voucher PWA backed by Google Apps Script, Google Sheets and Drive. `index.html` loads `frontend/main.js`; `frontend/core/` owns shared infrastructure; `frontend/features/` owns feature behavior; `backend/Code.gs` is the API source. Root `app.js` is legacy and is not loaded by `index.html`.

Server-side authorization is authoritative. Browser-local offline entries are not centrally backed up until synchronized. Recorded backup status does not prove snapshot completeness or restoreability. Daily cash close remains design-only until the owner approves the decisions in `docs/DAILY-CASH-CLOSE-DESIGN.md`.

## Current PR state

- PR #46 is merged to `main`; backup failure cleanup, lock safety, and removal of the arbitrary commit-count ceiling are in the integration history. Its mock tests do not prove live Drive/restore behavior.
- PR #47 is closed without merge to avoid stacking; its formatting correction was included in #46.
- PR #48 is merged into `main` (merge commit `49142bd92eb3ef45a0dee70610d874612c40523a`); its contrast/financial readability foundation passed CI and 75 Browser E2E checks.
- PR #49 merged on 9 October 2026 (merge commit `dd70819f02c564ad4df433e27342d7a53dd004b6`); it adds seven-width responsive overflow checks, 44px mobile navigation targets, and a visible-focus assertion.
- PR #50 is the current review target: [measured accessibility contrast and dialog-focus regressions](https://github.com/tchouhanjsm/cash-voucher/pull/50), branch `ui/measured-accessibility-contrast`. Verify the exact live head and both CI/E2E runs before owner review.
- No Apps Script production deployment, live backup/restore, or production-data operation has been performed.

## Process decisions

- No hard commit-count ceiling; judge coherence, reviewability, final diff and evidence.
- No history rewrite or force-push. Avoid stacked PRs; fold safe corrections into the active PR.
- Every PR requires `docs/pr-handoffs/PR-<number>.md` and an updated `docs/HANDOFF.md`.
- The owner reviews and merges. Do not merge, deploy Apps Script, or mutate production data on the owner's behalf.
- Local repository synchronization is the owner's post-approval step; do not ask for a local sync while the PR is under review.

## Current batch: PR #50

Scope: measure WCAG AA contrast for the existing token pairings, improve low-contrast control boundaries and focus indication on dark navigation, and add regression assertions for contrast and dialog focus restoration. No backend/API, permission, voucher schema, or accounting semantics change.

Next steps:

1. Verify CI and Browser E2E against the exact live PR #50 head.
2. If a check fails, diagnose and fix on the same branch; do not create a stacked PR.
3. Leave PR #50 for owner review/merge; owner controls merge and any deployment.
4. Follow with a separate manual screen-reader, zoom/reflow and one-thumb task-flow review; automated contrast assertions are not a complete WCAG audit.

## Operational gates still open

- Live Drive permissions, scheduled trigger behavior, backup completeness and restore into a separate Sheet/folder are unverified.
- Real Apps Script lock contention and Google service quotas/timeouts are not proven by mocks.
- Daily cash close semantics/schema remain unapproved.
- Real-device PWA install/update, formal accessibility evaluation and hotel pilot remain outstanding.
