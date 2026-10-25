# Engineering Handoff — Cash Voucher

**Updated:** 25 October 2026  
**Repository:** tchouhanjsm/cash-voucher  
**Integration branch:** `client-main`  
**Verified integration baseline:** `3ad2c8f955b36de00b208ee4283682a1a34805eb` (PR #211 merged; exact-head source checks passed).  
**Legacy branch:** `main` (read-only and divergent; do not merge/rebase blindly).  
**Current phase:** P0 release readiness and branch reconciliation. PR #211 is merged; PR #209 remains open on `client/p0-audit-monitoring-integrity-20261025` for mixed audit-marker integrity, and PR #210 remains open for delivery-monitor tooling. Live staging remains unverified; owner retains merge/deploy authority.

## Verified source state

- PRs #205–#208 and #211 are merged to `client-main`. The current source baseline is `3ad2c8f955b36de00b208ee4283682a1a34805eb`. PR #209 now includes current `client-main` as a merge parent; it remains open for owner review and final exact-head status confirmation. PR #210 remains open and still needs base reconciliation.
- Exact-head checks passed on current integration SHA `3ad2c8f955b36de00b208ee4283682a1a34805eb`: [CI / Quality](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40166966112), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40166966123), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40166966102). Historical PR #207/#208 checks remain in the audit trail.
- PR #207 hardened voucher/receipt idempotency, ambiguous append recovery, post-append setting counters, payment rail consistency and malformed cash-close rows. Mock tests do not prove real Google Sheets/Drive transaction semantics.
- Source readiness is not live staging readiness. The deployed Apps Script URL/version, cPanel response headers, resource isolation, schema state, backup/restore and intended-device acceptance remain unverified.
- The owner-only `auditLog` endpoint exposes audit monitoring. The previous monitor relied only on Script Properties, so a primary marker write failure could hide an AuditLog append failure. PR #208 added a Settings-sheet durable fallback and a transient cache fallback, distinguishes unavailable monitoring, and keeps health data on empty cursor pages. PR #209 remains open to make mixed valid/corrupt marker-store states fail closed.
- The temporary `GHSA-mrhx-c7xc-m3w5` Zod exception from PR #206 remains a separate risk, due for reassessment by 9 November 2026. Do not force a major-version override of Clasp's declared Zod dependency.

## P0 B6 — merged fallback and open fail-closed follow-up

1. Preserve one audit-health response contract for populated, empty and terminal cursor pages.
2. On an audit append failure, persist the marker in Script Properties and in the Settings-sheet fallback. If both durable stores fail, attempt a clearly labeled transient CacheService marker with a six-hour TTL.
3. Return `MONITORING_UNAVAILABLE` when marker sources cannot be read or a stored marker is malformed; never translate an unknown source state into `NO_KNOWN_FAILURE`.
4. Expose marker durability in the owner UI and health export so the owner can distinguish Properties, Settings fallback, temporary cache and unavailable monitoring.
5. Fault-injection coverage checks primary-store fallback, transient-cache fallback, corrupt markers and the case where every marker write fails.

This improves common failure cases; it does not reconstruct missing AuditLog events. If AuditLog, Script Properties, Settings and CacheService all fail to persist the marker, the application emits an explicit diagnostic but cannot guarantee a durable alert. That residual risk remains visible in tests and documentation.

## PR #209 — mixed audit-marker integrity follow-up

The open branch `client/p0-audit-monitoring-integrity-20261025` makes the owner-facing audit-health contract fail closed: if any marker store is unreadable or malformed, the result is `MONITORING_UNAVAILABLE` even when another store retains a valid marker. Known failure count, timestamp, kind and marker source remain visible in the owner UI and health export.

The last fully green pre-status-alignment head was `76df53e233d693d83caab8b07eddb9f6df376db4`: [CI / Quality #40170498728](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40170498728), [Browser E2E #40170498735](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40170498735), and [Full Flight Test #40170498738](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40170498738) passed on that exact SHA. The current branch includes `client-main` at `3ad2c8f955b36de00b208ee4283682a1a34805eb` as a merge parent; use PR #209's live `Verification evidence` section for the newest head and check conclusions. These are source/mock checks, not proof of live Google Sheets/Drive behavior.

## Support-report rate-limit concurrency hardening — 25 October 2026

- **Finding:** `supportRateAllowed_` previously performed CacheService read/check/write operations without serialization. Concurrent requests could observe the same counter and exceed the per-user hourly or workspace six-hour limit.
- **Correction:** one short ScriptLock now protects both quota reads and both increments as a single decision. Counter values are validated; exhausted quotas return `RATE_LIMIT`. Lock/cache errors fail closed with a temporary `BUSY` response. A lock is released only after successful acquisition.
- **Regression coverage:** `test/test-support-report.js` simulates a counter changing immediately before the locked read for both user and workspace quotas, verifies lock contention sends no email and releases no unacquired lock, and checks that a successful request increments both counters once.
- **Boundary:** these are mock/source-level checks, not proof of live Apps Script concurrency or email delivery. CacheService remains best-effort storage; the lock serializes concurrent executions within this script project but does not make cache data durable. If support reporting returns `BUSY`, the reporter should retry later or use the workspace's established support contact.
- **Release status:** PR #211 merged this source fix at `3ad2c8f955b36de00b208ee4283682a1a34805eb`. Its PR-head CI [#40162435222](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40162435222), Browser E2E [#40162435213](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40162435213), and Full Flight Test [#40162435233](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40162435233) passed on `f018a958fa86c7ffe4ef8baa799ddd62c1bfb0d2`; the merge SHA then passed current integration checks. No live staging or production operation is authorized.

## Release gates that remain open

1. Verify the dedicated staging Script, Sheet, receipt/backup folders, existing Web App deployment ID and `/exec` URL against production references privately.
2. Inspect a staging backup and actual headers before running only schema migrations required by live data. Preserve historic payment-method blanks; do not use `setup()` as an upgrade.
3. Push reviewed backend source and update only the verified staging deployment with owner authorization; publish the independently built staging ZIP to the verified cPanel document root.
4. Run guarded UAT against the exact deployment; review sanitized evidence and actual HTTP security headers, role/receipt authorization, read models, payment/approval/cash-close flows.
5. Inspect a real backup and restore into a separate recovery Sheet/folder; reconcile headers, counts, voucher numbering, users/settings and receipt references.
6. Complete install/update, offline queue/reconnect/recovery, print/PDF/A5, keyboard, zoom/reflow and assistive-technology checks on intended devices.
7. Start the controlled 14-day pilot only after the gates pass and written owner/manager acceptance is recorded.

## Engineering constraints

- All product PRs target `client-main` through short-lived `client/*` branches; never push directly to `client-main`.
- `main` remains frozen/read-only. Recheck branch relationships before branch operations; do not blindly merge, rebase or force-update long-lived branches.
- **Verified branch-protection gap:** `client-main` reports `protected=false`; the active `cash-voucher-rule` ruleset targets `~DEFAULT_BRANCH` (currently `main`), requires only `quality`, and requires zero approving reviews. Owner/admin must correct and verify ruleset coverage for `client-main` before relying on enforcement.
- Required CI/Quality, Browser E2E and Full Flight Test must pass on the exact final PR head. Fix failures; do not bypass checks.
- PR handoff validation requires the exact `## Verification evidence` heading with meaningful current-head links; update the PR body before pushing a new head so the handoff gate evaluates the intended evidence.
- Keep Git merge, Clasp upload, Web App version update, ZIP publication, live UAT, migrations and production release as separate gates.
- If target identity, schema, backup, security headers, audit monitoring or restore fails, stop and preserve evidence. No production operation is authorized by this handoff.

## Autonomous delivery workflow — current implementation

- The ChatGPT delivery monitor is configured hourly. The requested 45-minute cadence is unsupported; do not represent it as a 45-minute job.
- The repository monitor is event-driven: pushes to `client-main` trigger the trusted checkpoint/recovery job, while PRs targeting `client-main` run read-only observation. Manual dispatch is intentionally unavailable because GitHub requires a `workflow_dispatch` workflow to exist on the default branch, while `main` remains frozen and this workflow is not present there. Do not modify `main` as a workaround. The ChatGPT monitor supplies the hourly observation cadence.
- The monitor records exact SHA, phase, required CI/E2E/Flight status, PR review/check status, operational staging/ZIP state, release gates, timeout recovery attempts and bounded run history in a dedicated GitHub checkpoint issue and workflow artifact.
- It may retry only timed-out source-validation workflows with exact-head validation and a three-attempt ceiling. It does not retry ordinary test failures, cancellations, staging UAT or ZIP publication. PR-event jobs are read-only.
- No automated PR merge, Clasp push, Apps Script deployment, Google resource mutation, migration, live UAT write, cPanel upload or production change is permitted. The repository owner remains responsible for approval, merge and release authorization.
- GitHub branch protection/rulesets and the mismatch between default branch main and integration branch client-main remain owner/admin settings to verify. The monitor does not assume source workflows enforce branch protection.

## Deep-dive defects reserved for a separate targeted fix

1. backend/90-support.gs — supportRateAllowed_ uses CacheService get-then-put as a counter. Concurrent requests can observe the same count and exceed intended 5-per-user/hour or 20-per-workspace/6-hour thresholds. Use a lock/atomic strategy or a storage primitive with suitable consistency; add concurrency/failure-path regression tests.
2. Audit health — PR #209 hardens readAuditPropertiesMarker_ and mixed-store aggregation so malformed persisted state reports MONITORING_UNAVAILABLE. Its exact-head checks passed, but it is still unmerged; the issue remains present in the current `client-main` baseline until owner review and merge.
3. Operational launch gates remain P0: confirm staging Script/deployment/Sheet/folders, backend/frontend staging release, guarded UAT, actual response headers, schema migration only after review, restore into a separate recovery target, and real-device/offline/print/accessibility acceptance.

## Cancellation diagnostics follow-up — 25 October 2026

- Deep review found that the monitor's detailed-job inspection selected failed, timed-out and action-required workflow runs, but omitted completed `cancelled` runs. Cancelled required checks remained non-passing, yet their job/step diagnostics were not collected into the checkpoint report.
- The follow-up in PR #210 includes cancelled workflow runs in diagnostic collection. The existing job and step filters retain cancellation conclusions, so operators can distinguish a concurrency-superseded run from a cancellation inside the actual validation job.
- A regression assertion protects the workflow collector's cancellation filter. Cancellation is still never treated as success; a cancelled required check remains `WAITING_FOR_VALIDATION` until valid exact-head evidence exists.
- This source commit invalidates prior PR #210 exact-head evidence. Re-run CI / Quality, Browser E2E and Full Flight Test on the new head before review or merge.

## Review-state integrity follow-up — 25 October 2026

- Deep review found the delivery monitor recorded PR review state but did not let `CHANGES_REQUESTED` block the PR's delivery state. A green check set could therefore appear as review-ready even when review feedback remained unresolved.
- The review collector now treats unresolved `CHANGES_REQUESTED` as a blocker and reports the explicit owner action to resolve review feedback before merge.
- An `APPROVED` review counts as current approval only when its `commit_id` matches the current PR head SHA. An approval on a superseded head falls back to `REVIEW_REQUIRED`; unresolved change requests remain blocking until a later review from that reviewer supersedes them.
- Regression tests cover stale approvals, exact-head approvals, unresolved changes requests, later approvals, and monitor-level blocked-state reporting. The current PR head must pass CI / Quality, Browser E2E, and Full Flight Test after this correction.
- Review-state follow-up validation RCA: CI / Quality runs [#40155142165](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40155142165), [#40155325426](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40155325426), [#40155458256](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40155458256), and [#40155666356](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40155666356) stopped at `Run quality gate` / `prettier --check .`; the first run flagged both the monitor and test file, later runs flagged only `scripts/autonomous-dev-monitor.js`. The temporary diagnostic run [#40155791155](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40155791155) exposed the exact remaining two line-wrap differences in the current-head approval predicate and change-request blocker message. Those lines are corrected, and the temporary diagnostic workflow step is removed in this follow-up. These were deterministic formatter failures; the regression suite did not run before the gate stopped. Fresh exact-head checks remain mandatory.

## Delivery-monitor release-state integrity follow-up — 25 October 2026

- Deep review found that the monitor selected the newest staging/ZIP run but did not compare its source SHA with current `client-main`. The latest Client staging ZIP run [#39988800756](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39988800756) was built from `aa37d94819e59a72c797ba36839aa8f8ec94008f`, older than the current baseline `176da7c559d279149e2473a65a71fd03d3e53018`; it must not be represented as current release evidence.
- Missing, pending, running, cancelled or skipped operational runs were not included in the monitor's incomplete-validation state calculation. If handoff wording later changed, the report could incorrectly appear healthy without completed staging and ZIP evidence.
- Unverified repository governance was shown as a next action but did not participate in overall state precedence. A report could therefore appear healthy while protection for `client-main` remained unverified.
- PR #210 now labels operational runs from any SHA other than the exact current `client-main` SHA as `STALE_HEAD`, preserves the original conclusion for diagnostics, and treats stale operational evidence as a release blocker. Missing, pending, running, cancelled and skipped staging/ZIP runs now produce `WAITING_FOR_VALIDATION`. An unverified governance state prevents `HEALTHY` and leaves the report in `SOURCE_GREEN_OPERATIONAL_GATES_OPEN` when source and operational checks otherwise pass.
- Regression tests cover missing operational evidence, cancelled staging, a stale ZIP artifact and unverified governance. This is a monitoring/reporting correction only; it does not rerun staging, deploy artifacts, or authorize release.
- Validation RCA: CI / Quality run [#40158708240](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40158708240) failed at `Run quality gate` / `prettier --check .` because this handoff update ended with an extra blank line. This was a deterministic formatting failure; the regression suite did not run. The trailing blank line is removed in this follow-up commit, and all required checks must pass on the new exact head.
- The existing staging preflight failure [#39596101014](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39596101014) remains unresolved. No retry was attempted with unchanged configuration.

## Latest base-commit Full Flight false negative — 25 October 2026

- **Integration checkpoint:** `client-main` remains at `176da7c559d279149e2473a65a71fd03d3e53018`. PR #210's workflow correction is not integrated yet.
- **Observed run:** [Full Flight Test #40162268665](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40162268665), created 25 October 2026 at 04:32:40 UTC. GitHub identifies this as a `push` event for branch `client/support-rate-limit-atomic-20261025`; the log confirms `branch=client/support-rate-limit-atomic-20261025`, `event=push`, while the commit SHA was the base `176da7c559d279149e2473a65a71fd03d3e53018`. This is a feature-branch creation push at the base SHA, not evidence that the `client-main` push itself failed.
- **Failed job/step:** job `flight` (job ID `121076114308`), step **Verify CI and Browser E2E on the same commit**. The log selected CI run #2205 as `success`, but Browser E2E run #1984 as `cancelled`, then failed the gate. [Flight job log](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40162268665/job/121076114308).
- **Cancellation evidence:** [Browser E2E run #40162268669](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40162268669), job ID `121076114302`, had Playwright installation complete; the **Run browser E2E** step was cancelled and the visual-matrix artifact uploaded. The test suite did not finish, so this run is neither a test pass nor an assertion failure.
- **Root cause:** the integration workflow still permits `push` events on `client/**` and runs the chained gate for any non-manual event. A feature-branch creation push at the base SHA was superseded by later PR commits; the Full Flight gate consumed the cancelled Browser E2E result. This is a concurrency/event-selection defect, not a timeout or demonstrated application regression.
- **Correction already proposed in this PR:** `.github/workflows/flight-test.yml` runs the chained gate only for PR events targeting `client-main` and pushes to `client-main`. This preserves exact-head validation and does not convert cancellation to success; it removes the redundant feature-branch push gate. PR #210's own current-head checks were green before this documentation update; this new commit requires fresh exact-head checks.
- **Recovery:** no manual retry. Retrying the cancelled feature-branch run would not correct the event-selection defect. Do not treat the cancelled run as passing evidence.
