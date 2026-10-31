# Cash Voucher — Staging Login Release Checklist

**Purpose:** reach and verify first login on the dedicated staging origin without confusing source upload, Apps Script initialization, Web App deployment and frontend publication.

**State recorded for this checkpoint (18 October 2026):** the operator reports the staging Sheet is disposable/empty; the Apps Script project and `SS_ID` were rechecked against staging; `OWNER_EMAIL` and `OWNER_PASSWORD` are configured; and no `backupData_` trigger exists. The owner has not run `setup()`. These are operator-reported checks, not independent proof of runtime behavior.

## Guardrails

- Do not commit or push directly to `main`; use a feature branch and reviewed PR.
- Never run `setup()`, `clasp push`, deployment, or frontend upload against production as part of staging work.
- Never reuse the root `config.js` endpoint for staging without independently verifying Script/deployment/Sheet/folder identities.
- Do not store owner passwords, Clasp OAuth tokens, or resource IDs in Git, PR text, customer documents, screenshots, or chat.
- Local tests are not proof of live Apps Script, Drive, HTTP headers, browser-origin behavior, backup/restore or customer acceptance.

## Gate 1 — source and tests

- [ ] Setup-preflight change is on a feature branch in `tchouhanjsm/cash-voucher`, not pushed directly to `main`.
- [ ] The PR's exact head passes required GitHub CI and Browser E2E. Record the tested head SHA.
- [ ] Review `backend/10-setup.gs`: target resolution, Users schema/data checks, and first-owner credential validation must happen before initialization writes.
- [ ] Regression coverage includes missing email/password, malformed Users headers, rows without UserID, incomplete records and repeat setup without a duplicate Owner.
- [ ] Review the complete source/test/docs diff. Merge only with explicit owner approval.

## Gate 2 — verify target identity before remote writes

- [ ] Open Apps Script from the intended staging Sheet and privately confirm `SS_ID` matches that Sheet.
- [ ] Run `npx clasp status` and `npx clasp deployments`; confirm local Clasp is staging. A `@HEAD` deployment is not proof a versioned Web App is ready.
- [ ] Verify staging Script, Sheet, receipt folder, backup folder and deployment identities do not match production. Store IDs in the private operator register only.
- [ ] Inspect staging Script Properties privately; owner email and temporary password are ready and must not appear in logs/chat.
- [ ] Inspect current Apps Script triggers and note handlers/schedule.
- [ ] Stop if an ID is unknown, target is ambiguous, Sheet is populated, or resources overlap production.

## Gate 3 — separately authorized one-time initialization

Checking this list is **not authorization**. Obtain a separate explicit owner instruction before running `setup()`.

- [ ] Run `setup()` once from the verified staging Apps Script editor and approve only required scopes.
- [ ] If preflight fails, do not rerun blindly. Record the error and inspect Script Properties, tabs/headers/data, Drive folders and triggers.
- [ ] After success, verify expected tabs and exact headers; one Owner row; mandatory password change; `PEPPER`; receipt/backup folder IDs; and daily backup trigger.
- [ ] Verify `OWNER_PASSWORD` was deleted after initial Owner creation.
- [ ] Confirm no production resources were created or modified.

## Gate 4 — first backup and versioned staging deployment

- [ ] Treat the first backup as separate evidence: setup installs the daily trigger but does not prove backup or restore.
- [ ] Under explicit staging-write authorization, run a controlled staging backup, inspect snapshot/Sheet copy/receipts/manifest, and restore into a separate recovery destination.
- [ ] Create the first versioned Web App deployment manually if none exists; do not treat `@HEAD` as customer-ready.
- [ ] Execute as the operator/owner account. Public HTTP access may be needed because the static client cannot rely on Google login cookies, but app-level email/password authentication and per-route authorization must remain mandatory.
- [ ] Record the exact `/exec` URL privately and match its deployment ID to the intended Script project. Do not put it into shared root `config.js`.

## Gate 5 — publish staging frontend to GoDaddy/cPanel

Intended staging origin: `https://cashvoucher-staging.hotelgarhjaisal.com`. Re-verify DNS, SSL and the staging document root before release.

- [ ] Use supported Node (`>=20 <23`) and build using the verified staging URL:

  ```bash
  CV_API_URL="https://script.google.com/macros/s/<VERIFIED_STAGING_DEPLOYMENT_ID>/exec" \
  CV_ENVIRONMENT=staging npm run build:web
  ```

- [ ] Confirm `dist/` contains generated app and per-instance `config.js`, not `backend/`, `docs/`, `scripts/`, `test/`, or repository metadata.
- [ ] Upload **only the contents of `dist/`** to the staging subdomain's cPanel document root. Never upload the repository root or overwrite production.
- [ ] Verify published config points to the verified staging endpoint and uses the staging environment.
- [ ] Inspect actual response headers and browser Console/Network; a generated `.htaccess` alone does not prove Apache applied them.

## Gate 6 — Owner login and onboarding

- [ ] Open the staging HTTPS URL in a clean/private browser window; confirm the browser origin is the staging host.
- [ ] After the endpoint-bound session update, expect one reauthentication for legacy cached sessions without endpoint metadata. A saved token resumes only when its stored endpoint binding matches the active client configuration.
- [ ] Sign in with the staging Owner's registered email and temporary password. Never put credentials in PRs/logs.
- [ ] Confirm the mandatory password-change flow; sign out and back in with the new password.
- [ ] Verify the expected in-app onboarding checklist appears for first-run Owner and identifies the intended environment.
- [ ] Confirm technical diagnostics identify the right Script, deployment, Sheet and folders. Do not bypass a blocked preflight.
- [ ] Create a separate staging Manager through the approved flow and verify password change and role restrictions.
- [ ] Do not declare staging ready until required Owner/Manager/Staff checks, recent successful backup, restore drill, receipt access, cash-close and offline-sync checks are complete.

## Client handoff boundary

The client receives the verified URL, login email, a temporary password delivered separately, first-login/password-change steps, onboarding guidance and support contact. Never ask the client to run `clasp`, edit Script Properties, enter the Apps Script editor, inspect raw Sheet/Drive IDs or handle operator credentials.

## Failure recovery record

Record timestamp, branch/commit/PR or deployment version, exact non-sensitive error, target environment, resources observed before/after and next approved action. If an error occurs after writes begin, do not delete folders, Sheets, users or triggers merely to retry. Preserve partial state, diagnose, and choose a reviewed recovery action.
