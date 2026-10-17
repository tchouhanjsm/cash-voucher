# Final Repository Deep Audit — 17 October 2026

## Audit scope and verified baseline

Repository: [tchouhanjsm/cash-voucher](https://github.com/tchouhanjsm/cash-voucher)  
Verified `main` SHA: `8e18b4f3ed8601f70e192b6d32587675ad4cdb7b`  
Most recent relevant source change: PR #169, “Consolidate password login, audit trail and staging readiness,” merged at that SHA.  
Post-merge main CI: [run 39049788835](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39049788835), success.  
PR #169 pre-merge evidence: CI/quality, Browser E2E and Full Flight Test all passed at the exact head `b82b8f38b891f01b7cba2a1c421a920ceabd14fc`. These were source/mock test results, not live Google-resource tests.

This audit covers live repository state, product roadmap/backlog, architecture, authentication and migration controls, staging/release workflows, recovery, rendering security, UI/accessibility notes and customer onboarding. It is **not** an Apps Script deployment, production security certification, live restore test or first-client acceptance report.

## Executive decision

**Source is ready to proceed to isolated staging setup, but staging and first-client release are not yet verified.** The latest merge contains password authentication and supporting staging controls. The high-risk work remaining is principally owner-provisioned operations and witnessed evidence, plus a bounded set of source/documentation hardening tasks.

No open PRs or issues were returned by the repository search at the time of this audit. Several old feature/document branches are behind `main`; one old Phase 22 documentation branch has diverged substantially. Do not cherry-pick historical branches as though they were current work. Review the current roadmap and actual main tree first.

## Findings by priority

### P0 — blocks calling the staging or first-client release verified

1. **Provision truly isolated staging resources.** Create a new staging Apps Script project and bound Sheet, separate receipt and backup folders, and a first versioned Web App deployment. Independently verify every Script/Deployment/Sheet/Drive ID and confirm there is no overlap with production.
2. **Configure protected deployment controls.** Create the GitHub `staging` Environment, restrict eligible branches to `main`, require approval where supported, and configure the documented staging/production identity variables plus protected Clasp, Owner and Manager password secrets. Branch-protection/ruleset state could not be independently read in this audit; inspect it in GitHub Settings.
3. **Run the guarded staging workflow with explicit authorization.** Start with `validate-only`. Run `deploy-and-uat` only from `main`, with exact `STAGING-ONLY` confirmation and explicit staging-write consent after target identity and credentials have been reviewed. Retain the run link and sanitized target-identity evidence. The synthetic INR 10,000 payment and cancellation stay in staging.
4. **Witness a real backup and a separate restore.** Confirm a completed backup snapshot and receipt manifest, restore to a separate recovery Sheet/folder, and reconcile expected tabs/headers, row counts, user/settings state, receipt mappings and voucher-number counters. An integrity report or backup status field is not restore proof.
5. **Verify real authorization and deployment behavior.** Test Owner/Manager/Staff/Accountant boundaries, own-versus-foreign vouchers, receipt access, password change/lockout and logout against the actual target. Verify execution identity, versioned deployment URL, Sheet binding, trigger and property values without disclosing credentials.
6. **Create the first client separately from staging.** Use a dedicated customer Script/Sheet/receipt/backup set and a unique static site origin. Never reuse the existing root `config.js` endpoint for a new client. Publish only the generated `dist/` artifact and confirm the actual host returns CSP (including `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and the expected referrer/permissions headers.
7. **Repository privacy is an owner-controlled cutover.** The source repository is public. Verify static hosting can build from a private source repository and does not depend on root GitHub Pages before changing visibility. A later privacy change cannot recall copies already cloned or cached.

### P1 — must be completed for dependable live operation

1. **Manual device/accessibility validation.** Verify PWA install/update, actual mobile/tablet layout, brief offline use, queue recovery/export/import on every operating device, pending-versus-server-saved status, print/export, 200–400% zoom/reflow, manual keyboard order/focus and real screen-reader announcements. Automated screenshots, heuristic accessible-name checks and simulated mobile viewports do not prove WCAG conformance.
2. **Review remaining HTML rendering sinks.** The current inventory records 17 `innerHTML =` sites across eight frontend modules. The count/fingerprint checks only detect drift; each remaining interpolation still needs contextual review and hostile-input regression. Do not describe this as complete XSS certification.
3. **Measure real-service limits in staging.** Capture Apps Script/Sheets latency, API/bootstrap/report cost, quota errors, backup duration and voucher-number lock contention under authorized synthetic traffic before setting production SLOs.
4. **Run the 14-day controlled pilot.** Start only after staging target, role checks, live headers, restore and device gates pass. Reconcile voucher numbers, every device's pending queue, book balance versus physical cash, variance explanations, incidents, fallback and owner/manager sign-off daily. Stop on unexplained variance, missing/duplicate vouchers, missing receipts, unresolved material classifications, backup failure or unrecoverable queue records.

### P2 — security/product decisions requiring review rather than a blind implementation

1. **Audit durability:** AuditLog append and the Script Properties failure-marker write can both fail. That double-failure has no durable fallback, and the log is not a tamper-evident ledger. Decide durability, permissions, retention and failure semantics before building a fallback; never fabricate historical events.
2. **Password storage algorithm:** current server-side password verification uses salted HMAC-SHA256 with a Script Properties pepper. That is the current implementation and not a memory-hard password KDF. Review feasible password hashing options and Apps Script performance constraints before production; do not make an unmeasured algorithm swap within a documentation-only change.
3. **Targeted lockout risk:** five failed attempts trigger a temporary 15-minute per-email lockout. This mitigates guessing but lets someone deliberately lock out a known email. Review abuse controls and user recovery procedures without simply removing brute-force resistance.
4. **Dependency exception:** reassess the documented `braces@3.0.3` Clasp/micromatch chain by 9 November 2026; the documented CI cutoff is 10 November unless the exception receives an explicit review and renewal.
5. **Accountant/product decisions:** the Recorded Movement CSV is generic, not a certified Tally/Zoho import, general ledger or tax report. Get receiving-software version and accountant-approved fixture/mapping first. Denomination-level cash counts remain a deferred owner decision. Establish usability/performance targets from measured pilot evidence.

## Implementation and regression state

### Authentication and access control

- The live shell loads `frontend/main.js`; password login and forced password change are implemented. Newly created/reset/changed passwords use server-side 8–128-character validation. The legacy short-credential path requires the explicit migration marker and mandatory password change.
- Session records are cache-backed and tied to the user's salt; password change/reset rotates the salt. Route guards limit forced-change sessions to password change or logout, and write handlers authenticate after acquiring ScriptLock.
- Login success/failure/lockout and password lifecycle events are designed not to log raw passwords. Central audit persistence remains best-effort as described above.
- The populated legacy Users migration (`migratePinAuthToPasswordSchema()`) is **not** part of normal setup: take and verify a backup, confirm the target project/Sheet, review recovery, obtain owner authorization, run once only on the intended legacy instance, then publish the reviewed deployment. Never point it at an unverified or production target by convenience.

### UI/UX and architecture

- `index.html` loads the modular `frontend/main.js` entry point. The numbered `backend/*.gs` files are active; `backend/30-entry.gs` owns `doGet`/`doPost`/routing.
- Root `app.js` is intentionally retained as a legacy artifact and is not loaded by the active shell. Architecture Decision Record 0003 says not to delete it incidentally; any removal needs a separately reviewed compatibility/history decision.
- The login page now has a two-panel responsive design, inline email/password errors, accessible show/hide password and theme controls. Automated source/browser coverage passes; rendered-device and assistive-technology review remains open.
- FrontUI Studio and shared UI styles are merged into the app workflows; the standalone studio remains a static component gallery rather than a production route.

### Data and financial controls

- The source includes independent payment/receipt numbering, client-ID idempotency, offline queue account/endpoint binding, safe recovery import/export, high-value payment approval (INR 10,000 inclusive, no self-approval), cash-close snapshots/corrections and a report-only accountant role.
- Historical blank CashImpact/approval/vendor IDs are not silently backfilled. Unresolved material approvals/classification stay excluded from approved totals and may block close under the recorded policy.
- Mock tests and source checks do not prove real Sheet permissions, concurrency, trigger execution or restoreability.

## Documentation and engineering corrections in this batch

- Reconcile `PROJECT.md` to password authentication, currently implemented cash close/approvals/accountant/reporting, the split `backend/*.gs` architecture and post-Phase-39 status.
- Move roadmap, release-readiness and backlog baselines to the merged PR #169 main SHA and current CI evidence.
- Correct stale active runbook instructions that still tell staging/customer administrators to use PINs.
- Correct the UX audit's “forced-PIN dialog” description to forced password change and align the design-system status with the merged UI/release phases.
- Add a regression test for the current readiness docs so the merge baseline, authentication vocabulary and live-release boundary cannot silently drift back.

Operational gates are not marked complete by mock CI. This audit does not authorize Google-resource creation, credential handling, running a migration, writing staging data or deploying production.

## Staging-to-customer sequence

1. Review and merge the source/documentation reconciliation PR after its exact-head checks pass.
2. In the owner-controlled Google account, provision the dedicated staging Sheet-bound Apps Script project and isolated receipt/backup folders.
3. Run `setup()` once only on the verified empty staging project with temporary staging Owner properties; approve scopes and create the dedicated staging Manager. Complete both mandatory password changes.
4. Create the first staging Web App deployment manually and record its deployment ID/URL in the private operator register. Verify identity and resource separation independently.
5. Configure the protected GitHub `staging` Environment and secrets; verify reviewer/branch restrictions.
6. Run validate-only, inspect results, and then perform the explicit guarded staging UAT with synthetic data and consent.
7. Witness backup and isolated restore, confirm live headers/authorization/trigger and conduct device/accessibility checks.
8. Provision the first customer as a completely separate instance/origin. Build and publish only `dist/`, verify real headers and endpoint identity, test roles, receipt access, recovery and backup/restore.
9. Complete the private instance register and customer quick-start; obtain recorded acceptance before calling the customer link production-ready.
10. Start and finish the 14-day controlled pilot with daily reconciliation. Revisit P1/P2 risks using observed evidence.

## Related canonical guides

- `docs/PRODUCT-ROADMAP.md` — source phase status and priorities.
- `docs/BACKLOG.md` — concise current operational queue.
- `docs/RELEASE-READINESS.md` — release acceptance gates.
- `docs/STAGING-RELEASE-AUDIT.md` — staging and first-customer blockers.
- `docs/APPS-SCRIPT-RELEASE-RUNBOOK.md` — owner-controlled script deployment/migration/UAT.
- `docs/CUSTOMER-ONBOARDING-RUNBOOK.md` — separate customer setup, acceptance and handover.
- `docs/ACTIVE-DOM-SINK-INVENTORY.md` and `docs/SECURITY-RENDERING-AUDIT.md` — known rendering-sink limitation.
