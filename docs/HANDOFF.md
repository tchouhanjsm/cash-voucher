# Engineering Handoff — Cash Voucher

**Updated:** 21 October 2026  
**Repository:** tchouhanjsm/cash-voucher  
**Integration branch:** client-main  
**Current integration head:** acc93eb68cec21b1c0510c31fc5f4c82c5481e1d (PR #198 merged after PR #197).  
**Legacy branch:** main (read-only; divergent).  
**Current phase:** release readiness and first-customer acceptance, not feature expansion.

## Verified source state

- PR #197 (“streamline fast entry and add live batch totals”) is merged to client-main. The exact source-head checks reported as passed: [CI / Quality](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39541110608), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39541110591), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39541110605). Recheck the exact head for this follow-up; older checks do not apply to new commits.
- PR #197 adds fast entry/live batch totals, payment-method batch summaries, quick-save payee defaults, keyboard progression and regression coverage. Its migration tests are mock-backed; it did not run live Google migrations.
- The observed branch comparison has client-main 13 commits ahead and 2 behind main, merge base acebc6b63010a92e136200321fc77c03dac9a3be. Do not merge/rebase branches blindly. Repository metadata still listed main as default; an owner/admin must verify actual ruleset state.
- A source merge is not Apps Script upload, Web App deployment, static-host publication, schema migration, real backup/restore or customer acceptance.

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


## Immediate actions

1. PR #198 is merged. Its merged head passed CI/Quality, Browser E2E and Full Flight Test. Do not repeat source-release work; begin verified staging preparation.
2. Owner/admin verifies active branch rulesets, default branch and private-host permissions. Keep client-main as integration and main read-only; this PR does not alter settings or reconcile branches.
3. Verify isolated staging resource IDs and protected staging Environment; run validate-only, then owner-authorized deploy-and-uat or uat-only from client-main using exact STAGING-ONLY confirmation and explicit write consent.
4. Perform live role/receipt tests; verify a real backup and receipt manifest and restore to a separate recovery Sheet/folder; complete device/offline/print/accessibility checks.
5. Record written customer acceptance and begin the 14-day controlled pilot only when all launch gates pass.

## Release boundary and safeguards

- PaymentMethod/vendor-default migrations must be reviewed against the real schema and run only on a verified, backed-up staging target under owner authorization. Preserve historical blanks; never infer historical PaymentMethod from CashImpact.
- Cash impacts the physical drawer; UPI/Bank does not. A payment at or above ₹10,000 requires independent approval; the creator cannot self-approve.
- Do not run setup against a populated or production target. Do not guess IDs, expose credentials, overwrite the only backup or deploy to production from this PR.
- Current staging audit instructions must agree with the workflow: the supported integration branch and staging Environment restriction are client-main, not main.

## Canonical decision documents

- docs/CEO-BOARD-STRATEGY.md — product thesis, commercial direction and deferred work.
- docs/EXECUTION-PLAN-2026-10-21.md — release gates, staging/UAT, backup/restore, pilot and priority queue.
- docs/CLIENT-MAIN-ENGINEERING-STRATEGY-2026-10-21.md — branch, quality, staging and merge controls.
- docs/STAGING-RELEASE-AUDIT.md — operational proof required before staging and customer launch.

No production configuration or live Google resource is changed by this handoff.
