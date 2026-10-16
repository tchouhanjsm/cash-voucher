# Engineering Handoff

Updated: 16 October 2026  
Repository: tchouhanjsm/cash-voucher  
Last verified main SHA: `ec5f76c215b8d8986d7dd38e265cc4d1b50e36ee` (PR #157 merge commit)  
Current engineering batch: Phase 22 — authentication race regression and source-of-truth reconciliation  
Current working branch: `phase-22-auth-race-evidence-docs-2026-10-16`  
Current candidate: simulate write-session invalidation at ScriptLock acquisition, prove fail-closed behavior, and reconcile stale project records; exact-head CI/E2E/Flight checks are authoritative

## Verified repository state

- Live `main` is `ec5f76c215b8d8986d7dd38e265cc4d1b50e36ee`, the PR #157 merge commit. Phase 21's light-first shared UI redesign is merged; the exact tested head `f38feeafdf7fd682d4e07e134026627c0bfc2413` passed CI/quality, Browser E2E (402 checks) and Full Flight Test (281 backend + 402 browser checks). A post-merge run on the merge commit was not established in the current review. Source/mock checks remain separate from proof of a live staging deployment, role/Drive permissions or witnessed restore.
- The Phase 15 studio remains a static design reference, not a production route. Its release-integrity guard requires `frontend-ui-kit.css` in both the index link list and offline shell; no API, schema, dependency or financial/authorization semantics changed.
- The active DOM sink inventory remains 17 assignments across eight frontend modules. Counts/fingerprints are drift controls, not XSS certification.
- Phase 16 performance/repository-hygiene work is complete in PR #152. Phase 17 is merged in PR #153 and changed owner-facing Audit Log behavior: clearer language for the `NO_KNOWN_FAILURE` state, explicit unknown/degraded states when the health read fails or is invalid, and a JSON health snapshot export that contains monitoring/coverage metadata but no audit event contents. It does not add a new durable audit store or reconstruct missing events.
- Preserve the plain JS/no-build architecture and no-external-runtime-assets policy. No React/UI package, remote font/icon service or dependency is added; app CSP remains strict and studio HTML uses no inline scripts, handlers or styles.
- `scripts/verify-frontend-release.js` now checks the kit CSS is linked by `index.html` and present in the service-worker shell. Browser E2E should verify static gallery loading/CSP, component tokens and no page-level overflow across narrow through desktop widths.
- Phase 13 operational release proof remains an owner-controlled P0 gate: live Apps Script project/version, execution identity, Sheet/Drive permissions, role/receipt access, scheduled backup, isolated restore and production reconciliation cannot be established by source/mock tests. Do not deploy or mutate production.
- The repository declares Node `>=20 <23`; verify local Node version before running checks.
- Preserve the protected local untracked `docs/AI-ENGINEERING-PROTOCOL.md` if present; never stage, overwrite or delete it.
- Real-device recovery, zoom/reflow, manual keyboard traversal, screen-reader checks and role-based operator review remain open even if automation passes.

## Phase 10 — UI refresh integration and dashboard trust states

**Completed and merged in PR #141** at `42ff7708535d04c15510caf90c5f93738109669e`. The implementation adds a local inline SVG sprite, allowlisted icon helper, DOM-created navigation icons, Dashboard KPI icons and a needs-attention panel, removes breadcrumbs, bumps the app-shell cache version to `cv2-v16`, and adds focused browser coverage.

- The panel inspects only approval/review exceptions, offline state, malformed records and invalid monetary values. Its empty state says no known dashboard exceptions were found in those checks and explicitly does not verify backups, the full recovery queue or release readiness.
- Icon names are constrained to app-authored values, and Dashboard route actions are restricted to the Register action. No external icon package/runtime request is added.
- The Dashboard statement fingerprint was reviewed and updated to `2977910e`; independent sink-count/API and source-fingerprint gates remain active.
- CI, Browser E2E and Full Flight Test passed on the same exact pre-merge head `d2b354474fb6b4ad67ad055bd33ff75925bee7d8`. The PR reports post-merge main CI passed; check the live Actions page before any release decision.
- No backend approval-policy change, schema migration, historical backfill, `clasp push`, Apps Script deployment or production-data mutation was performed. The repository owner retains merge/release authority.

## Phase acceptance criteria

- Merge target and ancestry are accurately described; a feature-only PR is not treated as a mainline release.
- Dashboard has no universal safety/all-clear claim while backup, all queue states and release controls are not checked.
- SVG renderer inputs and navigation action keys are allowlisted.
- Service-worker cache/precache, CSP and offline shell behavior are checked.
- Changed sink fingerprint matches exact source and hostile-data browser coverage.
- CI, Browser E2E and Full Flight Test pass on one final SHA; post-merge CI is checked separately.
- No live-service, device, assistive-technology or deployment test is claimed without evidence.

## Remaining risks and owner-controlled operational gates

- Main after PR #152 retains 17 active HTML assignment sites across eight frontend modules. Phase 17 is limited to the Audit Log UI/action mapping and browser regression coverage; no backend/audit data contract changes are proposed.
- Live Apps Script deployment identity/version, Sheet/Drive permissions, role/receipt authorization, scheduled backup, isolated restore, device/offline/accessibility and real-service quotas/concurrency remain unverified.
- Investigate the documented audit-write dual-failure observability limit without fabricating missing events.
- Reassess the `@google/clasp -> micromatch -> braces` dependency exception by 9 November 2026.
- Preserve the protected local untracked `docs/AI-ENGINEERING-PROTOCOL.md`; never stage, overwrite or delete it.
- `docs/HANDOFF.md` is the single canonical handoff. Do not create per-PR handoff documents.

## Phase 11 — contextual rendering-security review and sink retirement

**Batches 1–3 — merged in PRs #143–#145:** Users loading/error, payment-save/bulk completion, Reports/Cash Close access denied and Register totals/status templates were moved to DOM APIs. Inventory reduced from 27 to 19; each merged batch passed its recorded exact-head gates.

**Batch 4 — merged in PR #146:** the My Account profile/PIN page and offline outbox banner/review details now use DOM construction. The sink count is 19 → 17 across eight modules, hostile stored profile/queue content is tested as inert, and existing queue action keys and account controls are preserved. However, the full Browser E2E and Full Flight Test on exact PR head `c1c56053cee6f1daaa028ee3acc3a5696c15821c` each report one failing check: `My Account preserves sign-out and Change PIN controls after DOM rendering`. Do not describe Batch 4 as fully verified until the fix below passes all required workflows.

**Batch 4 follow-up — PR #147, merged into main at `61e46989032985fba54ceb48d768ab57430aa48a`:** explicitly assigns `type='submit'` to the Change PIN submit control. The previous DOM renderer relied on the browser's default button type without setting the attribute, while Browser E2E looks for `button[type=submit]`. CI/quality, Browser E2E (358 checks, 0 failures) and Full Flight Test (281 backend checks plus 358 browser checks, 0 failures) passed on exact PR head `bfdbbb401c397730b12480fec5ac9fd1e57072d9`. This is a focused correction, not a financial/authorization policy or sink-count change.

**Acceptance boundary:** frontend rendering and focused Browser E2E only. No `clasp push`, Apps Script deployment, production-data mutation, schema change, merge or release is performed by this follow-up. It is incremental risk reduction, not XSS certification.

## Next phases — grouped outcome plan

**Phase 12 — Cross-workflow integrity and recovery: complete.** PR #148 merged; endpoint-bound outbox isolation regression and canonical evidence reconciliation passed all required exact-head workflows.

**Phase 13 — Operational release proof: P0 owner-controlled blocker.** Verify Apps Script project/version, execution identity, Sheet binding, live role/receipt permissions, a real scheduled backup, isolated restore and voucher/receipt reconciliation only with explicit owner authorization. Mock CI cannot satisfy this phase.

**Phase 14 — Whole-product UX completion: Batch 1 complete in PR #150.** Register keyboard table scrolling and Reports responsive/focus regression guardrails are merged. Manual device, zoom and assistive-technology checks remain open.

**Phase 15 — FrontUI Studio + shared component kit: complete in PR #151.** Static gallery, shared CSS tokens/components and offline/release-integrity coverage are merged. Manual device/accessibility and owner-controlled release gates remain open.

**Phase 16 — Evidence-led performance and repository hygiene: complete in PR #152.** Repeated seeded mock measurements are captured as a versioned JSON workflow artifact; the dependency exception was rechecked with its original deadline preserved.

**Phase 17 — Audit monitoring clarity and portable health snapshot: completed in PR #153.** The owner-facing UI explicitly explains the dual-store blind spot, keeps health request/invalid-response states visibly unknown, and downloads a JSON snapshot of status and coverage metadata. It does not persist a second audit log, claim history completeness, or reconstruct missing events. Phase 13 live release proof remains an owner-controlled P0 gate.

**Phase 18 — Actionable diagnostic exports: complete in PR #154**, merged at `17665e82c3acd26d717c796d1eecd79c42a963b7`. Settings offers schema-versioned JSON exports for validated data-quality and backup-integrity reports; failed/invalid refreshes do not leave stale export actions.

## Phase 19 — staging and UAT implementation status

- Added a read-only owner/settings-authorized backend readiness probe that reports Script ID, bound Sheet/Drive targets, expected sheet headers and backup-trigger presence without returning voucher rows or credentials.
- Added fail-closed staging target validation, an isolated temporary Clasp workspace/HOME, a no-cache local staging web server, a separate staging Playwright UAT script and a manually dispatched GitHub staging workflow.
- The transactional UAT is configured to create, approve and cancel one unique INR 10,000 staging payment after target isolation is verified; it asserts the approved-payment total remains unchanged while pending, rises only after independent approval, and returns to baseline after cancellation.
- **Not yet provisioned or executed against real Google resources:** GitHub Environment `staging`, staging Apps Script/Sheet/Drive resources, first versioned staging deployment, Clasp OAuth secret, and separate UAT account secrets. The automated pipeline cannot deploy or perform live UAT until the owner provides these. No production deployment or live Google data mutation has been performed by this change.
- Remaining non-automated UAT gates: real scheduled backup and witnessed restore/reconciliation, device/offline/assistive-technology validation and Google quota/lock-contention testing in an authorized environment.

## Phase 20 — harden staging OAuth diagnostic redaction

- Code review found that the staging deployer's `sanitized()` function redacted the complete `CLASPRC_JSON` string but did not independently redact nested access tokens, refresh tokens, ID tokens, OAuth client IDs/secrets, or other strings stored inside the credential document if a Clasp diagnostic echoed one field separately.
- The candidate adds recursive extraction of sensitive scalar values from the parsed Clasp credential document and redacts those values before any Clasp output is printed.
- Regression coverage injects representative nested OAuth fields into simulated diagnostics and asserts that no credential value survives sanitization. The existing `test/test-staging-pipeline.js` command is part of `npm test`.
- The change is source/test-only. It does not execute Clasp, access Google credentials, deploy staging or production, or mutate voucher data.
- Live staging provisioning and owner-authorized UAT remain blocked on separate Google resources, the protected GitHub `staging` environment, isolated Clasp OAuth credentials and dedicated Owner/Manager test accounts. Do not infer that these are provisioned from CI.

## Phase 21 — premium light frontend redesign (completed in PR #157)

- Art direction: warm ivory canvas, near-white surfaces, soft blue-grey secondary information, restrained gold-brown primary actions, and pale beige selected navigation. Keep the dashboard light-first while preserving an explicit, user-selectable dark theme.
- Bulk scope: shared application shell/navigation, top bar/account states, typography, cards and KPI composition, segmented filters, forms/buttons, status badges, tables, charts, modals, notifications and responsive mobile navigation.
- Dashboard presentation is reorganized around a scoped overview, compact horizontal KPI cards, a clearly separated date-range control, trend panel and vendor/category breakdowns. No financial calculation, approval state, voucher schema, authorization, audit or offline queue semantics should change.
- Add a design-system regression gate and update contrast verification to measure the new navigation surfaces and active-state text. Existing DOM-sink source/fingerprint gates remain unchanged.
- Default first-use theme is light; a previously saved explicit theme preference remains respected. No framework, external font/icon service, dependency, API or production integration is introduced.
- Operational release proof remains P0 and owner-controlled. The visual batch is not staging/production verification.


## Phase 22 — authentication race regression and project-record reconciliation (candidate)

- Source review confirms login failure counters are updated inside `withScriptLock_`; current-PIN failures are throttled for 15 minutes; owner PIN reset clears both lockout counters; write routes acquire the shared lock and authenticate the session inside the lock before invoking a write handler.
- The remaining regression gap is the interval around write-lock acquisition. The candidate adds a deterministic test hook that invalidates a cached session after lock acquisition but before route authentication. The test must prove the route returns `SESSION`, appends no voucher, and releases the acquired lock.
- The test hook is one-shot and exists only in the in-memory mock. It does not simulate real simultaneous Apps Script executions or prove live authorization.
- Reconcile the current main/PR state in the handoff, roadmap, backlog, project guide and release-readiness status. Do not modify financial policy or run migrations/deployments.
- Next cash-close enhancement requiring an owner decision: denomination rows remain optional and must not be assumed useful or made mandatory without approval; the existing close MVP is already implemented.
