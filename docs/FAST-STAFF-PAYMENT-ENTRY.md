# Fast staff payment entry — implementation notes

## Staff workflow

- Payee, amount and optional note share the first line on desktop; category and payment method sit directly beneath it.
- Cash is the default, avoiding a mandatory extra selection on the common path. UPI and Bank transfer remain available in the compact selector.
- Payee entry is free text with suggestions from the active vendor directory and previous voucher names. Staff do not need to leave the payment screen for an unfamiliar payee.
- A saved vendor's default category and payment method take precedence. If no vendor default exists, the latest active voucher for the same payee is used, then the safe fallback of Other/Cash.
- A new row cannot be added until the prior row has a payee and positive amount. An incomplete middle row cannot be silently ignored during save.
- Staff Salary is an expense category, not a payroll system. Attendance, payslips, tax deductions and payroll approval are outside this change.

## Data model

- Vouchers column W: PaymentMethod (`CASH`, `UPI`, `BANK_TRANSFER`).
- Vendors columns H:I: `DefaultCategory`, `DefaultPaymentMethod`.

Cash impact remains a separate drawer-reconciliation dimension. Cash maps to CASH_IN/CASH_OUT; UPI and Bank transfer map to NO_CASH. The form no longer asks staff to classify drawer movement separately when the selected payment method already defines it.

## Existing-data rollout requirements

1. Obtain owner approval for the workflow and visual change.
2. Take and verify the standard backup before schema work.
3. Run `migrateVoucherPaymentMethodField()` and `migrateVendorDefaultsSchema()` manually in the intended Apps Script project only after verifying its Script Properties and spreadsheet ID. These functions are append-only and fail closed if expected headers are absent or target columns are occupied. Mock-backed regression tests cover header additions, preservation of legacy values, blank historical defaults/payment methods, repeat invocation and occupied-column refusal. These tests do not prove the live staging Sheet has been migrated.
4. Do not infer historical payment methods from cash impact; historical values remain blank and print as “Not recorded”.
5. Roll out in order: complete the verified backup, run both migrations in the intended Apps Script project, deploy and verify the backend first, then release the static frontend. This avoids a mixed version recording a payment method without persisting it. Deploy only through the reviewed release workflow; do not run a migration or `clasp push` against production from this PR.
6. UAT owner/manager/staff roles, desktop and phone widths, Cash/UPI/Bank transfer, vendor defaults, new payees, staff salary, incomplete rows, receipt attachments, duplicate warnings, offline queue/replay, cash close and print preview.

## Print voucher

The print template retains the legacy A5 layout, amount-in-words and signature zones. It uses “Paid via” or “Received via” based on voucher direction and avoids exposing internal cash-impact enum values. Physical paper alignment still needs staging print/PDF UAT.

## Follow-up opportunities (not implemented)

- Vendor/supplier ledger and due-date reminders for unpaid bills.
- A daily cash-vs-bank/UPI position shown clearly for the owner.
- Monthly payroll summary and staff salary register only if the owner wants a true payroll workflow.
- Hindi and other local-language labels after the English workflow is stable.
