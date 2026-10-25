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

## Current batch — P0 B6

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
