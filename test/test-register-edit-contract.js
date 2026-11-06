'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const editor = fs.readFileSync('frontend/features/register.js', 'utf8');
const state = fs.readFileSync('frontend/core/state.js', 'utf8');
const backend = fs.readFileSync('backend/50-vouchers.gs', 'utf8');
const readModels = fs.readFileSync('backend/46-read-models.gs', 'utf8');

assert.match(editor, /paymentMethod\\.id = 'epm'/);
assert.ok(editor.includes('knownPaymentMethods = PAYMENT_METHODS'));
assert.ok(state.includes("export const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER'];"));
assert.match(editor, /labeledControl\\('Physical cash movement', cashImpact\\)/);
assert.match(editor, /cashImpact\\.required = true/);
assert.doesNotMatch(editor, /cashImpact\\.disabled = true/);
assert.doesNotMatch(editor, /derivedImpact/);
assert.doesNotMatch(editor, /suggestCashImpact/);
assert.match(editor, /fields\\.paymentMethod = selectedMethod/);
assert.match(editor, /cashMovementLabel/);
assert.match(editor, /data-act="classify"/);
assert.match(editor, /fields: \\{ cashImpact: movement\\.value \\}/);
assert.match(editor, /id = 'rcashimpact'/);
assert.match(editor, /id = 'ramountValidity'/);
assert.match(backend, /const impact = cashImpact_\\(en\\.cashImpact, row\\)/);
assert.doesNotMatch(backend, /Cash impact must match the saved payment method/);
assert.match(backend, /if \\(f\\.cashImpact !== undefined\\)/);
assert.match(readModels, /Physical cash movement/);
assert.match(readModels, /amountValidity/);
assert.match(readModels, /rowCashImpact/);

console.log(
  'Register exception contract OK — physical cash remains an explicit, independent, auditable choice; exceptions are directly filterable and correctable.',
);
