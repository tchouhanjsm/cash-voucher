# Daily Cash Close and Physical Reconciliation — Design Proposal

**Phase:** 23 (design gate only)  
**Status:** proposed; requires owner review before implementation  
**Source baseline:** `main` at `f0377937b260d9e873360ae3f726258e0ae8c272`  
**Scope:** single-property cash-voucher PWA backed by Apps Script and Sheets. No code, API, schema, deployment or production data changes in this phase.

## 1. Problem and evidence

A dashboard cash-in-hand number is not evidence that physical cash matches the records. The current application has payment and cash-received vouchers, an owner-configurable `Settings.openingBalance`, active/cancelled statuses, voucher edit/cancel operations and a best-effort audit log. It has no dated opening-balance history, daily close record, closed-period state or dedicated post-close correction record.

The current dashboard calculation is global: configured opening balance + all active receipts − all active payments. It should not be presented as a daily close/reconciliation result.

## 2. User and outcome

**Primary user:** property owner or manager who is responsible for the cash drawer.  
**Supporting users:** staff who create vouchers and may need to explain or correct their entries, subject to existing permissions.  
**Outcome:** produce a dated report that explains expected cash, physical cash counted and the difference, with drill-through to the vouchers behind the total and an attributable path for discrepancies.

No new role, approval hierarchy or mandatory second-person sign-off is assumed in this proposal.

## 3. Current versus desired behavior

| Area           | Current source behavior                                                                                | Desired close workflow                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Opening cash   | One global setting; no date-specific history                                                           | A clearly defined opening amount for each close period                                                                         |
| Book movement  | Active PAYMENT and RECEIPT vouchers; cancelled vouchers remain visible but excluded from active totals | Explicit, repeatable inclusion rules for the selected period                                                                   |
| Physical count | No count entry or denomination breakdown                                                               | Enter and review actual cash counted; denomination rows only if the owner confirms they help operations                        |
| Variance       | No close-specific variance calculation or explanation                                                  | Show expected, counted and variance as labeled amounts and words; require a reason for non-zero variance if accepted as policy |
| Close state    | No close record or sealed period                                                                       | A durable record with period, totals, actor and timestamps; edit/correction semantics must be agreed first                     |
| Corrections    | Active vouchers may be edited; cancellations have a reason and audit event                             | Avoid silent post-close changes; define an attributable correction/reconciliation trail                                        |
| Offline queue  | Pending vouchers remain on the originating browser until synced                                        | Surface pending/offline records and prevent a misleading claim that the central ledger is reconciled                           |
| Report         | Voucher CSV/print exists; no close report                                                              | Printable/exportable close report with links or identifiers for included vouchers                                              |

## 4. Candidate calculation (not yet an approved accounting policy)

For a defined close period:

`Expected cash = opening cash + included cash receipts − included cash payments`

`Variance = counted physical cash − expected cash`

- Include only vouchers that meet the agreed period, status and cash-treatment rules.
- Every total must be traceable to its contributing voucher IDs and amounts.
- Use the existing two-decimal amount boundary for the proposal; do not silently introduce a new currency model or ledger migration.
- Display the sign and meaning of variance in text, not color alone.
- Do not treat the current global opening balance as the opening amount for every day.
- A close report must distinguish “calculated from synced records” from a period that may still have pending device-local entries.

## 5. Owner decisions required before implementation

These questions are deliberately unresolved; the implementation PR must not guess.

| Decision                 | Why it changes correctness                                                   | Options to discuss                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Business period          | Determines voucher inclusion and date boundary                               | Property-local calendar day (source timezone is Asia/Kolkata) or named shift with explicit start/end                 |
| Opening cash             | Current setting is global, not dated                                         | Carry forward the prior accepted close's counted amount; explicit manual opening; or another owner-defined process   |
| Missing prior close      | A carry-forward chain can have gaps                                          | Block close until resolved, or allow an explicitly explained opening amount                                          |
| Drawer/shift count       | Determines uniqueness and aggregation                                        | One drawer/property/day; named drawers; or shifts. Start with one only if it matches actual operations               |
| Cash movement categories | Category labels alone do not prove cash movement semantics                   | Define treatment of Bank Withdrawal, Owner Deposit, Bank Deposit/transfer, Refund Received and any non-cash items    |
| Backdated vouchers       | A late voucher can change a previously reported period                       | Disallow after close, reopen/restate with an audit trail, or record a separate adjustment                            |
| Edits and cancellations  | Current active vouchers can be edited; cancellation is allowed with a reason | Block mutations affecting a closed period; or preserve the close and post a separate correction/reconciliation event |
| Offline entries          | Unsynced entries are not in the central Sheet                                | Require queue empty and server refresh before close; or allow close marked provisional with an explicit exception    |
| Physical count input     | Denominations may slow a small-property close                                | Single total; optional denomination rows; or required denominations                                                  |
| Close authority          | Current roles are owner/manager/staff; no new approval workflow is specified | Define which existing role may create a close. Second-person confirmation remains optional until explicitly agreed   |
| Variance policy          | A reason helps explain discrepancies but may not resolve them                | Require reason for non-zero variance; decide whether zero variance can close without extra fields                    |
| Corrections after close  | Audit log is best-effort, not tamper-evident                                 | Define correction event fields, permissions, report restatement and whether any reopening exists                     |

## 6. Proposed narrow MVP boundary

Subject to the decisions above, keep the first implementation limited to:

1. One explicitly defined close period and opening-cash rule.
2. Expected-cash calculation using server-authoritative voucher data and agreed status/type/category rules.
3. Physical count entry, variance display and a reason for non-zero variance if accepted by the owner.
4. A durable close record with actor, timestamp, period, opening amount, included totals, counted amount and variance.
5. A report that identifies included vouchers and distinguishes central/synchronized records from pending device-local records.
6. A documented correction path that preserves attribution and does not silently rewrite a previously issued close report.

Exclude from MVP unless separately agreed: multiple properties, accountant role, configurable approval thresholds, mandatory second-person approval, cash-transfer workflows, tax/accounting fields, AI flags, and a general ledger redesign.

## 7. Failure modes and acceptance criteria for the future implementation

- **Missing/invalid opening amount:** no silently inferred opening balance; provide an actionable error or explicit exception path agreed by the owner.
- **No prior close or a gap in dates:** follow the selected gap policy and show the source of opening cash.
- **Cancelled voucher:** excluded from expected cash while its cancellation reason remains visible in drill-through/history.
- **Edit/cancel/backdated entry after close:** never silently mutate a previously reported result; follow the approved correction policy.
- **Concurrent close attempts:** server-side locking and uniqueness must prevent two conflicting closes for the same agreed period/drawer.
- **Lost response/retry:** use an idempotent close request or equivalent collision-safe behavior so retry cannot create duplicate closes.
- **Offline queue pending or sync response lost:** do not label the close fully reconciled against central data until sync status is known; retain and explain pending data.
- **Unauthorized user:** enforce close permissions server-side, not only by hiding a navigation item.
- **Malformed or extreme amounts:** validate on the server using existing monetary boundaries and ensure totals cannot be altered by client-submitted totals.
- **Audit write failure:** decide whether close creation must fail closed if its required audit/close record cannot be durably written; current generic `audit_` is best-effort and is insufficient alone as the close's integrity record.
- **Report/export failure:** preserve the close record and let the user retry report generation without creating a second close.
- **Time-zone boundary:** use the agreed property timezone consistently in date selection, inclusion and timestamps.

Future implementation acceptance requires tests for calculation boundaries, canceled/backdated vouchers, duplicate and concurrent close requests, permission enforcement, correction attribution, pending offline records, and report totals versus source voucher IDs.

## 8. Architecture and data design constraints

- Backend is authoritative; do not calculate a trusted close solely from the frontend's current `S.vouchers` cache.
- Do not add close state to `Settings` as a mutable singleton. A close is a dated record and requires a defined uniqueness key.
- Do not modify the existing Vouchers sheet schema incidentally. If a separate close/correction data structure is approved, specify headers, IDs, uniqueness, migration behavior, backup/restore compatibility and rollback before writing code.
- A daily close record must not depend solely on the existing best-effort `AuditLog` append.
- Preserve the offline queue's idempotency guarantees and never discard pending entries to make reconciliation pass.
- No new dependencies are needed for this design phase.

## 9. Two-pass review

### Pass A — product and UX

- Primary task: select period, review calculated cash movements, enter count, understand variance and save/report.
- Show expected, counted and variance as labeled currency amounts; never rely on color alone.
- Include loading, empty-period, stale-data, pending-offline, validation, save failure, success and report failure states.
- Provide voucher drill-through and a clear difference between “saved on this device” and “recorded centrally.”
- Reuse existing UI conventions; preserve keyboard access, labels, focus, mobile layout and print legibility.
- Avoid glass/blur behind cash figures, forms, dense tables or printed reports.

### Pass B — engineering and security

- Server-side role enforcement and validation; no trusting client totals.
- ScriptLock/concurrency and uniqueness policy for close creation and correction.
- Idempotency for ambiguous responses and retries.
- Clear treatment of canceled, edited, backdated and offline vouchers.
- Explicit durable close/correction records, audit attribution and backup/restore behavior.
- No silent data deletion, forced branch updates, schema migration or production deployment in the design PR.

## 10. Old review findings reconciled for this slice

- **Already resolved in source:** role checks for voucher operations, voucher cancellation reasons, idempotent voucher creation, backend write locking.
- **Present/open gap:** only a global opening balance exists; no daily close, physical count, closed-period policy or dedicated correction record.
- **Present limitation:** generic audit logging is best-effort, not a tamper-evident ledger.
- **Not verified:** real Google Apps Script concurrency, actual backup/restore, live data behavior and physical cash workflow.
- **Not applicable to this docs-only PR:** UI implementation, schema migration, service-worker cache change, live deployment.

## 11. Rollback and release boundary

This phase changes documentation only. Rollback is a normal reviewed revert of the documentation PR; no data migration or runtime behavior changes. Do not deploy Apps Script or change production settings.

**Owner gate:** review the decision table and approve the MVP accounting/operational rules before a separate implementation phase is opened.

## 10. Cash-versus-bank semantics — Phase 24 design refinement

### Current-source facts

The voucher schema records `Type` (`PAYMENT` or `RECEIPT`), `Category`, `Date`, `Amount`, `Status`, and other metadata. It does **not** record a settlement method, bank account, or explicit physical-cash effect.

Default receipt categories include `Room Revenue`, `Restaurant`, `Guest Advance`, `Bank Withdrawal`, `Refund Received`, `Owner Deposit`, and `Other`. Payment categories include `Bank Charges`, `Guest Refund`, `Vendor Payment`, and others. Categories are configurable. These labels describe business context; they do not prove whether notes/coins entered or left the drawer.

Therefore:
- `PAYMENT` / `RECEIPT` is not sufficient to determine physical-cash direction.
- The same category may be settled in cash or through UPI/card/bank transfer.
- Do not use category-name heuristics to calculate physical cash.
- Existing vouchers have no reliable cash-impact classification; do not silently infer one from their category or type.

### Proposed cash-impact vocabulary

| Value | Meaning | Drawer calculation |
| --- | --- | --- |
| `CASH_IN` | Physical notes/coins actually enter the drawer | Add amount |
| `CASH_OUT` | Physical notes/coins actually leave the drawer | Subtract amount |
| `NO_CASH` | Voucher records a transaction without physical drawer movement | No drawer effect |
| `UNCLASSIFIED` | Cash impact is not yet established | Resolve or apply an explicitly owner-approved exception policy before final close |

This is a proposed data concept, not an existing field or approved schema. How it is stored—on the voucher or in a separately governed movement record—must be reviewed before implementation.

Candidate calculation:

`Expected physical cash = opening physical cash + sum(CASH_IN) - sum(CASH_OUT)`

`Variance = counted physical cash - expected physical cash`

Only active, in-period vouchers with resolved cash impact contribute. Cancelled vouchers remain visible in history but do not contribute to expected cash. The report must show included and unresolved voucher IDs so totals are traceable.

### Examples — illustrative, not automatic category mappings

| Example of actual event | Drawer impact | Reason |
| --- | --- | --- |
| Room/restaurant revenue received as cash | `CASH_IN` | The same category can also be paid digitally |
| Guest advance received in cash | `CASH_IN` | A digital transfer does not enter the drawer |
| Bank withdrawal where cash is collected into the drawer | `CASH_IN` | A bank-to-bank transfer is not drawer cash |
| Owner contributes physical cash | `CASH_IN` | An owner bank transfer is not physical cash |
| Vendor expense paid from the drawer | `CASH_OUT` | The same category may be paid from a bank account |
| Guest refund paid in cash | `CASH_OUT` | A digital refund does not leave the drawer |
| Notes/coins deposited from the drawer into the bank | `CASH_OUT` | A cash transfer, not an operating expense |
| Bank charges paid from the bank account | `NO_CASH` | Bank balance changes, drawer does not |
| Room revenue received only by UPI/card/bank | `NO_CASH` | Non-cash funds increase, drawer does not |
| “Bank Withdrawal” without physical cash entering the drawer | `NO_CASH` | The category name does not prove a physical withdrawal |

These examples classify the actual physical event. They must not become automatic mappings based on category names: `Bank Withdrawal`, `Owner Deposit`, `Guest Advance`, `Guest Refund`, `Bank Charges`, and `Other` can have different cash impacts depending on settlement.

### Existing vouchers and migration boundary

Before implementation, choose a policy for active historical vouchers that have no cash-impact value:

1. **Resolve on close:** list unclassified vouchers and require an authorized user to classify them before finalizing the period.
2. **One-time historical review:** build a separately reviewed migration/reconciliation path with attribution and correction support.
3. **Provisional exception:** allow a visibly provisional close while unresolved items remain, but never call it fully reconciled.

**Recommendation:** do not backfill from category labels. Block a final close while active in-period vouchers remain `UNCLASSIFIED`; provide a deliberate resolution path. If an exception is needed, it must remain visibly provisional. This recommendation is not owner-approved policy.

### Decisions required before any product-code PR

- Approve/revise the four-state vocabulary.
- Decide whether users classify impact at voucher creation/edit, during close review, or both.
- Decide whether classification is mandatory for new vouchers or enforced at close.
- Decide historical-voucher treatment and whether a one-time backfill is needed.
- Decide which roles can set/change the classification and whether changes require a reason and audit record.
- Define `NO_CASH` as “no physical drawer movement” only; bank/accounting reporting remains a separate concern.
- Decide whether category defaults are suggestions only or enforced rules. They must never override explicit transaction-level classification.
- Decide whether unresolved vouchers or pending offline vouchers block a final close or permit an explicitly provisional close.

### Future implementation acceptance criteria

- Server-authoritative totals use explicit cash-impact values, not category heuristics or client-submitted totals.
- UI copy explains that `NO_CASH` means no drawer movement, not “no financial impact”.
- Every active voucher in the period is classified or appears in an unresolved list.
- Tests cover cash and non-cash settlement within the same category, bank withdrawal into cash, cash deposit into bank, cancellations, edits/backdating, concurrent/retried closes, and voucher-to-total traceability.
- Schema/migration/rollback and backup/restore behavior for existing rows are documented before adding fields or records.

This Phase 24 refinement is documentation-only: no product code, API, Sheet schema, or production data changes.
