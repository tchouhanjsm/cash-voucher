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
- PR #47 was opened as a formatting-only child PR against the #46 branch. To avoid stacked PRs, fold any needed formatting correction directly into #46 and close #47 without merging it.
- PR #46's previously verified head was `075cf2181990554b34465e1935551fa7e644b656`; its CI failed in `prettier --check .` on `backend/Code.gs`, while Browser E2E passed on that same head. These are historical results; use the PR body and live Actions page for current results after subsequent changes.
- PR #46's current functional test coverage primarily invokes `recordBackupFailure_()` directly. Orchestration-level failures and lock-acquisition behavior require explicit review and regression coverage before calling the fix complete.
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

1. Remove the hard commit-count failure gate and its boundary test; preserve the six required handoff-section checks.
2. Keep the formatter correction on #46 and close #47 after verifying it is no longer needed as a separate review.
3. Fix lock handling so the lock is released after any successful acquisition, including failures while obtaining properties; do not release a lock when acquisition fails.
4. Add orchestration-level tests for partial copy/manifest failures, cleanup failure, complete snapshot preservation after retention failure, failure-metadata write failure, and lock acquisition.
5. Update `docs/pr-handoffs/PR-46.md` and this file with final scope, exact-head results and remaining operational gates.
6. Review the final changed-file list and PR body. Do not merge or deploy; wait for owner review.

## Operational gates still open

- Live Drive permissions, scheduled trigger behavior, backup completeness and restore into a separate Sheet/folder are not verified.
- Real Apps Script lock contention and Google service quotas/timeouts are not proven by the mock suite.
- Daily cash close semantics and schema remain unapproved; do not implement them as part of backup work.
