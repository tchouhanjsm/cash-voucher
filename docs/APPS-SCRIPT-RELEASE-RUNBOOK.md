# Apps Script Release Readiness and Controlled Deployment

**Purpose:** release the reviewed backend source intentionally without confusing Git merge, source upload, Web App deployment, and production verification.

## Current release boundary

PR #67 is merged; the current `main` baseline is `628f691fe9e4353cc6b701bd57c95c3e169aa495`. PRs #64–#66 include backend changes after the previously reported version-4 deployment. The current merged backend must not be assumed deployed. Local quality checks and mock Browser E2E do not deploy Apps Script or prove live Google Sheets/Drive behavior.

The frontend `config.js` already contains a Web App `/exec` URL. Do not replace it or create a different URL until the local Clasp deployment list proves which Apps Script project and deployment serve that URL.

The root `.gitignore` excludes `.clasp.json` and `.clasprc.json` intentionally. The local Clasp configuration/authentication must remain local and must not be committed.

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

Required Script Properties and sensitive values must be configured in Apps Script Project Settings, never committed to Git or pasted into a PR: `OWNER_EMAIL`, temporary `OWNER_PIN` only for first initialization, `PEPPER`, `SS_ID`, `RECEIPT_FOLDER_ID`, `BACKUP_FOLDER_ID`. Do not expose PINs, tokens, IDs or private account data in logs or chat.

## Gate D — live smoke test and recovery

After the intended deployment is updated:

- Open the exact `config.js` Web App URL and verify the expected API response.
- Sign in with the intended owner account and complete any required first-login PIN change.
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
- Owner-provided local checks on Node `v20.20.2` passed: `npm run check`, including 110 backend checks, backup orchestration/integrity, CSV export safety, dependency-audit tests and PR quality gate. ESLint reports one existing warning: `backupData_` is defined but unused in `backend/Code.gs`.
- Owner-provided Browser E2E passed: **128 checks, 0 failures**, using an isolated Python virtual environment with Playwright `1.52.0` and Chromium installed.
- `git diff --check` reported no issues. The only reported untracked file is `docs/AI-ENGINEERING-PROTOCOL.md`; keep it local and uncommitted.
- `npx clasp status` lists only `backend/appsscript.json` and `backend/Code.gs`. `npx clasp versions` reports four numbered versions; version 4 is named `Cash Voucher reviewed backend release`. The configured `config.js` Web App URL matches the version-4 deployment ID, and a separate `@HEAD` deployment exists.
- These checks establish deployment ID alignment, not that current `main` is deployed. Owner confirmation in the Apps Script editor of the intended project, deployment, Sheet binding and Script Properties remains outstanding. Do not run `clasp push`, `clasp deploy`, or `setup()` until the owner confirms the target and explicitly authorizes release.
- npm still reports three high-severity dependency findings; do not use `npm audit fix --force`. Live role/receipt authorization, a real scheduled backup, and a witnessed restore into a separate recovery Sheet/folder remain unverified.

## Daily Cash Close schema migration — reviewed release only

PR #110 introduced the additive Vouchers CashImpact column. The Daily Cash Close feature additionally needs CashCloses and CashCloseCorrections tabs. Before publishing a version containing Daily Cash Close:

1. Verify the intended Apps Script project, SS_ID, bound Sheet and a current backup. Inspect the existing Vouchers row count and A:P headers; ensure the next column is available.
2. Upload the reviewed backend source only after explicit owner authorization. A Git merge is not an upload or deployment.
3. If Vouchers Q1 is not CashImpact, run migrateCashImpactField() once and verify A:P and voucher row count are unchanged and all historical CashImpact cells remain blank.
4. Run migrateDailyCashCloseSchema() once. It requires the current CashImpact header, adds only the two dedicated tabs, validates any pre-existing same-named tabs, and stops rather than overwriting unexpected data.
5. Verify the exact headers of both new tabs and confirm existing Vouchers and Settings rows/values are unchanged. Do not run setup() to force the migration.
6. Publish the reviewed backend version to the verified existing Web App deployment only after the owner separately authorizes deployment. Then complete live role, close/duplicate, voucher lock, backup/restore and real-device checks before relying on the feature.

Do not run either migration or deploy from the feature PR. Preserve every existing row and all historical unclassified vouchers.

The client-side queue gate can inspect only the browser used for closing. Before trusting a daily close, confirm pending/rejected/offline recovery entries are reviewed and synchronized on every operating device. A successful close response is a central Sheet record, but it cannot prove that a different offline device has no unsynchronized entries.
