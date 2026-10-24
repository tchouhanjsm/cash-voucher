'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const editor = fs.readFileSync('frontend/features/register.js', 'utf8');
const backend = fs.readFileSync('backend/50-vouchers.gs', 'utf8');

assert.match(editor, /paymentMethod\.id = 'epm'/);
assert.match(editor, /knownPaymentMethods = \['CASH', 'UPI', 'BANK_TRANSFER'\]/);
assert.match(editor, /paymentMethod\.addEventListener\('change', updateCashImpactHint\)/);
assert.match(editor, /cashImpact\.disabled = true/);
assert.match(editor, /fields\.paymentMethod = selectedMethod/);
assert.match(editor, /Not recorded \(legacy\)/);
assert.match(backend, /Cash impact must match the saved payment method/);
assert.match(backend, /sameClientVoucherReceipts_\(voucher, entry\)/);

console.log(
  'Register edit contract OK — rail-derived cash impact, legacy blank rail preservation and receipt-aware idempotency are wired.',
);
