# Daily Cash Close and Physical Reconciliation — Design and Owner Policy Record

**Phase:** 23 design record; the MVP implementation is merged in PR #111.  
**Status:** close rules and the one-drawer/day MVP are implemented in source; live deployment, schema migration, real backup/restore and hotel-pilot evidence remain unverified. The payment-approval policy, report-only accountant role and VendorID export merged in PR #114 at `95cd5e0e733d07354e1a2e0b9291a65dee19d126`; they are not an active PR. Denomination-level cash counts remain optional and require an explicit owner decision before implementation.
**Current source baseline:** `main` at `4a759b7513a925aee796949d8f6e79085f096314` (17 October 2026; PR #166 merge)  
**Scope:** preserve the original design reasoning and owner-approved rules for the single-property Apps Script/Sheets product. Editing this record does not run migrations or release code.

**Decision-precedence note (17 October 2026):** Sections 1–12 preserve the original design-time baseline/proposal and early unresolved questions; statements there describing the absence of Daily Cash Close represent the pre-MVP state. The owner-approved MVP policy in section 13 and the payment-approval decisions recorded after it supersede those earlier statements where they conflict. CashImpact, one-drawer/day Daily Cash Close, correction history, payment approval and VendorID changes are implemented in source through merged PRs; they are **not** evidence that live migrations/deployment, backup/restore or a physical-cash pilot have been completed. Current gates are in `docs/RELEASE-READINESS.md` and `docs/STAGING-RELEASE-AUDIT.md`.
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

## 12. Cash-versus-bank semantics — Phase 24 design refinement

### Current-source facts

The voucher schema records `Type` (`PAYMENT` or `RECEIPT`), `Category`, `Date`, `Amount`, `Status`, and other metadata. It does **not** record a settlement method, bank account, or explicit physical-cash effect.

Default receipt categories include `Room Revenue`, `Restaurant`, `Guest Advance`, `Bank Withdrawal`, `Refund Received`, `Owner Deposit`, and `Other`. Payment categories include `Bank Charges`, `Guest Refund`, `Vendor Payment`, and others. Categories are configurable. These labels describe business context; they do not prove whether notes or coins entered or left the drawer.

Therefore:

- `PAYMENT` / `RECEIPT` is not sufficient to determine physical-cash direction.
- The same category may be settled in cash or through UPI, card, or bank transfer.
- Category-name heuristics must not calculate physical cash.
- Existing vouchers have no reliable cash-impact classification. Do not silently infer one from category or voucher type.

### Proposed cash-impact vocabulary

- `CASH_IN`: physical notes or coins actually enter the drawer; add the amount.
- `CASH_OUT`: physical notes or coins actually leave the drawer; subtract the amount.
- `NO_CASH`: a transaction occurs without physical drawer movement; it has no drawer effect.
- `UNCLASSIFIED`: physical-cash impact is not established; resolve it or apply an explicitly owner-approved exception policy before final close.

**Owner-approved Slice 1 policy (13 October 2026):** `CashImpact` is stored on each voucher. New vouchers must carry `CASH_IN`, `CASH_OUT`, or `NO_CASH`; `UNCLASSIFIED` is reserved for legacy records and unresolved historical data. All authorized voucher creators may classify a new voucher. Only existing owner/manager edit permissions may change a saved classification; edits must include the existing required correction reason and the audit event records old/new values, actor, timestamp, and reason. Category-derived values are editable suggestions only and never authoritative. No historical backfill is performed.

Before deploying the new backend version, the owner must intentionally upload the reviewed source and run `migrateCashImpactField()` once in the intended Apps Script project. It adds only the `CashImpact` header at the next column and leaves historical cells blank. The function is manual and was not run during this code change.

Candidate calculation:

`Expected physical cash = opening physical cash + sum(CASH_IN) - sum(CASH_OUT)`

`Variance = counted physical cash - expected physical cash`

Only active, in-period vouchers with resolved cash impact contribute. Cancelled vouchers remain visible in history but do not contribute to expected cash. The report must show included and unresolved voucher IDs so totals remain traceable.

### Examples — illustrative, not automatic category mappings

- Room or restaurant revenue received as physical cash: `CASH_IN`. The same category settled digitally has no drawer impact.
- Guest advance received in cash: `CASH_IN`. A digital transfer does not enter the drawer.
- Bank withdrawal where physical cash is collected into the drawer: `CASH_IN`. A bank-to-bank transfer is not drawer cash.
- Owner contribution in physical cash: `CASH_IN`. An owner bank transfer is not physical cash.
- Vendor expense or guest refund paid from the drawer: `CASH_OUT`. The same category paid digitally does not reduce drawer cash.
- Notes or coins deposited from the drawer into the bank: `CASH_OUT`. This is a cash transfer, not an operating expense.
- Bank charges paid from the bank account, or room revenue received only by UPI, card, or bank transfer: `NO_CASH`.
- A `Bank Withdrawal` category without physical cash entering the drawer: `NO_CASH`.

These examples classify the actual physical event. They must not become automatic mappings by category name: `Bank Withdrawal`, `Owner Deposit`, `Guest Advance`, `Guest Refund`, `Bank Charges`, and `Other` can have different cash impacts depending on settlement.

### Existing vouchers and migration boundary

Before implementation, choose a policy for active historical vouchers without a cash-impact value:

1. **Resolve on close:** list unclassified vouchers and require an authorized user to classify them before finalizing the period.
2. **One-time historical review:** build a separately reviewed migration and reconciliation path with attribution and correction support.
3. **Provisional exception:** allow a visibly provisional close while unresolved items remain, but never call it fully reconciled.

**Recommendation:** do not backfill from category labels. Block a final close while active in-period vouchers remain `UNCLASSIFIED`; provide a deliberate resolution path. If an exception is needed, it must remain visibly provisional. This recommendation is not owner-approved policy.

### Decisions approved for the cash-impact field

- Classification is mandatory at voucher creation. Only `CASH_IN`, `CASH_OUT`, or `NO_CASH` may be submitted for a new voucher; `UNCLASSIFIED` is not a valid new-voucher value.
- All authorized voucher creators can classify new entries. Saved classifications can be changed only by existing owner/manager roles, with the existing required correction reason and old/new audit values.
- Category defaults are editable suggestions only. Voucher type and category names never determine actual physical-cash movement.
- Existing vouchers are not backfilled. Missing values remain `UNCLASSIFIED`; a future final close must block while active in-period vouchers remain unclassified.
- `NO_CASH` means no physical drawer movement; it does not mean no financial or bank-account impact.

### Outstanding operational rollout and non-blocking decisions

The original design-time questions below were resolved in source/policy for the owner-approved single-property, one-drawer/calendar-day MVP. The remaining rollout work is operational, not another unapproved close implementation:

- **Live deployment/schema:** verify the target Script, Sheet binding, execution identity and current headers; after an owner-authorized backup, run only the applicable guarded migrations in the order recorded in section 13 and verify unchanged historical rows/columns. No migration or deployment is evidenced by this source review.
- **Backup and recovery:** inspect a real scheduled backup, receipt manifest and copied Sheet; restore to a separate recovery destination and reconcile counts and voucher numbering.
- **Real-service behavior:** exercise retries, duplicate/concurrent close requests and lock contention against authorized staging resources. Mock tests do not prove real Apps Script concurrency.
- **Device-local records:** review pending/rejected/recovery entries on every operating device before accepting a close. This browser cannot certify that other devices are synchronized.
- **Pilot proof:** compare book balance with physical count, ensure discrepancies have attributed reasons, retain the fallback process, and complete the controlled 14-day pilot.
- **Optional denomination rows:** still require an explicit owner decision and are not part of the current MVP.

### Implemented-source contracts to retain through staging validation

- Server-authoritative totals use explicit cash-impact values, not category heuristics or client-submitted totals.
- UI copy explains that `NO_CASH` means no drawer movement, not “no financial impact”.
- Every active voucher in the period is classified or appears in an unresolved list.
- Tests cover cash and non-cash settlement within the same category, bank withdrawal into cash, cash deposit into bank, cancellations, edits/backdating, concurrent/retried closes, and voucher-to-total traceability.
- Schema migration is additive: append the `CashImpact` header without reordering existing columns, and leave historical cells blank; no category-based backfill is permitted.
- Before deploying the reviewed backend version, capture the usual backup/schema evidence and run `migrateCashImpactField()` once in the intended Apps Script project. Verify the new header, unchanged row count and unchanged existing columns. Rollback must retain the added column and any classified values; do not remove saved data.
- Existing device-local queue items without `cashImpact` remain recoverable: they are not auto-classified or discarded, and synchronization marks them failed until the owner/operator exports and deliberately re-enters them with classification.

The cash-impact field is now an owner-approved code slice. This PR does not upload Apps Script source, run the migration, deploy a Web App version, or modify production data.

## 13. Owner-approved MVP policy and implementation boundary — 13 October 2026

The owner approved these defaults for the implementation phase. This section supersedes the earlier undecided options above for this MVP:

- **Period / uniqueness:** one property, one physical drawer (MAIN), one calendar day in Asia/Kolkata. A business date can be closed once. Dates must be finalized chronologically; a later finalized date blocks closing a missing earlier date so the carry-forward chain cannot be retroactively contradicted.
- **Opening cash:** carry forward the previous calendar day's accepted physical count. If that exact prior-day close does not exist (first day or a gap), require a manually entered opening amount and a reason. The global Settings opening balance is never used as a daily opening amount.
- **Calculation:** opening physical cash + all active CASH_IN vouchers − all active CASH_OUT vouchers. NO_CASH is included in the traceable snapshot but contributes zero to drawer movement. Cancelled vouchers are excluded. Category names and voucher type are never used to infer impact.
- **Finalization gate:** block close when any active in-period voucher is UNCLASSIFIED or has an invalid amount. A non-zero variance requires a reason. Store the included voucher IDs and compact voucher snapshot with totals, actor, property timezone and timestamp in the dedicated close row.
- **Offline:** preview/finalization use central Sheet data and require an online server request. The close UI must not claim a central close succeeded while offline or while the response is uncertain. Retry uses the same request ID. Existing device-local entries are never discarded or silently classified.
- **Authority:** only existing owners and managers may preview/finalize close or record correction notes; backend authorization is authoritative.
- **Closed period / corrections:** one immutable close per date. API voucher creation, edits, date changes and cancellations that affect a closed date are rejected. A separate correction note requires a type, details, reason and actor, optionally linked to a voucher in the saved snapshot. A note does not change voucher data, reopen a close or revise reported totals. Any financial restatement/adjustment workflow remains a separately reviewed future decision.
- **Durability:** a dedicated CashCloses row stores the original totals and included-voucher snapshot together; a separate append-only CashCloseCorrections row preserves correction attribution. All close writes use the existing ScriptLock wrapper and a request ID. Reuse of the same ID and same payload returns the original close; a conflicting payload is rejected.

### Schema / release procedure

The implementation adds two dedicated tabs; PR #111 added Daily Cash Close, and the current PR #114 appends payment-approval fields R:U after CashImpact Q plus VendorID V. No existing voucher or setting columns are rearranged. After reviewing and backing up the intended Apps Script project, upload the reviewed source only when the owner authorizes it. Run `migrateCashImpactField()` first if column Q is missing, then `migrateVoucherApprovalFields()` after validating A:Q and empty R:U, then `migrateVoucherVendorIdField()` after validating A:U and empty V, then `migrateDailyCashCloseSchema()` once from the Apps Script editor. The migrations stop on unexpected schemas rather than overwriting data. Verify exact headers, unchanged row count and blank historical CashImpact, approval and VendorID cells before publishing any Web App version. Do not run `setup()` as a shortcut. Migrations and deployment are not performed by the feature PR.

### MVP limitations / acceptance gates

- Corrections are attributed notes, not numeric adjustments. The original close is never silently rewritten.
- The saved snapshot is the basis of the printed/exported report; a CSV contains the summary, all included voucher IDs/amounts and correction notes.
- CI, Browser E2E and Full Flight Test must pass on the exact same final PR head. Live Apps Script/Sheets concurrency, real backups/restore, device queue behavior and the controlled hotel pilot remain independent release gates.

## Current-browser outbox gate

The close screen inspects this browser's IndexedDB outbox (including unbound/recovery entries) before showing finalization as available and checks again immediately before submit. If queue storage cannot be read, the finalization button stays blocked. This is intentionally fail-closed. It does not prove that other phones, browsers or devices have synchronized; the operator must verify those separately. The backend cannot inspect client-local queues, so no UI can make a server-wide empty-queue guarantee from this check alone.

## Payment approval policy — owner-approved 13 October 2026

This section records the owner-approved payment rule and the accountant/vendor-identity slice merged in PR #114. The UAT-048 edit policy was separately approved on 14 October 2026; this PR records that decision in source. No source merge proves production deployment.

- **Scope and threshold:** only new `PAYMENT` vouchers with amount greater than or equal to **₹10,000** require approval. The threshold is inclusive and fixed for this release; it is not an owner-configurable setting. `RECEIPT` vouchers are outside the rule.
- **Authority:** existing owner and manager roles can approve or reject a pending payment. A voucher creator cannot approve their own voucher; the backend is the authority for this rule. Rejecting requires an attributable reason. No new role is introduced.
- **State and history:** new qualifying payments start `PENDING`; successful review records status, approver, timestamp and reason when rejected in the existing audit log. `APPROVED` becomes eligible for approved payment totals and cash-close inclusion. Under owner-approved UAT-048, changes to amount, vendor identity, date, or `CashImpact` on an approval-managed payment invalidate the current approval; if the edited amount remains at or above ₹10,000, the voucher returns to `PENDING` until independently reapproved. If the amount is below the threshold, its state becomes `NOT_REQUIRED`. Category and notes corrections retain the current approval status and approval metadata. Every accepted correction still requires a reason and records old/new values; when reapproval is triggered, the audit event records the prior approval attribution before the current approval fields are cleared. Crossing the threshold through a correction also requires approval. Existing historical blank approval fields remain `NOT_REQUIRED` and are not retroactively backfilled.
- **Financial treatment:** pending, rejected or malformed approval states stay visible but are excluded from approved payment totals. They block a final cash close rather than silently disappearing from expected cash. A rejected active voucher must be cancelled or otherwise resolved before final close; cancellation remains audited. The existing cash-impact value remains separate from approval status and is never inferred from it.
- **Historical compatibility:** the additive schema appends `ApprovalStatus`, `ApprovedBy`, `ApprovedAt`, and `ApprovalReason` in R:U after `CashImpact` in Q, then `VendorID` in V. Migrations add headers only and never backfill old approval states or vendor links. Blank historical approval values read as `NOT_REQUIRED`; legacy payments are not reclassified by amount.
- **Accountant/export/vendor identity:** the current PR adds a report-only `accountant` role with a generic recorded-movement CSV; no target-specific Tally/Zoho/accounting mapping or tax treatment is claimed. Stable VendorIDs are stored on new vouchers when a unique saved vendor-name match exists, exposed in Vendor management, and included in report export. Legacy rows are not backfilled; the report uses only a unique exact-name fallback when the stored ID is blank and surfaces unresolved names.
- **Release boundary:** after explicit authorization and a verified backup, run `migrateCashImpactField()` if Q is missing, then `migrateVoucherApprovalFields()`, then `migrateVoucherVendorIdField()`, then `migrateDailyCashCloseSchema()`. Verify headers, existing row count/data, and blank historical values. No migration, Clasp push, Web App deployment or production data change is included in the feature PR.
