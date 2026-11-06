'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const editor = fs.readFileSync('frontend/features/register.js', 'utf8');
const state = fs.readFileSync('frontend/core/state.js', 'utf8');
const backend = fs.readFileSync('backend/50-vouchers.gs', 'utf8');
const readModels = fs.readFileSync('backend/46-read-models.gs', 'utf8');

assert.ok(editor.includes("paymentMethod.id = 'epm'"));
assert.ok(editor.includes('knownPaymentMethods = PAYMENT_METHODS'));
assert.ok(state.includes("export const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER'];"));
assert.ok(editor.includes("labeledControl('Physical cash movement', cashImpact)"));
assert.ok(editor.includes('cashImpact.required = true'));
assert.ok(!editor.includes('cashImpact.disabled = true'));
assert.ok(!editor.includes('derivedImpact'));
assert.ok(!editor.includes('suggestCashImpact'));
assert.ok(editor.includes('fields.paymentMethod = selectedMethod'));
assert.ok(editor.includes('cashMovementLabel'));
assert.ok(editor.includes('data-act="classify"'));
assert.ok(editor.includes('fields: { cashImpact: movement.value }'));
assert.ok(editor.includes('cashImpact: R.cashImpact'));
assert.ok(editor.includes('amountValidity: R.amountValidity'));
assert.ok(editor.includes('for="rcashimpact"'));
assert.ok(editor.includes('for="ramountValidity"'));
assert.ok(backend.includes('const impact = cashImpact_(en.cashImpact, row)'));
assert.ok(!backend.includes('Cash impact must match the saved payment method'));
assert.ok(!backend.includes('cashImpactForPaymentMethod_'));
assert.ok(backend.includes('if (f.cashImpact !== undefined)'));
assert.ok(readModels.includes('Physical cash movement'));
assert.ok(readModels.includes('amountValidity'));
assert.ok(readModels.includes('rowCashImpact'));

console.log(
  'Register exception contract OK — physical cash remains an explicit, independent, auditable choice; exceptions are directly filterable and correctable.',
);
