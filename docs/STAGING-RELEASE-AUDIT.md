# Staging Release Audit and Pending Queue

**Audit date:** 21 October 2026  
**Authoritative integration baseline:** client-main d5ed3e77387d0f1896c97dbaac793ed23b17eb32,
following PR #197.  
**Legacy baseline:** main b4fa94405c0e6a7393c36f43e168f8b54c99c408.  
**Observed relationship:** client-main is 13 commits ahead and 2 behind main; merge base
acebc6b63010a92e136200321fc77c03dac9a3be. Do not merge/rebase branches blindly.  
**Scope:** source and release-workflow audit, not live deployment, restore or customer acceptance.

## Executive status

PR #197 (“streamline fast entry and add live batch totals”) is merged to client-main. Its reported
CI/Quality, Browser E2E and Full Flight Test checks passed for the reviewed source commit. It
contains source changes and mock-backed migration tests; it does not execute a Google Sheet
migration, deploy an Apps Script Web App, publish the static frontend, verify live response headers
or demonstrate backup/restore.

The branch policy names client-main as the only integration branch and main as legacy/read-only.
Repository metadata still listed main as the default branch. Accessible branch-protection data did
not prove active required-check/ruleset enforcement. Owner/admin must verify actual rulesets and
default settings; this source PR must not change repository settings or reconcile divergent
long-lived branches.

Dedicated staging resources, protected staging Environment, a real deployed staging frontend,
successful live UAT, support-email delivery, real backup/restore, physical-device acceptance and
customer acceptance are not evidenced as complete. Verify that the private-repository host
integration still has access. The product remains single-property, not multi-tenant.

## Active release sequence

Follow the six-step pipeline in [the execution plan](EXECUTION-PLAN-2026-10-21.md). PRs #197 and
#198 are merged; live staging and customer acceptance remain unverified.

**Evidence still required:** isolated staging identity and host access; inspected pre-migration
backup; schema validation and only required staging migrations; backend-first deploy and
staging-configured frontend; exact-run guarded UAT; live role, receipt, payment-method, offline and
print checks; and restore into a separate recovery target. The hotel pilot remains blocked until
those gates pass. Production is excluded.

## Evidence from workflow run #39587669660 — 21 October 2026

The manually dispatched workflow from `client-main` passed source/security/backend checks, mock Browser E2E, and Python syntax validation. The **deployment preflight failed closed** before `staging:deploy`, target recheck, or live UAT ran. The preflight reported four missing production resource variables: `CV_PRODUCTION_SCRIPT_ID`, `CV_PRODUCTION_SPREADSHEET_ID`, `CV_PRODUCTION_RECEIPT_FOLDER_ID`, and `CV_PRODUCTION_BACKUP_FOLDER_ID`; it also rejected `CLASPRC_JSON` as missing/invalid. The workflow log redacted the OAuth value; do not expose or paste it into chat.

No deployment or live UAT steps ran in this attempt. A completed workflow log cannot prove that unrelated external systems were untouched, but this workflow provides no evidence that it updated the Apps Script deployment or created the synthetic payment. Preserve this run as failed-preflight evidence; **do not rerun it or relax preflight to get a green result** until the owner has corrected and independently checked the Environment configuration.

Owner recovery checklist:

1. In GitHub **Settings → Environments → staging → Environment variables**, confirm all four production resource values correspond to the actual production Script, Sheet, receipt folder and backup folder. Enter each exact verified ID privately; do not infer one from another or copy a staging ID into the production slot.
2. In **Environment secrets**, replace `CLASPRC_JSON` only with a fresh, valid Clasp OAuth credentials JSON generated for the operator account authorized to access the staging Apps Script project. It must contain the expected top-level `token` and `oauth2ClientSettings` members. Do not share the secret content or post it in issues/logs. If a real credential was ever pasted into a public or untrusted location, revoke/rotate it.
3. Re-check all other staging and production variable identities independently. The preflight requires all five staging resource IDs to be distinct, all five production identities (including the deployment derived from root `config.js`) to be distinct, and no staging ID to overlap production. **Do not change `config.js` or copy production IDs into staging resources.**
4. Run `validate-only` from `client-main` to reconfirm source/mock checks, then review the updated Environment privately. A validate-only run does not validate these secrets/resources because they are not passed into the validation job. Store the Clasp OAuth JSON only in the protected GitHub Environment secret; do not paste it into chat, issues, commits or workflow inputs.
5. Only after private verification should the owner explicitly dispatch a fresh `deploy-and-uat` run from `client-main`. Review preflight first, then the exact steps/logs. Stop if any identity is uncertain or any guard fails.

## Branch and staging workflow — authoritative correction

The active integration branch is **client-main**. The staging Environment must restrict deployments
to **client-main**, because the deploy/UAT guard accepts only refs/heads/client-main. Dispatch
deploy-and-uat or uat-only from client-main with exact STAGING-ONLY confirmation and explicit
staging-write consent. Starting the staging workflow from main is not supported.

- validate-only runs source checks and mock Browser E2E without staging credentials.
- deploy-and-uat is owner-authorized and updates an already verified staging deployment; it must not
  create or guess a target deployment.
- uat-only tests a known deployed staging version without uploading source.
- This audit does not authorize production deployment, production migration or a DNS change.

Owner/admin must verify that the GitHub Environment is named staging, deployment restrictions allow
client-main, reviewer protection is configured where supported, and only expected variables/secrets
exist. Never copy secret values to Git, chat, PR text or logs.

## Priority 0 — required before staging is verified

### A. Dedicated staging

1. Verify a staging-only Apps Script project, Spreadsheet, receipt folder, backup folder, Web App
   deployment and distinct browser origin. Record target identity privately and prove every staging
   resource differs from production.
2. On a verified empty staging Sheet only, configure staging Owner properties, run setup once,
   approve scopes, create a dedicated Manager and complete first password changes. Never run setup on
   populated or production data.
3. Create the first versioned staging Web App deployment manually; independently verify deployment
   ID and /exec URL. Automated deployment intentionally updates an existing deployment.
4. Verify protected GitHub Environment staging and variables CV_STAGING_SCRIPT_ID,
   CV_STAGING_DEPLOYMENT_ID, CV_STAGING_API_URL, CV_STAGING_SPREADSHEET_ID,
   CV_STAGING_RECEIPT_FOLDER_ID, CV_STAGING_BACKUP_FOLDER_ID, CV_PRODUCTION_SCRIPT_ID,
   CV_PRODUCTION_SPREADSHEET_ID, CV_PRODUCTION_RECEIPT_FOLDER_ID and CV_PRODUCTION_BACKUP_FOLDER_ID.
5. Configure secrets CLASPRC_JSON, CV_STAGING_UAT_OWNER_EMAIL, CV_STAGING_UAT_OWNER_PASSWORD,
   CV_STAGING_UAT_MANAGER_EMAIL and CV_STAGING_UAT_MANAGER_PASSWORD. Never record values in this audit.
6. Run validate-only first. After owner review of target identity and workflow code, dispatch
   deploy-and-uat from client-main with STAGING-ONLY and explicit staging-write consent. Review
   sanitized logs and exact workflow result. The synthetic INR 10,000 payment is created and canceled;
   its canceled record and audit trace remain in staging.
7. Save the workflow run and target identity evidence in the private release register. Green CI
   alone is not live UAT evidence.

### B. First-customer instance

1. Verify private static-host access. Preserve URL continuity before DNS changes.
2. Give each customer a distinct Sheet, Script project, private receipt/backup folders, Web App
   deployment and frontend origin. Do not reuse staging or another customer's IDs.
3. Build the frontend with an independently verified customer Web App URL and the correct
   environment. Publish only the generated artifact after separate owner approval.
4. Inspect response headers actually served by the host, including framing and content-type
   protection. Generated .htaccess/_headers do not prove live response behavior.
5. Test Owner/Manager/Staff permissions, denied API operations, voucher create/cancel, receipt
   upload/read, approvals, reports and real backend behavior.
6. Run a real backup, verify Sheet snapshot/copy, receipt files and manifest, then restore into a
   separate recovery Sheet/folder. Reconcile headers, row counts, voucher numbering, user/settings
   state and receipt mapping.
7. Test intended devices: install/update, online save, receipt capture, offline queue,
   reconnect/idempotent replay, export/recovery, print/PDF, zoom/reflow, keyboard focus and assistive
   technology.
8. Record instance register, customer quick-start, incident fallback and written acceptance.

**Exit evidence:** isolated resource inventory; target-matched live UAT; verified host and
permissions; real backup and witnessed isolated restore; device/offline evidence; customer
acceptance. Any missing item blocks the release claim.

## Priority 1 — controlled pilot

Start a 14-day pilot only after Priority 0 passes. Record daily voucher reconciliation, book balance
versus physical count, Cash versus UPI/Bank treatment, unresolved exceptions, every-device offline
state, backup evidence, incidents and owner/manager sign-off. Stop on missing/duplicate vouchers,
unexplained variance, missing receipts, unauthorized access, failed backup, target mismatch or
unrecoverable offline entries.

Include physical-device/accessibility review, including 200–400% zoom/reflow, focus order,
screen-reader/status behavior and print/export. Measure Apps Script/Sheets latency, quotas and lock
contention in authorized staging before publishing service-level promises.

## Priority 2 — decisions and later work

- **Audit durability:** simultaneous AuditLog append and Script Properties marker-write failure has
  no durable fallback. Define failure, access, retention and recovery semantics before implementation;
  never invent historical audit events.
- **Dependency exception:** braces@3.0.3 remains a time-bounded Clasp toolchain exception. Review
  compatibility by 9 November 2026; CI is expected to reject it from 10 November unless renewed
  explicitly with tests. Do not blindly downgrade Clasp.
- **Accountant export:** generic recorded-movement CSV exists, but no destination-specific
  compatibility, tax calculation or ledger claim is approved. The receiving accountant must select
  software/version and validate an anonymized fixture; qualified Indian CA review is required for tax
  treatment.
- **Daily close:** denomination rows remain optional until owner/pilot evidence demonstrates value.
- **Scale:** collect pilot evidence before numeric SLO promises, chain support or multi-tenant
  architecture.

## Release decision

**Source packaging:** available as a staging input. **Live staging:** not verified. **First-customer
handover:** blocked until Priority 0 gates pass. **Production:** untouched and not authorized by
this audit.

This audit's branch instructions supersede historical snippets elsewhere that tell operators to
dispatch from or restrict staging deployment to main. Update this audit and its regression tests in
the same meaningful release-governance change whenever the workflow guard changes.
