# Cash Voucher — Execution Plan

**Date:** 21 October 2026  
**Integration branch:** client-main  
**Reviewed baseline:** d5ed3e77387d0f1896c97dbaac793ed23b17eb32, post-PR #197  
**Release state:** live staging and first-customer acceptance remain unverified.

## Executive decision

Do not start a broad feature sprint. Run a coherent release-readiness batch that aligns branch policy, manual staging controls, source baseline and release evidence. Pass live staging and recovery gates before starting the pilot. This plan does not authorize production changes.

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


## Branch and source controls

- All product PRs target client-main from short-lived client/* branches.
- Require CI, Browser E2E and Full Flight Test on the exact final PR head; fix failures instead of bypassing checks.
- Keep main legacy/read-only. The 21 October comparison showed client-main 13 commits ahead and 2 behind main, with merge base acebc6b63010a92e136200321fc77c03dac9a3be. Do not merge, rebase or force-push long-lived branches as part of this work.
- Owner/admin must verify active GitHub rulesets, required checks, default branch and the restrictions on main. Available repository metadata did not prove ruleset enforcement.
- Keep repository branch policy separate from staging/production deployment authorization.

**Exit:** branch and exact-head check behavior is verified; any remaining owner-side settings tasks are recorded.

## Phase B — release-readiness implementation PR (completed: PR #198 merged)

1. Add the CEO/board strategy, dated execution plan and dedicated client-main engineering strategy.
2. Update handoff to post-PR #197 and distinguish source checks from live release proof.
3. Correct the staging audit: protected staging Environment and guarded deploy/UAT are for client-main, not main.
4. Rename the misleading workflow guard label from “Require main” to “Require client-main”.
5. Add regression checks for agreement among the workflow, branch policy, current strategy and staging audit.
6. Keep live Apps Script migrations, resource creation, static hosting/DNS and production deployment outside this PR.

**Completed:** PR #198 merged to client-main at acc93eb68cec21b1c0510c31fc5f4c82c5481e1d; CI/Quality, Browser E2E and Full Flight Test all passed on that merged head. This does not complete live staging or authorize production.

## Phase C — staging and recovery (current execution phase)

1. Verify dedicated staging Script project, Spreadsheet, receipt and backup folders, Web App deployment/URL and unique browser origin. Record identities privately and confirm no staging/production overlap.
2. Verify the private repository's static-host integration still has access. Independently verify that a generated staging ZIP points to the intended staging /exec endpoint.
3. Verify the GitHub Environment named staging, its client-main deployment restriction and required variables/secrets. Never expose values in Git or logs.
4. Run validate-only first. After owner review and approval, run deploy-and-uat from client-main with exact STAGING-ONLY confirmation and explicit staging-write consent; or uat-only against a known deployed staging version.
5. Inspect sanitized logs, target identity, real role/API behavior and the synthetic transaction/cancellation audit trace.
6. Create a real staging backup; verify its Sheet snapshot, receipt files and manifest; restore into a separate recovery Sheet/folder and reconcile headers, row counts, voucher numbering, settings/users and receipts.

**Exit:** successful exact-run live UAT, identity evidence, live role/receipt tests and witnessed isolated restore. CI alone does not satisfy this gate.

## Phase D — device and usability gate

Test real customer devices for installation/update, narrow and desktop layout, save confirmation, receipt capture, offline state, reconnection, idempotent sync, queue export/recovery, print/PDF/A5, keyboard focus, zoom/reflow and assistive technology. Check every operating device; one browser cannot prove all offline queues are synchronized. Involve an owner/manager, not engineers only.

**Exit:** device/browser matrix, repeatable evidence, critical defects resolved and recovery demonstrated.

## Phase E — design-partner pilot

Start only after prior gates pass and the customer instance is accepted. Document scope, fees, support hours, data ownership, export/exit, known limitations, fallback, escalation and acceptance. Do not share broad Google/hosting credentials.

Run a 14-day controlled pilot with named owner and manager. Record daily movement reconciliation; physical drawer count and variance; Cash vs UPI/Bank; approvals/close status; offline queues across all devices; backup state; incidents/missing receipts; recovery time; and owner/manager sign-off.

Stop on missing/duplicate vouchers, unexplained variance, missing receipts, unauthorized access, failed backup, target mismatch or unrecoverable offline entries.

## Phase F — next product batch after pilot evidence only

Consider one integrated **Today → Close → Owner card** workflow: Today prioritizes actions/exceptions; Close guides sync, pending approvals, physical drawer and classification; Owner card separates cash and non-cash movements and shows verifiable exception/sync/backup state. Define the target task, baseline and outcome metric before building. If pilot data shows another bottleneck, work on that instead.

## Priority queue

- **P0 — Current six-step staging release.** Owner: operator + repository/account owner. Acceptance: isolated staging identity; verified pre-migration backup; schema-reviewed required migrations; backend-first deploy; staging static frontend and live UAT; live operational checks and isolated restore.
- **P0 — Branch rulesets/default branch.** Owner: repository owner/admin. Acceptance: actual GitHub Settings state recorded.
- **P1 — Controlled 14-day pilot.** Owner: product owner + customer. Acceptance: written acceptance, fallback/support terms and daily operating evidence.
- **P2 — Next product batch.** Owner: product/engineering. Acceptance: observed pilot bottleneck and success metric.
- **P2 — Durable audit-failure fallback.** Owner: security/backend. Acceptance: failure/retention/access decision.
- **P2 — Accountant mapping.** Owner: customer/accountant. Acceptance: chosen software/version and anonymized fixture.
- **P2 — Database/multi-tenant architecture.** Owner: founder/architecture. Acceptance: measured scaling trigger and migration business case.
## Non-goals and stop conditions

No production migration/deployment, blind branch synchronization, multi-tenant rewrite, AI dependency, autonomous posting, outbound WhatsApp campaign, unvalidated tax/ledger claim or mandatory denomination schema change. Staging is unverified until live UAT, backup and isolated restore are evidenced. Customer handover is blocked until access, device, data ownership and acceptance gates pass.
