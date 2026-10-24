# Engineering Handoff — Cash Voucher

**Updated:** 25 October 2026  
**Repository:** tchouhanjsm/cash-voucher  
**Integration branch:** `client-main`  
**Verified integration baseline:** `176da7c559d279149e2473a65a71fd03d3e53018` (PR #208 merged).  
**Legacy branch:** `main` (read-only and divergent; do not merge/rebase blindly).  
**Current phase:** P0 operational release gates and delivery-monitor review. PR #208 remains the merged application baseline; PR #209 is checks-green but unmerged; PR #210 is the monitor tooling PR under review. Live staging remains unverified; owner retains merge/deploy authority.

## Verified source state

- PRs #205–#208 are merged to client-main. The latest source baseline is 176da7c559d279149e2473a65a71fd03d3e53018.
- Exact-head integration checks passed after PR #208: [CI / Quality](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40085100024), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40085100025), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40085100077).
- PR #209 remains open on `ac732798633f6df655400c5aaa3444cea97558f9`; [CI / Quality](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40126557717), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40126557746) and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40126557718) all passed on that exact head. Human review and merge remain outstanding.
- PR #210's last observed head `c09a28db43d70a201265a53d92345bedb1f02c98` had CI fail in the `Run quality gate` step at `test/test-current-readiness-docs.js:90`, because the monitor workflow document lacked the asserted baseline SHA. [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40127345166) passed; [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40127345178) failed at its prerequisite step verifying CI and Browser E2E on the same commit. These are historical results; the corrected branch head must receive fresh checks.
- PR #207 hardened voucher/receipt idempotency, ambiguous append recovery, post-append setting counters, payment rail consistency and malformed cash-close rows. Mock tests do not prove real Google Sheets/Drive transaction semantics.
- Source readiness is not live staging readiness. The deployed Apps Script URL/version, cPanel response headers, resource isolation, schema state, backup/restore and intended-device acceptance remain unverified.
- The owner-only `auditLog` endpoint exposes audit monitoring. The previous monitor relied only on Script Properties, so a primary marker write failure could hide an AuditLog append failure. The B6 branch adds a Settings-sheet durable fallback and a transient cache fallback, distinguishes unavailable monitoring, and keeps health data on empty cursor pages.
- The temporary `GHSA-mrhx-c7xc-m3w5` Zod exception from PR #206 remains a separate risk, due for reassessment by 9 November 2026. Do not force a major-version override of Clasp's declared Zod dependency.

## P0 B6 — merged fallback and open fail-closed follow-up

1. Preserve one audit-health response contract for populated, empty and terminal cursor pages.
2. On an audit append failure, persist the marker in Script Properties and in the Settings-sheet fallback. If both durable stores fail, attempt a clearly labeled transient CacheService marker with a six-hour TTL.
3. Return `MONITORING_UNAVAILABLE` when marker sources cannot be read or a stored marker is malformed; never translate an unknown source state into `NO_KNOWN_FAILURE`.
4. Expose marker durability in the owner UI and health export so the owner can distinguish Properties, Settings fallback, temporary cache and unavailable monitoring.
5. Fault-injection coverage checks primary-store fallback, transient-cache fallback, corrupt markers and the case where every marker write fails.

This improves common failure cases; it does not reconstruct missing AuditLog events. If AuditLog, Script Properties, Settings and CacheService all fail to persist the marker, the application emits an explicit diagnostic but cannot guarantee a durable alert. That residual risk remains visible in tests and documentation.

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

## Autonomous delivery workflow — current implementation

- The ChatGPT delivery monitor is configured hourly. The requested 45-minute cadence is unsupported; do not represent it as a 45-minute job.
- The repository monitor is event/manual triggered (push to client-main, PR targeting client-main with read-only observation, and manual dispatch). It deliberately has no cron trigger because GitHub scheduled workflows execute from the repository default branch, which remains main and is designated frozen/read-only.
- The monitor records exact SHA, phase, required CI/E2E/Flight status, PR review/check status, operational staging/ZIP state, release gates, timeout recovery attempts and bounded run history in a dedicated GitHub checkpoint issue and workflow artifact.
- It may retry only timed-out source-validation workflows with exact-head validation and a three-attempt ceiling. It does not retry ordinary test failures, cancellations, staging UAT or ZIP publication. PR-event jobs are read-only.
- No automated PR merge, Clasp push, Apps Script deployment, Google resource mutation, migration, live UAT write, cPanel upload or production change is permitted. The repository owner remains responsible for approval, merge and release authorization.
- GitHub branch protection/rulesets and the mismatch between default branch main and integration branch client-main remain owner/admin settings to verify. The monitor does not assume source workflows enforce branch protection.

## Deep-dive defects reserved for a separate targeted fix

1. backend/90-support.gs — supportRateAllowed_ uses CacheService get-then-put as a counter. Concurrent requests can observe the same count and exceed intended 5-per-user/hour or 20-per-workspace/6-hour thresholds. Use a lock/atomic strategy or a storage primitive with suitable consistency; add concurrency/failure-path regression tests.
2. Audit health — PR #209 hardens readAuditPropertiesMarker_ and mixed-store aggregation so malformed persisted state reports MONITORING_UNAVAILABLE. Its exact-head checks passed, but it is still unmerged; the issue remains present in the current `client-main` baseline until owner review and merge.
3. Operational launch gates remain P0: confirm staging Script/deployment/Sheet/folders, backend/frontend staging release, guarded UAT, actual response headers, schema migration only after review, restore into a separate recovery target, and real-device/offline/print/accessibility acceptance.
