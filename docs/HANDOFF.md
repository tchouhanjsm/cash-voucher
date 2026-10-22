# Engineering Handoff — Cash Voucher

**Updated:** 22 October 2026  
**Repository:** tchouhanjsm/cash-voucher  
**Integration branch:** `client-main`  
**Verified integration baseline:** `bbc7f4d1266c580a951fad950e09c5c41027b666` (PR #202 merged).  
**Legacy branch:** `main` (read-only and divergent; do not merge/rebase blindly).  
**Current phase:** six-step staging release pipeline. PR #203 is an open, source-only staging evidence improvement; it has not been merged. No live staging run, migration, deployment, restore drill or customer pilot is claimed.

## Verified source state

- PR #202 adds server-side validation for user-controlled display names and vendor/company names while preserving safe international phone-number handling. It is merged into `client-main`.
- PR #203 adds a sanitized release-evidence artifact to both manual staging deployment-and-UAT and UAT-only workflows. It records the exact source commit/workflow run, step outcomes, UAT check count, transcript digest and payment-cancellation status without including raw transcript text, credentials, API endpoint URLs or staging resource IDs. Its exact-head checks must be green before merge.
- Source CI and mock-backed browser tests do not prove a live Apps Script deployment, real Google Sheet/Drive permissions, restoreability, hosted response headers or customer acceptance.
- GitHub API currently reports `client-main` as unprotected with required checks disabled. Owner/admin must verify and enforce the intended ruleset/branch protection and default-branch settings. The source workflow cannot substitute for that repository configuration.
- The private repository's static-host integration must be confirmed to retain access before any frontend publication or DNS change.

## Immediate actions

1. Review PR #203 after exact-head CI/Quality, Browser E2E and Full Flight Test pass. Do not merge it while any required check is failing, pending or tied to a superseded head.
2. After merge, have the owner/operator privately verify every staging Script, deployment, Sheet, receipt folder, backup folder, API URL, account and staging Environment secret. Previous deployment attempts failed closed at preflight; do not bypass the checks or dispatch a write-capable run until the configuration is independently reconciled.
3. Verify a pre-migration backup, inspect actual staging headers, and execute only the approved migrations on the confirmed staging target. Preserve historical `PaymentMethod` blanks; never infer historical values from `CashImpact`.
4. Deploy the reviewed backend to the verified existing staging deployment, publish the frontend separately with the exact verified staging API URL and `CV_ENVIRONMENT=staging`, then run the guarded manual UAT with `STAGING-ONLY` and explicit transactional write consent.
5. Verify live roles, receipt upload/read, payment flow and audit trace; complete a real backup and restore into a separate recovery Sheet/folder; finish device/offline/print/accessibility checks. Start the 14-day controlled hotel pilot only after all launch gates and written customer acceptance are evidenced.

## Release boundary and safeguards

- This source PR does not deploy the Apps Script backend, publish the static frontend, execute migrations, dispatch transactional UAT or mutate Google resources.
- Never run `setup()` against a populated or production target. Do not guess resource IDs, expose credentials, overwrite the only backup or deploy to production without separate owner approval.
- The staging workflow remains manual-only and restricted in source to `client-main`, with explicit write consent and target-isolation preflight. Keep Git merge, Clasp upload, Web App version update, static-host publication, live verification and customer acceptance as distinct release gates.

## Canonical decision documents

- `docs/CEO-BOARD-STRATEGY.md` — product thesis, commercial direction and deferred work.
- `docs/EXECUTION-PLAN-2026-10-21.md` — the ordered release gates, staging/UAT, backup/restore, pilot and priority queue.
- `docs/CLIENT-MAIN-ENGINEERING-STRATEGY-2026-10-21.md` — branch, quality, staging and merge controls.
- `docs/STAGING-RELEASE-AUDIT.md` — operational proof required before staging and customer launch.

Do not expand features ahead of staging isolation, live UAT and witnessed recovery. No production configuration or live Google resource is changed by this handoff.
