# Product Requirements Baseline

**Status:** Current product/requirements baseline; source capability and live operational guarantees are tracked separately.  
**Updated:** 17 October 2026  
**Product today:** Single-property cash-voucher PWA using a static frontend, Google Apps Script API, Google Sheets, and Google Drive. Phases 37–39, customer static packaging and password-authentication/staging-readiness PR #169 are merged at main SHA `8e18b4f3ed8601f70e192b6d32587675ad4cdb7b`. The active queue is owner-provisioned staging, live backup/restore and first-customer acceptance.

## 1. Purpose and decision boundary

This document translates the supplied code-review memo into a practical product direction for the current repository. It separates current capabilities, near-term product requirements, owner decisions, and longer-term business options.

The review memo includes a possible hosted fintech and multi-property acquisition strategy. That strategy is not an approved requirement for this product. The current product should remain useful as a low-cost, single-property tool while near-term owner and staff problems are validated.

This document is a requirements proposal, not approval to change the product architecture, data model, APIs, or production deployment.

## 2. Product objective

Help an owner or manager answer four questions reliably:

1. What cash should be physically present?
2. Which vouchers explain the balance and any discrepancy?
3. Which entries need attention, evidence, or correction?
4. Can the business recover its records after a device, user, or service failure?

The product should prioritize trustworthy records and clear exceptions over a large number of features.

## 3. Users and primary jobs

### Owner

- Review money movement and unresolved exceptions.
- Understand whether reported figures come from synchronized records.
- Control access, review sensitive changes, and recover business records.
- Export records for an accountant without losing traceability.

### Manager

- Review staff entries and resolve operational exceptions within granted permissions.
- Explain corrections and cancellations.
- Complete a close only under owner-approved rules and authorized permissions.

### Staff

- Create an accurate voucher quickly on a phone.
- Attach available supporting evidence.
- Understand whether an entry is saved locally or synchronized centrally.
- View only records allowed by the server-enforced permission model.

### Accountant — implemented in source; deployment and export fit unverified

The repository contains an accountant role with constrained report access and automated browser/API tests. Confirm its live deployed permissions before relying on it. The receiving accountant's product/version, export format, source-field inventory, reconciliation controls and tax-data decision gates still need owner approval; the export is not destination-certified or tax-ready. See `docs/ACCOUNTANT-RECORDKEEPING-AND-REPORTING-REQUIREMENTS.md`.

## 4. Product principles

- **Trust before expansion:** correctness, authorization, traceability, and recovery precede speculative features.
- **Source-linked numbers:** every reported total should identify the records that contribute to it.
- **Explicit uncertainty:** distinguish verified, synchronized data from pending, stale, provisional, or unresolved data.
- **Server authority:** authorization, validation, financial totals, and durable writes must not rely on client-only controls.
- **Corrections preserve history:** do not silently rewrite a previously reconciled result; define attributable correction semantics first.
- **Offline honesty:** local persistence is not the same as central synchronization or backup.
- **Simple mobile workflows:** one clear primary action, readable forms, explicit feedback, and accessible status cues.
- **Evidence-led scope:** do not add dependencies, services, roles, or infrastructure without a validated need.

## 5. Current capabilities and boundaries

The current repository documents and implements voucher entry for payments and receipts, separate numbering series, role-based access, receipt images, dashboard/register reporting, CSV/print, bulk import, an offline outbox/recovery path, and backup/audit mechanisms.

These capabilities do not by themselves guarantee:

- A tamper-evident financial ledger.
- A completed daily physical-cash close.
- A verified production backup restore.
- Correct permissions in the live Google deployment.
- Real-device accessibility, usability, or performance targets.
- An accountant-specific compliant export.
- Multi-property tenant isolation or digital movement of funds.

See `docs/PRODUCT-ROADMAP.md`, `docs/DATA-DURABILITY.md`, `docs/RELEASE-READINESS.md`, and `docs/UI-UX-REVIEW.md` for the current gap register and operational limitations.

## 6. Proposed priority order

### P0 — Operational trust and security evidence

Keep the existing security and durability baseline accurate. Verify live deployment permissions, private Sheet/Drive access, backup restoration, session and role behavior, and user-controlled rendering paths through explicit operational or engineering work. Do not claim these are verified solely because source code or mock tests exist.

### P1 — Daily cash close and physical reconciliation

The cash-impact policy and Daily Cash Close MVP are implemented in source and merged in PRs #110 and #111. The approved policy uses an explicit voucher-level `CashImpact` value: new vouchers require `CASH_IN`, `CASH_OUT`, or `NO_CASH`; `UNCLASSIFIED` is reserved for historical or unresolved records. Category values are editable suggestions only. Historical values are not backfilled, and unresolved active vouchers block final close.

The MVP defines one property / MAIN drawer / calendar day in Asia/Kolkata, previous-day counted-cash carry-forward, a reasoned manual opening where a prior-day close is missing, traceable immutable snapshots, chronological finalization and attributed correction notes. These source features do not prove a live deployment, a verified backup/restore, or a real-world reconciliation. See `docs/DAILY-CASH-CLOSE-DESIGN.md` for the policy record and `docs/APPS-SCRIPT-RELEASE-RUNBOOK.md` for the separately authorized migrations and release gates.

### P2 — Evidence and exception workflow

Potential next product requirements, subject to validation:

- Make unresolved operational issues discoverable without forcing the owner to inspect every voucher.
- Audit-log discoverability and traceability include structured transaction-lifecycle events, field-level old/new changes and reasons where applicable, plus cursor-based older-page loading. Filters/CSV cover loaded pages only. Confirm retention, tamper-evidence and durable audit-write requirements before claiming a complete financial audit trail.
- **Approval policy approved 13 October 2026:** new PAYMENT vouchers at or above INR 10,000 require approval by an existing owner/manager other than the creator. Pending/rejected or malformed approval states are excluded from approved payment totals and block final cash close until resolved. Rejection requires a reason; historical blank approval values are not backfilled. The policy and implementation are documented in the repository history. The live open-PR search on 14 October 2026 returned no open PRs; verify the relevant PR's final state and merge SHA before treating any implementation as pending. Payee-day aggregation uses stable VendorID when both records have non-empty IDs; if either record is legacy/unlinked, use a normalized, case-insensitive vendor-name fallback. Distinct non-empty IDs remain distinct even if the display names match. This fallback must not silently backfill historical IDs.
- Keep each exception explainable and linked to source records.

Do not create automated fraud flags until duplicate rules, false-positive handling, override attribution, and review ownership are specified.

### P3 — Accountant and reporting workflow

The previously documented PR #114 implementation adds a report-only `accountant` role with server-authorized access to generic Recorded Movement Report CSV, not voucher editing, cash close, user administration or vendor-contact management. Stable `VendorID` values are exposed and included in exports; new vouchers store the ID when a unique saved vendor name is matched exactly. Historical links are not backfilled, and unmatched/ambiguous counterparty names remain unresolved and visible.

The export deliberately remains destination-neutral. The first accounting software/version, import route, accountant-approved sample/mapping and tax-specific fields are open owner/accountant decisions. No Tally/Zoho compatibility, GST/TDS calculation, general-ledger claim or statutory readiness is implied.

### P4 — UX and operational support

Prioritize mobile task completion, clear empty/loading/error/offline states, accessible contrast and focus, safe updates, visible app version, backup status, and a simple problem-reporting path. Use real users and devices to validate outcomes before claiming success.

### P5 — Strategic options requiring discovery

Multi-property tenancy, relational database migration, shared vendor/price intelligence, OCR, language/voice entry, digital payouts, hosted SaaS, and lending integrations are options—not committed scope. Validate buyer, willingness to pay, consent, legal/compliance obligations, payment-rail availability, support costs, and data separation first.

## 7. Proposed functional requirements

These are requirements for future design and prioritization, not claims that the behavior exists today.

### PR-01 — Voucher traceability

Every financial summary must identify its source records and state the inclusion rules used. A user must be able to move from a total to the underlying vouchers without relying on category labels alone.

### PR-02 — Synchronization transparency

The interface must distinguish locally saved, pending synchronization, synchronized, failed, and recovery-required states wherever these states affect the user's confidence in the record.

### PR-03 — Permission integrity

The server must authorize each protected operation. The UI may hide unavailable actions but must not be treated as the security boundary.

### PR-04 — Evidence handling

Where a receipt or attachment is expected, the product should show whether evidence is present and allow a user to locate it. Any mandatory-evidence rule needs owner approval and a defined exception path.

### PR-05 — Correctable, attributable records

Voucher edits are restricted by server-enforced edit permissions and must include a reason of 3–200 characters whenever one or more editable fields actually change. Each correction audit event records the actor, timestamp, voucher target, reason, and the changed fields' before/after values. No-op edits are rejected rather than creating a misleading correction event. Cancellation continues to require its own reason.

This history is stored in the existing best-effort AuditLog sheet; it is not a tamper-proof ledger, and failure of the audit write is not an atomic rollback of the voucher update. Do not rely on this history as a cash-close control until reliability and recovery behavior have been reviewed. Approvals and future close corrections still require explicitly agreed permissions and policy.

### PR-06 — Recoverability

Document backup coverage, last known successful backup, restore procedure, ownership, and limitations. A backup is not proven recoverable until a restore drill succeeds.

### PR-07 — Cash-close correctness

A future close must use server-authoritative source records, approved period and cash-impact rules, traceable totals, and an explicit unresolved-voucher policy. It must not infer physical cash movement from category names.

### PR-08 — Export ownership

Before adding accounting-specific exports, define the target accounting system, column mapping, amount/date conventions, tax-field responsibility, privacy boundaries, and reconciliation expectations.

### PR-09 — Safe workflow automation

Automation should reduce repetitive operator work without obscuring financial state or creating duplicate records. Each workflow needs an explicit trigger, timezone where relevant, authorization check, idempotency rule, visible outcome, retry/failure behavior, audit trail, privacy boundary and owner-controlled disable path. Scheduled summaries, recurring vouchers, cash-close automation and external delivery remain proposals until their business rules and accountable owners are agreed. See `docs/REPORTING-AND-AUTOMATION-DESIGN.md`.

## 8. Candidate success measures

Treat these as measurement candidates, not approved service-level objectives or promises.

- **Entry efficiency:** median time and error rate for a staff member to create a valid voucher on a representative phone.
- **Traceability:** percentage of report totals that can be reconciled to identified source records.
- **Synchronization clarity:** number of users who incorrectly believe a pending local entry is centrally saved during usability observation.
- **Recovery:** completion and integrity of a documented backup-restore drill.
- **Cash reconciliation:** amount and age of unresolved cash variance after a business-approved close process exists.
- **Accessibility:** verified keyboard/focus, contrast, zoom, and assistive-technology outcomes.
- **Performance:** measured create/list latency at representative data volumes, with sample size and environment recorded.

Do not adopt numeric targets such as sub-300 ms latency, under-one-second usability, or a specific fraud false-positive rate until the measurement environment, sample, and business acceptance criteria are defined.

## 9. Remaining owner/accountant decisions

The current release target is one property per isolated instance. Do not imply that the existing product provides multi-property tenancy or chain-wide data isolation. For this first project, the immediate gate is deployment, role/receipt proof, backup/restore and device recovery—not adding new financial or tax semantics.

The following choices remain unresolved for future scope:

- Which accounting package/version and import route does the receiving accountant use, and what anonymized fixture/mapping will they approve?
- Which entity/tax facts, mandatory source documents and tax treatments should be encoded, if any? A qualified Indian CA must validate tax requirements before implementation.
- Which business exceptions beyond the already owner-approved payment-approval and cash-close policies require explicit responsibility/retention/escalation rules?
- Which metrics should be reviewed monthly, and what representative samples/measurement method will make targets meaningful?
- Should optional denomination rows be added to Daily Cash Close? Do not change the current schema or make the breakdown mandatory without an explicit owner decision.
- Which multi-property, chain, digital-payout or AI/network options should remain out of scope until first-customer and support economics are measured?

For the approved cash-close and payment-approval policies, the detailed current decisions remain in `docs/DAILY-CASH-CLOSE-DESIGN.md`. Current staging and operational blockers are tracked in `docs/STAGING-RELEASE-AUDIT.md`; this document does not authorize migrations or deployment.

## 10. Acceptance criteria for this requirements baseline

- Current capabilities are distinguished from proposed features and unverified operational guarantees.
- Near-term requirements are separated from hosted fintech and multi-property strategy.
- Each proposed requirement has a clear user outcome and testable direction.
- Numeric targets from the supplied memo are not treated as commitments without a defined measurement method.
- The roadmap and handoff link to this document and distinguish merged source features from independent live cash-close/deployment and recovery gates.
- This documentation-only phase changes no application code, API, schema, dependencies, production data, or deployment settings.

## Phase 1 status reconciliation — 14 October 2026

Current live source baseline is `255d78ccb6a21b204d432221489114ccf514d333` (PR #126 merge). The repository audit is recorded in `docs/PHASE-1-REPOSITORY-AUDIT.md`. Historical references to active PRs are not authoritative; use current GitHub PR metadata. Product policy in this document remains subject to the owner-approved decisions already recorded above.
