# PR Handoffs and Engineering History

This index is a durable map for future development threads. The dedicated handoff for each new PR belongs in `docs/pr-handoffs/PR-<number>.md`. The PR description remains the source for exact-head CI/E2E URLs and owner review status. Do not infer current state from old notes: verify live GitHub base/head SHAs first.

## Recent reviewed PR sequence

| PR | Outcome | Durable record / important boundary |
| --- | --- | --- |
| [#41](https://github.com/tchouhanjsm/cash-voucher/pull/41) | Targeted hardening of HTML rendering sinks and stored-XSS regressions. | Merged. Not a complete sanitizer migration; full dynamic HTML sink audit remains open. |
| [#42](https://github.com/tchouhanjsm/cash-voucher/pull/42) | DOM text rendering and commit-count gate raised to 20. | Merged. The commit-count ceiling is being removed in #46; required PR handoff sections remain enforced. |
| [#43](https://github.com/tchouhanjsm/cash-voucher/pull/43) | Fixed dated-backup retention matching and CSV manifest line breaks. | Merged. Live Drive and restore behavior were not verified. |
| [#44](https://github.com/tchouhanjsm/cash-voucher/pull/44) | Initial owner-only backup status implementation. | Closed unmerged; the reviewed replacement is #45. |
| [#45](https://github.com/tchouhanjsm/cash-voucher/pull/45) | Added owner-only backup status and clearer recovery-state messaging. | Merged. Status metadata does not prove snapshot completeness or restoreability. |
| [#46](https://github.com/tchouhanjsm/cash-voucher/pull/46) | Clean up incomplete backup snapshots and harden failure/lock handling. | Active. See [PR-46 handoff](pr-handoffs/PR-46.md) and live PR checks. |
| [#47](https://github.com/tchouhanjsm/cash-voucher/pull/47) | Formatting-only child PR created while correcting #46. | Closed without merge to avoid stacked PRs; the active review target is #46. |

## Per-PR handoff contract

Every PR must create or update `docs/pr-handoffs/PR-<number>.md` before owner review. Include:
- User/operator outcome and acceptance criteria.
- What changed, with relevant files, functions, interfaces and data contracts.
- Tests and exact verification status; distinguish passed, failed, skipped and not run.
- Security, concurrency, failure/recovery and UI/UX review findings.
- Important decisions and explicit exclusions.
- Release boundary, residual risks, and next steps.
- Exact current head and CI/E2E URLs may be recorded in the PR description to avoid stale documentation after another commit.

Update `docs/HANDOFF.md` in every active work batch with the verified `main` SHA, current active PR/head SHA, blockers, next steps, and deployment/production status. On a new thread, read this file, `docs/HANDOFF.md`, `docs/DEVELOPMENT-WORKFLOW.md`, relevant design docs, and the active PR's description/diff/checks before editing.

## Current source-of-truth rules

- GitHub live refs and workflow runs outrank stale handoff text.
- No hard commit-count ceiling. Coherence, reviewability, exact-head verification and documented risk determine readiness.
- The owner merges PRs. No agent merge or production deployment.
