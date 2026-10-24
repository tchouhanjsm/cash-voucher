# Engineering Handoff — Cash Voucher

**Updated:** 24 October 2026  
**Repository:** tchouhanjsm/cash-voucher  
**Integration branch:** `client-main`  
**Verified integration baseline:** `176da7c559d279149e2473a65a71fd03d3e53018` (PR #208 merged).  
**Legacy branch:** `main` (read-only and divergent; do not merge/rebase blindly).  
**Current phase:** deep code review and delivery guard hardening on `fix/deep-code-review-guards-20261024`. This is a source-only follow-up; owner retains merge/deploy authority. Live staging remains unverified.

## Verified source state

- PRs #205–#208 are merged to `client-main`. The latest inspected baseline is `176da7c559d279149e2473a65a71fd03d3e53018`.
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

## Deep-review findings and fixes in this follow-up

- Staging UAT entry points require both `CV_STAGING_DEPLOY_CONFIRMATION=STAGING-ONLY` and explicit write consent; GitHub workflow and direct shell/Python invocation enforce the same contract.
- Support-report quota reservations are serialized under the shared ScriptLock. If counters cannot be read or updated, reporting fails closed. The lock is released before MailApp is called.
- Dependency exceptions are constrained to the exact checked-in Clasp/Zod and Clasp/micromatch/braces toolchain; a direct Zod dependency, changed install path or changed pinned versions no longer inherit a stale exception.
- Voucher create/edit amount validation rejects non-scalar JSON values and non-decimal coercions. Offline entries rejected because a business date is already closed are sent to review rather than retried automatically.
- Separate unresolved risk: `migratePinAuthToPasswordSchema()` sets an auth-migration marker, but the reviewed login path does not demonstrate legacy `PinHash`/`MustChangePin` field mapping. Do not run this migration or change the deployed auth version until the legacy-header, interrupted-migration and rollback sequence has an explicit tested runbook and the owner confirms a backup/recovery path.
- New tests are source/mock-backed. They do not substitute for live staging UAT or Google Workspace quota, locking and migration-recovery verification.

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
