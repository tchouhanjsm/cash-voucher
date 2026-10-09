# Product Gap Register and Roadmap

**As of:** 9 October 2026  
**Purpose:** reconcile the attached code-review memo with the actual current v2 repository and prioritize improvements by the value and risk to a property owner.

This is a single-property cash-voucher PWA today. The attached memo's hosted fintech/multi-property concept is a strategic scenario, not an agreed requirement.

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
- No verified live backup restore or real-device/PWA upgrade drill.
- Browser-local queue is not central backup until synchronized.
- No owner-approved daily cash close or physical denomination reconciliation.
- No real latency/load benchmark, formal contrast audit, assisted-technology test, external pen test or full dynamic-HTML sink audit.
- No multi-property tenant separation, digital movement of funds, GST/TDS compliance rules or accountant-specific exports.

## 3. Prioritized owner-value roadmap

### P0 — Phase 22: auth protection and trustworthy project records

**Current PR scope:** serialize login failure counting under ScriptLock; throttle incorrect current-PIN attempts; clear counters on owner reset; revalidate write sessions after the write lock; align README, project guide, module contracts, durability, development workflow and release gates; add this gap register and a source-based UI/UX review.

Exit gate: exact PR CI and browser workflow pass; code-review findings are accurately labeled; no production deploy. This phase must be reviewed and merged by the owner before the next phase starts.

### P1 — Daily cash close and physical reconciliation (Phase 23 design)

**Status:** design proposal only; no close workflow is implemented. Phase 23 records the current source constraints, candidate business rules, failure cases and owner decisions required before a money-affecting implementation. See `docs/DAILY-CASH-CLOSE-DESIGN.md`.

Current source has a single global `Settings.openingBalance`, active/cancelled voucher statuses, separate PAYMENT/RECEIPT types, editable active vouchers, and best-effort audit events. It does not have dated opening balances, close records, close-state enforcement or a correction ledger. The dashboard's cash-in-hand figure uses the global opening balance plus all active receipts minus all active payments; it is not a daily reconciliation report.

The design must settle these points before schema/API changes:
- how a business day's opening cash is established and carried forward;
- whether one property has one drawer or multiple drawers/shifts;
- how Bank Withdrawal, Owner Deposit, bank deposits/transfers and other categories affect physical cash;
- how backdated entries and cancellation/edit after close are handled;
- how device-local offline entries are surfaced and reconciled before a close;
- whether denomination rows are needed, and who may close/reopen/correct a close.

Candidate calculation for review: expected physical cash = approved opening cash + active cash receipts in the selected close period − active cash payments in that period, with every included voucher drillable from the report. A non-zero variance should require an explanation. Any post-close correction should be a separate, attributable event rather than a silent rewrite. These are proposed rules, not implemented behavior or owner-approved policy.

Exit gate: owner reviews the business-rule/decision table and accepts the MVP boundary before an implementation PR. No schema migration, approval/sign-off workflow, day lock, Apps Script deployment or production-data change is included in the design PR.

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

- Establish/verify design tokens for type, color, spacing, radius, elevation, and focus/selected/error states.
- Improve one-thumb mobile tasks, density/scanability, filter discoverability, empty states, loading/success/error/offline feedback.
- Formal contrast, keyboard/focus, screen-reader, zoom and motion checks; usability observation with at least one real user from each role is a starting point, not statistical validation.
- Keep glass/translucency subtle and scoped to overlays; never compromise legibility of forms, registers or receipts.
- Consider making audit logs a discoverable route with date/action/user filters and safe CSV export.

The static review is recorded in `docs/UI-UX-REVIEW.md`. This PR does not redesign the screens, so the security and documentation changes can be reviewed independently.

### P5 — Operational automation

- Real daily backup monitoring and restore drill; clear last-backup status for owner.
- Owner daily close summary after close workflow semantics are agreed.
- Recurring vouchers, petty-cash floats and vendor ledger only after observing actual repetitive tasks.
- User-facing version/help/report-problem affordance, support/runbook and volume thresholds.

### P6 — Scale/business bets (validate before building)

Multi-property tenancy, relational database migration, shared vendor/price benchmarks, OCR, language/voice entry, UPI/digital payouts and hosted SaaS operations are not current requirements. First validate buyer segment, willingness to pay, data separation, legal/compliance responsibility, payment-rail partner and support economics. Keep current Google Sheet self-hosting path viable until there is evidence to change it.

## 4. Phase governance

Each phase has one focused PR, actual test evidence, a two-pass review (product/workflow then security/failure/recovery), and explicit residual risks. The owner reviews and merges the PR. Do not merge or proceed to the next phase on behalf of the owner. No branch deletion, forced update, history rewrite or live deployment without explicit permission.
