# Engineering Handoff

**Updated:** 2026-10-09  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified main SHA (PR #57 base):** `9249d753daf361798c457d237ab16d121d13b47e`  
**Source of truth:** live GitHub refs and exact-head workflow runs. PR descriptions hold the authoritative current CI/E2E links.

## Product and architecture

Cash Voucher is a single-property cash-voucher PWA backed by Google Apps Script, Google Sheets and Drive. `index.html` loads `frontend/main.js`; `frontend/core/` owns shared infrastructure; `frontend/features/` owns feature behavior; `backend/Code.gs` is the API source. Root `app.js` is legacy and is not loaded by `index.html`.

Server-side authorization is authoritative. Browser-local offline entries are not centrally backed up until synchronized. Recorded backup status does not prove snapshot completeness or restoreability. Daily cash close remains design-only until the owner approves the decisions in `docs/DAILY-CASH-CLOSE-DESIGN.md`.

## Current PR state

- PR #46 is merged to `main`; backup failure cleanup, lock safety, and removal of the arbitrary commit-count ceiling are in the integration history. Its mock tests do not prove live Drive/restore behavior.
- PR #47 is closed without merge to avoid stacking; its formatting correction was included in #46.
- PR #48 is merged into `main` (merge commit `49142bd92eb3ef45a0dee70610d874612c40523a`); its contrast/financial readability foundation passed CI and 75 Browser E2E checks.
- PR #49 merged on 9 October 2026 (merge commit `dd70819f02c564ad4df433e27342d7a53dd004b6`). Its Browser E2E passed 93 checks; use the live PR description for exact CI evidence.
- PR #50 merged on 9 October 2026 (merge commit `c9ccc829076b9d461372cd6a2959342286cc04a4`); it adds a 19-pair contrast check and dialog Escape/focus-return handling.
- PR #52 merged on 9 October 2026 (merge commit `64655a5b11956d0289b4e6098599df7cd8932860`); it isolates modal background interaction and adds focus-containment browser coverage. Exact-head CI/E2E passed 98 checks, 0 failures.
- PR #53 merged on 9 October 2026 (merge commit `a6bb1ace7547114c9c8072dd7359ca901387980d`); narrow payment-row reflow and reduced-motion browser coverage passed CI and 101 Browser E2E checks.
- PR #54 merged on 9 October 2026 (merge commit `a87c1d90405b1e7cd1097c6328668f91f8cc9af4`); register empty-state clarity and filter recovery passed CI and 103 Browser E2E checks.
- PR #55 merged on 9 October 2026 (merge commit `b73aee24b91a4b5808e05bda2e84537188c5028f`); receipt retry and register refresh recovery are integrated. Exact-head CI and Browser E2E passed on PR head `54b2cae724a6dcb6c9a63e1a996f745e99e38427` (106 checks, 0 failures).
- PR #56 merged on 9 October 2026 (merge commit `9249d753daf361798c457d237ab16d121d13b47e`); exact PR head `9a06246c125594ff7af1201cf1f897000a744857`, CI passed and Browser E2E passed 114 checks / 0 failures.
- No Apps Script production deployment, live backup/restore, or production-data operation has been performed.

## Process decisions

- No hard commit-count ceiling; judge coherence, reviewability, final diff and evidence.
- No history rewrite or force-push. Avoid stacked PRs; fold safe corrections into the active PR.
- Every PR requires `docs/pr-handoffs/PR-<number>.md` and an updated `docs/HANDOFF.md`.
- The owner reviews and merges. Do not merge, deploy Apps Script, or mutate production data on the owner's behalf.
- Local repository synchronization is the owner's post-approval step; do not ask for a local sync while the PR is under review.

## Current batch: PR #57 — manager register mobile review

Scope: identify payment-versus-receipt and status at a glance; make register actions clearly labelled and easier to tap on phones; reflow register rows and filters into a compact card layout at mobile widths.

Keep all action eligibility tied to existing client capability checks and rely on server authorization as the security boundary. No API, schema, accounting, or production behavior change.

**Branch:** `ui/manager-register-mobile-review`.
**PR:** https://github.com/tchouhanjsm/cash-voucher/pull/57.
Base is the verified `main` SHA above.

**Current gate:** On candidate head `556e6b3ea9a4f1aef47e133255968d0daea27da3`, CI is `failure` and Browser E2E is `pending`. The last completed CI attempt failed at Prettier for `docs/HANDOFF.md` and `frontend/features/register.js`; that formatter output must be generated in a connected checkout before the batch can be considered ready.

Next steps:
1. In a connected checkout, run `npx prettier --write docs/HANDOFF.md frontend/features/register.js` and commit the formatter output.
2. Require CI and Browser E2E to pass on one identical final SHA.
3. Inspect final diff and residual risks; leave merge to the owner.

## Operational gates still open

- Live Drive permissions, scheduled trigger behavior, backup completeness and restore into a separate Sheet/folder are unverified.
- Real Apps Script lock contention and Google service quotas/timeouts are not proven by mocks.
- Daily cash close semantics/schema remain unapproved.
- Real-device PWA install/update, formal accessibility evaluation and hotel pilot remain outstanding.
