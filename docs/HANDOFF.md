# Engineering Handoff — Cash Voucher

**Updated:** 24 October 2026  
**Repository:** tchouhanjsm/cash-voucher  
**Integration branch:** `client-main`  
**Verified integration baseline:** `27208e0565678b46c7b48f75ab3bc0f55989f54e` (PR #205 merged).  
**Legacy branch:** `main` (read-only and divergent; do not merge/rebase blindly).  
**Current phase:** P0 B4 — live dashboard/register read-model contract coverage in guarded staging UAT. Feature branch: `client/p0-live-read-model-uat-20261024`. Review and merge are owner-controlled.

## Verified source state

- PR #205 is merged to `client-main` at `27208e0565678b46c7b48f75ab3bc0f55989f54e`. It added static Pages/Apache security policy validation, actionable dashboard handling for an unsupported `dashboardSummary` action, and presentation-only filtering of malformed legacy payee suggestions.
- Source readiness is not live staging readiness. The deployed Apps Script URL/project/version, cPanel response headers, Google resource isolation, schema state, backup/restore, and real-device acceptance still require operational evidence.
- PR #204's server-backed dashboard/register read models are a key deployment contract. A stale target returning `Unknown action` for `dashboardSummary` must be detected before any synthetic financial write.
- Payment-entry payees remain separate from vendor-master maintenance. Historical voucher rows must not be rewritten to clean suggestions.
- Keep `.clasp.json`, `.clasprc.json`, OAuth data, passwords and customer resource IDs out of Git and logs.

## Current batch — P0 B4

The guarded staging UAT now validates the two server-backed read models before creating its tagged ₹10,000 synthetic payment. It checks:

1. `dashboardSummary` date window, finite numeric summary fields, trend series and grouping arrays.
2. `registerPage` page-size bounds, pagination metadata, aggregate totals and filter facets.
3. A stale deployment returning `Unknown action` for `dashboardSummary` fails before creating the synthetic voucher.
4. Sanitized evidence records both read-model statuses without exposing endpoints, resource IDs, credentials or raw transcript text.

No production operation or deployment is part of this source batch. The write-capable workflow remains manual-only and requires exact `STAGING-ONLY` confirmation, explicit staging-write consent and resource-isolation preflight.

## Dependency advisory gate

- `body-parser` is pinned to patched `2.4.0` through a package override and lockfile update; regression tests verify the manifest, resolved tarball integrity, supporting `content-type` and `qs` versions.
- The current upstream `@google/clasp` 3.4.1 toolchain declares `zod ^3.25.76`, while the published advisory fix begins in Zod 4.6.6. The audit policy has a precise, time-boxed exception for only `GHSA-mrhx-c7xc-m3w5`, scoped to the local/CI developer-tool chain and due for review on **9 November 2026**. This is not a claim that Zod 3 is patched. Do not force a major override of Clasp's declared dependency; verify upstream compatibility or remove the exception before its review date.
- Unrelated high/critical advisories and any second advisory on Zod remain blocking; tests assert the exception is not blanket allowlisting.

## Release gates that remain open

1. Verify the dedicated staging Script, Sheet, receipt/backup folders, existing Web App deployment ID and `/exec` URL against production references privately.
2. Inspect a staging backup and actual headers before running only schema migrations required by the live data. Preserve historic payment-method blanks; do not use `setup()` as an upgrade.
3. Push the reviewed backend and update only the verified staging deployment with owner authorization; publish the independently built staging ZIP to the verified cPanel document root.
4. Review exact staging UAT evidence. Verify actual hosted security headers, live Owner/Manager/Staff authorization, receipt actions, payment/approval/cash-close behavior and both read-model contracts.
5. Inspect a real backup and restore into a separate recovery Sheet/folder; reconcile counts, voucher numbering, settings/users and receipt references.
6. Complete installation/update, offline queue/reconnect/recovery, print/PDF/A5, keyboard, zoom/reflow and assistive-technology checks on intended devices.
7. Start the controlled 14-day pilot only after the prior gates pass and owner/manager acceptance is recorded.

## Engineering constraints

- All product PRs target `client-main` through short-lived `client/*` branches; do not push directly to `client-main`.
- `main` remains frozen/read-only; do not merge, rebase or force-update long-lived branches blindly.
- Fix failing checks; exact-head CI/Quality, Browser E2E and Full Flight Test must all pass before review/merge.
- Keep Git merge, Clasp upload, Web App version update, static ZIP publication, live UAT, migrations and production release as distinct operations.
- If target identity, schema, backup, security headers or recovery fails, stop and preserve evidence rather than bypassing guardrails.
