# Cash Voucher — Execution Plan

**Date:** 21 October 2026  
**Integration branch:** client-main  
**Reviewed baseline:** d5ed3e77387d0f1896c97dbaac793ed23b17eb32, post-PR #197  
**Release state:** live staging and first-customer acceptance remain unverified.

## Executive decision

Do not start a broad feature sprint. Run a coherent release-readiness batch that aligns branch policy, manual staging controls, source baseline and release evidence. Pass live staging and recovery gates before starting the pilot. This plan does not authorize production changes.

## Phase A — branch and source controls

- All product PRs target client-main from short-lived client/* branches.
- Require CI, Browser E2E and Full Flight Test on the exact final PR head; fix failures instead of bypassing checks.
- Keep main legacy/read-only. The 21 October comparison showed client-main 13 commits ahead and 2 behind main, with merge base acebc6b63010a92e136200321fc77c03dac9a3be. Do not merge, rebase or force-push long-lived branches as part of this work.
- Owner/admin must verify active GitHub rulesets, required checks, default branch and the restrictions on main. Available repository metadata did not prove ruleset enforcement.
- Keep repository branch policy separate from staging/production deployment authorization.

**Exit:** branch and exact-head check behavior is verified; any remaining owner-side settings tasks are recorded.

## Phase B — release-readiness implementation PR

1. Add the CEO/board strategy, dated execution plan and dedicated client-main engineering strategy.
2. Update handoff to post-PR #197 and distinguish source checks from live release proof.
3. Correct the staging audit: protected staging Environment and guarded deploy/UAT are for client-main, not main.
4. Rename the misleading workflow guard label from “Require main” to “Require client-main”.
5. Add regression checks for agreement among the workflow, branch policy, current strategy and staging audit.
6. Keep live Apps Script migrations, resource creation, static hosting/DNS and production deployment outside this PR.

**Exit:** CI, Browser E2E and Full Flight Test pass on the exact final PR head; regression tests enforce branch-policy consistency; no live resource is mutated.

## Phase C — staging and recovery

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

## Phase F — next product batch after evidence

Consider one integrated **Today → Close → Owner card** workflow: Today prioritizes actions/exceptions; Close guides sync, pending approvals, physical drawer and classification; Owner card separates cash and non-cash movements and shows verifiable exception/sync/backup state. Define the target task, baseline and outcome metric before building. If pilot data shows another bottleneck, work on that instead.

## Priority queue

| Priority | Item | Owner | Acceptance evidence |
|---|---|---|---|
| P0 | Release-readiness PR | Engineering/reviewer | Exact-head CI, Browser E2E, Flight Test |
| P0 | Branch rulesets/default branch | Owner/admin | Actual GitHub Settings state recorded |
| P0 | Staging identity and UAT | Operator + owner | Isolated resource register and exact workflow run |
| P0 | Backup and restore | Owner/operator | Restore into separate target with reconciliation |
| P0 | Device/offline/print/accessibility | QA + customer operator | Device matrix and critical issues closed |
| P1 | Controlled pilot | Product owner + customer | Written acceptance and 14-day evidence |
| P1 | Next product batch | Product/engineering | Observed problem, baseline and success metric |
| P2 | Durable audit-failure fallback | Security/backend | Failure/retention/access decision |
| P2 | Accountant mapping | Customer/accountant | Chosen software/version and anonymized fixture |
| P2 | Database/multi-tenant strategy | Founder/architecture | Measured trigger and migration business case |

## Non-goals and stop conditions

No production migration/deployment, blind branch synchronization, multi-tenant rewrite, AI dependency, autonomous posting, outbound WhatsApp campaign, unvalidated tax/ledger claim or mandatory denomination schema change. Staging is unverified until live UAT, backup and isolated restore are evidenced. Customer handover is blocked until access, device, data ownership and acceptance gates pass.
