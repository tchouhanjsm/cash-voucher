# Apps Script Release Readiness and Controlled Deployment

**Purpose:** release the reviewed backend source intentionally without confusing Git merge, source upload, Web App deployment, and production verification.

## Current release boundary

PR #62 is merged at `49f2a3db297f84093d46b247a54c93c9372f3684`. It contains a backend idempotency change. The repository's CI and browser tests use mocks; they do not deploy Apps Script or prove live Google Sheets/Drive behavior.

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
- Perform a restore drill into a separate recovery Sheet/folder before claiming recoverability. Do not overwrite the only production copy.
- Record deployed version, deployment ID, UTC/local timestamp, checks performed and any failed/untested gates.

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
