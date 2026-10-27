# P0 Release Batch — B1, B2 and B3

**Integration target:** `client-main`  
**Original design baseline for B1–B3:** PR #204 merge `aa37d94819e59a72c797ba36839aa8f8ec94008f`  
**Updated:** 27 October 2026 11:02 IST (P0 recovery drill evidence contract)
**Current integration baseline:** `2b8120789811f27410f0542c29c7436fcc5f190c` (PR #232 merged; exact-head source gates pass; operational release gates remain blocked).
**Purpose:** complete release readiness across staging identity, schema/recovery safety, authorization, offline/sync and device/customer acceptance. This is a checklist, not proof that an external operation ran.

## Current live checkpoint — 27 October 2026 11:02 IST

- **Authoritative integration:** `client-main` at `2b8120789811f27410f0542c29c7436fcc5f190c`; legacy `main` remains read-only by engineering policy at `b4fa94405c0e6a7393c36f43e168f8b54c99c408` (GitHub reports `main` protected and `client-main` unprotected).
- **PR queue at batch selection:** PRs #220–#230 and #232 are merged; PR #231 is closed without merge. No open PR existed when this batch was selected. PR #232 merged at 05:24:42Z with merge commit `2b8120789811f27410f0542c29c7436fcc5f190c`; its tested head was `9e94e1c8ebf925154a14a757eeb2109605a9884a`. Exact PR-head CI [#40450927644](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40450927644), Browser E2E [#40450927649](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40450927649), Full Flight Test [#40450927659](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40450927659) and monitor [#40450927568](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40450927568) passed. PR #232 has no submitted review.
- **Exact integration-head checks:** CI / Quality [#40455165721](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40455165721) PASS (304 backend checks); Browser E2E [#40455165659](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40455165659) PASS; Full Flight Test [#40455165635](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40455165635) PASS and confirms CI run 2505 and Browser E2E run 2284 both succeeded on the same SHA with zero transient retries; Autonomous Development Monitor [#40455165577](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40455165577) PASS and persisted Issue #212. Final checkpoint artifact: [12711829132](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40455165577/artifacts/12711829132). The optional manual-full-flight job and browser-diagnostics upload were skipped by event conditions.
- **Governance:** repository `allow_auto_merge=true`, but PR-level auto-merge was not requested by this source batch. Ruleset [#24624368](https://github.com/tchouhanjsm/cash-voucher/rules/24624368) targets `main` only, requires only `quality`, and requires zero approvals. The live `client-main` branch API reports `protected=false`; the classic branch-protection read returns HTTP 403 to this integration. Owner/admin correction and verification remain required.
- **Selected recovery batch:** `client/p0-recovery-drill-evidence-20261027`, based on `2b8120789811f27410f0542c29c7436fcc5f190c`. It adds a strict private recovery-drill evidence contract and regression suite for resource-fingerprint separation, snapshot integrity, all seven required tabs and header/row-count reconciliation, voucher-ID/number digests, receipt-manifest/read-back reconciliation, owner approval and unchanged production state. It does not execute a restore, access Google resources, or authenticate evidence claims.
- **Staging/recovery:** the latest recorded staging UAT remains [#39596101014](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39596101014), which failed preflight on `f3b5cf0b6e70f79e33db235b49458350a8e3c175` because production resource references were missing and Clasp credentials were missing/rejected. Deployment and live UAT were skipped; do not retry unchanged configuration. Client ZIP [#39988800756](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39988800756) used stale SHA `aa37d94819e59a72c797ba36839aa8f8ec94008f` and its artifact is expired. The live releases endpoint is empty.
- **Still unverified:** live staging identity/version, guarded live UAT, a real restore into a separate destination, actual host security headers, live role/receipt authorization, offline/reconnect on intended devices, print/PDF, accessibility and customer acceptance. The evidence validator checks completeness/internal consistency only and is not proof of live recovery.
- **Security follow-up:** reassess the temporary Clasp/Zod advisory exception by **9 November 2026**.
- **Release boundary:** source/tests/runbook/checkpoint documentation only. No Clasp push, Apps Script deployment, migration, Sheets/Drive mutation, write-capable UAT, cPanel publication, release publication or production operation was performed.

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

## Historical gate checkpoint — 26 October 2026, 23:59 IST (superseded)

The source isolation boundary from PR #224, backup-manifest integrity from PR #226 and Asia/Kolkata business-date handling from PR #227 are merged. The current integration source gate is not green: CI [#40373320173](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40373320173) failed formatting on `test/test-staging-workflow.js`; Full Flight [#40373320448](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40373320448) hit a GitHub API HTTP 502 and failed. The single source batch repairs the formatting regression and adds a bounded transient-only retry with regression coverage.

Operational release gates remain blocked independently of source validation:

- Owner/admin must configure and verify `client-main` rules requiring CI / Quality, Browser E2E, Full Flight Test and human approval. The active ruleset covers `main` only; `client-main` reports `protected=false`.
- The last staging UAT [#39596101014](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39596101014) failed preflight because production resource references were missing and Clasp credentials were missing/rejected. Do not retry unchanged configuration.
- The last ZIP [#39988800756](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39988800756) used stale SHA `aa37d94819e59a72c797ba36839aa8f8ec94008f`; its artifact has expired. No published release is recorded.
- Live staging identity, actual HTTP security headers, role/receipt authorization, a real restore into a separate recovery target, offline/reconnect, print/PDF, intended-device/accessibility testing and customer sign-off remain unverified. Production remains excluded.

The source batch does not authorize Clasp pushes, Apps Script deployment, migrations, Google Sheets/Drive mutation, write-capable UAT, cPanel publication or production operations.

## Scope

### B1 — staging identity and release proof

- Reverse-sync the approved `client-main` branch to the operator workstation using a clean, fast-forward-only Git pull.
- Validate the supported Node version, locked dependencies, source checks, browser E2E, dependency policy and exact source SHA.
- Verify the local `.clasp.json` identifies the dedicated staging Script project and `rootDir: "backend"`; verify the Script's bound Sheet, Script Properties, receipt folder, backup folder, deployment ID and `/exec` URL in the Apps Script editor.
- Upload backend source only after target confirmation and owner authorization. Update the already verified deployment; do not create a parallel deployment or change the URL silently.
- Dispatch the manual Client staging dist ZIP workflow on `client-main` with client code `cash-voucher`. The workflow reads the endpoint from the `staging` Environment secret and runs artifact-mode target-isolation preflight before packaging; no free-form API URL is accepted.
- Inspect the downloaded artifact's root entries, `config.js`, `release-manifest.json` commit and ZIP integrity. Upload only to the verified staging document root after taking a backup.
- Run the guarded staging UAT workflow only after staging and production resource identity is independently verified.
- Treat a dashboard response of `Unknown action` for `dashboardSummary` as a client/backend contract or target-identity failure: this action is present in the repository route registry, so verify the generated staging `CV_API_URL`, deployment ID and the source version actually deployed in that same Apps Script project. Do not use partial bootstrap data as a financial-total fallback; keep totals hidden until the staging route responds correctly.
- Keep the voucher payee string separate from vendor-master maintenance. A saved voucher records who was paid; it does not automatically create a master vendor. Entry suggestions may include historical voucher names, so malformed legacy strings should be suppressed from suggestions without rewriting the historical ledger.

**Exit evidence:** local source SHA; CI/check evidence; verified target/deployment identity stored privately; artifact run ID and manifest commit; live staging URL and UAT run evidence. Do not store credentials or sensitive resource IDs in this repository.

### B2 — staging schema, backup and restore

- Before any migration, verify the staging Sheet and inspect actual `Vouchers` and `Vendors` header rows, occupied columns and row counts.
- Take a staging backup and inspect the Sheet snapshot, receipt copies and manifest before modifying schema.
- With explicit owner approval, run only migrations required by the actual schema: `migrateVoucherPaymentMethodField()` and/or `migrateVendorDefaultsSchema()`.
- Preserve historical `PaymentMethod` blanks. Never infer historical values, overwrite occupied columns, migrate production, or use `setup()` as an upgrade mechanism.
- Verify `Vouchers` W and `Vendors` H:I where those migrations are required; compare headers, row counts and historic values before/after.
- Run a second backup after migration, then restore to a separate recovery Sheet/folder. Reconcile headers, row counts, voucher numbering, users/settings and receipt references.

**Exit evidence:** pre-migration backup inspection, before/after schema and row-count comparison, migration execution evidence, and witnessed isolated restore/reconciliation. If the live schema differs from the documented prior schema, stop and investigate; do not force the migration.

### B3 — security, authorization and real-device acceptance

- Validate generated `_headers` and `.htaccess` security policy at build time and in the ZIP workflow. Required controls include CSP directives, `frame-ancestors 'none'`, anti-framing, MIME-sniffing, referrer and permissions policies. Reject unsafe or external script sources.
- After static publication, inspect the actual HTTP response headers. Generated files alone do not prove the hosting server applies them; Apache must support `mod_headers` and the required overrides.
- Test Owner/Manager/Staff authorization, denied API actions, receipts, approval, payments, Cash vs UPI/Bank, duplicate warnings, cash close, and support-report behavior against live staging.
- On each intended device, test install/update, save confirmation, receipt capture, offline queue, reconnect/idempotent replay, queue export/recovery, print/PDF/A5, responsive layout, keyboard focus, zoom/reflow and assistive technology.
- Confirm pending device-local entries are not represented as server-saved vouchers.

**Exit evidence:** saved response-header evidence; role/access test matrix; device/browser matrix; no unresolved critical defects; explicit owner/manager acceptance.

## Engineering changes in this batch

- The static web builder validates generated Cloudflare Pages and Apache security policy before reporting a successful build.
- The policy validator requires the core CSP directives and security headers, rejects wildcard/external script sources and `unsafe-eval`, and requires `frame-ancestors 'none'`.
- The manual staging ZIP workflow independently checks the generated Apache policy markers and rejects unsafe/external script-source patterns.
- Dashboard error handling now distinguishes an unsupported `dashboardSummary` route and gives staging-target/backend-version remediation while withholding financial totals.
- Payee suggestion sources filter numeric/punctuation-only legacy values from the quick-entry chips and datalist, without modifying voucher history; regression coverage verifies the filtering while preserving inert hostile-label rendering coverage.
- The API route-registry test explicitly classifies `dashboardSummary` as a registered read action.
- Regression tests exercise the policy validator and ensure the staging ZIP workflow retains its security checks.

These checks are source/build gates. They do not certify live response headers, real Google authorization, schema state, backups, restoration or physical-device behavior.

## Release controls

- `client-main` is the integration branch for this work; do not merge/rebase/force-push long-lived branches blindly.
- Keep `.clasp.json`, `.clasprc.json`, account credentials and private instance IDs out of Git and logs.
- Run staging workflows only from `client-main`. `deploy-and-uat` and `uat-only` require exact `STAGING-ONLY` confirmation and explicit staging-write consent.
- The staging UAT writes and cancels one tagged INR 10,000 test voucher; its cancelled row and audit trail remain in staging.
- No production migration, deployment, DNS change or customer handover is authorized by this batch.
- If any identity, schema, backup, header or recovery gate fails, stop and preserve evidence rather than bypassing the guard.

## Recommended execution order

1. Merge this reviewed source batch only after exact-head CI, Browser E2E and Full Flight Test pass.
2. Sync the merged source to the operator's local checkout and run the documented local checks.
3. Verify staging resources and pre-migration backup; perform only approved schema migrations.
4. Push and deploy backend to the verified existing staging deployment.
5. Generate and publish the staging ZIP from the reviewed commit.
6. Run guarded staging UAT, live security/role/device checks, and the isolated restore drill.
7. Record evidence and owner/manager sign-off before beginning the controlled pilot.
