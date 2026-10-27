# Cash Voucher — Execution Plan

**Updated:** 27 October 2026 (read-only staging configuration readiness phase)
**Integration branch:** `client-main`; `main` remains legacy/read-only.
**Current integration SHA:** `1dba1b008eb2303ffddf069285fbb22efc76a8cb` (PR #240 merged; the current release remains blocked).
**Historical PR #227 baseline:** `524a5280c9a1aa49eccb2f3ee6f5f8f75ca73a8b`.
**Current source batch:** `client/staging-config-preflight-20261027`; extend the staging preflight with a read-only readiness mode and sanitized evidence. No live operation is performed.
**Historical follow-up:** PR #229, `client/fix-business-date-arithmetic-20261027`, merged at 03:18:35Z; its exact-head source checks were red.

## Current release-session checkpoint — 27 October 2026

- **Integration baseline:** `client-main` at `1dba1b008eb2303ffddf069285fbb22efc76a8cb` after PR #240 merged. Legacy `main` remains read-only.
- **Selected bulk phase:** `client/staging-config-preflight-20261027`. Add a read-only `readiness` mode to the staging preflight and invoke it from `validate-only` through the protected GitHub `staging` Environment.
- **Preflight coverage:** staging and production resource inventory, endpoint/deployment consistency, distinct owner/manager UAT credentials, and Clasp legacy/3.x credential shape. The `STAGING-ONLY` confirmation remains mandatory for actual deploy/UAT paths; readiness mode does not deploy or write.
- **Evidence boundary:** the evidence report carries only the source/run reference, category states and sanitized blocker messages. It excludes raw resource identifiers, endpoint URLs, email/passwords and credential JSON. It explicitly states that remote connectivity, independent ownership, deployment and restore were not verified.
- **Workflow isolation:** the readiness job runs only from `client-main` in the protected GitHub `staging` Environment. Secrets are scoped to the one validation step; checkout, Node setup and artifact upload do not receive them. No dependency install runs in that secret-bearing step, and the evidence remains configuration-only—not proof of connectivity, resource ownership or restore.
- **Required checks:** CI / Quality, Browser E2E and Full Flight Test must all pass on the same final PR head. No live Environment run is performed by source validation itself.
- **Still blocked:** staging secrets must be privately populated and owner-verified, the read-only workflow must run against the intended protected Environment, then separately authorized live UAT and an isolated restore/reconciliation are required. Governance and device/customer acceptance gates remain open.
- **Scope boundary:** no Clasp push, Apps Script deployment, migration, Sheets/Drive mutation, write-capable UAT, cPanel publication, release publication or production operation.

## Current live checkpoint — 27 October 2026 17:59 IST

- **Authoritative integration:** `client-main` at `ba56028c4eba2ea499c988fe03866a592005f12c`; `main` remains legacy/read-only and must not be changed.
- **Current bulk phase:** the shared backend marker contract is consumed by both `backupStatus` and onboarding; both Settings and launch UI now surface actionable validity, freshness and chronology signals. The onboarding page highlights the next required action, serializes mutation controls and reconciles authoritative state after failed confirmation/advancement.
- **Required validation:** CI / Quality, Browser E2E and Full Flight Test must pass on one identical final PR SHA. Source checks are not evidence of live resource identity, actual backup/restore or customer acceptance.
- **Release remains blocked:** `client-main` protection/human review, isolated staging credentials/resources, guarded staging UAT, live permission testing, isolated restore, host headers, device/offline recovery, printing, accessibility and customer acceptance still require separate owner/operator action.
- **No operational actions:** this phase performs no Clasp push, deployment, migration, live Sheet/Drive mutation, staging write-capable UAT or production change.

## Historical checkpoint — 27 October 2026 09:59 IST (superseded by PR #232)

- **Authoritative integration:** `client-main` at `f1041a177b292468dca59cf1c68d2bdcf2a5c192`; legacy `main` remains read-only at `b4fa94405c0e6a7393c36f43e168f8b54c99c408`.
- **PR queue:** PRs #220–#230 are merged. PR #231 (`fa73c17dc96615dc106290232d05516941996b34`) is closed without merge and was superseded by PR #230. The live open-PR query returned zero.
- **Exact integration-head checks:** CI / Quality [#40445374416](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40445374416) PASS (304 backend checks); Browser E2E [#40445374459](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40445374459) PASS (992 checks, 0 failures); Full Flight Test [#40445374394](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40445374394) PASS on the same SHA; Autonomous Development Monitor [#40445374437](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40445374437) PASS and persisted Issue #212. The optional manual-full-flight and browser-diagnostics jobs were skipped by workflow conditions, not required-gate failures.
- **Review/governance:** PR #230 merged without a submitted review; PR #231 was closed unmerged without review. Repository auto-merge is enabled but no PR-level auto-merge is requested. Ruleset [#24624368](https://github.com/tchouhanjsm/cash-voucher/rules/24624368) targets `main` only, requires only `quality`, and requires zero approvals. `client-main` reports `protected=false`; classic branch-protection read returned HTTP 403. Owner/admin verification and correction remain required.
- **Selected P0 source batch:** `client/p0-write-staging-inventory-20261027`. It requires a complete production Script/Sheet/receipt-folder/backup-folder inventory for write-capable `deploy` and `uat` preflight; the owner attestation remains available only for non-mutating artifact builds. It adds negative tests and reconciles staging runbook instructions. This is source-only and does not populate secrets or execute staging operations.
- **Staging/recovery:** latest recorded staging UAT [#39596101014](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39596101014) failed preflight because required resource references were absent and Clasp credentials were missing/rejected. Do not retry unchanged configuration. Client ZIP [#39988800756](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39988800756) used stale SHA `aa37d94819e59a72c797ba36839aa8f8ec94008f` and is expired; the releases endpoint is empty.
- **Still unverified:** live staging identity/version, guarded live UAT, real backup/restore to a separate destination, actual host security headers, live role/receipt authorization, offline/reconnect on intended devices, print/PDF, assistive-technology/accessibility and customer acceptance. No deployment, migration, Sheets/Drive mutation, write-capable UAT, cPanel publication or production operation is authorized by this source batch.
- **Security follow-up:** reassess the temporary Clasp/Zod advisory exception by **9 November 2026**.

## Historical checkpoint — PR #229 integration audit (superseded 27 October 2026 09:59 IST)

- **Integration baseline:** `client-main` `2b7fec463575f235373f01d2d97eddbb6ecea6fa`. PRs #220–#229 are merged; the live open-PR query returned zero before this source batch was selected. The legacy `main` branch remains read-only.
- **PR #229 merge:** `fix: make business-date windows timezone independent` merged at 03:18:35Z into the current integration SHA. No review was submitted. Its current integration-head source checks are red; merge history is not release approval.
- **Exact-head CI / Quality:** [run #40443448972](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40443448972) failed at `test/test-service-worker-policy.js:139`: the test hard-codes `cv2-v31` while `sw.js` declares `cv2-v32`. The quality run reached the regression suite; this is a stale cache-version fixture, not a backend assertion failure.
- **Exact-head Browser E2E:** [run #40443449053](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40443449053) reported 991 checks passed and 1 failed. The failing check, “invalid date range marks both fields and programmatically links them to one alert,” expected `Choose a valid date range` while the current UI renders `Choose real calendar dates with From on or before To.`
- **Exact-head Full Flight Test:** [run #40443449098](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40443449098) failed because both exact-SHA CI and Browser E2E prerequisites failed. The separate manual job was skipped by the push-event condition.
- **Autonomous Development Monitor:** [run #40443449014](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40443449014) completed successfully and persisted a finalized checkpoint to [Issue #212](https://github.com/tchouhanjsm/cash-voucher/issues/212); artifact [12707118240](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40443449014/artifacts/12707118240) is the monitor report. The checkpoint correctly records all three source gates as failed.
- **Selected source batch:** `client/restore-green-source-gates-20261027`. It makes the PWA cache-policy test derive current/previous shell-cache names from `sw.js`, explicitly checks that offline queue/auth/recovery modules are precached, and aligns the Reports date-range E2E assertion with the actual validation copy. It also updates the readiness-document contract and release checkpoint wording. This is source/test validation only; the date-copy correction changes no application behavior.
- **Governance:** ruleset [#24624368](https://github.com/tchouhanjsm/cash-voucher/rules/24624368) targets `main` only, requires `quality` only and zero approvals. The live `client-main` branch API reports `protected=false`; classic branch-protection details remain unavailable to this integration. Owner/admin must configure and verify the intended protection and approval policy.
- **Staging and release:** staging UAT [#39596101014](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39596101014) failed isolation preflight due to missing production resource references and missing/rejected Clasp credentials; deployment and live UAT were skipped. ZIP [#39988800756](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39988800756) was built from stale SHA `aa37d94819e59a72c797ba36839aa8f8ec94008f` and is expired. The live releases endpoint is empty.
- **Still unverified:** live staging identity/version, actual host security headers, live role/receipt authorization, real backup/restore to a separate destination, offline/reconnect on intended devices, print/PDF, accessibility and customer acceptance. No deployment, migration, Google Sheets/Drive mutation, write-capable UAT, cPanel publication or production operation is authorized by this batch.

## Historical gate evidence — PR #229 pre-merge snapshot

- **Historical PR #227 baseline — CI / Quality:** [run #40373320173](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40373320173) failed on the current SHA at `prettier --check .` for `test/test-staging-workflow.js`. The source quality gate stopped at formatting; this is a deterministic formatting regression, not evidence of a backend assertion failure.
- **Historical PR #227 baseline — Browser E2E:** [run #40373320581](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40373320581) passed on the exact current SHA.
- **Historical PR #227 baseline — Full Flight Test:** [run #40373320448](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40373320448) failed after a GitHub Actions API HTTP 502 when querying E2E workflow runs. The query has no transient retry today; CI was also red. PR #228 integrated the at-most-two retries for HTTP 500/502/503/504 and preserves immediate failure for other statuses.
- **Historical PR #227 baseline — Autonomous Development Monitor:** [run #40373320213](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40373320213) completed but warned that its three-minute finalization window expired before every required workflow completed. The checkpoint is explicitly non-passing for missing/non-terminal checks; artifact `12672174746` is available.
- **Acceptance criteria:** formatting check passes; the workflow regression test enforces the retry allowlist and two-retry ceiling; CI / Quality, Browser E2E and Full Flight Test pass on the same exact final PR head; monitor evidence does not mark missing checks as passed.
- **Operational priority remains P0:** staging isolation source guards and backup-manifest validation are merged (#224 and #226); Asia/Kolkata business-date handling is merged (#227). Live staging identity, real backup/restore, role/receipt authorization, offline/reconnect and intended-device/customer acceptance are still unverified and cannot be substituted by this source batch.
- **Governance:** ruleset #24624368 covers `main` only, requires `quality` only and zero approvals; `client-main` reports `protected=false`. Owner/admin must configure and verify the intended protection and review requirements. This batch does not change settings.
- **Staging:** UAT [#39596101014](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39596101014) failed preflight due to missing production references and rejected/missing Clasp credentials. Do not rerun unchanged configuration. ZIP [#39988800756](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39988800756) was built from stale SHA `aa37d94819e59a72c797ba36839aa8f8ec94008f` and has expired; no published release exists.
- **Safety boundary:** source and mock validation only. No deployment, migration, Google resource mutation, cPanel publication or production operation is included.

- **Conflict resolution:** PR #228 advanced `client-main` to `b2a4a45e0f4326a59b51151754691d56476f0b35` after PR #229 was opened from the earlier PR #227 baseline. The conflict-resolution merge must preserve PR #228's updated Full Flight workflow, `test/test-flight-workflow.js`, `package.json` test wiring and formatted staging contract test.
- **Business-date implementation:** PR #229 aligns date-only calendar arithmetic and Dashboard/Reports range validation across the legacy and modular frontend entry paths, increments the service-worker cache version, and adds timezone, India-midnight, leap-day and year-boundary regression coverage.
- **Prior PR #229 head evidence:** CI / Quality [#40379591148](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40379591148), Browser E2E [#40379591102](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40379591102), and Full Flight Test [#40379591096](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40379591096) failed on superseded SHA `c71e233e11eec5b6d2b2d37be27216a80a170f7e`; monitor [#40379591122](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40379591122) passed. These results do not validate the merge-resolution head; all exact-head checks must rerun.

---

## Historical execution-plan snapshot — 25 October 2026

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
