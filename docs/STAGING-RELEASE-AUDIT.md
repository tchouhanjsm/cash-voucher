# Staging Release Audit and Pending Queue

**Audit date:** 21 October 2026  
**Authoritative integration baseline:** client-main d5ed3e77387d0f1896c97dbaac793ed23b17eb32, following PR #197.  
**Legacy baseline:** main b4fa94405c0e6a7393c36f43e168f8b54c99c408.  
**Observed relationship:** client-main is 13 commits ahead and 2 behind main; merge base acebc6b63010a92e136200321fc77c03dac9a3be. Do not merge/rebase branches blindly.  
**Scope:** source and release-workflow audit, not live deployment, restore or customer acceptance.

## Executive status

PR #197 (“streamline fast entry and add live batch totals”) and PR #198 (release-readiness strategy/guardrails) are merged to client-main. PR #198's merged head is acc93eb68cec21b1c0510c31fc5f4c82c5481e1d; its merged-head CI/Quality, Browser E2E and Full Flight Test all passed. PR #197 contains source changes and mock-backed migration tests; it does not execute a Google Sheet migration, deploy an Apps Script Web App, publish the static frontend, verify live response headers or demonstrate backup/restore.

The branch policy names client-main as the only integration branch and main as legacy/read-only. Repository metadata still listed main as the default branch. Accessible branch-protection data did not prove active required-check/ruleset enforcement. Owner/admin must verify actual rulesets and default settings; this source PR must not change repository settings or reconcile divergent long-lived branches.

Dedicated staging resources, protected staging Environment, a real deployed staging frontend, successful live UAT, support-email delivery, real backup/restore, physical-device acceptance and customer acceptance are not evidenced as complete. Verify that the private-repository host integration still has access. The product remains single-property, not multi-tenant.

## Immediate pipeline — preserve this order

**This is the active work queue. Do not replace it with a feature sprint.** PR #197 is the completed source batch; PR #198 is merged. The current next action is the verified staging release, followed by the controlled hotel pilot only after all gates pass.

### 1. Complete the source release

- PR #197 is merged to `client-main`; PR #198 has also been merged.
- Verify CI/Quality, Browser E2E and Full Flight Test on the relevant merged commit. Historical green checks prove source checks only.
- Review the merged source release and the staging workflow. Do not create another cosmetic PR.

### 2. Prepare and identify staging

- Verify the dedicated staging Apps Script project, Spreadsheet, receipt folder, backup folder, existing Web App deployment and exact `/exec` URL.
- Verify the private repository can build through the static-host integration and that the staging ZIP will use the verified staging API URL with `CV_ENVIRONMENT=staging`.
- Record a private resource identity register and prove the staging Script, deployment, Sheet and Drive folders do not overlap production.
- Verify the protected GitHub `staging` Environment, variables/secrets and deployment restriction to `client-main`. Keep credentials out of logs and PRs.
- If any target identity or access is uncertain, stop before writing.

### 3. Back up, then migrate staging

- Create a backup of the confirmed staging Sheet and receipts before changing schema. Inspect the snapshot/receipt manifest and record the backup evidence.
- Inspect the actual staging headers and relevant row counts before running either migration. Confirm both migrations are needed and each expected target column is empty; the functions are deliberately fail-closed if their supported prior schema is absent or trailing columns are occupied.
- With explicit owner authorization, run `migrateVoucherPaymentMethodField()` and `migrateVendorDefaultsSchema()` **against the confirmed staging Sheet only**. Do not infer historical payment methods. Keep historical `PaymentMethod` blanks blank; do not overwrite unexpected columns or vendor data.
- Verify the resulting Vouchers W and Vendors H:I headers, existing voucher/vendor row counts and unchanged historical values. If the schema differs from expectation, stop and review—do not improvise a migration.
- Production migration is not part of this pipeline.

### 4. Deploy backend first and run staging UAT

- Verify the reviewed backend source is selected for the intended staging Apps Script project, upload it to that project, and update the verified existing staging Web App deployment. Confirm the deployment identity and URL.
- Build the static frontend only after the staging API URL is confirmed, using `CV_ENVIRONMENT=staging`; publish it to the verified staging host through the approved static-host integration or staging ZIP workflow.
- Run the manual [Staging UAT workflow](https://github.com/tchouhanjsm/cash-voucher/blob/client-main/.github/workflows/staging-uat.yml) from `client-main`: first `validate-only`, then owner-authorized `deploy-and-uat` or `uat-only` as appropriate, with the exact `STAGING-ONLY` confirmation and explicit staging-write consent. Never dispatch deploy/UAT from `main`.
- Preserve sanitized workflow logs, target identity and UAT results. A passing mock E2E is not live UAT.

### 5. Prove operational readiness

Test the deployed staging path using the intended Owner, Manager and Staff accounts and real customer devices. Verify:
- role permissions, denied API actions and password flows;
- payment and receipt creation/read, including receipt access boundaries;
- Cash versus UPI/Bank classification and physical-drawer treatment;
- saved-payee defaults and duplicate warnings;
- independent approval and cash-close/correction controls;
- offline entries, queue state, reconnection, idempotent recovery and all-device checks;
- printed output, PDF/A5 alignment, narrow layouts, keyboard focus, zoom/reflow and assistive technology;
- the post-migration schema/row counts and a real backup of the migrated staging instance.

Restore that backup into a **separate recovery Sheet/folder**. Verify headers, row counts, voucher numbering, settings/users and receipt mapping. Backup success without an isolated restore is not a pass.

### 6. Controlled 14-day hotel pilot

Only after stages 2–5 pass, record the customer's acceptance, fallback and support boundaries, and start the 14-day pilot. Track daily reconciliation, physical cash variance, Cash vs UPI/Bank, pending offline entries on each device, backup freshness, incidents/recovery and owner/manager sign-off. Pause for missing/duplicate vouchers, unexplained variance, missing receipts, failed backup, unauthorized access, target mismatch or unrecoverable offline entries. Production remains behind separate gates and is not implicitly authorized.

### Exit rule

No stage is complete because a source PR merged or a mock test passed. Keep evidence for every gate. Do not start the next product feature batch until the first-customer release/pilot evidence shows a real bottleneck.



## Branch and staging workflow — authoritative correction

The active integration branch is **client-main**. The staging Environment must restrict deployments to **client-main**, because the deploy/UAT guard accepts only refs/heads/client-main. Dispatch deploy-and-uat or uat-only from client-main with exact STAGING-ONLY confirmation and explicit staging-write consent. Starting the staging workflow from main is not supported.

- validate-only runs source checks and mock Browser E2E without staging credentials.
- deploy-and-uat is owner-authorized and updates an already verified staging deployment; it must not create or guess a target deployment.
- uat-only tests a known deployed staging version without uploading source.
- This audit does not authorize production deployment, production migration or a DNS change.

Owner/admin must verify that the GitHub Environment is named staging, deployment restrictions allow client-main, reviewer protection is configured where supported, and only expected variables/secrets exist. Never copy secret values to Git, chat, PR text or logs.

## Priority 0 — execution evidence still required

The six-step pipeline above is the canonical sequence. This section records the release gates to prove; it is not a second sequence and does not certify completion.

### A. Staging identity and configuration

1. Verify the dedicated staging Apps Script project, Spreadsheet, receipt folder, backup folder, existing Web App deployment and distinct browser origin. Record IDs privately and confirm they do not overlap production.
2. Verify the protected GitHub Environment `staging`, its restriction to `client-main`, any required reviewer gates, variables and secrets. Never copy secret values into Git, chat or logs.
3. Verify private-repository static-host access and that the generated staging ZIP will use the independently confirmed staging `/exec` URL and `CV_ENVIRONMENT=staging`.
4. Run `validate-only` first. A deploy/UAT run must be owner-authorized, dispatched from `client-main`, include exact `STAGING-ONLY` confirmation and explicit staging-write consent, and use the verified existing deployment.

### B. Backup and required schema migrations

1. Back up the confirmed staging Sheet and receipt files; inspect the snapshot and receipt manifest before writing.
2. Inspect actual Vouchers and Vendors headers and row counts. Run `migrateVoucherPaymentMethodField()` and/or `migrateVendorDefaultsSchema()` only where schema inspection proves they are required, after explicit owner approval.
3. Preserve historical `PaymentMethod` blanks. Stop on unexpected headers or occupied target columns; never overwrite an unknown schema.
4. Verify Vouchers W, Vendors H:I, unchanged row counts and historical values after any migration.

### C. Deploy, UAT and recovery evidence

- Deploy backend first and verify the Apps Script project/deployment/URL; then publish the static staging frontend with the verified API URL and staging environment.
- Verify Owner/Manager/Staff authorization, payment/receipt operations, Cash versus UPI/Bank, saved-payee defaults, duplicate warnings, approval/cash-close controls and offline recovery on all intended devices.
- Verify print/PDF/A5, keyboard focus, zoom/reflow and assistive technology.
- Back up the migrated staging instance and restore to a **separate recovery Sheet/folder**. Reconcile headers, row counts, voucher numbering, settings/users and receipt mapping.

**Production boundary:** none of these staging steps authorizes a production migration, deployment, DNS change or customer-data write.


### B. First-customer instance

1. Verify private static-host access. Preserve URL continuity before DNS changes.
2. Give each customer a distinct Sheet, Script project, private receipt/backup folders, Web App deployment and frontend origin. Do not reuse staging or another customer's IDs.
3. Build the frontend with an independently verified customer Web App URL and the correct environment. Publish only the generated artifact after separate owner approval.
4. Inspect response headers actually served by the host, including framing and content-type protection. Generated .htaccess/_headers do not prove live response behavior.
5. Test Owner/Manager/Staff permissions, denied API operations, voucher create/cancel, receipt upload/read, approvals, reports and real backend behavior.
6. Run a real backup, verify Sheet snapshot/copy, receipt files and manifest, then restore into a separate recovery Sheet/folder. Reconcile headers, row counts, voucher numbering, user/settings state and receipt mapping.
7. Test intended devices: install/update, online save, receipt capture, offline queue, reconnect/idempotent replay, export/recovery, print/PDF, zoom/reflow, keyboard focus and assistive technology.
8. Record instance register, customer quick-start, incident fallback and written acceptance.

**Exit evidence:** isolated resource inventory; target-matched live UAT; verified host and permissions; real backup and witnessed isolated restore; device/offline evidence; customer acceptance. Any missing item blocks the release claim.

## Priority 1 — controlled pilot

Start a 14-day pilot only after Priority 0 passes. Record daily voucher reconciliation, book balance versus physical count, Cash versus UPI/Bank treatment, unresolved exceptions, every-device offline state, backup evidence, incidents and owner/manager sign-off. Stop on missing/duplicate vouchers, unexplained variance, missing receipts, unauthorized access, failed backup, target mismatch or unrecoverable offline entries.

Include physical-device/accessibility review, including 200–400% zoom/reflow, focus order, screen-reader/status behavior and print/export. Measure Apps Script/Sheets latency, quotas and lock contention in authorized staging before publishing service-level promises.

## Priority 2 — decisions and later work

- **Audit durability:** simultaneous AuditLog append and Script Properties marker-write failure has no durable fallback. Define failure, access, retention and recovery semantics before implementation; never invent historical audit events.
- **Dependency exception:** braces@3.0.3 remains a time-bounded Clasp toolchain exception. Review compatibility by 9 November 2026; CI is expected to reject it from 10 November unless renewed explicitly with tests. Do not blindly downgrade Clasp.
- **Accountant export:** generic recorded-movement CSV exists, but no destination-specific compatibility, tax calculation or ledger claim is approved. The receiving accountant must select software/version and validate an anonymized fixture; qualified Indian CA review is required for tax treatment.
- **Daily close:** denomination rows remain optional until owner/pilot evidence demonstrates value.
- **Scale:** collect pilot evidence before numeric SLO promises, chain support or multi-tenant architecture.

## Release decision

**Source PR #197:** merged and checked. **Release-governance PR #198:** merged and checked. **Next required action:** stage resource identity, backup, inspect and run the two named staging migrations, backend-first deployment, staging UAT, and isolated restore in the order above. **Source packaging:** available as a staging input. **Live staging:** not verified. **First-customer handover:** blocked until Priority 0 gates pass. **Production:** untouched and not authorized by this audit.

This audit's branch instructions supersede historical snippets elsewhere that tell operators to dispatch from or restrict staging deployment to main. Update this audit and its regression tests in the same meaningful release-governance change whenever the workflow guard changes.
