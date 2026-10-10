# Accountant Recordkeeping, Tax Preparation and Reporting Blueprint

**Phase:** PR #61 — accountant / finance-officer review  
**Status:** requirements and data audit for owner/accountant review; not a tax opinion or approved accounting policy  
**Repository baseline:** `main` at `d4742a34d57bc973d0fda849b65ae6d35259bf22` (PR #60 merge)  
**Product scope:** one-property cash-voucher PWA; Google Apps Script, Sheets and Drive  
**Currency/timezone:** currently INR is implied by the operating context, and backend business dates use `Asia/Kolkata`; confirm currency and tax registrations with the owner before adding tax or accounting rules.

## 1. Executive assessment

Reviewing this product as a finance record keeper changes the definition of “done”: a voucher form is only the capture layer. An accountant needs a traceable evidence chain from source document → recorded transaction → approval/correction history → period report → reconciled export → accountant import/review.

The current app has a useful operational base: payment and receipt vouchers, separate numbering series, date/vendor/category/amount/notes, active/cancelled status, creator/update metadata, receipt image references, client IDs, user/role controls, an audit log, register/dashboard surfaces, CSV/print paths, offline queue/recovery and backup mechanisms. These fields are not yet a complete general ledger or tax subledger.

**Do not treat the current voucher register or Audit CSV as a statutory book, a GST return, a TDS statement, a profit-and-loss account, or a complete accounting ledger.** The product lacks several fields and accounting controls needed to make those claims. This phase defines the gaps and sequence; it does not invent tax classifications, alter production records, or add tax calculations.

## 2. Current source record inventory

The current `Vouchers` sheet schema is:

| Field | Current meaning / use | Accountant's assessment |
| --- | --- | --- |
| `VoucherID` | Internal voucher identity | Preserve as immutable source key in every export. |
| `VoucherNo` | Human-readable number; payment and receipt series are separate | Export together with voucher type and internal ID; never rely on number alone. |
| `Date` | Voucher/business date | Need explicit business-date semantics, timezone and period inclusion rules. |
| `Vendor` | Free-text counterparty / description | Too ambiguous for tax reporting; distinguish supplier/customer/employee/owner/bank and link to a stable party record. |
| `Amount` | Single amount | No explicit gross/net/tax-inclusive definition or debit/credit sign convention. |
| `Category` | Operational category | Not an approved chart of accounts and must not be mapped automatically to tax treatment. |
| `Notes` | Free text | Helpful context but not a substitute for invoice fields or a structured business purpose. |
| `Status` | Active/cancelled state | Export must retain cancellation state/reason and define whether cancelled records are excluded from totals. |
| `CreatedBy`, `CreatedAt` | Creator and timestamp | Useful for traceability; normalize timestamps and preserve original creation time. |
| `UpdatedBy`, `UpdatedAt` | Last editor and timestamp | Last-update fields alone do not preserve a complete before/after history. |
| `Receipts` | Drive file IDs | Evidence references exist, but evidence type, invoice number, tax fields and review outcome are not structured. |
| `CancelReason` | Cancellation explanation | Keep in operational/audit exports; do not delete cancelled source records from history. |
| `ClientID` | Retry/idempotency identifier | Technical identity; do not expose session secrets or treat it as an accounting document number. |
| `Type` | PAYMENT or RECEIPT | Useful cash-operation classification, but does not alone prove physical cash impact, income, expense, bank movement or tax category. |

Supporting sheets are `Users`, `Vendors`, `Settings`, and `AuditLog`. The audit log is documented as best-effort, so it must not be represented as tamper-proof or as a complete immutable change journal.

### Immediate data-quality rules

- Every report states date range, timezone, generation time, inclusion rules, record count, totals and known exclusions.
- Each aggregate can drill down to the source voucher IDs and the supporting evidence references.
- Separate business date from creation/update timestamps.
- Preserve cancelled and corrected records with reasons; define their effect on totals instead of erasing history.
- Treat missing receipts, missing party identity, unknown category and unresolved sync as visible exceptions.
- Do not infer income/expense, taxability, GST rate, TDS applicability or cash movement from free-text categories/notes.
- Keep amounts numeric and currency explicit; do not mix formatted strings with machine-readable values.

## 3. Finance officer workflows

### A. Daily transaction capture

1. Staff selects payment or receipt and enters business date, counterparty, amount, category and description.
2. Staff attaches the source evidence where available (supplier bill, receipt, refund proof, deposit slip or other relevant record).
3. App confirms whether the record is local-only, pending sync, server-confirmed or failed.
4. Manager reviews exceptions and corrections under existing permissions.
5. Finance reviewer can filter missing evidence, unknown parties/categories, cancelled records and unusual values.

No voucher should be labelled “accountant-ready” merely because it was saved. It is ready only when required fields/evidence for its transaction class are present and exceptions are surfaced.

### B. Period close and reconciliation

A close report should compare recorded movements to independent evidence (cash count, bank statement, deposit/withdrawal record, receipts and source vouchers). A calculated dashboard balance is not a physical cash count. Daily cash close remains blocked until the owner approves `docs/DAILY-CASH-CLOSE-DESIGN.md`.

Minimum close workflow, after policy approval:
- Select period and business location/property (currently single-property).
- Show opening balance provenance and date; do not reuse a single global opening balance as if it were period history.
- List included payments/receipts and explicitly exclude or separately show cancelled, pending-sync and unclassified items.
- Enter independently observed physical cash/bank reconciliation figures only if the approved design covers those accounts.
- Show expected balance, actual counted/reconciled balance, variance, drill-through and explanation.
- Require an attributable correction workflow and defined period re-open/lock policy.
- Export a signed-off report with report version, generated timestamp, source IDs and reconciliation totals.

### C. Monthly accountant handoff

1. Freeze the requested period's reporting snapshot or record the exact generation timestamp and source version.
2. Resolve pending sync and failed writes; do not silently include device-local records in server reports.
3. Review cancelled/edited vouchers and the exception list.
4. Reconcile totals to source register and relevant cash/bank evidence.
5. Export a human-readable review pack and a machine-readable data file.
6. Share through an owner-approved private channel with least-privilege access.
7. Accountant imports/reviews, records rejected rows/questions, and returns reconciliation differences.
8. Owner/manager resolves differences; regenerate a clearly versioned export instead of overwriting the previous file without trace.

The product should later support an export manifest with period, row count, totals, schema/version, generation timestamp, filters and a file checksum. A checksum detects file changes; it does not prove source completeness or correctness.

## 4. Reports, dashboards and charts

Prioritize reports that help the owner and accountant identify exceptions and reconcile to source records. Every chart must have a linked detail table, defined metric and explicit period.

| Report / visualization | What it answers | Required data / rules | Status |
| --- | --- | --- | --- |
| Daily receipts vs payments | How much was recorded in each direction each day? | Business date, voucher type, amount, status, timezone; drill-down by voucher ID | Feasible for recorded voucher movements; not necessarily physical cash |
| Monthly cash movement trend | How do recorded inflows/outflows change month to month? | Same rules, period boundaries, explicit cancellations and late entries | Feasible with caveats |
| Expense by operational category | Where are recorded payments categorized? | Payment records, category, amount, uncategorized bucket, cancellation policy | Feasible as operational analysis, not a tax-deductible-expense report |
| Spend by supplier/counterparty | Which counterparties account for recorded payments? | Stable party identity, role/type, amount, date; duplicate-name review | Partially feasible; current vendor is ambiguous/free-text |
| Receipt/evidence coverage | Which vouchers lack supporting evidence? | Voucher ID, transaction class, evidence IDs and approved evidence rules | Feasible as a gap report; mandatory rules need owner/accountant approval |
| Cancellation/edit exceptions | What changed, was cancelled and why? | Source status, reason, creator/update data, audit history limitations | Partial; audit is best-effort and not full before/after history |
| Pending sync / failure queue | Which device records are not centrally confirmed? | Actual outbox state, attempt age, retry outcome and safe recovery action | Device-specific view; never mix silently into server totals |
| Cash reconciliation / variance | Does recorded expected cash match a physical count? | Approved dated opening, cash-impact policy, close count, correction/period lock | Blocked pending owner approval and workflow design |
| GST output/input summary | What tax amounts might be reportable? | Verified registration, tax invoice data, taxable value, tax type/rate/amount, place-of-supply and valid classifications as applicable | Not supportable from current schema; requires CA-approved fields/rules |
| TDS review register | Which payments may need TDS review? | Party type/PAN where legally needed, payment/credit dates, nature/section/rate, threshold context, amount and deposit/return references | Not supportable from current schema; do not auto-infer |
| Profit & loss / balance sheet | What is accounting profit and financial position? | Double-entry journal, chart of accounts, accruals, liabilities, assets, inventory, depreciation, settlements and adjustments | Out of scope for current voucher-only data |
| Tax filing pack | What evidence supports accountant-prepared filings? | Reconciled ledgers, source invoices, tax classifications, return-period rules, credits/adjustments and external records | Future accountant workflow; not a filing-ready output today |

### Dashboard design principles

- Use KPI tiles for recorded receipts, recorded payments, net recorded movement, unresolved exceptions, pending sync and evidence gaps.
- Use line/bar charts for time trends and category/counterparty comparison; avoid pie charts when many categories are small.
- Show INR only after currency is confirmed; use consistent decimal precision and Indian number grouping.
- Label all amounts as “recorded voucher movement” until cash impact and accounting mapping are approved.
- Never label voucher net movement as profit, taxable turnover, GST liability or closing cash without the required source records and policy.
- Display counts alongside totals, and show cancelled/pending/unclassified records separately.
- Support keyboard-accessible data tables and CSV for every chart; color must not be the only status signal.

## 5. Data needed for accountant/tax workflows — proposed, not yet approved

The following are candidate fields. Add only the fields that the owner and qualified accountant confirm are necessary for the chosen accounting method, entity and destination.

### Party / supplier / customer master
- Stable Party ID; legal/display name; party role (supplier, customer, employee, owner, bank or other).
- Address and country/state where relevant.
- GSTIN and PAN only where legally applicable and access/privacy policy permits.
- Duplicate/merge workflow preserving old IDs and history.

### Source document and settlement
- Source document type, invoice/receipt number, invoice date, due date where relevant.
- Supplier/customer reference, original voucher reference and credit/debit note link where applicable.
- Payment method/account (cash drawer, bank account, card/UPI or other) and settlement reference.
- Gross amount, taxable value, discount, tax components, round-off and net amount as distinct values **only if supported by approved invoice rules**.
- Evidence file reference, evidence type, uploaded timestamp, review status and missing-evidence reason.
- Business purpose and reviewer/approval metadata where the owner's policy requires it.

### Tax-specific data (CA-approved only)
- Tax registration status and effective dates.
- Tax type and classification; applicable rate and taxable base; separate tax components as required.
- Place-of-supply/supply-type details where relevant.
- HSN/SAC or other code only when applicable and validated.
- TDS section, rate, threshold/period assessment, deduction date, amount, deposit/challan and return reference only where applicable.
- Credit-note/reversal/adjustment links and original document traceability.
- Export mapping/version and reconciliation result.

Do not implement all these fields speculatively. Some data may belong in an accounting system rather than this cash-voucher app. Never store Aadhaar, bank credentials, tax portal credentials or unrelated personal data as a convenience.

## 6. Export contract for another accountant

Generic export and destination-specific import are different products. First destination remains unselected. Before building an import template, the owner and receiving accountant must approve a representative, anonymized sample.

### Required export metadata
- Property/entity identifier and confirmed currency.
- Period start/end, business timezone, generated-at timestamp and source dataset/version.
- Voucher type, internal VoucherID, VoucherNo, business date, party identity, category, amount, status, creation/update metadata, cancellation reason and source evidence references where permitted.
- Explicit inclusion/exclusion rules and counts/totals by type/status.
- Exception file/list for missing evidence, unknown party/category, pending sync and rejected rows.
- Schema version and export filters.
- No session token, PIN, secret, unnecessary personal data or public Drive link.

### Safety and reconciliation
- CSV formula-injection defense for text fields beginning with `=`, `+`, `-`, `@`, tab or line-break/control characters, in addition to proper quoting/escaping.
- Preserve Unicode, commas, quotes and newlines; test decimal/date conventions in the target tool.
- Keep raw numeric amounts separate from display-formatted amounts.
- Never silently drop cancelled, edited, duplicate or unresolved rows; define the handling and expose excluded-row counts.
- Reconcile exported record count and totals to the exact source query and make the inclusion logic testable.
- Accountant import should be idempotent or use a stable external reference to prevent duplicate posting.
- Include an import/rejection reconciliation template; a download is not evidence that an import succeeded.
- Limit export access server-side; an accountant read-only role requires separate owner approval and action-by-role tests.

## 7. Recommended staged implementation plan

### Stage A — requirements and source data audit (this PR)
- Record current fields and their accounting meaning/limitations.
- Define report catalog, charts, workflow, tax-data candidates and export acceptance contract.
- Make no runtime/schema/tax-calculation changes.

### Stage B — integrity and recovery (next engineering phase after this review)
- Harden and test offline sync/idempotency, including commit-then-lost-response, repeated client ID, changed-content collision, cross-tab retry and stale lease recovery.
- Make server-confirmed vs local-only states unambiguous; do not let accountant exports silently include local-only records.
- Perform the witnessed backup/restore drill as an operational gate using a separate recovery destination.

### Stage C — data-quality reports
- Implement exception lists for missing evidence, uncategorized/unknown parties, cancellations/edits, pending sync and invalid dates/amounts.
- Build linked daily/monthly receipt-payment and category reports using only fields whose semantics are confirmed.
- Add count/total reconciliation tests and CSV-injection regression tests.

### Stage D — destination-specific export
- Select the target accounting product/version and import route.
- Obtain accountant-approved column mapping and anonymized fixture.
- Test successful import, rejected rows, duplicate re-import, cancellation/credit note behavior, date/decimal/currency conventions and totals.
- Only then mark the export as compatible with that destination.

### Stage E — tax and ledger capabilities, only if required
- Have the accountant define applicable tax rules, data ownership, review and effective dates.
- Decide whether the app should capture tax data or defer to the accounting package.
- Do not call the current app a general ledger or produce filing calculations without a defined and tested accounting model.

## 8. Decisions required from owner and receiving accountant

1. Which accounting software/version and import route does the receiving accountant actually use?
2. Which legal entity and tax registrations apply to this property, and who is the qualified tax/accounting reviewer? Do not share confidential identifiers in this chat.
3. Does the accountant want a simple source-voucher export first, or is a tax-coded import genuinely required?
4. Which source documents are mandatory by transaction type, and who reviews exceptions?
5. Which settlement methods/accounts are actually used, and what evidence proves settlement?
6. Should accountants receive an app account (read-only, requiring owner-approved permissions) or receive a controlled export file?
7. Which reports are needed daily, monthly, and at tax-period close?
8. What reconciliation tolerances and correction/period-lock policies are approved by the owner/accountant?

## 9. Tax and professional boundary

This document is an engineering and recordkeeping requirements review, not legal, audit or tax advice. Indian GST/TDS and income-tax applicability depends on the actual entity, registration, transaction facts, dates, thresholds, documents and current rules. A qualified Indian CA/tax professional must confirm the relevant fields, classification, rates, filing periods and treatment before they are encoded or relied upon. The software should preserve source evidence and make exceptions visible; it should not invent a tax treatment.

## 10. Acceptance criteria

- Current source fields are inventoried without implying missing fields already exist.
- Reports distinguish operational cash-voucher movement from accounting profit, cash-in-hand and tax liability.
- Every aggregate has source drill-through, date-range rules, record counts, totals and exception disclosure.
- Tax fields and calculations remain proposed until CA/owner validation.
- Destination-specific export remains blocked until the receiving accountant approves target/version, mapping and anonymized fixture.
- No runtime/API/schema/dependency/scheduled-trigger/deployment/production-data change is included.
