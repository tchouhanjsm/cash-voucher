# Engineering Handoff — Cash Voucher

**Updated:** 25 October 2026  
**Repository:** tchouhanjsm/cash-voucher  
**Integration branch:** `client-main`  
**Verified integration baseline:** `176da7c559d279149e2473a65a71fd03d3e53018` (PR #208 merged).  
**Legacy branch:** `main` (read-only and divergent; do not merge/rebase blindly).  
**Current phase:** P0 release readiness — support-report rate-limit atomicity and delivery-monitor follow-ups. Feature branch: `client/support-rate-limit-atomic-20261025`. PRs #209–#211 remain open; live staging remains unverified; owner retains merge/deploy authority.

## Verified source state

- PRs #205–#208 are merged to `client-main`. The latest source baseline is `176da7c559d279149e2473a65a71fd03d3e53018` (PR #208). PRs #209–#211 are open and are not yet integrated.
- Exact-head integration checks passed after PR #207: [CI / Quality](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40064247679), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40064247678), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40064247717).
- PR #207 hardened voucher/receipt idempotency, ambiguous append recovery, post-append setting counters, payment rail consistency and malformed cash-close rows. Mock tests do not prove real Google Sheets/Drive transaction semantics.
- Source readiness is not live staging readiness. The deployed Apps Script URL/version, cPanel response headers, resource isolation, schema state, backup/restore and intended-device acceptance remain unverified.
- The owner-only `auditLog` endpoint exposes audit monitoring. The previous monitor relied only on Script Properties, so a primary marker write failure could hide an AuditLog append failure. The B6 branch adds a Settings-sheet durable fallback and a transient cache fallback, distinguishes unavailable monitoring, and keeps health data on empty cursor pages.
- The temporary `GHSA-mrhx-c7xc-m3w5` Zod exception from PR #206 remains a separate risk, due for reassessment by 9 November 2026. Do not force a major-version override of Clasp's declared Zod dependency.

## Current batch — P0 B6

1. Preserve one audit-health response contract for populated, empty and terminal cursor pages.
2. On an audit append failure, persist the marker in Script Properties and in the Settings-sheet fallback. If both durable stores fail, attempt a clearly labeled transient CacheService marker with a six-hour TTL.
3. Return `MONITORING_UNAVAILABLE` when marker sources cannot be read or a stored marker is malformed; never translate an unknown source state into `NO_KNOWN_FAILURE`.
4. Expose marker durability in the owner UI and health export so the owner can distinguish Properties, Settings fallback, temporary cache and unavailable monitoring.
5. Fault-injection coverage checks primary-store fallback, transient-cache fallback, corrupt markers and the case where every marker write fails.

This improves common failure cases; it does not reconstruct missing AuditLog events. If AuditLog, Script Properties, Settings and CacheService all fail to persist the marker, the application emits an explicit diagnostic but cannot guarantee a durable alert. That residual risk remains visible in tests and documentation.

## Support-report rate-limit concurrency hardening — 25 October 2026

- **Finding:** `supportRateAllowed_` previously performed CacheService read/check/write operations without serialization. Concurrent requests could observe the same counter and exceed the per-user hourly or workspace six-hour limit.
- **Correction:** one short ScriptLock now protects both quota reads and both increments as a single decision. Counter values are validated; exhausted quotas return `RATE_LIMIT`. Lock/cache errors fail closed with a temporary `BUSY` response. A lock is released only after successful acquisition.
- **Regression coverage:** `test/test-support-report.js` simulates a counter changing immediately before the locked read for both user and workspace quotas, verifies lock contention sends no email and releases no unacquired lock, and checks that a successful request increments both counters once.
- **Boundary:** these are mock/source-level checks, not proof of live Apps Script concurrency or email delivery. CacheService remains best-effort storage; the lock serializes concurrent executions within this script project but does not make cache data durable. If support reporting returns `BUSY`, the reporter should retry later or use the workspace's established support contact.
- **Release status:** this source fix is proposed on `client/support-rate-limit-atomic-20261025`; exact-head CI, Browser E2E and Full Flight Test must pass before merge. No live staging or production operation is authorized.

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
- Required CI/Quality, Browser E2E and Full Flight Test must pass on the exact final PR head. Fix failures; do not bypass checks.
- Keep Git merge, Clasp upload, Web App version update, ZIP publication, live UAT, migrations and production release as separate gates.
- If target identity, schema, backup, security headers, audit monitoring or restore fails, stop and preserve evidence. No production operation is authorized by this handoff.
