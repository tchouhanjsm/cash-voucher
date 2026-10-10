# Product Gap Register and Roadmap

**As of:** 10 October 2026  
**Purpose:** reconcile the attached code-review memo with the actual current v2 repository and prioritize improvements by the value and risk to a property owner.

This is a single-property cash-voucher PWA today. The attached memo's hosted fintech/multi-property concept is a strategic scenario, not an agreed requirement. The product-level scope, user outcomes, candidate measures, and owner decisions are consolidated in [Product Requirements Baseline](PRODUCT-REQUIREMENTS.md).

## 1. Code-review findings reconciled against current v2

| Finding from the supplied review                                                           | Current evidence                                                                                                                                                                                                                                      | Disposition                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner PIN/email committed in old `src/01_Config.js` / `03_Auth.js` paths                   | Those files are absent from the current main tree; current `backend/Code.gs` expects setup values in Script Properties and removes `OWNER_PIN` after owner creation. Checked path history for the cited files returned no commits in this repository. | **Not corroborated in current repository.** This does not prove the values were never used elsewhere. If the reported values were ever used, rotate the deployed owner PIN. No history rewrite was performed; rewriting public history would be a separate destructive operation requiring explicit authorization. |
| Plain SHA-256 PIN hashing                                                                  | Current `hashPin_` uses HMAC-SHA256 with per-user salt and a Script Properties pepper.                                                                                                                                                                | Resolved in current v2 source. Real properties/pepper and deployment still require operational verification.                                                                                                                                                                                                       |
| Web App executes as accessing user and staff can edit the Sheet                            | Current manifest says `USER_DEPLOYING` with anonymous web access; backend checks session/role on each protected action.                                                                                                                               | Source configuration is corrected. Verify actual deployment setting and keep Sheet/Drive private; source manifest alone cannot prove live settings.                                                                                                                                                                |
| Voucher numbers collide/reset                                                              | Writes are guarded by ScriptLock; `nextNumber_` reconciles counters with existing active data and rejects invalid persisted numbers.                                                                                                                  | Addressed in current v2 source/tests. Real concurrent load has not been stress-tested.                                                                                                                                                                                                                             |
| Staff can edit/cancel any voucher                                                          | Current `PERMS` allows staff create/view-own; edit/cancel/view-all are manager/owner capabilities.                                                                                                                                                    | Resolved in current v2 source.                                                                                                                                                                                                                                                                                     |
| PIN change leaves other sessions valid                                                     | PIN change rotates the user's salt; `auth_` checks the stored salt, invalidating old cached session tokens on use.                                                                                                                                    | Behavior is already implemented. Phase 22 adds a failed-current-PIN throttle.                                                                                                                                                                                                                                      |
| Login failures race during read-modify-write                                               | Current login counter was read and written without a lock.                                                                                                                                                                                            | **Phase 22 fix:** serialize login attempts with the ScriptLock; add a regression check for lock usage and lockout. Mock tests cannot simulate true simultaneous Apps Script calls.                                                                                                                                 |
| PIN change has no failed-attempt throttle                                                  | Current change-PIN endpoint lacked a counter.                                                                                                                                                                                                         | **Phase 22 fix:** five incorrect current-PIN attempts trigger a 15-minute cache lockout; owner PIN reset clears both related counters.                                                                                                                                                                             |
| Duplicate global functions / broken legacy user creation / active-spreadsheet lookups      | Current runtime uses one backend source file and header-mapped sheet helpers; the named old files/functions are not present in the current active layout.                                                                                             | Old-code findings not reproduced in current v2. Keep future Apps Script changes in the source-managed backend and test them.                                                                                                                                                                                       |
| Full-sheet scans may become slow                                                           | Authentication looks up the current user from the Users sheet; bootstrap loads the voucher set required by the present UI.                                                                                                                            | **Open scale risk.** Measure real row counts/latency first; consider bounded caching with explicit invalidation only when measured.                                                                                                                                                                                |
| Cancel status enum drift                                                                   | Current v2 uses explicit status values in write/read paths and tests cancellation. The old enum names from the memo were not found in this active implementation.                                                                                     | Legacy finding not reproduced as written; add centralized status constants only with a targeted tested change.                                                                                                                                                                                                     |
| Stored-XSS / dynamic `innerHTML` risk                                                      | Feature renderers use HTML templates and escaping helpers in multiple locations; no complete sink-by-sink audit has been completed.                                                                                                                   | **Open security review item.** Audit every user-controlled string in text and attribute contexts; add regressions for vendor, note, user, error and audit-log content.                                                                                                                                             |
| Hardcoded spreadsheet ID                                                                   | Current setup resolves the sheet into Script Properties (`SS_ID`); requests use that property.                                                                                                                                                        | Resolved in current v2 source. Keep real IDs/config values out of source where practical.                                                                                                                                                                                                                          |
| No real tests / empty README                                                               | Current repository has backend service mocks, Playwright E2E, CI, README and project/docs guides.                                                                                                                                                     | Resolved; documentation drift is addressed in Phase 22.                                                                                                                                                                                                                                                            |
| No cash-received entries, receipt evidence, dashboard/export, offline support or audit log | All exist in current source: payment/receipt type, Drive receipt images, dashboard/register CSV, IndexedDB outbox/recovery, owner audit API/table.                                                                                                    | Already implemented. Gaps remain in richer reconciliation, reporting/export formats and discoverability.                                                                                                                                                                                                           |
| No dedicated audit view                                                                    | Audit table currently appears in the owner Settings screen; the backend returns up to 200 recent events.                                                                                                                                              | **Partial product gap.** A dedicated route plus filters/export may be valuable, but should follow user interviews and careful handling of audit data.                                                                                                                                                              |
| No approvals, day close, physical cash count, budget controls or accountant role           | These are not present in the current module/API/role set reviewed.                                                                                                                                                                                    | **Open product gaps**, prioritized below.                                                                                                                                                                                                                                                                          |
| Multi-property, vendor price network, digital payouts, OCR/AI                              | Not present; would require material tenancy, finance, compliance and operations decisions.                                                                                                                                                            | Strategic options only. Do not build before buyer/problem validation.                                                                                                                                                                                                                                              |

### Security follow-up note

`docs/SECURITY-RENDERING-AUDIT.md` records the incremental rendering audit and targeted regressions. The complete dynamic-HTML sink review remains open.

The repository is public. This review did not perform a general Git object/secret scan and cannot certify that all past commits are clean. The cited old paths returned no path-history records in this repository. A history purge could disrupt consumers and requires a deliberate owner-approved migration; no force push or history rewrite is part of Phase 22.

## 2. What the owner can rely on—and what still needs proof

### Current capability

- Payment and cash-received vouchers with separate numbering.
- Role-based server authorization, user activation, PIN reset/change and audit events.
- Receipt images in Drive, dashboard/register/CSV/print, bulk import.
- Offline queue and recovery export/import designed to prevent duplicate sync.
- Daily backup mechanism present in source.
- Modular ES-module frontend and CI/browser test workflows.

### Not yet a guarantee

- No tamper-evident ledger: edits/cancellations are represented in ordinary Sheets records plus audit events, not a hash-chained immutable ledger.
- No verified live backup restore or real-device/PWA upgrade drill. The owner-only status panel exposes recorded backup metadata, but live Drive access and restoreability remain unverified.
- Browser-local queue is not central backup until synchronized.
- No owner-approved daily cash close or physical denomination reconciliation.
- No real latency/load benchmark, formal contrast audit, assisted-technology test, external pen test or full dynamic-HTML sink audit.
- No multi-property tenant separation, digital movement of funds, GST/TDS compliance rules or accountant-specific exports.

## 3. Prioritized owner-value roadmap

### P0 — Phase 22: auth protection and trustworthy project records

**Current PR scope:** serialize login failure counting under ScriptLock; throttle incorrect current-PIN attempts; clear counters on owner reset; revalidate write sessions after the write lock; align README, project guide, module contracts, durability, development workflow and release gates; add this gap register and a source-based UI/UX review.

Exit gate: exact PR CI and browser workflow pass; code-review findings are accurately labeled; no production deploy. This phase must be reviewed and merged by the owner before the next phase starts.

### P1 — Daily cash close and physical reconciliation (Phases 23–24 design gates)

**Status:** design-only; no close workflow is implemented. Phase 23 documented the close workflow and open business decisions. Phase 24 refines cash-versus-bank semantics and documents why existing voucher type/category values cannot reliably establish physical-cash movement. See `docs/DAILY-CASH-CLOSE-DESIGN.md`.

Current source has a global `Settings.openingBalance`, active/cancelled voucher statuses, separate PAYMENT/RECEIPT types, editable active vouchers, and best-effort audit events. The Vouchers schema has no settlement method or physical-cash-impact field. Receipt categories include `Bank Withdrawal`, `Owner Deposit`, `Guest Advance`, and `Refund Received`; payment categories include `Bank Charges` and `Guest Refund`. These labels do not prove physical cash entering or leaving the drawer. Dashboard “cash in hand” is global opening balance + active receipts − active payments, not daily physical-cash reconciliation.

The refined proposal uses an explicit per-voucher cash-impact concept: `CASH_IN`, `CASH_OUT`, `NO_CASH`, or `UNCLASSIFIED`. This is not an existing field or approved schema. Category names must not be used as silent classification heuristics; the same category can be cash or non-cash depending on settlement. Existing vouchers have no classification and need an owner-approved resolution policy.

Candidate expected physical cash = opening physical cash + classified CASH_IN amounts − classified CASH_OUT amounts. NO_CASH vouchers have no drawer effect but may affect bank balances or other financial reporting. Recommendation: block final close while active in-period vouchers remain UNCLASSIFIED, unless the owner explicitly approves a visibly provisional exception policy.

**Exit gate:** owner accepts the cash-impact vocabulary, historical-data policy, category semantics, and close-period/correction rules before product-code or schema changes. Phase 24 changes documentation only; no product code, API, Sheet schema, deployment, or production data is changed.

### P2 — Approval and exception controls

- Manager approval for high-value entries, cancellations or post-close corrections; configurable limit and reason.
- Reviewable rule-based flags for duplicate same-vendor/amount/date, a new vendor's unusually large first payment, off-hours entries and split payments near the approval threshold.
- Every flag explains why it appeared and links to the underlying record. Start with deterministic rules before models.
- Make decisions and overrides auditable and avoid noisy rules until real operational data exists.

### P3 — Finance and accountant workflow

- Confirm the actual first accounting destination before designing exports (e.g., Tally/Zoho-compatible CSV requirements).
- Decide which GSTIN, tax amount, HSN/SAC and TDS fields are genuinely needed; define validation and tax/accountant ownership before adding fields.
- Consider a read-only accountant role with export/report access and no transaction edits.
- Upgrade reports from voucher CSV to a reconciliation export that ties every total back to source vouchers.

### P4 — Product UI/UX quality pass

**PR #49 implementation:** broaden responsive overflow coverage across Dashboard and Register at 320–1280px, assert mobile navigation touch-target height, and verify visible keyboard focus. This improves regression detection but does not complete the formal accessibility or usability review.

**PR #50 implementation:** measured 19 source-token contrast pairs, darkened warning/chart colors where thresholds were missed, and added Escape-close/focus-restoration regression coverage for dialogs. This remains a scoped audit, not a formal WCAG conformance claim.

**PR #52 implementation:** prevent background application interaction while a modal is open, with explicit browser assertions for modal semantics, Tab/Shift+Tab cycling, disabled-submit Escape behavior, and focus restoration. Automated checks are guardrails; manual screen-reader and zoom/reflow testing remain outstanding.

**Incremental progress:** the October 2026 UI foundation batch darkens the shared muted-text token, aligns financial figures with tabular numerals, and adds Browser E2E assertions for mobile page overflow and these styles. This does not close the full UI/UX phase or establish WCAG conformance. See `docs/UI-UX-REVIEW.md`; real-device and assisted-technology review remain outstanding.

- Establish/verify design tokens for type, color, spacing, radius, elevation, and focus/selected/error states.
- Improve one-thumb mobile tasks, density/scanability, filter discoverability, empty states, loading/success/error/offline feedback.
- Formal contrast, keyboard/focus, screen-reader, zoom and motion checks; usability observation with at least one real user from each role is a starting point, not statistical validation.
- Keep glass/translucency subtle and scoped to overlays; never compromise legibility of forms, registers or receipts.
- Consider making audit logs a discoverable route with date/action/user filters and safe CSV export.

The static review is recorded in `docs/UI-UX-REVIEW.md`. This PR does not redesign the screens, so the security and documentation changes can be reviewed independently.

### P5 — Operational automation

- Complete a live backup/restore drill and verify Drive permissions and snapshot integrity. The owner-only recorded-status panel is implemented; it is not a substitute for a restore drill.
- Owner daily close summary after close workflow semantics are agreed.
- Recurring vouchers, petty-cash floats and vendor ledger only after observing actual repetitive tasks.
- User-facing version/help/report-problem affordance, support/runbook and volume thresholds.

### P6 — Scale/business bets (validate before building)

Multi-property tenancy, relational database migration, shared vendor/price benchmarks, OCR, language/voice entry, UPI/digital payouts and hosted SaaS operations are not current requirements. First validate buyer segment, willingness to pay, data separation, legal/compliance responsibility, payment-rail partner and support economics. Keep current Google Sheet self-hosting path viable until there is evidence to change it.

## 4. Phase governance

Each phase has one focused PR, actual test evidence, a two-pass review (product/workflow then security/failure/recovery), and explicit residual risks. The owner reviews and merges the PR. Do not merge or proceed to the next phase on behalf of the owner. No branch deletion, forced update, history rewrite or live deployment without explicit permission.

**PR #53 — mobile reflow and reduced-motion guardrails:** The existing reduced-motion stylesheet is now covered by browser assertions. Payment-entry rows gain a narrow-width layout that gives vendor and amount fields usable space, keeps the amount/removal controls on a consistent visual row, stacks category/note fields, and gives the remove-row action a 44px target. Browser E2E checks the 320 CSS-pixel payment-entry layout and reduced-motion media preference. This is a targeted usability improvement, not a full 400% browser-zoom or real-device certification.

**PR #53 merged:** narrow payment-entry reflow and reduced-motion browser coverage is integrated in merge commit `a6bb1ace7547114c9c8072dd7359ca901387980d`. Next focused batch (PR #54) distinguishes register filters with no matches from an empty/unavailable register and provides an accessible clear-filters action.

**PR #54 merged:** register empty-state messaging and filter recovery are integrated in merge commit `a87c1d90405b1e7cd1097c6328668f91f8cc9af4`; CI and 103 Browser E2E checks passed. **PR #55 merged:** visible refresh progress/error recovery and retryable receipt loading failures are integrated in merge commit `b73aee24b91a4b5808e05bda2e84537188c5028f`; CI passed and Browser E2E passed 106 checks / 0 failures. **PR #56 merged:** staff mobile entry now matches labels and save feedback to payment/cash-receipt mode. Exact-head CI passed and Browser E2E passed 114 checks / 0 failures. **Next batch (PR #57):** improve manager register mobile review and correction without changing backend or accounting semantics.

## Role-based usability continuation — October 2026

**PR #56 merged:** staff payment/cash-receipt entry now uses task-specific save/status wording and preserves the selected mode for the next entry. The exact PR head `9a06246c125594ff7af1201cf1f897000a744857` passed CI and Browser E2E (114 checks, 0 failures); these mock-browser results do not verify Google-account behavior or physical-device ergonomics.

**PR #57 merged:** manager register mobile review improved at-a-glance payment/receipt identity, grouped actions and narrow-screen register layout without changing backend or accounting semantics.

**Historical batch (completed by PR #58): owner audit discoverability.** Give the owner a dedicated Audit log route, local filters across the server-returned latest 200 events, and CSV export for the filtered loaded set. Preserve the existing server authorization and audit API; do not imply this export covers the full history. No new backend query, schema, role, or production behavior is introduced.

## Current phase status — PR #62 merged, PR #63 Apps Script release readiness

**PR #62 merged:** offline sync/idempotency assurance is integrated at merge commit `49f2a3db297f84093d46b247a54c93c9372f3684`. Its reviewed PR head passed CI and Browser E2E (126 checks, 0 failures), but mock tests do not establish live Google behavior.

**PR #63 — Apps Script release readiness and controlled deployment:** merged. The owner reports uploading the reviewed backend source and updating the configured existing Web App deployment to version 4. The local static/unit checks passed, but Browser E2E did not run because Playwright was missing. Node v24 is outside the repository's Node 20–22 range; npm reported three high-severity dependency findings that require triage. Live role checks and restore remain unverified.

Do not rerun `setup()` during a normal release. Do not push a new backend version until the intended project and existing deployment have been re-verified and required checks pass.

**Operational P0 after deployment:** observe a real backup and perform a restore into a separate recovery Sheet/folder. Until then, the project is not recovery-verified or production-ready.

**Next product phase after deployment/recovery evidence:** source-traceable data-quality exception reports and daily/monthly recorded-voucher movement reports. Keep GST/TDS, general-ledger claims, daily cash close and destination-specific accountant export behind existing owner/accountant/CA decision gates.

## Current implementation status — PR #65 merged

PR #65 merged at `eef7a8d46dd41b86a7ebaab4fadbf64be42e5922`. Its exact PR head `09eaac429307e4243d7a7d2fce1f16ef3402b029` passed CI and Browser E2E. The feature adds manager/owner-only recorded voucher movement reporting with source rows, validated filters, active/cancelled totals and CSV safety. It does not classify physical cash, calculate tax, or establish profit/bank balance.

## Completed phase — PR #66: backup integrity inspection

Prioritize operational assurance before expanding financial reporting. Add an owner-only read-only inspection for the ten latest managed backup snapshots:

- Verify a spreadsheet copy exists and can be opened.
- Verify required tabs and report header-schema differences as compatibility warnings.
- Verify the receipts folder and manifest exist, manifest columns are valid, manifest count matches copied receipt count, and each listed copy is present.
- Show per-snapshot pass/warning/fail results and sheet row counts without exposing Drive IDs.
- Fail closed when a snapshot cannot be inspected.

PR #66 is merged at `3c93ddd6d45052f2e53e04c713060f0da72ccdd6`. This is structural inspection only. It does not run a restore, mutate production, prune backups, or prove a restored workbook behaves correctly. The operational P0 remains a witnessed restore into a separate recovery Sheet/folder, with record counts and voucher numbering validated.

## Release and product boundaries

- The existing deployment was last reported at version 4 before PRs #64 and #65 merged. Current `main` must not be assumed deployed.
- No Clasp push, Web App deployment, `setup()`, or production-data operation is part of PR #66.
- Daily cash close, physical cash classification, GST/TDS, general-ledger claims and accountant-specific exports remain behind explicit owner/accountant/CA decisions.
- Live authorization, scheduled backup execution, Drive permissions, restoreability, real-device PWA update/install, accessibility and hotel pilot remain unverified.
- Node v24 is outside the declared Node 20–22 range; npm previously reported three high-severity dependency findings that still need triage.

## Current engineering phase — PR #67: inspection UI regression coverage

Before adding another product feature, extend browser regression coverage around the existing owner-only data-quality and backup-integrity inspection surfaces. Verify the data-quality results and its explicit accounting/tax limitation; verify backup-integrity failure messaging and retry restoration in the browser mock. This is UI failure-path coverage only, not live Drive or recovery evidence.

**Operational P0 remains independent of this PR:** verify the intended Apps Script deployment and live role boundaries, observe a real scheduled backup, and complete a witnessed restore into a separate recovery Sheet/folder. Do not declare production readiness or claim restoreability from mock tests.

## Current phase — P0 Apps Script release and recovery verification (after PR #67)

PR #67 is merged at `628f691fe9e4353cc6b701bd57c95c3e169aa495`. The owner-provided local quality gate passes on Node `v20.20.2`, and Browser E2E passes 128 checks / 0 failures. The local Clasp inventory shows four numbered versions; the configured URL matches version 4's deployment ID, with a separate `@HEAD` deployment also present. This does not establish that current `main` is deployed.

Before feature expansion, confirm the intended project, active deployment, Sheet binding and Script Properties in the Apps Script editor. Then complete live role/receipt authorization checks, observe a real scheduled backup, and witness a restore into a separate recovery Sheet/folder. No upload, deployment, `setup()`, or production mutation is authorized by this code phase. These live gates remain release blockers; targeted source-level rendering-security work may continue independently but does not substitute for live operational evidence.

## Completed phase — PR #69: DOM-only modal rendering

The next implementation batch narrows the shared modal's attack surface. `frontend/core/ui.js` must accept only a DOM Node/DocumentFragment for dialog body content; existing modal callers should create form controls, option values and user-derived text with DOM APIs. Retain the hostile persisted-vendor regression coverage for voucher edit and cancellation dialogs.

**Exit gate:** every current `dialog()` caller is migrated, the shared API rejects string bodies, CI and Browser E2E pass on the exact PR head, and the PR handoff/audit are updated. This does not certify the remaining view-level `innerHTML` sinks; continue the sink-by-sink audit in a later focused phase.

**Operational P0 remains a production-readiness blocker:** current `main` is not proven deployed, live role/receipt authorization has not been evidenced, and real backup/isolated restore have not been witnessed. No deployment or production mutation is authorized by this code phase.

## Completed phase — PR #70: escape persisted voucher numbers

PR #70 is merged at `1e656dee0266dba38d35500150889ce6020d8045`. Its exact PR head passed CI and Browser E2E (130 checks, 0 failures), including hostile persisted voucher-number coverage in register and print views.

## Completed phase — PR #71: executable full flight test

PR #71 merged at ea99e4e19be0f29e8c1afdc25828bf1b5ecce399. Its exact PR head passed the full flight workflow: dependency advisory policy, complete quality/backend gate (110 backend checks), and Browser E2E (130 checks, 0 failures). The merge commit and tested PR head share the same source tree. [Full flight run](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38043779296).

## Completed phase — PR #72: Recorded Movement Report browser journey

PR #72 merged at `13a1fd84a013d85952d04c512313e8fcf9e36475`. Its exact PR head `d7f9e928f542a831d4588935d1c05dd96ed28979` passed the full flight test, CI and Browser E2E; the browser suite passed 140 checks / 0 failures. Coverage exercises report disclosure/totals, active/cancelled and type filters, and CSV row parity with the filtered table. This remains evidence for recorded voucher movement, not physical cash, general-ledger, profit/loss or tax calculations.

## Completed phase — PR #73: report date-range rendering

PR #73 merged at `71033675cc9f52ad391f8b2d06a362551a224be6`. Its tested head passed Full Flight Test, normal CI and Browser E2E; 110 backend checks and 141 browser checks passed with zero failures. The change escapes the report date labels and tests malformed state. It is one sink-level fix, not a full XSS certification.

## Completed phase — PR #74: payment success voucher-number rendering

PR #74 merged to `main` as `970475dc440a3dc84b788087e60a73836d3d8814`. Its exact tested head `96fcc2b62e126c92318b97b3d8678302ef6dec11` passed Full Flight Test, normal CI and Browser E2E (110 backend checks; 142 browser checks, zero failures). It escaped the server-returned voucher number in the success panel and added hostile-response browser coverage. This remains a targeted fix, not complete XSS certification.

## Current engineering phase — PR #75: bulk import completion feedback

Improve the bulk-import completion panel so assistive technology receives a polite status announcement and the copy accurately distinguishes cash receipts from payments. Keep the change limited to the existing completion panel, focused Browser E2E coverage and synchronized handoff docs; no import contract, data semantics, or backend behavior changes.

**Exit gate:** Full Flight Test, normal CI and Browser E2E pass on the exact same final PR head. No deployment or production mutation.

## Product priorities after PR #75

1. **P0 — Operational assurance:** owner confirms the live Apps Script target/settings, verifies role and receipt permissions, observes a real scheduled backup and witnesses restore into a separate recovery destination. Code/CI does not replace these operations.
2. **P1 — Rendering-security audit:** continue the source-by-source inventory with regression tests for confirmed unsafe sinks. Do not claim full XSS certification until the inventory has been reviewed.
3. **P2 — UI/UX quality pass:** map staff, manager and owner tasks, then choose a free Figma community kit as a reference. Define reusable tokens and components and improve voucher entry, register filters, import review, report export, and loading/empty/error feedback incrementally.
4. **P3 — Workflow additions:** design daily cash close and physical reconciliation only after owner/accountant decisions on opening float, counted cash, variance handling, cancelled vouchers and sign-off. Keep approvals and scheduled automation behind explicit decisions; do not infer accounting/tax semantics.

**Production boundary:** live target/authorization, real backup and isolated restore remain unverified. No deployment or production mutation is authorized by this code phase.
