# Cash Voucher — Execution Plan

**Date:** 21 October 2026  
**Integration branch:** client-main  
**Reviewed baseline:** d5ed3e77387d0f1896c97dbaac793ed23b17eb32, post-PR #197  
**Release state:** live staging and first-customer acceptance remain unverified.

## Executive decision

Do not start a broad feature sprint. Run a coherent release-readiness batch that aligns branch policy, manual staging controls, source baseline and release evidence. Pass live staging and recovery gates before starting the pilot. This plan does not authorize production changes.

## Immediate pipeline — preserve this order

**This is the active work queue.** PR #197 and PR #198 are merged. The next task is the staging release, not another feature sprint.

### 1. Complete the source release

- PR #197 and PR #198 are merged to `client-main`.
- The merged PR #198 head `acc93eb68cec21b1c0510c31fc5f4c82c5481e1d` passed CI/Quality, Browser E2E and Full Flight Test.
- These checks prove source quality, not live deployment or data recovery.

### 2. Prepare and identify staging

- Verify the dedicated staging Script, Sheet, receipt/backup folders, existing Web App deployment and `/exec` URL.
- Confirm static-host access and a staging ZIP configured with the verified API URL and `CV_ENVIRONMENT=staging`.
- Record resource identities privately. Prove staging IDs do not overlap production.
- Verify the protected GitHub `staging` Environment, config/secrets and the `client-main` restriction. Stop if target identity is uncertain.

### 3. Back up, then migrate staging

- Back up the confirmed staging Sheet and receipts; inspect the snapshot and manifest first.
- Inspect live Vouchers/Vendors headers and row counts. With explicit owner approval, run only migrations confirmed necessary: `migrateVoucherPaymentMethodField()` and `migrateVendorDefaultsSchema()`.
- Preserve historical `PaymentMethod` blanks. Stop on unexpected headers or occupied target columns. Never infer historic methods or overwrite unknown data.
- Verify Vouchers W, Vendors H:I, row counts and unchanged historic values. Do not migrate production.

### 4. Deploy backend first and run staging UAT

- Upload reviewed backend source to the verified staging Script and update its existing Web App deployment; verify ID and URL.
- Then build/publish the static frontend with the verified staging API URL and `CV_ENVIRONMENT=staging`.
- Dispatch the manual [Staging UAT workflow](https://github.com/tchouhanjsm/cash-voucher/blob/client-main/.github/workflows/staging-uat.yml) from `client-main`. Run `validate-only` first; any write-capable run requires exact `STAGING-ONLY` confirmation and explicit staging-write consent.
- Keep sanitized logs and exact-run evidence. Mock E2E is not live UAT.

### 5. Prove operational readiness

Verify on the deployed staging instance and intended devices:
- Owner/Manager/Staff authorization, password flows and denied API actions.
- Payments, receipts, Cash versus UPI/Bank, saved-payee defaults and duplicate warnings.
- Independent approval, cash-close controls, offline queue/reconnect/recovery.
- Print/PDF/A5, responsive layout, keyboard focus, zoom/reflow and assistive technology.
- Backup the migrated staging instance and restore into a **separate recovery Sheet/folder**. Reconcile headers, counts, voucher numbering, users/settings and receipt mapping.

### 6. Controlled 14-day hotel pilot

Only after steps 2–5 pass, document customer acceptance, fallback and support boundaries. Track daily reconciliation, physical-cash variance, Cash vs UPI/Bank, every-device offline queues, backup freshness, incidents/recovery and owner/manager sign-off. Pause for missing/duplicate vouchers, unexplained variance, missing receipts, failed backup, unauthorized access, target mismatch or unrecoverable offline entries. Production remains separately gated.

**Exit rule:** source checks do not complete operational gates. Do not start the next feature batch until pilot evidence identifies a real bottleneck.


## Branch and source controls

- All product PRs target client-main from short-lived client/* branches.
- Require CI, Browser E2E and Full Flight Test on the exact final PR head; fix failures instead of bypassing checks.
- Keep main legacy/read-only. The 21 October comparison showed client-main 13 commits ahead and 2 behind main, with merge base acebc6b63010a92e136200321fc77c03dac9a3be. Do not merge, rebase or force-push long-lived branches as part of this work.
- Owner/admin must verify active GitHub rulesets, required checks, default branch and the restrictions on main. Available repository metadata did not prove ruleset enforcement.
- Keep repository branch policy separate from staging/production deployment authorization.

**Exit:** branch and exact-head check behavior is verified; any remaining owner-side settings tasks are recorded.

## Branch governance verification

- All product PRs target client-main from short-lived client/* branches.
- Require CI, Browser E2E and Full Flight Test on the exact final PR head; fix failures instead of bypassing checks.
- Keep main legacy/read-only. The 21 October comparison showed client-main 13 commits ahead and 2 behind main, with merge base acebc6b63010a92e136200321fc77c03dac9a3be. Do not merge, rebase or force-push long-lived branches as part of this work.
- Owner/admin must verify active GitHub rulesets, required checks, default branch and the restrictions on main. Available repository metadata did not prove ruleset enforcement.
- Keep repository branch policy separate from staging/production deployment authorization.

**Exit:** branch and exact-head check behavior is verified; any remaining owner-side settings tasks are recorded.

## Stage execution detail — staging and recovery

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
