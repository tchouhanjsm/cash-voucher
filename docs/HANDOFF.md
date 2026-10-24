# Engineering Handoff — Cash Voucher

**Updated:** 23 October 2026  
**Repository:** tchouhanjsm/cash-voucher  
**Integration branch:** `client-main`  
**Verified integration baseline:** `aa37d94819e59a72c797ba36839aa8f8ec94008f` (PR #204 merged).  
**Legacy branch:** `main` (read-only and divergent; do not merge/rebase blindly).  
**Current phase:** P0 release hardening B1–B3. PR #205 is an open, source-only batch and has not been merged. Exact-head CI, Browser E2E and Full Flight Test must pass before review/merge. No live staging run, migration, deployment, restore drill or customer pilot is claimed.

## Verified source state

- PR #204 is the verified source integration baseline at `aa37d94819e59a72c797ba36839aa8f8ec94008f`.
- PR #205 groups P0 B1–B3 work: static security-header/CSP validation, staging/schema/backup/restore gates, dashboard deployment-contract diagnostics, and filtering of malformed legacy payee suggestions without rewriting history. It is still open and unmerged.
- The payment-entry payee is stored on a voucher. The separate vendor master is maintained through the explicit vendor-save flow; a historical payee appearing as a recent suggestion is not proof that a vendor-master record was created.
- The current screenshot reports `Unknown action` for `dashboardSummary`. That action exists in the reviewed backend route registry, so verify the staging client API URL, Apps Script project and deployed backend version. Do not guess the deployment or push until the staging target is independently confirmed and owner-approved.
- Source CI and mock-backed browser tests do not prove a live Apps Script deployment, real Google Sheet/Drive permissions, restoreability, hosted response headers or customer acceptance.
- Source CI and mock-backed browser tests do not prove a live Apps Script deployment, real Google Sheet/Drive permissions, restoreability, hosted response headers or customer acceptance.
- GitHub API currently reports `client-main` as unprotected with required checks disabled. Owner/admin must verify and enforce the intended ruleset/branch protection and default-branch settings. The source workflow cannot substitute for that repository configuration.
- The private repository's static-host integration must be confirmed to retain access before any frontend publication or DNS change.

## Immediate actions

1. Review PR #205 only after exact-head CI/Quality, Browser E2E and Full Flight Test are green. Its current source-only checks must not be represented as live staging proof. Do not merge while a required check is failed, pending or tied to a superseded SHA.
2. Diagnose the screenshot's dashboard `Unknown action` by verifying the client `CV_API_URL`, deployment ID and Apps Script project/version. Update only the already verified staging deployment after explicit owner approval; then confirm that `dashboardSummary` responds successfully before showing totals.
3. Have the owner/operator privately verify every staging Script, deployment, Sheet, receipt folder, backup folder, API URL, account and staging Environment secret. Previous deployment attempts failed closed at preflight; do not bypass checks or dispatch a write-capable run until configuration is independently reconciled.
4. Verify a pre-migration backup, inspect actual staging headers, and execute only the approved migrations on the confirmed staging target. Preserve historical `PaymentMethod` blanks; never infer historical values from `CashImpact`.
5. After backend staging verification, publish the frontend separately with the exact verified staging API URL and `CV_ENVIRONMENT=staging`, then run guarded manual UAT with `STAGING-ONLY` and explicit transactional write consent.
6. Verify live roles, receipt upload/read, payment flow and audit trace; complete a real backup and restore into a separate recovery Sheet/folder; finish device/offline/print/accessibility checks. Start the 14-day controlled hotel pilot only after all launch gates and written customer acceptance are evidenced.

## Release boundary and safeguards

- This source PR does not deploy the Apps Script backend, publish the static frontend, execute migrations, dispatch transactional UAT or mutate Google resources.
- Never run `setup()` against a populated or production target. Do not guess resource IDs, expose credentials, overwrite the only backup or deploy to production without separate owner approval.
- The staging workflow remains manual-only and restricted in source to `client-main`, with explicit write consent and target-isolation preflight. Keep Git merge, Clasp upload, Web App version update, static-host publication, live verification and customer acceptance as distinct release gates.

## Canonical decision documents

- `docs/CEO-BOARD-STRATEGY.md` — product thesis, commercial direction and deferred work.
- `docs/EXECUTION-PLAN-2026-10-21.md` — the ordered release gates, staging/UAT, backup/restore, pilot and priority queue.
- `docs/P0-RELEASE-BATCH-B1-B3.md` — this integrated B1–B3 plan and evidence gates.
- `docs/CLIENT-MAIN-ENGINEERING-STRATEGY-2026-10-21.md` — branch, quality, staging and merge controls.
- `docs/STAGING-RELEASE-AUDIT.md` — operational proof required before staging and customer launch.

Do not expand features ahead of staging isolation, live UAT and witnessed recovery. No production configuration or live Google resource is changed by this handoff.
