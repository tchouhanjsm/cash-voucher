# Apps Script Release Readiness and Controlled Deployment

**Purpose:** release the reviewed backend source intentionally without confusing Git merge, source upload, Web App deployment, and production verification.

## Support-report release notes

PR #175 adds authenticated Account → Report a problem through Apps Script action `reportIssue`. Set `SUPPORT_EMAIL` in each client project's Script Properties to the operator-controlled inbox. The frontend cannot choose the recipient. The message includes a short reference, workspace/reporter/role, environment and Script context; the audit event records the subject rather than the message body. Rate limits use Script Cache (5 per user per hour, 20 per workspace per six hours) and are best-effort; they do not eliminate abuse or provider-quota risk. The form is source/test verified, but live MailApp delivery is not yet verified. Test one report in staging before production.

## Current release boundary

**Base main commit reviewed for this follow-up:** `8b14adc72c146589149a33d793ca9e55af5da13a` (merge of PR #180, master-template bundle). Workflow links elsewhere in this runbook are historical and apply only to the commits they name, not to this follow-up branch or a live deployment. Check the exact PR head's required workflows before merge.

The staging/UAT workflow and server-backed onboarding gates are source-complete. Dedicated staging Google resources, the first Web App deployment, protected GitHub `staging` Environment, secrets and a static staging hostname are not evidenced as provisioned. The repository is private; confirm the existing host integration can still read it before triggering a rebuild or changing DNS. A merge is distinct from Clasp upload, Web App deployment, static publication, live UAT and customer acceptance. Local checks and mock Browser E2E do not prove live Google Sheets/Drive behavior.

The root frontend `config.js` contains an unverified Apps Script URL. **Do not reuse or overwrite it for staging.** The GitHub repo is now private; verify hosting integration retains access before changing DNS or relying on automatic builds. Confirm a new staging Web App endpoint and independently match its deployment ID to the intended Script project before building the frontend. For the static staging build, set `CV_API_URL` to the exact staging `/exec` URL and set `CV_ENVIRONMENT=staging`; publish only generated `dist/`. Production requires a separate owner-approved build with the verified customer URL and `CV_ENVIRONMENT=production`.

**Current staging boundary (18 October 2026):** PR #155's manual workflow, PR #156's credential redaction and PR #173's server-backed environment gate are merged. The owner must provision isolated resources, build the frontend for the verified staging endpoint, then execute the protected workflow. The workflow deploys the Apps Script backend and runs UAT; it does **not** publish the frontend `dist/` to the staging subdomain. UAT creates and cancels one tagged INR 10,000 test payment in staging; its cancelled row and audit trace remain. The customer instance is separate and follows `docs/CUSTOMER-ONBOARDING-RUNBOOK.md`.

The root `.gitignore` excludes `.clasp.json` and `.clasprc.json` intentionally. Keep local Clasp configuration/authentication in protected secrets or local files; never commit them.

## Setup preflight and safe recovery

Run `setup()` only after the operator has privately verified that the Script project and `SS_ID` identify the intended empty staging Sheet and configured the staging-only owner properties. Before its first write, preflight checks the target and any existing application tab headers/data. A new instance must have no app tabs or initialization markers and valid initial Owner credentials. A completely initialized instance is detected as a read-only no-op; a partial/legacy schema is rejected before setup rewrites headers or formats sheets. The preflight also rejects data rows without a `UserID`, incomplete/invalid account rows, an application without an active Owner, invalid/missing initial-owner credentials, or an inaccessible target. Use a separately documented and backed-up migration for legacy schemas.

If setup fails after writes begin, do not press Run again automatically. Record the execution error, then inspect Script Properties, Sheet tabs/headers/data, Drive folders and Apps Script triggers. A preflight rejection should happen before initialization writes; later permission, quota or service errors may leave partial resources. Preserve them and choose a reviewed recovery path instead of deleting folders or repeatedly replacing triggers.

After success, verify all expected tabs and exact headers; one Owner record requiring a password change; `PEPPER`; receipt/backup folder IDs and access; and the daily `backupData_` trigger. Confirm the temporary `OWNER_PASSWORD` property was removed after initial owner creation. Setup success alone does not prove that a versioned Web App or frontend is live.

## Frontend CSP release gate

The active frontend shell contains a meta Content Security Policy. `npm run check` validates the production-source allowlist and rejects a missing/duplicate policy, broad script sources, inline executable shell code, or inline event-handler attributes. The mock E2E server adds `'unsafe-eval'` only to its served test copy so Playwright's string-based wait predicates work; the static source gate explicitly rejects that source in production HTML. Browser E2E exercises the remaining policy while testing the user workflows, but is not proof that a production host serves the same policy.

- Review the deployed HTML policy before trusting a frontend release. Same-origin assets and the Apps Script ContentService endpoints must remain the only API/script origins; receipt previews rely on `data:`/`blob:` image sources.
- The current dashboard requires inline style attributes for variable chart widths. Script execution remains restricted to same-origin external files; do not add `unsafe-eval`, `data:` script sources, third-party script origins, or inline event handlers.
- A CSP meta tag **cannot enforce `frame-ancestors`** and is not a substitute for a host response header. If the static host supports headers, set a CSP response header including `frame-ancestors 'none'` and verify it in browser DevTools/Network. Do not claim framing protection or a verified production CSP based solely on repository source/CI.
- After deployment, check the actual served page and console for CSP violations. Validate that the Apps Script request, service worker, and receipt preview still work. This source change does not alter hosting settings or deploy any file.

## Required distinction

1. **Git merge:** reviewed source is in `main`.
2. **Clasp upload:** `clasp push` uploads the local `backend/` project files to the selected Apps Script project.
3. **Web App release:** create a new version and update the intended existing deployment (or create a new deployment only if explicitly approved).
4. **Live verification:** exercise the actual Web App, roles, records, receipts and backup behavior. CI green is not live-service evidence.

## Gate A — local source and target verification

From the local repository root:

```bash
git switch main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
npm ci
npm run check
npm run test:e2e
git diff --check
```

Stop if the working tree is unexpectedly dirty, the pull is not fast-forwardable, or a required check fails. Do not use `clasp pull` to overwrite the Git source of truth.

Confirm the local `.clasp.json` exists and points at the intended Apps Script project. Its expected shape for this repository is:

```json
{
  "scriptId": "<the confirmed Apps Script project ID>",
  "rootDir": "backend"
}
```

Do not create or guess a script ID. Confirm the project in the Apps Script editor and ensure its bound/configured Sheet and Script Properties are the intended ones. The local `.clasp.json` is ignored by Git; never commit it or `.clasprc.json`.

Then inspect the local Clasp connection without writing:

```bash
npx clasp --version
npx clasp status
npx clasp deployments
```

Compare the deployment ID listed by Clasp with the deployment ID in the existing `config.js` `/s/<deploymentId>/exec` URL. Stop if they do not match, if the script/project identity is uncertain, or if the expected files would overwrite an unknown project.

## Gate B — upload reviewed backend source

Only after Gate A passes and the owner has confirmed the target project:

```bash
npx clasp status
npx clasp push
npx clasp status
```

Review the push output. Expected source scope is the backend project (including `Code.gs` and `appsscript.json`), not the frontend repository root. Stop if Clasp proposes unexpected files or a different target.

## Cash-impact field migration — only for the approved cash-impact release

The new voucher schema appends `CashImpact` as column Q. Do not use `setup()` for this migration: it is not a safe substitute for an additive, data-preserving schema change.

After the reviewed backend source has been uploaded to the verified Apps Script project (Gate B), but before publishing a Web App version:

1. Confirm a current backup exists and the intended `SS_ID` / bound Sheet is verified.
2. Inspect the `Vouchers` header row: the existing A:P headers must match the prior schema exactly, and Q must be empty. Do not proceed if the sheet differs or Q already contains unrelated data.
3. In the Apps Script editor, run `migrateCashImpactField()` once. It validates the prior header, writes only `CashImpact` to Q1, formats Q as text, and leaves every historical Q cell blank. It never infers values from type or category.
4. Verify Q1 is `CashImpact`, existing A:P headers and voucher row count are unchanged, and historical rows are still blank in Q. The app must represent those rows as `UNCLASSIFIED`; do not label them as reconciled.
5. If the function stops on a schema/column mismatch, stop the release and investigate. Do not run `setup()` or overwrite column Q to force the migration.

This is a future release procedure only. A code merge does not execute it, and this PR does not upload source, run the migration, or deploy.

## Gate C — publish a version while preserving the intended URL

In the Apps Script editor, inspect the project and existing deployments. Create a new version and update the existing Web App deployment that corresponds to the current `config.js` URL. Preserve its deployment ID/URL unless the owner explicitly approves a URL change.

The equivalent Clasp deployment command may be used only after the exact existing deployment ID has been verified:

```bash
npx clasp deploy -i <verified-existing-deployment-id> -d "Cash Voucher reviewed backend release"
```

Do not run `clasp deploy` without the verified ID; do not create a parallel deployment and silently leave the frontend pointed at the old version.

## One-time setup: hard stop unless proven necessary

**Do not run `setup()` just because a new backend version is being deployed.** In current source it ensures sheets, folders, defaults and the daily backup trigger, and creates an owner if the Users sheet is empty. It can also replace the existing backup trigger. Running it against an existing property without first inspecting the Sheet and Script Properties is unsafe.

Run `setup()` only when the owner has verified that this is the intended new/empty project, confirmed its Sheet binding/ID, reviewed required Script Properties and deliberately authorized initialization. If the project already has production data or users, do not rerun setup.

Required Script Properties and sensitive values must be configured in Apps Script Project Settings, never committed to Git or pasted into a PR: `OWNER_EMAIL`, temporary `OWNER_PASSWORD` only for first initialization, `PEPPER`, `SS_ID`, `RECEIPT_FOLDER_ID`, `BACKUP_FOLDER_ID`. Do not expose passwords, legacy PINs, tokens, IDs or private account data in logs or chat.

## Gate D — live smoke test and recovery

After the intended deployment is updated:

- Open the exact `config.js` Web App URL and verify the expected API response.
- Sign in with the intended owner account and complete any required first-login password change.
- Verify staff/manager/owner permissions using dedicated test accounts; never use direct Sheet sharing as a workaround.
- In a controlled test window, create a clearly identified test voucher and cash receipt, verify numbering and source rows, then cancel/clean up only according to the owner's approved data-handling policy. Do not mutate real financial records merely to test deployment.
- Verify receipt upload/read authorization and that production Sheet/Drive folders remain private.
- Check backup status and Drive for a real completed snapshot, receipt copies and manifest.
- Review the new Apps Script MailApp permission before authorizing the intended project. Verify `OWNER_EMAIL` is the approved recipient, then confirm that a controlled failure in a non-production project sends one email and that subsequent failures do not spam the recipient; also verify a successful backup clears the failure incident state.
- Perform a restore drill into a separate recovery Sheet/folder before claiming recoverability. Do not overwrite the only production copy. Do not deliberately break the production backup to test notification delivery.
- Record deployed version, deployment ID, UTC/local timestamp, authorization scopes approved, checks performed and any failed/untested gates.

## Rollback

Before deployment, record the current deployment ID and active version. If the new version fails smoke tests, update the same deployment back to the last known-good version in the Apps Script deployment manager. Preserve the URL and all existing data. Do not delete deployments, Sheets, folders, triggers or user records as part of rollback.

## Release status

- PR #63 is merged. On 10 October 2026, the owner ran `npx clasp push` and updated the existing configured Web App deployment using its verified deployment ID; Clasp reported deployment version 4.
- The owner’s local `npm run check` passed, including 90 backend checks, but `npm run test:e2e` exited before running because Playwright is not installed for the selected Python interpreter. Do not describe Browser E2E as passed for this local release.
- Local Node v24.14.0 is outside the repository's declared Node `>=20 <23` range. Use the supported Node version for repeatable release checks.
- npm reported three high-severity dependency findings; inspect the dependency paths and resolve them in a separate reviewed dependency-security change.
- Live owner/staff/manager smoke tests, receipt authorization checks, real backup verification and restore into a separate recovery Sheet/folder are still required. The deployment version number alone does not establish operational readiness.
- Do not rerun `setup()`, overwrite production records, or claim restoreability until the owner has witnessed the recovery drill.

## Post-PR #64 source baseline

PR #64 merged at `e266d0fba4d1468cdffac077bfac5ffef2a6ea90`. The owner reports local static/unit checks passed on this SHA, but Browser E2E did not run because Playwright is unavailable for the selected Python interpreter. Node v24 is outside the declared Node 20–22 range. Clasp listed the configured existing deployment `AKfycbys21L1jrEYXmdjN5lf1dYlAQJnqGRU3WjGQrvpPwjW7_zVJNb7w6ExRDnmbrkkFdM` at version 4 and a separate deployment at HEAD; do not target the latter by default. PR #64 deployment remains unconfirmed. Live authorization and a witnessed isolated restore remain open gates.

## Post-PR #65 / backup integrity inspection

- Main source baseline: `eef7a8d46dd41b86a7ebaab4fadbf64be42e5922`.
- PR #65 CI and Browser E2E passed on exact head `09eaac429307e4243d7a7d2fce1f16ef3402b029`.
- The deployment last reported at version 4 predates PRs #64 and #65. Do not upload until the owner verifies the exact project and intended existing deployment, completes required checks, and explicitly authorizes release.
- PR #66 adds an owner-only structural scan of the latest ten managed backup snapshots. It checks the spreadsheet copy, required tabs, header compatibility, receipt folder, manifest and receipt-copy references. It is read-only and does not restore or mutate data.
- A successful integrity scan is not restore proof. The P0 release gate remains a witnessed restore into a separate recovery Sheet/folder, followed by record-count and voucher-number validation.
- Never run `setup()` as a routine release step. Never test by overwriting the only production copy.

## Post-PR #66 / PR #67 verification note

PR #67 adds browser coverage for owner Settings data-quality results and backup-integrity inspection failure/retry behavior under the mock Google services. This does not verify live Drive permissions, actual snapshot contents, the configured Web App deployment, or restoration. The local report supplied after PR #66 showed Node v24 (outside the declared Node 20–22 range) and Browser E2E not run because Playwright was missing for the selected Python interpreter. Use supported Node and require exact-head GitHub CI plus Browser E2E before merge. Keep the existing deployment unchanged unless the owner separately authorizes a release after target verification.

## Post-PR #67 / local release gate update — 10 October 2026

- Verified Git baseline: `628f691fe9e4353cc6b701bd57c95c3e169aa495` (`main`, PR #67 merge).
- Owner-provided local checks on Node `v20.20.2` passed: `npm run check`, including 110 backend checks, backup orchestration/integrity, CSV export safety, dependency-audit tests and PR quality gate. ESLint reports one existing warning: `backupData_` is defined but unused in `backend/*.gs`.
- Owner-provided Browser E2E passed: **128 checks, 0 failures**, using an isolated Python virtual environment with Playwright `1.52.0` and Chromium installed.
- `git diff --check` reported no issues. The only reported untracked file is `docs/AI-ENGINEERING-PROTOCOL.md`; keep it local and uncommitted.
- `npx clasp status` lists only `backend/appsscript.json` and `backend/*.gs`. `npx clasp versions` reports four numbered versions; version 4 is named `Cash Voucher reviewed backend release`. The configured `config.js` Web App URL matches the version-4 deployment ID, and a separate `@HEAD` deployment exists.
- These checks establish deployment ID alignment, not that current `main` is deployed. Owner confirmation in the Apps Script editor of the intended project, deployment, Sheet binding and Script Properties remains outstanding. Do not run `clasp push`, `clasp deploy`, or `setup()` until the owner confirms the target and explicitly authorizes release.
- npm still reports three high-severity dependency findings; do not use `npm audit fix --force`. Live role/receipt authorization, a real scheduled backup, and a witnessed restore into a separate recovery Sheet/folder remain unverified.

## Cash-impact, payment-approval, VendorID and Daily Cash Close migrations — reviewed release only

PR #110 added Vouchers CashImpact in Q; PR #111 added CashCloses and CashCloseCorrections; the current PR appends payment-approval fields in R:U and VendorID in V. Before publishing source containing these features:

1. Verify the intended Apps Script project, `SS_ID`, bound Sheet and a current backup. Confirm the Vouchers A:P headers and row count, Q CashImpact, and the expected prior schema.
2. Upload reviewed backend source only after explicit owner authorization. A Git merge is not an upload or deployment.
3. If Vouchers Q1 is not `CashImpact`, run `migrateCashImpactField()` once. Verify A:P and row count are unchanged and historical CashImpact values remain blank.
4. Run `migrateVoucherApprovalFields()` once after CashImpact exists. It validates A:Q and appends only `ApprovalStatus`, `ApprovedBy`, `ApprovedAt`, and `ApprovalReason` in R:U. Existing data in R:U prevents the migration; historical approval cells remain blank and read as `NOT_REQUIRED`.
5. Run `migrateVoucherVendorIdField()` once after R:U is present. It validates the reviewed A:U schema, appends only `VendorID` in V and refuses to overwrite any existing V header/data. Historical voucher rows remain unlinked by migration; no VendorID is backfilled.
6. Run `migrateDailyCashCloseSchema()` once after the CashImpact field exists. It adds only the two dedicated tabs and refuses unexpected existing tabs/headers.
7. Verify exact Vouchers Q:V headers, both cash-close tab headers, unchanged historical row count and values, blank historical CashImpact/approval/VendorID cells, and no overwrites. Do not run `setup()` to force a migration.
8. Publish the reviewed backend version to the verified existing Web App deployment only after the owner separately authorizes deployment. Verify live owner/manager/accountant/staff permissions, payment approval, stable vendor identity, close guards, backup/restore and real-device behavior before relying on the features.

Vendor identity rules: new vouchers resolve a saved VendorID only on a unique case-insensitive exact match to a vendor-master name. Editing a voucher counterparty updates that link explicitly. Existing vouchers are not backfilled; report exports may use a unique exact-name fallback when an old row has no VendorID. Unmatched or ambiguous names produce a blank ID and an exception count. Vendor IDs are identifiers, not accounting-system mappings.

Do not run migrations or deploy from the feature PR. Preserve every existing row and all historical unclassified vouchers. Do not infer approval from historical amount or vendor identity from a fuzzy/partial name.
The client-side queue gate can inspect only the browser used for closing. Before trusting a daily close, confirm pending/rejected/offline recovery entries are reviewed and synchronized on every operating device. A successful close response is a central Sheet record, but it cannot prove that a different offline device has no unsynchronized entries.

## Staging environment and controlled UAT — Phase 19

The repository now provides a manually dispatched staging workflow at `.github/workflows/staging-uat.yml`. It is separate from production release and never runs on a push or pull request.

### One-time owner provisioning

1. Create a **dedicated staging Apps Script project**, staging Spreadsheet, staging receipt folder and staging backup folder. None may be the production resource. Set the staging project's Web App execution/access settings deliberately to support the UAT accounts while using synthetic data only.
2. In the staging Apps Script editor, set the required initial Script Properties for the staging owner and run `setup()` **once only on this verified empty staging project**. This initializes its tabs, folders and backup trigger. Do not run `setup()` from GitHub Actions and never use it as a production release step.
3. Create a dedicated staging manager account in the staging app. Manually complete first-login password changes for both staging owner and manager before workflow UAT; their emails and passwords must be distinct and must not be shared with production. Use `CV_STAGING_UAT_OWNER_PASSWORD` and `CV_STAGING_UAT_MANAGER_PASSWORD` GitHub Environment secrets after the forced password changes.
4. Create the first versioned staging Web App deployment manually, confirm its Web App URL identifies that staging deployment, and record the deployment ID and URL. The automated deploy step deliberately refuses to create a new/unknown deployment; it updates only this pre-existing staging deployment.

### GitHub Environment configuration

Create a GitHub Environment named `staging`, restrict its deployment branch to `client-main`, and, where available, require reviewer approval. To set the restriction, open **Settings → Environments → staging**; click the deployment branch dropdown currently labelled **No restriction**, choose **Selected branches and tags**, add the exact branch `client-main`, and save. The workflow separately refuses deploy/UAT runs unless the ref is `refs/heads/client-main`.

Configure these environment **variables**: `CV_STAGING_SCRIPT_ID`, `CV_STAGING_DEPLOYMENT_ID`, `CV_STAGING_API_URL`, `CV_STAGING_SPREADSHEET_ID`, `CV_STAGING_RECEIPT_FOLDER_ID`, and `CV_STAGING_BACKUP_FOLDER_ID`. The production Web App deployment ID is extracted from the existing production `config.js` URL and is always checked against the staging URL/deployment.

For the four production resource references—`CV_PRODUCTION_SCRIPT_ID`, `CV_PRODUCTION_SPREADSHEET_ID`, `CV_PRODUCTION_RECEIPT_FOLDER_ID`, and `CV_PRODUCTION_BACKUP_FOLDER_ID`—choose **one** of these safe configurations:

- **Automated inventory comparison (preferred):** enter all four real, independently verified production resource IDs. These are reference values only; deployment commands target the configured staging Script ID. Do not copy staging IDs into these fields.
- **Staging-only owner attestation:** leave all four values unset/empty and add `CV_STAGING_RESOURCE_ISOLATION_ATTESTATION` with the exact value `OWNER-VERIFIED-STAGING-ONLY`, but only after independently verifying that the staging Script, Sheet, receipt folder, and backup folder are distinct from production. In this mode, automated checks still enforce distinct staging resources and block matching the production Web App URL/deployment, but the four absent Script/Sheet/Drive comparisons are an explicit owner-attested gap.

Do **not** provide only some production reference IDs: partial inventory fails closed. Empty production reference values by themselves are not sufficient; the explicit attestation is required when all four are omitted.

Configure these environment **secrets**: `CLASPRC_JSON`, `CV_STAGING_UAT_OWNER_EMAIL`, `CV_STAGING_UAT_OWNER_PASSWORD`, `CV_STAGING_UAT_MANAGER_EMAIL`, and `CV_STAGING_UAT_MANAGER_PASSWORD`. `CLASPRC_JSON` may use the legacy Clasp format (`token` plus `oauth2ClientSettings`) or the Clasp 3.x format (`tokens.default` with non-empty `refresh_token`, `client_id`, and `client_secret`). Do not paste or commit the JSON. A local structural diagnostic should print only key names and boolean field-presence checks, never values. The deployer's diagnostic sanitizer must redact the complete document and nested OAuth credentials. If Clasp credentials are invalid, stop and generate/verify the local Clasp credential file; do not expose it in chat or logs.

### Running the phases

- **validate-only** runs source/security checks, unit/regression tests and the existing mock Browser E2E without staging credentials.
- **deploy-and-uat** runs only from `client-main`; type `STAGING-ONLY` and explicitly enable `confirm_staging_writes`. The workflow verifies that all configured staging resources differ from production, pushes backend files to the dedicated staging Script ID using temporary Clasp files, updates the already configured staging deployment, and runs owner/manager browser UAT.
- **uat-only** uses the same guarded UAT against an already deployed staging version without uploading source.

The automated transactional UAT creates one uniquely marked INR 10,000 PAYMENT, verifies that the creator cannot self-approve, verifies independent manager approval affects active totals correctly, and cancels the test voucher with a reason. The cancelled voucher and audit trail remain in the staging data; the UAT never deletes audit history, creates a Daily Cash Close, writes receipt payloads, or targets a production ID.

### Backend-only releases after merge

Merging a change to `backend/*.gs` does **not** update the Google Apps Script project or the deployed Web App. After the reviewed PR reaches `client-main`, use the manually dispatched **Staging UAT** workflow with operation `deploy-and-uat`, confirmation `STAGING-ONLY`, and `confirm_staging_writes=true`. This guarded workflow creates temporary Clasp configuration/authentication files from the protected `staging` Environment, verifies the configured staging Script and existing deployment, uploads `backend/`, updates only the existing staging deployment, and runs the tagged synthetic UAT. It does not rebuild or publish the static frontend ZIP. If the `staging` Environment variables/secrets are not provisioned or the preflight fails, stop: do not substitute a guessed `.clasp.json`, run `clasp push` against an unverified target, or deploy to production. Never commit `.clasp.json` or `.clasprc.json.

**UAT boundaries:** a green workflow is not a complete production-release sign-off. After automated UAT, the owner must separately review the Apps Script execution identity/access settings, verify a real scheduled staging backup, witness restore into a separate recovery Sheet/folder and reconcile row counts/voucher numbering, and complete device/offline/accessibility checks. The automated backup-integrity scan is structural only and does not prove restoreability.

## Password-authentication migration — populated legacy instance only

For an already populated instance that still has legacy `PinHash` / `MustChangePin` Users headers, do not run `setup()` to repair the schema. First take and verify a complete backup. Upload the reviewed backend source, run `migratePinAuthToPasswordSchema()` once from the intended Apps Script editor, and then immediately update the matching Web App deployment to this source version. The migration renames the two Users headers, preserves existing salted HMAC values, and marks every existing user for mandatory password change. During that forced-change-only state, the old shorter credential may be used to reach the change-password screen; the backend denies all other application actions until a new password of 8–128 characters is set. Test Owner, Manager, and Staff accounts after deployment. Do not point the old deployment at the migrated Sheet, and do not roll back old source onto the new headers. New staging projects do not require this migration.
