# Product Requirements Baseline

**Status:** Proposed baseline for owner review  
**Updated:** 9 October 2026  
**Product today:** Single-property cash-voucher PWA using a static frontend, Google Apps Script API, Google Sheets, and Google Drive.

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

### Accountant — proposed future role

A read-only report/export role may be valuable, but it is not an existing role or approved requirement. Confirm the first accounting destination and access boundaries before designing it.

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

Continue as a design-only gate in `docs/DAILY-CASH-CLOSE-DESIGN.md`.

The current voucher schema has no explicit settlement method or physical-cash-impact field. The proposed `CASH_IN`, `CASH_OUT`, `NO_CASH`, and `UNCLASSIFIED` vocabulary is not yet an approved schema or policy.

Do not implement this workflow until the owner resolves the decisions recorded in the design document, including period boundaries, opening cash, historical vouchers, pending offline entries, permissions, variance handling, and post-close corrections.

### P2 — Evidence and exception workflow

Potential next product requirements, subject to validation:

- Make unresolved operational issues discoverable without forcing the owner to inspect every voucher.
- Improve audit-log discoverability only after confirming required filters, retention, export, and access controls.
- Define approval thresholds and correction permissions from actual operating practice.
- Keep each exception explainable and linked to source records.

Do not create automated fraud flags until duplicate rules, false-positive handling, override attribution, and review ownership are specified.

### P3 — Accountant and reporting workflow

Validate which accounting tool the first users actually use. Specify export columns, tax-field ownership, reconciliation rules, and read-only access before adding GST/TDS fields or a new role.

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

Edits, cancellations, approvals, and future close corrections must have defined permissions, reasons where required, and attributable history. Do not describe the existing best-effort audit log as tamper-proof.

### PR-06 — Recoverability

Document backup coverage, last known successful backup, restore procedure, ownership, and limitations. A backup is not proven recoverable until a restore drill succeeds.

### PR-07 — Cash-close correctness

A future close must use server-authoritative source records, approved period and cash-impact rules, traceable totals, and an explicit unresolved-voucher policy. It must not infer physical cash movement from category names.

### PR-08 — Export ownership

Before adding accounting-specific exports, define the target accounting system, column mapping, amount/date conventions, tax-field responsibility, privacy boundaries, and reconciliation expectations.

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

## 9. Owner decisions required

Before turning this proposal into a committed product backlog, decide:

- Is the primary buyer the owner of one property, a small chain, or both?
- Which operational pain should be addressed immediately: cash reconciliation, backup confidence, evidence, approvals, or accountant export?
- Which role is accountable for each exception and correction?
- What is the first accounting export destination, if any?
- What does the owner consider acceptable evidence of a successful backup and restore?
- Which metrics are meaningful enough to review monthly?
- Which strategic options are explicitly out of scope for the next release?

For daily cash close, the detailed decisions remain in `docs/DAILY-CASH-CLOSE-DESIGN.md`. This requirements document does not override that owner gate.

## 10. Acceptance criteria for this requirements baseline

- Current capabilities are distinguished from proposed features and unverified operational guarantees.
- Near-term requirements are separated from hosted fintech and multi-property strategy.
- Each proposed requirement has a clear user outcome and testable direction.
- Numeric targets from the supplied memo are not treated as commitments without a defined measurement method.
- The roadmap and handoff link to this document and preserve the cash-close implementation gate.
- This documentation-only phase changes no application code, API, schema, dependencies, production data, or deployment settings.
