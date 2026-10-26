## Current verified checkpoint

The current merged integration checkpoint is `e97c4e080b3f6903e16ef77f571822f9844faeed` (PR #213). PRs #209–#213 are merged. PR #214 is the sole open PR targeting [`client-main`](https://github.com/tchouhanjsm/cash-voucher/pull/214), with exact head `fb99228e9191ce92baf7b67ba91ccceace971d56`. CI / Quality #40215001346, Browser E2E #40215001337 and Full Flight Test #40215001342 passed on that exact head; the monitor's read-only PR observation #40215001360 also passed. PR #214 is not draft and GitHub reports it mergeable, but no review is submitted and PR-level auto-merge is not requested. Repository metadata confirms `allow_auto_merge=true`; the latest recorded ruleset evidence still excludes `client-main` and requires no approvals. The current connector cannot independently re-read branch rules. Owner/admin must verify governance; source checks do not close staging, restore or customer-acceptance gates.

The monitor must compare the live `client-main` SHA with `docs/HANDOFF.md` and report baseline drift rather than silently treating stale documentation as current. Open PR heads remain separate from the merged integration baseline. Source checks do not close staging, restore, governance or customer-acceptance gates.

The bounded retry policy permits at most two retries per eligible source-validation run (three total attempts), and only for a revalidated timeout. It never retries ordinary test failures, cancellations, staging UAT or ZIP publication.

## Scheduler cadence

The ChatGPT monitor is configured to run hourly. A 45-minute recurring schedule is not supported by the available scheduler; do not claim that interval was configured. Repository Actions are event-driven only and have no cron or manual-dispatch trigger: the default branch is `main`, while `client-main` is the integration branch and `main` is designated frozen/read-only. GitHub scheduled and `workflow_dispatch` triggers require the workflow file on the default branch, so neither is available for this workflow without changing the frozen branch. Do not modify `main` as a workaround.

## Auto-merge policy boundary

The external ChatGPT delivery scheduler may request GitHub auto-merge only for the single active PR after exact-head required checks, dependency/security gates, mergeability, verified branch protection and required human review are satisfied. Repository metadata confirms `allow_auto_merge=true`; no repository-settings change is needed. PR-level auto-merge remains unrequested for PR #214 because no review is submitted and `client-main` protection is not verified. The scheduler must not claim a PR-level request succeeded without GitHub confirmation. The repository Actions monitor itself remains read-only with respect to merges.

**Serial PR queue:** inspect all open PRs at the start of each scheduler run. Do not open another PR while any prior PR remains open/unmerged. Fix a failed check on the active PR branch instead of creating a second PR. Advance to the next planned batch only after GitHub confirms the current PR is merged; a requested auto-merge is not a merge confirmation.

## Repository monitor behavior

The workflow observes pushes to `client-main` and PR changes targeting `client-main`. Pull-request runs are read-only. It collects the exact integration SHA, canonical handoff baseline/phase, CI/E2E/Flight results for that exact SHA, workflow status against each open PR head SHA, review state, staging/ZIP runs, failed job/step summaries, in-progress age, release gates and API collection warnings.

Pass, failure, pending, running, stalled, timed out, cancelled, skipped and unknown are distinct states. Missing check data is not success. Handoff SHA mismatch is drift. Data/API collection errors become warnings/blockers rather than silently being reported green. Workflow-run selection prioritizes `run_number`, then `created_at`; `updated_at` is only a fallback/tie-breaker so a rerun of an older run cannot displace a newer-created run.

## Timeout recovery

Only timed-out source-validation runs are eligible: CI/Quality, Browser E2E and Full Flight. Recovery re-fetches the run before retrying, verifies it is completed with conclusion `timed_out`, verifies the exact current `client-main` SHA, and restricts automatic recovery to trusted `client-main` push runs. Manual dispatch is not available while the workflow is absent from the default branch. Maximum total attempts are three (initial run plus two retries). Only failed jobs are rerun where supported. A recovery reservation is written to the persistent checkpoint before the action; the ledger then records requested or failed. If the request result is uncertain, it is not blindly retried.

Regular code/test failures, cancellations, PR-head runs, staging UAT, Client staging ZIP, migrations and deploys are never automatically retried or performed by this monitor. Persistent failures require failed-step review/root-cause analysis and a reviewed source fix or human escalation.

## Persistent checkpoints and handoff

A single GitHub issue titled "Autonomous Development Monitor — Persistent Checkpoint" stores status and bounded history of run IDs/attempts, source SHA, phase, exact-head check state, open PRs, blockers, recovery reservations/results and release gates. History is capped. The workflow also uploads sanitized JSON report artifacts. Secrets, OAuth data, passwords, raw staging endpoints, spreadsheet/folder IDs and raw staging transcripts must not be copied into checkpoint content.

docs/HANDOFF.md remains the single engineering session handoff. Update it when the baseline, active phase, important defect or release gate materially changes. Do not create per-PR handoff documents.

## Merge and deployment boundaries

This monitor never merges pull requests. Passing CI is not enough: human review, approvals, required checks, active repository rulesets/branch protection and an authorized owner decision remain prerequisites. The repository default branch is main while the integration branch is client-main; owner/admin must resolve settings deliberately without blindly changing the frozen branch.

The monitor never performs Clasp push, Apps Script version update, Google Sheets/Drive mutation, write-capable staging UAT, schema migration, cPanel upload, production deployment or DNS changes. Operational release remains blocked until staging identity is proved, live UAT succeeds, security headers/roles are checked, backup restore is demonstrated into a separate destination, and device/offline/print/accessibility acceptance is complete.

## Follow-up defects found in deep review

1. backend/90-support.gs, supportRateAllowed_: CacheService get-then-put rate counting is not atomic under concurrent submissions. It can overshoot intended 5 reports/user/hour and 20/workspace/6h limits. Fix in a separate change using a bounded lock or atomic backend and concurrency tests.
2. B6 audit health: the pre-PR #209 review identified malformed persisted counters/timestamps and mixed-store states that needed fail-closed handling. PR #209 merged that correction into `client-main`; it is no longer a separate open code fix. Keep the residual limitation explicit: if every audit-marker store fails, durable alerting cannot be guaranteed.
3. Live staging, actual response headers, real Google resource isolation, migration need, backup/restore, and device acceptance remain unverified. Green CI/mock tests must not close those release gates.

## Owner-required actions

- Verify that rulesets/branch protection cover `client-main` with CI / Quality, Browser E2E, Full Flight Test and the intended human approval. Repository auto-merge is already enabled; PR-level auto-merge must wait for those gates.
- Confirm staging Script/deployment/Sheet/folders and production separation privately; never paste credentials or private IDs into the checkpoint.
- Review the temporary Zod advisory exception from PR #206 by 9 November 2026.
- Authorize staging deployment, migrations, transactional UAT and pilot explicitly; none is implied by monitor success.

## Live phase and handoff baseline semantics — 26 October 2026

The checkpoint's **Current phase** is derived from live exact-head CI / Quality, Browser E2E and Full Flight results, the current open PR queue, operational workflow evidence, release-gate flags, and observed branch-governance state. It is not copied verbatim from the handoff's historical **Current phase** field, because that prose can outlive a merge and leave the checkpoint reporting an already-closed PR as active.

The handoff's **Verified integration baseline** is a recorded snapshot, while the checkpoint's **Current SHA** is read from the live `client-main` ref. A baseline mismatch remains visible for provenance but is informational by itself; it is not a release blocker or a request to chase the exact merge SHA in another documentation PR. Failed or non-terminal source checks, unresolved PR reviews, stale or incomplete operational evidence, unverified staging/recovery/device gates, branch governance, and monitor data errors remain actionable gates.

This changes checkpoint reporting only. It does not weaken exact-SHA CI/E2E pairing, treat missing/cancelled checks as passes, grant review or merge approval, or authorize any staging or production operation.
