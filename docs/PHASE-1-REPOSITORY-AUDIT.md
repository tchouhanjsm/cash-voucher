# Phase 1 — Repository and Operational Readiness Audit

**Audit date:** 14 October 2026  
**Audited main:** `255d78ccb6a21b204d432221489114ccf514d333` (PR #126 merge)  
**Method:** live GitHub tree, source and documentation review; latest Actions metadata; no local checkout, Google account, deployed Apps Script, production Sheet/Drive, phone or restore destination was accessed.

## Follow-up evidence — 15 October 2026

The audit below is the original 14 October / PR #126 snapshot, retained as historical evidence. The last verified main baseline before PR #132 was `69f861f86d08a19da8fe1223b3bc6c4840478895` (PR #131 merge). The active branch contains a consolidated cross-phase batch.

New evidence work in PR #132 includes a high-confidence credential-pattern scan across current tracked text and reachable Git diff history; an API route-registry guard checking unauthenticated fail-closed behavior and declared write actions; and deterministic mock workloads validating bootstrap/report completeness and totals at 100, 500 and 1,000 voucher rows. Treat all as pending until CI passes on the final PR head. These are not a complete secret scanner, a full action-by-role authorization matrix, XSS certification, Google Sheets scale test or production verification.

Still open: complete active DOM-sink review; live role and deployment authorization review; actual backup and separate-destination restore; physical-device recovery/accessibility; and real service latency/quota/concurrency evidence.

---

## Follow-up — 15 October 2026

The original audit below is a historical snapshot. PR #132 is merged on main at 8169cd69cba1251121cc018683c2978a360c037c. Phase 4 adds an authenticated role/action test, own/foreign voucher and receipt visibility assertions, a reviewed per-module inventory of the current 33 innerHTML assignment sites, and a drift gate rejecting new designated high-risk DOM APIs. Passing these tests is source evidence only; the live Apps Script role configuration, deployed version, Sheet/Drive permission model, backup/restore and physical-device behavior remain unverified.

---

## Follow-up — PR #134 merged and Phase 6 proposed (15 October 2026)

- Current merged `main` after PR #134: `0cf47fc8d77f5dd7429a62c57ab8ec77309873f3`.
- PR #134's exact tested head `428db8af06d0eeaa9ddede9e3a8dc06d5c6f9280` passed CI, Browser E2E (342 checks) and Full Flight Test.
- Per-statement fingerprints supplement the 33-site count/API gate; they are drift markers, not contextual-safety proofs.
- PR #135 proposes converting five text/status/error-only sinks to DOM nodes, adding hostile server-error E2E coverage and lowering the proposed sink count from 33 to 28. This is not merged evidence until its final-head workflows pass.
- Live deployment/version, real authorization, scheduled backup, separate-destination restore, device recovery/accessibility, and production quota/concurrency evidence remain unverified.

---

## Follow-up — Phase 6 merged and Phase 7 proposed (15 October 2026)

- Current merged `main` after PR #135: `572b5d68fb6b6a572a08deab908c0b83d44aba62`. Post-merge CI passed: https://github.com/tchouhanjsm/cash-voucher/actions/runs/38701556441.
- PR #135 exact tested head `c4d163bcc05b543a004dcd12a617319b27a98f32` passed CI, Browser E2E (343 checks, zero failures) and Full Flight Test. The active source inventory is now 28 `innerHTML` assignment sites across nine modules.
- PR #136 adds proposed adversarial report HTML/CSV verification. It will not change business logic or the 28-site count.
- Live deployment/version, real authorization, scheduled backup, separate-destination restore, device recovery/accessibility, and production quota/concurrency evidence remain unverified.

---

## Executive decision

**Do not begin another isolated hardening PR.** The source contains a broad feature set and established automated checks, but operational readiness is explicitly unverified. Phase 1 must reconcile the product's actual state, then deliver end-to-end work packages with measurable outcomes.

Latest live repository facts:

- `main` is at `255d78ccb6a21b204d432221489114ccf514d333`.
- PR #126 is merged; no open pull requests were returned by the live PR search.
- The push-triggered CI run on that exact `main` SHA succeeded: [CI run 38570165968](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38570165968).
- The latest PR-specific Browser E2E and Full Flight Test successes were on PR #126's tested head `6c58dd1ec9913e7bffd2611caf9c11af4b6846cd`, not on the merge commit. They are valid PR-head evidence, not proof of the post-merge main commit or production.
- The repo contains 163 tree entries at the audited baseline, including modular frontend, Apps Script backend, browser E2E, backend/backup/recovery tests, and three primary Actions workflows.

## Evidence classification

### Source architecture

- **Finding:** `index.html` imports `frontend/main.js`; shared core and feature modules are separated; Apps Script source is split into `backend/*.gs`. Root `app.js` is documented as legacy.
- **Classification:** Present
- **Disposition:** Keep the active dependency graph authoritative; don't perform an architectural rewrite for its own sake.

### Voucher/approval/cash-close features

- **Finding:** Payments, receipts, approval states, cash-impact classification, Daily Cash Close, reports and audit paths are present in source and docs.
- **Classification:** Present in source
- **Disposition:** Verify complete cross-role workflows and failure recovery before declaring operational completion.

### Automated tests

- **Finding:** CI, Browser E2E and Full Flight Test exist. Latest main push CI passed. PR #126's three required checks passed on its exact tested head.
- **Classification:** Present; bounded evidence
- **Disposition:** Capture exact-SHA results for each new PR; distinguish source tests from production verification.

### Release documentation

- **Finding:** `docs/HANDOFF.md` still reports main at PR #125 and labels PR #126 as the current engineering sprint, despite PR #126 being merged. `docs/RELEASE-READINESS.md` has older baseline details.
- **Classification:** Confirmed documentation drift
- **Disposition:** Correct in this batch and use GitHub live metadata as source of truth.

### Product status documentation

- **Finding:** `README.md` describes PR #114 as active; `docs/PRODUCT-REQUIREMENTS.md` also labels the accountant/approval batches as active. Live PR search returns no open PRs.
- **Classification:** Confirmed stale status claims
- **Disposition:** Reconcile wording to “implementation status requires verification” unless merged state is confirmed from PR history. Do not infer PR #114's current state from old text.

### Roadmap

- **Finding:** The roadmap mixes current priorities with historical PR-by-PR notes and older “current sprint” statements.
- **Classification:** Confirmed maintainability gap
- **Disposition:** Establish a current Phase 1 section and move new work to outcome-based packages; retain historical notes only as history.

### Live authorization

- **Finding:** Source includes server-side role checks, but live deployment identity, version, Sheet binding, Script Properties and role behavior are not verified by source.
- **Classification:** Not verified
- **Disposition:** Owner-authorized deployment inspection and role-based smoke test.

### Backup/restore

- **Finding:** Source includes scheduled backup, receipt copies and manifest; status metadata is not proof of snapshot completeness or restoreability.
- **Classification:** Not verified
- **Disposition:** Witness a successful live backup and restore to a separate destination; validate rows, numbering and receipt references.

### Device/offline durability

- **Finding:** IndexedDB outbox and recovery import/export exist. Device-local unsynchronized records are outside central backup until sync.
- **Classification:** Implemented in source; device proof missing
- **Disposition:** Test actual operating devices, interrupted sync, export/import and service-worker update.

### UI/accessibility

- **Finding:** Responsive, contrast and modal checks exist, but UI/UX docs explicitly leave manual screen-reader, real-device and full usability checks open.
- **Classification:** Partially verified
- **Disposition:** Role-based task observation and manual accessibility pass.

### Rendering security

- **Finding:** Targeted hostile-input tests exist; the security audit explicitly is not complete XSS certification.
- **Classification:** Partially verified
- **Disposition:** Complete sink inventory in a coherent cross-feature security batch.

### Scale/concurrency

- **Finding:** No real production latency or simultaneous Apps Script write benchmark is documented.
- **Classification:** Not verified
- **Disposition:** Benchmark seeded/mock workload first; test live only under a separately approved safe plan.

### Historical/public repository secrets

- **Finding:** Existing docs say no general Git object/secret scan was performed; public history has not been certified clean.
- **Classification:** Not verified
- **Disposition:** Run a non-destructive repository/history secret scan; rotate any real exposed credential if found. Do not rewrite history without owner approval.

## Prioritized work packages

### P1-A — Cross-workflow integrity and debugging

**Outcome:** every key user action behaves consistently from entry through server persistence, register, approval, reporting, cash close and audit.

- Build a role/action/state matrix for owner, manager and staff.
- Trace success, validation error, timeout/ambiguous response, duplicate retry, offline queue, stale session and permission denial.
- Fix root causes across related frontend/backend modules in one PR; add end-to-end regressions for each defect.
- Preserve approved rules: ₹10,000 inclusive approval threshold for new PAYMENT vouchers, no creator self-approval, rejection reason, historical blank fields not backfilled, explicit CashImpact, and immutable close snapshots.
- **Acceptance:** no financial total hides unresolved records; each failure state offers a safe recovery path; CI, Browser E2E and Full Flight Test pass on the same exact final PR head.

### P1-B — Operational release proof

**Outcome:** prove the actual deployed system and recovery path are the expected ones.

- Owner confirms target Apps Script project, deployment/version, execution identity, Sheet binding and Script Properties.
- After explicit authorization and a verified backup, review and run only necessary migrations in documented order.
- Verify owner/manager/staff authorization and receipt access against the intended live endpoint.
- Witness a scheduled backup; inspect Sheet, receipt copies and manifest; restore to a separate destination and compare counts/numbering/references.
- **Acceptance:** signed evidence checklist; no production action performed by this audit PR.

### P1-C — UX completion

**Outcome:** a coherent and learnable product across the full screen set.

- Inspect Dashboard, New Entry, Register, Bulk Import, Reports, Cash Close, Users, Vendors, Settings, Audit and Backup Status at phone/tablet/desktop widths.
- Fix cross-screen consistency in one grouped PR, not isolated CSS changes.
- Run real role-based tasks, keyboard/focus/zoom checks and screen-reader review.
- **Acceptance:** task observations, issue list, automated evidence and manual residual-risk notes.

### P1-D — Security and data-integrity closure

**Outcome:** documented coverage of all high-risk inputs and actions.

- Finish dynamic HTML/DOM sink inventory and adversarial input coverage.
- Review server-side authorization for every API action and write path.
- Check offline account binding, idempotency, import/export, audit integrity and backup boundaries.
- **Acceptance:** each finding is fixed, verified, or explicitly accepted; no unsupported claim of full certification.

### P1-E — Evidence-led performance and repository hygiene

**Outcome:** avoid speculative architecture changes and stale engineering state.

- Reconcile status claims across README, roadmap, handoff, product requirements and release readiness.
- Scan current files and Git history for exposed credentials without rewriting history.
- Establish repeatable seeded workload measurements before optimizing Apps Script scans.
- Track the known `@google/clasp → micromatch → braces` advisory exception against its documented review date.
- **Acceptance:** one current handoff, ranked backlog, repeatable baseline and dated exceptions.

## Role ownership

- **Founder/owner:** approve business/security policy, live inspection and migrations; decide release go/no-go.
- **Senior Product Owner:** maintain role/action matrix, ranked backlog and observable acceptance criteria.
- **Principal Engineer:** trace cross-module root causes, review API/data contracts and consolidate related fixes.
- **CI/CD Engineer:** keep exact-head CI/E2E/flight evidence and release gates consistent; don't equate a merge with deployment.
- **Security Reviewer:** audit permissions, sinks, secret exposure, offline isolation and backup/restore threats.
- **QA Lead:** build the end-to-end matrix, debug test failures and test recovery/negative paths.
- **UI/UX Lead:** inspect all screens as one system and plan role-based real-device/accessibility validation.

## Explicitly outside this audit

No code behavior, accounting rules, backend/API contract, schema, production data, Google deployment, migration, force-push, history rewrite, branch deletion or live backup/restore was changed or run. This document is a source-based audit, not production sign-off.

## Exit criteria for Phase 1

1. Stale status claims corrected and one current handoff established.
2. Ranked backlog with owner, dependencies, risk and test evidence.
3. First implementation PR selected by user/business impact, not by ease of making a small change.
4. Live operational tasks remain visibly blocked until owner-authorized evidence is collected.
