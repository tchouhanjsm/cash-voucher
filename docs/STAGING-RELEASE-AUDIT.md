# Staging Release Audit and Pending Queue

**Audit date:** 25 October 2026 23:56 IST (pre-sync evidence snapshot)  
**Authoritative integration baseline:** `client-main` `e97c4e080b3f6903e16ef77f571822f9844faeed`, following merged PR #213.  
**Legacy branch:** `main` (read-only by engineering policy; the actual ahead/behind relationship must be rechecked before any branch operation).  
**Scope:** source and release-workflow audit, not live deployment, restore or customer acceptance.

## Executive status

PR #213 is the latest merged documentation/checkpoint baseline on `client-main` at `e97c4e080b3f6903e16ef77f571822f9844faeed`. The latest recorded exact integration evidence is [CI / Quality #40206481359](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40206481359), [Browser E2E #40206481344](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40206481344), and [Full Flight Test #40206481349](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40206481349). Monitor run #40206481372 completed but captured an intermediate snapshot before those checks finished. The current monitor fix is open as PR #214; source/mock validation is not live release evidence.

The branch policy names `client-main` as the only integration branch and `main` as legacy/read-only. Live ruleset #24624368 includes only `~DEFAULT_BRANCH` (`main`), requires only `quality`, and sets required approvals to zero. The `client-main` branch API reports `protected=false`; the classic branch-protection endpoint returned 403 `Resource not accessible by integration`. Repository metadata confirms `allow_auto_merge=true`, but repository-level auto-merge availability is not branch protection. Owner/admin must extend the active ruleset to `client-main` and verify the intended required checks and approval before considering PR-level auto-merge.

Dedicated staging resources, protected staging Environment, a real deployed staging frontend, successful live UAT, support-email delivery, real backup/restore, physical-device acceptance and customer acceptance are not evidenced as complete. Verify that the private-repository host integration still has access. The product remains single-property, not multi-tenant.

## Current checkpoint — 25 October 2026 23:56 IST (pre-sync evidence snapshot)

- **Open PR queue:** PRs #209–#213 are merged. PR #214 is the sole open PR targeting [`client-main`](https://github.com/tchouhanjsm/cash-voucher/pull/214), based on `e97c4e080b3f6903e16ef77f571822f9844faeed`. The last code-validated pre-sync head was `df9d2a01adae93e305c530eae1635079137adcd6`; this documentation sync advances the head, so read live PR metadata for the current SHA and comparison. GitHub previously reported it open, non-draft and mergeable. No review or inline review thread was submitted; PR-level auto-merge was not requested.
- **Pre-sync exact-head source checks:** On source head `df9d2a01adae93e305c530eae1635079137adcd6`, [CI / Quality #40217235001](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40217235001) passed (298 backend checks); [Browser E2E #40217234948](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40217234948) passed (975 checks, 0 failures); [Full Flight Test #40217234947](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40217234947) passed the same-head CI/E2E gate; [Autonomous Development Monitor #40217235113](https://github.com/tchouhanjsm/cash-voucher/actions/runs/40217235113) passed read-only observation. Expected PR-event skips were not failures. This documentation-only synchronization creates a new PR head; these prior runs do not validate that head. Read the live PR description and exact-head runs for final post-sync conclusions.
- **Auto-merge and review:** repository `allow_auto_merge=true` is confirmed by live metadata, but PR #214 has no submitted review and has no PR-level auto-merge request. Keep it unrequested until owner/admin verifies `client-main` protections and the required human review is satisfied.
- **Staging UAT:** [run #39596101014](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39596101014) failed at **Validate isolated deployment configuration**. Missing/placeholder production resource references and rejected `CLASPRC_JSON` blocked the deployment preflight; deployment, target recheck and live UAT were skipped. No retry is warranted until the owner privately corrects the environment and independently verifies isolation.
- **Staging ZIP:** [run #39988800756](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39988800756) succeeded but was built from stale SHA `aa37d94819e59a72c797ba36839aa8f8ec94008f`. Its artifact expires **26 October 2026 22:11 IST (16:41:12 UTC)** and is not release evidence; do not deploy it.
- **Releases and artifacts:** the live GitHub releases endpoint returned an empty list at 25 October 2026 23:56 IST; no published release is recorded. Pre-sync PR #214 artifacts `12607973403` (performance baseline), `12607333825` (responsive visual matrix) and `12608360769` (sanitized monitor report) are available and not expired, but are validation artifacts rather than a client release and do not validate the subsequent documentation-only commit.
- **Unverified operational gates:** staging identity/deployment, actual host security headers and role/receipt authorization, real backup and restore into a separate destination, offline/reconnect, print/PDF, intended-device/accessibility acceptance, and customer sign-off remain unverified. Production is not authorized.

## Active release sequence

Follow the six-step pipeline in [the execution plan](EXECUTION-PLAN-2026-10-21.md). PRs #209–#213 are merged at `e97c4e080b3f6903e16ef77f571822f9844faeed`; PR #214 is the only open PR and fixes monitor checkpoint finalization. Do not open another PR while #214 remains open, and do not start a product-feature batch while governance, staging identity, recovery and customer-acceptance gates remain open.

**Evidence still required:** independently verified staging identity and host access; inspected pre-migration backup; schema validation and only required staging migrations; backend-first deploy and staging-configured frontend; exact-run guarded UAT; live role, receipt, payment-method, offline and print checks; and restore into a separate recovery target. The hotel pilot remains blocked until those gates pass. Production is excluded.

## Evidence from workflow run #39587669660 — 21 October 2026

The manually dispatched workflow from `client-main` passed source/security/backend checks, mock Browser E2E, and Python syntax validation. The **deployment preflight failed closed** before `staging:deploy`, target recheck, or live UAT ran. The preflight reported four missing production resource variables: `CV_PRODUCTION_SCRIPT_ID`, `CV_PRODUCTION_SPREADSHEET_ID`, `CV_PRODUCTION_RECEIPT_FOLDER_ID`, and `CV_PRODUCTION_BACKUP_FOLDER_ID`; it also rejected `CLASPRC_JSON` as missing/invalid. The workflow log redacted the OAuth value; do not expose or paste it into chat.

No deployment or live UAT steps ran in this attempt. A completed workflow log cannot prove that unrelated external systems were untouched, but this workflow provides no evidence that it updated the Apps Script deployment or created the synthetic payment. Preserve this run as failed-preflight evidence; **do not rerun it or relax preflight to get a green result** until the owner has corrected and independently checked the Environment configuration.

Owner recovery checklist:

1. Compare production references with the actual production Script, Sheet, receipt folder and backup folder if you want code-level cross-resource comparison. Configure all four non-empty variables together; never infer IDs or copy a staging ID into a production slot. Alternatively, if these reference IDs are intentionally not stored in the staging Environment, leave all four unset and set `CV_STAGING_RESOURCE_ISOLATION_ATTESTATION=OWNER-VERIFIED-STAGING-ONLY` only after independently verifying that the staging Script, Sheet, receipt folder and backup folder are distinct from production. This mode explicitly relies on owner attestation for those four comparisons; the production Web App URL/deployment comparison remains mandatory.
2. The operator's local structural diagnostic reported valid JSON and a modern Clasp `tokens.default` credential with non-empty refresh token, client ID and client secret. The workflow validator only accepted legacy top-level `token`/`oauth2ClientSettings`, so run #39596101014 rejected a locally modern-format credential. The release fix must support both formats. Do not reveal or paste the secret; rotate it only if it was exposed to an untrusted party.
3. Independently re-check the five staging resource identities. Staging IDs must be distinct from one another. If all four production references are configured, the validator also checks that all five production identities (including the deployment derived from root `config.js`) are distinct and that no staging ID overlaps production. If the references are omitted, the attestation is required and the validator clearly reports that the four resource-level comparisons depend on the owner's verification. **Do not change `config.js` or copy production IDs into staging resources.**
4. Run `validate-only` from `client-main` to reconfirm source/mock checks, then review the staging Environment privately. A validate-only run does not validate these secrets/resources because they are not passed into the validation job. Keep Clasp OAuth JSON only in the protected GitHub Environment secret; do not paste it into chat, issues, commits or workflow inputs.
5. In **Settings → Environments → staging**, open the deployment branches dropdown currently labelled `No restriction`, choose **Selected branches and tags**, add `client-main`, and save. The workflow's own ref guard still checks `refs/heads/client-main`.
6. Only after the environment is corrected and isolation is verified should the owner explicitly dispatch a fresh `deploy-and-uat` run from `client-main`. Review preflight first, then the exact steps/logs. Stop if any identity is uncertain or any guard fails.

## Follow-up workflow run #39596101014 — 21 October 2026

The manual `deploy-and-uat` run passed the branch/confirmation/write-consent guard, source/security/regression checks, and mock Browser E2E. The deployment job then failed at **Validate isolated deployment configuration**. The log showed the four `CV_PRODUCTION_*` references were empty and the Clasp-format validator rejected `CLASPRC_JSON`. `Update the existing staging deployment only`, the target recheck, and live UAT were skipped. This run provides no evidence of an Apps Script push or synthetic payment write.

The owner subsequently ran a **local, value-free diagnostic**: JSON parsing succeeded; only root key `tokens` was present; `tokens.default` existed and contained non-empty refresh token, client ID, and client secret fields. That confirms the local file is in a modern Clasp 3.x shape. The source validator defect was that it only recognised the legacy `token` and `oauth2ClientSettings` keys. PR #201 updates it to accept both legacy and modern formats and adds regression coverage without printing credential values.

The screenshot also showed the GitHub `staging` Environment deployment branches dropdown set to **No restriction**. Use **Selected branches and tags → `client-main`** to add a second layer of branch protection where the setting is available.

## Branch and staging workflow — authoritative correction

The active integration branch is **client-main**. The staging Environment must restrict deployments to **client-main**, because the deploy/UAT guard accepts only refs/heads/client-main. Dispatch deploy-and-uat or uat-only from client-main with exact STAGING-ONLY confirmation and explicit staging-write consent. Starting the staging workflow from main is not supported.

- validate-only runs source checks and mock Browser E2E without staging credentials.
- deploy-and-uat is owner-authorized and updates an already verified staging deployment; it must not create or guess a target deployment.
- uat-only tests a known deployed staging version without uploading source.
- This audit does not authorize production deployment, production migration or a DNS change.

Owner/admin must verify that the GitHub Environment is named staging, deployment restrictions allow client-main, reviewer protection is configured where supported, and only expected variables/secrets exist. Never copy secret values to Git, chat, PR text or logs.

## Live read-model contract gate — P0 B4

The guarded staging UAT verifies the owner-scoped `dashboardSummary` and bounded `registerPage` APIs before creating any synthetic financial record. It validates the requested dashboard date range, finite summary fields, trend/group arrays, register page-size and pagination metadata, aggregate totals and facets. If the deployment returns `Unknown action` for `dashboardSummary`, UAT stops with a target/version remediation message before a test payment is created.

The sanitized staging evidence JSON and workflow summary record whether each contract was observed. Missing markers in a failed/incomplete run are `not-confirmed`, not passes; skipped UAT is `not-run`. This source gate is not live evidence until an authorized staging workflow completes against the independently verified staging project.

## Dependency audit response — source-side mitigation

The current npm registry audit surfaced a new high-severity `body-parser` advisory (GHSA-27r3-jxmh-p828, published 22 October 2026). The project pins its indirect Express/MCP-toolchain dependency to patched `body-parser@2.4.0`; the lockfile includes registry integrity and compatible transitive requirements.

The current latest upstream `@google/clasp@3.4.1` declares `zod ^3.25.76`. The Zod advisory (GHSA-mrhx-c7xc-m3w5) is fixed starting at 4.6.6, which is a major-version change outside Clasp's declared dependency range. Rather than downgrade Clasp or force an unverified major override, the source audit uses an advisory-specific exception through **9 November 2026** for that developer/CI-tooling path only. The exception is temporary, not a vulnerability fix; the release owner must re-evaluate an upstream-compatible Clasp/Zod update by its review date. The static client artifact excludes Node dependencies.

This does not relax the gate for unrelated high/critical findings or second advisories on Zod. Exact-head CI must verify the package-lock/install behavior before the batch is reviewable.

## Deep-dive integrity review — P0 B5

The code audit identified and is addressing five high-impact correctness cases:

1. **Voucher/receipt atomicity:** a Sheets write can report an error after its rows have committed. Blindly deleting created receipt files in that path leaves saved voucher rows referencing missing attachments. The revised flow rereads the ledger before cleanup and preserves receipt files when a row is persisted or persistence cannot be verified.
2. **Counter resilience:** next-number setting writes occur after the voucher ledger append. They are now best-effort after a successful append; numbering is still computed against the ledger so a failed settings update does not report a committed payment as a failed transaction.
3. **Idempotent evidence:** retries must match receipt count, MIME and bytes as well as voucher fields. Same client ID with changed receipt evidence now conflicts; prototype-like IDs are safe lookup keys.
4. **Input integrity and cash semantics:** malformed receipt lists/base64 and unsupported explicit types fail validation before Drive writes. A stored payment method constrains drawer impact; old rows with no recorded method remain manually classifiable without backfilling historical method data.
5. **Close integrity:** malformed status/type/ID/number rows for a business date are surfaced as blockers. Daily Cash Close may not silently omit them or label an unknown voucher type as a payment.

These safeguards are verified with unit/mock fault-injection tests on the B5 branch. They are not evidence of live Google Sheets/Drive transaction behavior. In the remaining operational phase, the owner must deliberately run authorized staging UAT, inspect real attachment references, verify the host response headers, and demonstrate a restore into a separate recovery destination.

## P0 B6 — audit-health fallback and response-contract correction

PR #208 merged the B6 source change at `176da7c559d279149e2473a65a71fd03d3e53018`. It adds a Settings-sheet fallback when Script Properties cannot persist an audit-write failure marker, then a labeled six-hour CacheService marker when both durable paths fail. Owner-only `auditLog` responses expose marker source/durability and keep `auditHealth` consistent on populated and empty cursor pages.

The current review branch `client/p0-audit-monitoring-integrity-20261025` addresses a mixed-source gap found in the follow-up audit: if one marker is valid while another marker source is unreadable or malformed, the response must still be `MONITORING_UNAVAILABLE`, not merely `DEGRADED`. Any known marker metadata remains visible in the UI and health export. Tests cover both directions of mixed valid/corrupt markers and preserve the all-stores-write-failed residual case.

If AuditLog, Script Properties, Settings and CacheService all fail to persist a marker, the application emits an explicit diagnostic but cannot guarantee a durable alert. This is an operational limitation, not a claimed fix.

## Priority 0 — required before staging is verified

### A. Dedicated staging

1. Verify a staging-only Apps Script project, Spreadsheet, receipt folder, backup folder, Web App deployment and distinct browser origin. Record target identity privately and prove every staging resource differs from production.
2. On a verified empty staging Sheet only, configure staging Owner properties, run setup once, approve scopes, create a dedicated Manager and complete first password changes. Never run setup on populated or production data.
3. Create the first versioned staging Web App deployment manually; independently verify deployment ID and /exec URL. Automated deployment intentionally updates an existing deployment.
4. Verify GitHub Environment `staging`, restrict deployment branches to `client-main`, and configure the six required `CV_STAGING_*` target variables. For the four `CV_PRODUCTION_*` reference IDs, either configure all four verified IDs for automated comparison or leave all four unset and set `CV_STAGING_RESOURCE_ISOLATION_ATTESTATION=OWNER-VERIFIED-STAGING-ONLY` after independently verifying distinct staging resources. Empty references without the attestation are not accepted.
5. Configure secrets CLASPRC_JSON, CV_STAGING_UAT_OWNER_EMAIL, CV_STAGING_UAT_OWNER_PASSWORD, CV_STAGING_UAT_MANAGER_EMAIL and CV_STAGING_UAT_MANAGER_PASSWORD. Never record values in this audit.
6. Run validate-only first. After owner review of target identity and workflow code, dispatch deploy-and-uat from client-main with STAGING-ONLY and explicit staging-write consent. Review sanitized logs and exact workflow result. The synthetic INR 10,000 payment is created and canceled; its canceled record and audit trace remain in staging.
7. Save the workflow run and target identity evidence in the private release register. Green CI alone is not live UAT evidence.

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

- **Audit durability:** B6 adds a Settings-sheet fallback and a labeled transient cache fallback. If all marker stores fail, a missed event can remain undetectable; keep the limitation visible, reconcile records manually and never invent historical events.
- **Dependency exception:** braces@3.0.3 remains a time-bounded Clasp toolchain exception. Review compatibility by 9 November 2026; CI is expected to reject it from 10 November unless renewed explicitly with tests. Do not blindly downgrade Clasp.
- **Accountant export:** generic recorded-movement CSV exists, but no destination-specific compatibility, tax calculation or ledger claim is approved. The receiving accountant must select software/version and validate an anonymized fixture; qualified Indian CA review is required for tax treatment.
- **Daily close:** denomination rows remain optional until owner/pilot evidence demonstrates value.
- **Scale:** collect pilot evidence before numeric SLO promises, chain support or multi-tenant architecture.

## Release decision

**Source baseline:** PRs #209–#213 are merged at `client-main` SHA `e97c4e080b3f6903e16ef77f571822f9844faeed`. PR #214 is the only open PR; its exact-head CI / Quality, Browser E2E and Full Flight Test passed, but no review is submitted and `client-main` protection remains unverified. Repository auto-merge is enabled but PR-level auto-merge is not requested. **Live staging:** not verified. **First-customer handover:** blocked until Priority 0 gates pass. **Production:** untouched and not authorized by this audit.

This audit's branch instructions supersede historical snippets elsewhere that tell operators to dispatch from or restrict staging deployment to main. Update this audit and its regression tests in the same meaningful release-governance change whenever the workflow guard changes.

## Autonomous delivery monitor

The repository has an event-driven monitor targeting `client-main`. It observes exact-SHA CI, Browser E2E and Full Flight Test; summarizes PR reviews/checks and staging/ZIP workflow runs; reports stalled, timeout and failure states; and persists a bounded run history to one GitHub checkpoint issue and workflow artifact. Manual dispatch is unavailable while the workflow is absent from the frozen default branch `main`; do not modify `main` merely to enable it.

The ChatGPT monitor has a real hourly schedule. The requested 45-minute interval is not supported. GitHub Actions cron is intentionally omitted because GitHub scheduled workflows run from the default branch, which remains main while repository policy treats main as frozen/read-only. Do not represent an event/manual workflow as a 45-minute cron.

Automatic recovery is limited to timed-out source-validation runs, validated against the exact current head, with at most three attempts total. It does not rerun failed tests, cancelled runs, write-capable staging UAT or static ZIP publication. PR-event observation is read-only. No automated merge, Clasp push, Apps Script deployment, Google resource mutation, migration, cPanel upload or production change is permitted.

## Deep-dive findings to fix in a separate code batch

- Support report rate limiting in backend/90-support.gs is implemented with CacheService read-then-put and is not atomic under concurrent submissions. Add a bounded lock/atomic counter and concurrency tests.
- B6 audit-marker parsing appears to coerce malformed Script Properties state into a degraded marker rather than always returning MONITORING_UNAVAILABLE. Add malformed counter/timestamp tests and align implementation with the published fail-closed contract.
- Live staging, actual response headers, real Google resource isolation, migration need, backup/restore, and device acceptance remain unverified. Green CI/mock tests must never close those release gates.
