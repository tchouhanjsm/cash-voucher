# Reporting Export and Workflow Automation Contract

**Phase:** PR #59 — requirements and safety contract  
**Status:** proposed for owner review; no application behavior changes  
**Baseline:** `main` at `544e0170fdb9333d62f7efa40dc512c84a28c1a6` (PR #58 merge)  
**Scope:** single-property cash-voucher PWA; reporting, accountant exports, and safe workflow automation.

## 1. Purpose

Prepare the next implementation decisions without inventing accounting policy or silently scheduling financial operations. The current Audit CSV is a filtered export of the latest 200 events, not a full-history accounting export. Reporting must remain traceable to source vouchers and preserve existing server-side authorization.

## 2. Reporting and export contract

Any new financial report/export should satisfy these baseline rules:

- **Traceability:** each reported total must be explainable from identified source vouchers and documented inclusion rules.
- **Stable semantics:** document whether cancelled, edited, cash-received, and payment vouchers are included; never infer cash movement from category labels alone.
- **Explicit range:** show the selected period, timezone/date interpretation, generation time, and whether results are complete or limited.
- **Reconciliation:** provide record counts and totals that can be compared with the source register; totals must not silently omit failed or unsynchronized records.
- **Safe serialization:** neutralize spreadsheet formulas in untrusted text fields, preserve dates/amounts consistently, and test commas, quotes, newlines, Unicode and leading formula characters.
- **Least privilege:** reuse server-side authorization. A hidden menu item is not access control. Accountant read/export access, if needed, requires a separate owner-approved role and server checks.
- **No false guarantee:** an export file being downloaded does not prove that it was imported successfully by an accounting package.

### Destination decision

**No first accounting destination is confirmed in this phase.** Before implementing a destination-specific export, record the chosen product/version and obtain an accountant-reviewed sample/template. Do not assume Tally, Zoho Books, Excel, or another destination.

The implementation brief must specify:

1. Target application/version and import path.
2. Required columns, identifiers, date format, decimal convention, currency and sign convention.
3. Voucher-type and status mapping, treatment of edits/cancellations, and duplicate-import/idempotency behavior.
4. Tax fields (GSTIN, GST amount, HSN/SAC, TDS) only when the accountable owner/accountant defines them and provides validation rules.
5. Expected totals, reconciliation method, privacy boundaries and a representative anonymized acceptance fixture.
6. Who approves the mapping and who supports import failures.

Until those are agreed, retain the existing generic audit CSV and do not add speculative financial fields or claim accounting-system compatibility.

## 3. Workflow automation inventory

Automation should remove repetitive work without hiding financial state or creating duplicate transactions. These are candidates, not approved commitments.

| Candidate | User value | Preconditions / safeguards | Recommendation |
|---|---|---|---|
| Pending-sync reminder and recovery entry point | Helps staff notice records that are local-only or failed to sync | Must read the real outbox state; never label local-only data as centrally saved; avoid repeated noisy alerts | High-value candidate for the #60 review |
| Reusable voucher presets | Speeds up genuinely repetitive entries | Owner confirms which fields may be prefilled; never auto-submit a financial voucher; show a review/confirm step | Validate through observed staff tasks first |
| Scheduled owner summary | Reduces manual reporting | Owner-approved metrics, timezone, schedule, recipient, delivery channel, privacy and retry behavior | Blocked on explicit policy and delivery decisions |
| Automated backup/restore assurance | Improves recovery confidence | A status ping is not a restore drill; test in a separate destination, verify snapshot integrity and permissions | Operational drill before automation claims |
| Daily cash close and variance notifications | Supports physical cash reconciliation | Requires approval of `docs/DAILY-CASH-CLOSE-DESIGN.md`, dated opening balances, cash-impact rules, period locking and correction policy | **Blocked; do not implement yet** |
| Recurring vouchers / petty-cash floats | Avoids repeated setup | Validate actual usage, recurrence boundaries, cancellation, duplicate prevention and authorization | Defer until evidence from real users |

## 4. Automation safety contract

Before an automated workflow ships, its brief and tests must define:

- **Trigger and clock:** user action or schedule, timezone, daylight-saving behavior where relevant, and start/stop controls.
- **Idempotency:** retries must not create duplicate vouchers, exports, notifications, or close records.
- **Authority:** the server rechecks authorization for every protected operation; automation never elevates a user's permission.
- **Visibility:** users can see last run, next run (if scheduled), outcome, scope, and actionable failure/retry guidance.
- **Failure behavior:** transient failures may be retried safely; permanent failures are surfaced; no silent success or data loss.
- **Auditability:** record who configured/ran the workflow and the outcome, without logging secrets or unnecessary financial/personal data.
- **Privacy and delivery:** explicit recipient, minimum necessary data, secure destination, and no financial data in public logs.
- **Kill switch:** owner can disable a scheduled workflow without deleting its history.
- **Testability:** deterministic clock, duplicate/retry tests, permission-denial tests, partial-failure tests, and accessible UI state coverage.

No scheduled trigger, external delivery, production-data mutation, Apps Script deployment, or new financial schema is authorized by this design phase.

## 5. Acceptance criteria for implementation planning

- Existing behavior is distinguished from proposed automation.
- One report/export destination is selected by the owner/accountant before destination-specific code begins.
- Every automated workflow has a named user, trigger, preconditions, permission model, idempotency rule, failure path and acceptance test.
- The implementation sequence favors low-risk staff friction reduction before financial automation.
- Daily cash close remains gated by owner approval of its design.
- No unsupported claim is made about live Google authorization, backup restoreability, or accounting import success.

## 6. Owner decisions to capture

1. Which accounting destination and version should be supported first, if any?
2. Who can validate its import template and sample output?
3. Which repetitive staff task should be observed first for automation: pending-sync recovery, reusable voucher setup, or another real workflow?
4. Are owner summaries wanted? If yes, what metrics, schedule/timezone, recipient and delivery channel?
5. What evidence is required before backup/restore can be described as operationally reliable?

## 7. Next phase

**PR #60 is reserved for a cross-functional retrospective and code review** across the shipped product, backend/API, frontend UX, CI/CD, security, QA and workflow automation. It should inspect the actual merged code and evidence, rank improvements by real-world risk/value, and publish an actionable backlog. It must not be a catch-all implementation PR. After that review, implement the highest-value bounded item in a separate PR.
