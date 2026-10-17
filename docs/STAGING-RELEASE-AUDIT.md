# Staging Release Audit and Pending Queue

**Audit date:** 17 October 2026  
**Verified main baseline:** `4a759b7513a925aee796949d8f6e79085f096314`  
**Scope:** review the current product documentation, source workflow, release controls and first-customer delivery requirements. This audit is evidence of a repository review—not a live staging deployment or production acceptance.

## Executive status

**Source baseline:** the code and delivery-packaging changes are merged. PR #165 (Phases 37–39) merged at `4b729f33d9caff13e01ed56acbc231375c5beec0`. PR #166 (customer-specific static build, security headers and onboarding/runbook material) merged at `4a759b7513a925aee796949d8f6e79085f096314`.

- [PR #165](https://github.com/tchouhanjsm/cash-voucher/pull/165): CI/quality, Browser E2E and Full Flight Test passed on exact head `26a92a70513a088cddc994d1a398d63d908ec8e0`.
- [PR #166](https://github.com/tchouhanjsm/cash-voucher/pull/166): CI/quality, Browser E2E (947 checks) and Full Flight Test (285 backend + 947 browser checks) passed on exact head `13f12d314687ec88d9044ccae7e8fb3c202743fb`.
- [Post-merge main CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39003040102) passed on the verified main baseline.
- The static customer builder creates `dist/`, validates `CV_API_URL`, excludes developer/backend files and emits a Cloudflare Pages `_headers` file. This produces a publishable artifact; it does not create a host, a Google deployment, a customer instance or a live URL.
- The repository is **public**. Proprietary customer handover requires an owner-controlled repository-privacy/hosting cutover. Copies already cloned from a public repository cannot be recalled by later changing visibility.
- No staging Apps Script project, customer Sheet, Drive receipt/backup folders, GitHub `staging` Environment, Cloudflare Pages project or customer URL is evidenced as provisioned. No live backup/restore drill or customer acceptance is recorded.
- Product model remains a **single-property instance**. Each staging/customer instance needs a distinct Apps Script project, Sheet and Drive folders, plus a distinct static origin; a different path/query string on a shared origin does not isolate IndexedDB/localStorage.

## Priority 0 — required before the first customer can be called staging-verified

### A. Provision and run the dedicated staging/UAT environment

Owner actions are documented in [the Apps Script Release Runbook](APPS-SCRIPT-RELEASE-RUNBOOK.md) and implemented by `.github/workflows/staging-uat.yml`.

1. Create a staging-only Apps Script project bound to a new staging Sheet, with separate receipt and backup folders. Confirm none of these IDs/URLs match production.
2. Initialize that verified empty staging project once from its Apps Script editor: set staging Owner properties, run `setup()`, approve scopes and create a dedicated staging Manager. Complete first-login password changes. Never run `setup()` against a populated or production property.
3. Create the first versioned staging Web App deployment manually and independently verify its deployment ID and `/exec` URL. The automated workflow intentionally updates an existing deployment; it must not invent one.
4. Create a GitHub Environment named `staging`, restrict deployments to `main`, and require reviewer approval where supported.
5. Configure environment variables: `CV_STAGING_SCRIPT_ID`, `CV_STAGING_DEPLOYMENT_ID`, `CV_STAGING_API_URL`, `CV_STAGING_SPREADSHEET_ID`, `CV_STAGING_RECEIPT_FOLDER_ID`, `CV_STAGING_BACKUP_FOLDER_ID`, `CV_PRODUCTION_SCRIPT_ID`, `CV_PRODUCTION_SPREADSHEET_ID`, `CV_PRODUCTION_RECEIPT_FOLDER_ID`, and `CV_PRODUCTION_BACKUP_FOLDER_ID`. The production deployment ID is extracted by the workflow from the reviewed root `config.js` URL; independently verify it before use.
6. Configure secret values: `CLASPRC_JSON`, `CV_STAGING_UAT_OWNER_EMAIL`, `CV_STAGING_UAT_OWNER_PASSWORD`, `CV_STAGING_UAT_MANAGER_EMAIL`, and `CV_STAGING_UAT_MANAGER_PASSWORD`. Do not place actual values in Git, PR text, chat or this audit.
7. From `main`, manually dispatch Staging UAT. Start with `validate-only`; after target identity, environment protection and credentials have been reviewed, run `deploy-and-uat` with the exact `STAGING-ONLY` confirmation and explicit staging-write consent. Review the exact workflow result and sanitized logs. The UAT creates and cancels one synthetic INR 10,000 test payment; its cancelled record and audit trail intentionally remain in staging.
8. Save the workflow run and target-identity evidence to the private register. A green workflow is not backup/restore proof and is not customer acceptance.

**Exit evidence:** dedicated resource identity record, protected Environment, successful exact-run UAT, confirmed target deployment, and no staging-to-production ID overlap.

### B. Create and verify the real first-customer instance

1. Confirm repository privacy and static-host integration first. The repository is currently public; do not switch visibility until the active/static host has authenticated private-repository read access and service continuity is understood.
2. Create a new customer's Google Sheet, bound Apps Script project, private receipt folder, private backup root and versioned Web App deployment. Do not reuse the staging project, the current root `config.js` endpoint, or another customer's resources.
3. Give the customer its own Cloudflare Pages project and unique `*.pages.dev` origin. Configure `CV_API_URL` as that customer's verified Web App URL; publish only `dist/`. Never share a hosting/GitHub/Google admin account with the customer.
4. Verify the deployed frontend points to the intended customer's deployment and serves the generated response headers (including CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`). A generated `_headers` file alone is not proof of the headers returned by the live host.
5. Test owner first-login/password change; Manager/Staff permissions; allowed and denied API operations; voucher creation/cancellation; receipt upload/read access; reports; approval controls; and real deployed API behavior.
6. Run `backupData_()` on the new instance, verify the actual Drive snapshot, copied Sheet, receipt files and receipt manifest, then restore to a separate recovery Sheet/folder. Reconcile headers, row counts, voucher numbering, user/settings state and receipt mapping. Keep unsynchronized device-local entries out of claims about server backup.
7. Test every intended operating device: install/update, narrow and desktop layouts, online save confirmation, receipt capture, offline queue display, reconnection, idempotent sync, queue export/recovery and absence of lost/duplicated entries. Check keyboard navigation, visible focus, zoom/reflow and assistive technology with human review.
8. Complete the private instance register, populate the customer quick-start template, verify first payment/contract status as appropriate, then record acceptance. Do not hand over a link as production-ready before these gates are complete.

**Exit evidence:** working HTTPS customer URL, private and correctly isolated resources, live role/receipt tests, one verified backup and successful isolated restore, device/offline evidence, and acceptance record.

## Priority 1 — required for dependable live operation

- **Fourteen-day controlled pilot:** not started. Begin only after the live target, backup/restore and device gates pass. Record daily voucher reconciliation, every-device offline queue status, book balance versus physical count, incidents, fallback and owner/manager sign-off. Stop on missing/duplicate vouchers, unresolved unclassified items, missing receipts, unexplained variance, backup failure or unrecoverable offline entries.
- **Physical-device/accessibility review:** PWA install/update and recovery, actual phone/tablet layout, 200–400% zoom/reflow, keyboard focus/order, status announcements, screen reader and print/export acceptance. Automated responsive screenshots and accessible-name heuristics are not human conformance sign-off.
- **Real-service capacity:** measure Apps Script/Sheets latency, quotas, bootstrap/report costs and voucher-numbering lock contention in an explicitly authorized staging/recovery environment before publishing production SLOs.
- **Remaining rendering review:** active inventory is 17 `innerHTML` assignment sites across eight frontend modules. Count/fingerprint tests are drift guards, not proof every interpolation is contextually safe. Continue the sink-by-sink review and hostile-data regressions; do not claim full XSS certification.

## Priority 2 — unresolved decisions or later product work

- **Audit durability:** simultaneous AuditLog append failure and Script Properties marker-write failure has no durable fallback. Phase 17 made the monitoring limitation explicit; it did not recover missing events. Decide the fallback's durability, access, retention and failure semantics before implementing it. Never fabricate historical audit events.
- **Dependency exception:** `braces@3.0.3` remains the time-bounded `@google/clasp → micromatch → braces` development-toolchain exception. Review upstream compatibility by **9 November 2026**; CI is expected to reject it from 10 November unless an explicitly renewed decision and tests are present. Do not blindly downgrade Clasp.
- **Accounting export:** PR #114 is merged and source now includes a least-privilege report-only accountant role, generic recorded-movement CSV, and VendorID support. Destination-specific Tally/Zoho/etc. compatibility, tax calculations and ledger claims remain blocked until the receiving accountant selects software/version/import route and approves an anonymized fixture/mapping; a qualified Indian CA must confirm tax treatment.
- **Daily Cash Close denomination rows:** implementation supports the approved one-drawer/day close, but denomination rows remain optional. Do not change the schema or make counts mandatory until the owner decides they provide operational value.
- **Product success metrics/scale strategy:** collect pilot evidence before setting numeric latency/usability targets or expanding to a chain/multi-tenant platform. The current product is single-property, not multi-tenant.

## Documentation inconsistencies corrected by this review

- PR #165 was merged, but the backlog and roadmap still called Phases 37–39 a candidate/in-review.
- PR #166 was merged, but the canonical handoff still described it as open and the release-readiness text said customer static-build packaging was still being added.
- PR #114 was merged, but the accountant requirements still said its report/accountant role was an active unmerged PR.
- The Apps Script runbook and active DOM-sink inventory cited older main baselines.
- The first sections of the Daily Cash Close design retain historical proposal language which is superseded by the owner-approved policy recorded later in the same document. The current policy and remaining operational gates must be presented explicitly.
- Some historical roadmap sections contain “current phase” wording from earlier dates. Keep those as history, but do not use them as the current execution queue.

## Release decision

**Source packaging: ready to review/use as a staging input. Live staging: not verified. First-customer handover: blocked until the Priority 0 gates pass.**

The only supported next action is to provision the separate staging resources and protected GitHub Environment, run the owner-authorized manual staging workflow, and review the result. Do not replace that action with another code-only PR or a production deployment.

## Authentication update required before staging deployment

The password-authentication release replaces the PIN sign-in UI with password entry (8–128 characters for new and changed passwords), updates temporary-password administration, and records failed login attempts for unknown emails and rate-limited lockouts in AuditLog. Update protected GitHub staging secrets to `CV_STAGING_UAT_OWNER_PASSWORD` and `CV_STAGING_UAT_MANAGER_PASSWORD` after each UAT account has completed its forced password change. Do not reuse the old PIN secret names. Production remains untouched; a populated legacy production Sheet requires the verified-backup procedure for `migratePinAuthToPasswordSchema()` before its Web App is updated.
