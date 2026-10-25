# Engineering Handoff — Cash Voucher

**Updated:** 25 October 2026  
**Repository:** tchouhanjsm/cash-voucher  
**Integration branch:** `client-main`  
**Verified integration baseline:** `3ad2c8f955b36de00b208ee4283682a1a34805eb` (PR #211 merged; exact-head source checks passed).  
**Legacy branch:** `main` (read-only and divergent; do not merge/rebase blindly).  
**Current phase:** P0 release readiness and branch reconciliation. PR #211 merged support-report rate-limit atomicity; PR #209 remains open for mixed audit-marker integrity, and PR #210 remains open for the delivery monitor. Live staging remains unverified; owner retains merge/deploy authority.

## Verified source state

- PRs #205–#208 and #211 are merged to `client-main`. The current source baseline is `3ad2c8f955b36de00b208ee4283682a1a34805eb`; PRs #209 and #210 remain open and need base reconciliation before merge.
- Exact-head checks passed on current integration SHA `3ad2c8f955b36de00b208ee4283682a1a34805eb`: [CI / Quality](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40166966112), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40166966123), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40166966102). Historical PR #208 checks remain recorded in the audit trail.
- PR #207 hardened voucher/receipt idempotency, ambiguous append recovery, post-append setting counters, payment rail consistency and malformed cash-close rows. Mock tests do not prove real Google Sheets/Drive transaction semantics.
- PR #211 merged at `3ad2c8f955b36de00b208ee4283682a1a34805eb`; its PR-head CI [#40162435222](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40162435222), Browser E2E [#40162435213](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40162435213), and Full Flight Test [#40162435233](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40162435233) passed on `f018a958fa86c7ffe4ef8baa799ddd62c1bfb0d2`; the merge SHA then passed the current integration checks listed above.
- PR #209's prior head `ac732798633f6df655400c5aaa3444cea97558f9` passed its three required checks, but this baseline-reconciliation commit creates a new head and requires fresh exact-head validation. PR #210's prior head `0f57d199d2b9eccc009b0c5c21f796f60c9fe662` also passed its checks, but its branch is diverged/dirty against the new base and must be reconciled before merge.
- Source readiness is not live staging readiness. The deployed Apps Script URL/version, cPanel response headers, resource isolation, schema state, backup/restore and intended-device acceptance remain unverified.
- The owner-only `auditLog` endpoint exposes audit monitoring. PR #208 added a Settings-sheet durable fallback, a six-hour transient cache fallback, marker durability metadata, and health data on empty cursor pages. The current follow-up makes any unreadable or malformed marker source report `MONITORING_UNAVAILABLE` even when another store retains a valid marker, while preserving known failure details in the owner UI and export.
- The temporary `GHSA-mrhx-c7xc-m3w5` Zod exception from PR #206 remains a separate risk, due for reassessment by 9 November 2026. Do not force a major-version override of Clasp's declared Zod dependency.

## P0 B6 — merged source behavior and follow-up

PR #208 implements the audit-health response contract for populated, empty and terminal cursor pages. On an audit append failure, the backend attempts Script Properties and a Settings-sheet durable fallback; if both fail, it attempts a CacheService marker with a six-hour TTL. The owner API and export expose marker durability and distinguish a transient cache-only signal from durable markers.

The current review branch closes a mixed-state defect found during the deep dive: a valid marker in one store must not hide another store that is unreadable or malformed. The response must remain `MONITORING_UNAVAILABLE`, while retaining any known failure count, timestamp, kind and marker source in the owner UI/export. Regression coverage includes valid Properties + corrupt Settings, valid Settings + corrupt Properties, and the case where every marker write fails.

This does not reconstruct missing AuditLog events. If AuditLog, Script Properties, Settings and CacheService all fail to persist the marker, the application emits an explicit diagnostic but cannot guarantee a durable alert. That residual risk remains visible in tests and documentation.

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
