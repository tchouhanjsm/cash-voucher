# Autonomous Development Workflow — Cash Voucher

## Purpose and source of truth

The delivery process must keep development moving without confusing a green mock test with successful live release. Source of truth is GitHub commit/PR/workflow state, docs/HANDOFF.md, the execution plan and staging release audit. The checkpoint issue is a persistent run record, not a substitute for source or deployment evidence.

## Current verified checkpoint

The last merged integration checkpoint is `176da7c559d279149e2473a65a71fd03d3e53018` (PR #208). The monitor must compare the live `client-main` SHA with `docs/HANDOFF.md` and report baseline drift rather than silently treating stale documentation as current. Open PR heads remain separate from the merged integration baseline.

The bounded retry policy permits at most two retries per eligible source-validation run (three total attempts), and only for a revalidated timeout. It never retries ordinary test failures, cancellations, staging UAT or ZIP publication.

## Scheduler cadence

The ChatGPT monitor is configured to run hourly. A 45-minute recurring schedule is not supported by the available scheduler; do not claim that interval was configured. Repository Actions are event-driven only and have no cron or manual-dispatch trigger: the default branch is `main`, while `client-main` is the integration branch and `main` is designated frozen/read-only. GitHub scheduled and `workflow_dispatch` triggers require the workflow file on the default branch, so neither is available for this workflow without changing the frozen branch. Do not modify `main` as a workaround.

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
2. B6 audit health: readAuditPropertiesMarker_ appears to normalize malformed property counters and missing timestamps/kinds to a degraded marker. This conflicts with the fail-closed contract requiring MONITORING_UNAVAILABLE for malformed monitoring state. Add corruption tests and reconcile behavior in a separate code fix.
3. Live staging, actual response headers, real Google resource isolation, migration need, backup/restore, and device acceptance remain unverified. Green CI/mock tests must not close those release gates.

## Owner-required actions

- Confirm rulesets and branch protection actually cover client-main and require intended checks and review.
- Confirm staging Script/deployment/Sheet/folders and production separation privately; never paste credentials or private IDs into the checkpoint.
- Review the temporary Zod advisory exception from PR #206 by 9 November 2026.
- Authorize staging deployment, migrations, transactional UAT and pilot explicitly; none is implied by monitor success.
