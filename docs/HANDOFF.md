# Engineering Handoff

**Updated:** 2026-10-09  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified main SHA:** `ff649a1f2095071723bc50d7c0b8ed59589b73a5`  
**Source of truth:** live GitHub refs and exact-head workflow runs; this document is a navigation and continuation aid.

## Product and architecture

Cash Voucher is a single-property cash-voucher PWA backed by Google Apps Script, Google Sheets and Drive. `index.html` loads `frontend/main.js`; `frontend/core/` owns shared infrastructure; `frontend/features/` owns feature behavior; `backend/Code.gs` is the API source. Root `app.js` is a legacy artifact and is not loaded by `index.html`.

Server-side authorization is authoritative. Browser-local offline entries are not centrally backed up until synchronized. Recorded backup status does not prove snapshot completeness or restoreability. Daily cash close remains design-only until the owner approves the open accounting and operational decisions in `docs/DAILY-CASH-CLOSE-DESIGN.md`.

## Current PR state

- PR #45 is merged into `main`; it adds the owner-only backup status panel and clearer recovery-status semantics.
- PR #46 is the active backup-failure cleanup PR: [PR #46](https://github.com/tchouhanjsm/cash-voucher/pull/46).
- PR #47 was closed without merge to avoid stacking. The single review/merge target is PR #46; its formatter issue is being corrected on the #46 branch.
- The most recently verified candidate head before the current follow-up was `81b321e84a576096aa58b98b549612bf3230d70d`: [CI passed](https://github.com/tchouhanjsm/cash-voucher/actions/runs/37931188568) with 88 backend checks and [Browser E2E passed](https://github.com/tchouhanjsm/cash-voucher/actions/runs/37931188584) with 72 checks, 0 failures. The current follow-up adds additional backup regressions; verify its new exact head before owner review.
- PR #46 now introduces a dependency-injected backup orchestration helper with regression cases for copy/manifest failures, cleanup failure, retention failure, metadata-write failure, lock acquisition and success. Exact-head CI must confirm these tests pass.
- No PR has been merged and no Apps Script production deployment or production data change has been performed by this workflow.

## Process decisions

- No hard commit-count ceiling. Do not add or retain a numeric PR commit limit in docs, scripts or tests. Keep commits meaningful; evaluate scope, final diff, evidence and risk.
- Do not rewrite or force-push history to improve presentation. Correct the branch with forward commits.
- Do not stack dependent PRs for formatting or small corrections; fold them into the active PR when safe and coherent.
- Every PR must have a dedicated `docs/pr-handoffs/PR-<number>.md` record and the current `docs/HANDOFF.md` updated.
- The PR description is the authoritative place for exact-head CI/E2E links and review status.
- Owner reviews and merges. No merge, Apps Script push, new deployment version or production-data operation by the agent.

## Engineering sequence

`main` → feature/fix branch → two-pass review → local `npm run check` + `npm run test:e2e` → push → PR → CI + Browser E2E on exact head → final diff/security review → owner merge.

Do not claim local checks were run when the local checkout or dependencies were unavailable. A mock test is not proof of real Drive/Sheets behavior.

## Next steps for PR #46

1. Run CI and Browser E2E on the exact current PR #46 head after the additional Sheet-copy and metadata-bound regression cases.
2. Review the complete diff, PR body, handoff record and changed-file list; record exact-head workflow URLs in the PR description.
3. Keep the PR open for owner review. Do not merge or deploy.

## Operational gates still open

- Live Drive permissions, scheduled trigger behavior, backup completeness and restore into a separate Sheet/folder are not verified.
- Real Apps Script lock contention and Google service quotas/timeouts are not proven by the mock suite.
- Daily cash close semantics and schema remain unapproved; do not implement them as part of backup work.
