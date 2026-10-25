# Cash Voucher — Execution Plan

**Updated:** 25 October 2026 23:56 IST (PR #214 is the sole open PR; operational release remains gated; pre-sync snapshot)  
**Integration branch:** client-main  
**Current source baseline for release follow-up:** e97c4e080b3f6903e16ef77f571822f9844faeed (PR #213 merge)  
**Release state:** PRs #205–#213 are merged at `client-main` SHA `e97c4e080b3f6903e16ef77f571822f9844faeed`. PR #214 is the only open PR targeting `client-main`; the last code-validated pre-sync head was `df9d2a01adae93e305c530eae1635079137adcd6`, on which CI / Quality, Browser E2E, Full Flight Test and read-only monitor observation passed. This documentation synchronization creates a new PR head; prior runs are not evidence for it. Repository `allow_auto_merge=true`, but PR-level auto-merge is blocked until owner/admin corrects `client-main` governance and the intended human review is recorded. Live staging, backup/restore and first-customer acceptance remain unverified. See [P0 Release Batch B1–B3](P0-RELEASE-BATCH-B1-B3.md) and [Staging Release Audit](STAGING-RELEASE-AUDIT.md).

## Current checkpoint — 25 October 2026 23:56 IST (pre-sync evidence snapshot)

- **Current integration baseline:** `e97c4e080b3f6903e16ef77f571822f9844faeed`, with latest recorded integration evidence at [CI / Quality #40206481359](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40206481359), [Browser E2E #40206481344](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40206481344), [Full Flight Test #40206481349](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40206481349), and monitor #40206481372. The monitor run captured an intermediate snapshot before source checks completed; do not treat that checkpoint as finalized.
- **Active PR #214:** base `client-main` at `e97c4e080b3f6903e16ef77f571822f9844faeed`; the last code-validated pre-sync head was `df9d2a01adae93e305c530eae1635079137adcd6`. This documentation synchronization advances the head, so read live PR metadata for the current SHA and comparison. GitHub previously reported the PR open, non-draft and mergeable; no review was submitted and PR-level auto-merge was not requested.
- **Pre-sync exact-head checks:** On source head `df9d2a01adae93e305c530eae1635079137adcd6`, [CI / Quality #40217235001](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40217235001) passed (298 backend checks); [Browser E2E #40217234948](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40217234948) passed (975 checks, 0 failures); [Full Flight Test #40217234947](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40217234947) passed the same-head CI/E2E gate; [Autonomous Development Monitor #40217235113](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40217235113) passed read-only observation. Expected PR-event skips were not failures. This documentation-only synchronization creates a new PR head; these prior runs do not validate that head. Read the live PR description and exact-head runs for final post-sync conclusions.
- **Governance:** repository metadata confirms `allow_auto_merge=true`. Live ruleset #24624368 includes only `~DEFAULT_BRANCH` (`main`), requires only `quality`, and sets required approvals to zero; the `client-main` branch API reports `protected=false`. The classic branch-protection endpoint returned 403 `Resource not accessible by integration`. Owner/admin must extend the active ruleset to `client-main`, require CI / Quality, Browser E2E, Full Flight Test and human approval, and verify the saved settings before PR-level auto-merge can be considered.
- **Operational release:** staging UAT #39596101014 remains failed at isolated deployment-configuration validation; deployment and live UAT were skipped. ZIP #39988800756 was built from stale SHA `aa37d94819e59a72c797ba36839aa8f8ec94008f`, expires 26 October 2026 at 22:11 IST, and must not be deployed. The live GitHub releases endpoint returned an empty list at 25 October 2026 23:56 IST. Staging identity, guarded UAT, separate-target restore, device/offline/print/accessibility and customer acceptance remain open.

## Executive decision

Do not start a broad feature sprint. Run a coherent release-readiness batch that aligns branch policy, manual staging controls, source baseline and release evidence. Pass live staging and recovery gates before starting the pilot. This plan does not authorize production changes.

## Immediate pipeline — preserve this order

PRs #209–#213 are merged to `client-main` at `e97c4e080b3f6903e16ef77f571822f9844faeed`. PR #214 is the sole open PR and fixes monitor checkpoint finalization. Its exact-head CI / Quality, Browser E2E and Full Flight Test checks passed, but no review is submitted and branch governance remains unresolved. Do not open another PR until #214 is merged or closed. Then continue owner-led governance and operational release evidence; do not start another feature sprint. The integrated operator checklist is [P0 Release Batch B1–B3](P0-RELEASE-BATCH-B1-B3.md), with the current state in [Staging Release Audit](STAGING-RELEASE-AUDIT.md).

### 1. Complete the source release

- PRs #205–#213 are merged to `client-main`; current integration SHA is `e97c4e080b3f6903e16ef77f571822f9844faeed`. PR #214 remains the sole open source PR; its exact-head source checks passed, but it still needs human review and verified branch protection.
- PR #211's exact-head checks passed on `f018a958fa86c7ffe4ef8baa799ddd62c1bfb0d2`: [CI/Quality](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40162435222), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40162435213), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40162435233). The resulting integration SHA `3ad2c8f955b36de00b208ee4283682a1a34805eb` also passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40166966112), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40166966123), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40166966102).
- Green source checks do not prove live deployment or recovery.

### 2. Prepare and identify staging

- Verify the staging Script, Sheet, receipt/backup folders, existing Web App deployment and `/exec` URL.
- Confirm private-host access and a staging ZIP with the verified API URL and `CV_ENVIRONMENT=staging`.
- Record staging IDs privately; prove none overlap production. Verify the protected `staging` Environment and `client-main` restriction.

### 3. Back up, then migrate staging

- Back up the confirmed staging Sheet and receipts; inspect the snapshot and manifest.
- Inspect Vouchers/Vendors headers and row counts. With owner approval, run only required `migrateVoucherPaymentMethodField()` and `migrateVendorDefaultsSchema()`.
- Preserve historical `PaymentMethod` blanks. Stop on unexpected headers or occupied columns. Never infer old methods, overwrite unknown data or migrate production.
- Verify Vouchers W, Vendors H:I, row counts and historic values.

### 4. Deploy backend first and run staging UAT

- Upload reviewed backend source to the verified staging Script and update its existing deployment; verify ID and URL.
- Then publish the static frontend with the verified API URL and `CV_ENVIRONMENT=staging`.
- Dispatch the manual [Staging UAT workflow](https://github.com/tchouhanjsm/cash-voucher/blob/client-main/.github/workflows/staging-uat.yml) from `client-main`. Run `validate-only` first. Writes require exact `STAGING-ONLY` and explicit staging-write consent.
- Preserve sanitized logs and exact-run evidence. Mock E2E is not live UAT.

### 5. Prove operational readiness

On the deployed staging instance and intended devices, verify:

- Owner/Manager/Staff authorization and denied API actions.
- Payments, receipts, Cash vs UPI/Bank, payee defaults and duplicate warnings.
- Independent approval, cash close, offline queue/reconnect/recovery.
- Print/PDF/A5, responsive layout, keyboard, zoom/reflow and assistive technology.
- Back up the migrated staging instance and restore to a **separate recovery Sheet/folder**. Reconcile headers, counts, voucher numbering, users/settings and receipts.

### 6. Controlled 14-day hotel pilot

Only after steps 2–5 pass, document acceptance, fallback and support boundaries. Track daily reconciliation, cash variance, Cash vs UPI/Bank, each-device offline queues, backup freshness, incidents/recovery and owner/manager sign-off. Pause for missing/duplicate vouchers, unexplained variance, missing receipts, failed backup, unauthorized access, target mismatch or unrecoverable offline entries. Production stays separately gated.

**Exit rule:** source checks do not complete operational gates. Do not start the next feature batch until pilot evidence identifies a bottleneck.

## Branch and source controls

- All product PRs target client-main from short-lived client/* branches.
- Require CI, Browser E2E and Full Flight Test on the exact final PR head; fix failures instead of bypassing checks.
- Keep main legacy/read-only. A historical 21 October comparison showed client-main 13 commits ahead and 2 behind main, with merge base acebc6b63010a92e136200321fc77c03dac9a3be. Recheck the live relationship before branch operations; do not merge, rebase or force-push long-lived branches as part of this work.
- Last recorded governance evidence: `client-main` reports `protected=false`; live ruleset `cash-voucher-rule` #24624368 targets only `~DEFAULT_BRANCH` (`main`), requires only `quality`, and requires zero approving reviews. The classic branch-protection endpoint returned 403 `Resource not accessible by integration`; owner/admin must extend ruleset coverage to `client-main` and record the resulting Settings state. This plan does not change repository settings.
- Keep repository branch policy separate from staging/production deployment authorization.
- Never dispatch deploy/UAT from `main`; dispatch it only from `client-main`.

**Exit:** branch and exact-head check behavior is verified; any remaining owner-side settings tasks are recorded.

## Source release status

PR #211 support-report concurrency hardening, PR #210 monitor changes and PR #213 checkpoint documentation are merged. Current `client-main` is `e97c4e080b3f6903e16ef77f571822f9844faeed`. PR #214 is the only open PR; its current exact-head checks are green, but human review and verified `client-main` protections remain required. Repository auto-merge is enabled. Source readiness does not complete operational gates; live staging, isolated restore, device acceptance and customer acceptance remain unverified.

## Phase D — device and usability gate

Test real customer devices for installation/update, narrow and desktop layout, save confirmation, receipt capture, offline state, reconnection, idempotent sync, queue export/recovery, print/PDF/A5, keyboard focus, zoom/reflow and assistive technology. Check every operating device; one browser cannot prove all offline queues are synchronized. Involve an owner/manager, not engineers only.

**Exit:** device/browser matrix, repeatable evidence, critical defects resolved and recovery demonstrated.

## Phase E — design-partner pilot

Start only after prior gates pass and the customer instance is accepted. Document scope, fees, support hours, data ownership, export/exit, known limitations, fallback, escalation and acceptance. Do not share broad Google/hosting credentials.

Run a 14-day controlled pilot with named owner and manager. Record daily movement reconciliation; physical drawer count and variance; Cash vs UPI/Bank; approvals/close status; offline queues across all devices; backup state; incidents/missing receipts; recovery time; and owner/manager sign-off.

Stop on missing/duplicate vouchers, unexplained variance, missing receipts, unauthorized access, failed backup, target mismatch or unrecoverable offline entries.

## Phase F — next product batch after evidence

Consider one integrated **Today → Close → Owner card** workflow: Today prioritizes actions/exceptions; Close guides sync, pending approvals, physical drawer and classification; Owner card separates cash and non-cash movements and shows verifiable exception/sync/backup state. Define the target task, baseline and outcome metric before building. If pilot data shows another bottleneck, work on that instead.

## Priority queue

- **P0 — Release-readiness PR.** Owner: engineering/reviewer. Acceptance: exact-head CI, Browser E2E and Flight Test.
- **P0 — Branch rulesets/default branch.** Owner: repository owner/admin. Acceptance: actual GitHub Settings state recorded.
- **P0 — Staging identity and UAT.** Owner: operator + owner. Acceptance: isolated resource register and exact workflow run.
- **P0 — Backup and restore.** Owner: owner/operator. Acceptance: restore into a separate target with reconciliation.
- **P0 — Device/offline/print/accessibility.** Owner: QA + customer operator. Acceptance: device matrix and critical issues closed.
- **P1 — Controlled pilot.** Owner: product owner + customer. Acceptance: written acceptance and 14-day evidence.
- **P1 — Next product batch.** Owner: product/engineering. Acceptance: observed problem, baseline and success metric.
- **P2 — Durable audit-failure fallback.** Owner: security/backend. Acceptance: failure/retention/access decision.
- **P2 — Accountant mapping.** Owner: customer/accountant. Acceptance: chosen software/version and anonymized fixture.
- **P2 — Database/multi-tenant architecture.** Owner: founder/architecture. Acceptance: measured scaling trigger and migration business case.

## Non-goals and stop conditions

No production migration/deployment, blind branch synchronization, multi-tenant rewrite, AI dependency, autonomous posting, outbound WhatsApp campaign, unvalidated tax/ledger claim or mandatory denomination schema change. Staging is unverified until live UAT, backup and isolated restore are evidenced. Customer handover is blocked until access, device, data ownership and acceptance gates pass.

## Autonomous delivery monitoring

PR #210's checkpoint-based monitoring workflow merged into `client-main` at `f9188ede9dd83f5e12c563bfa5b8f3082c0765b8` after exact-head validation and owner merge. The workflow is now integrated; its event-only behavior remains as documented below. The ChatGPT monitor runs hourly because a 45-minute cadence is unsupported. The GitHub Actions workflow is event-driven only: pushes to `client-main` run the trusted checkpoint/recovery job, while PRs targeting `client-main` run read-only observation. GitHub requires `workflow_dispatch` workflows to exist on the default branch; this workflow is not on default branch `main`, which remains frozen, so manual dispatch is not available. Do not add a cron schedule to `client-main` or modify `main` merely to advertise an unavailable trigger.

The monitor may observe CI, Browser E2E, Full Flight Test, PR reviews/checks, staging/ZIP runs and release-gate notes; it may retry only timed-out source-validation runs after exact-SHA checks and within a three-attempt ceiling. It never auto-merges, publishes static ZIPs, pushes Clasp, deploys Apps Script, runs transactional staging UAT, performs migrations or changes production. GitHub checkpoint history is persistent run evidence; docs/HANDOFF.md remains the engineering session handoff.

## Deep-dive follow-up defects

- backend/90-support.gs supportRateAllowed_ uses a non-atomic cache read/increment/write, so concurrent requests can exceed intended rate limits. Fix separately with concurrency/failure tests.
- Audit health: PR #209 is merged. Its mixed-store fail-closed behavior for malformed persisted counters/timestamps is integrated into `client-main`; historical PR-head checks passed before merge. Live Google Sheets/Drive behavior still requires guarded staging UAT.
