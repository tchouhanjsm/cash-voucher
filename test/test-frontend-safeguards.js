'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(require.resolve(path), 'utf8');
}

const formOptions = read('../frontend/core/form-options.js');
const payments = read('../frontend/features/payments.js');
const main = read('../frontend/main.js');
const state = read('../frontend/core/state.js');
const css = read('../frontend-ui-kit.css');

assert.match(formOptions, /vendor\.active/);
assert.match(formOptions, /vendor\.id/);
assert.doesNotMatch(formOptions, /S\.vouchers|cv\.cache|cache\.vn/);

const recentStart = payments.indexOf('function recentVendors(');
const recentEnd = payments.indexOf('function renderRecentVendors()', recentStart);
assert.ok(recentStart >= 0 && recentEnd > recentStart, 'recent vendor selector is present');
const recentSource = payments.slice(recentStart, recentEnd);
assert.match(recentSource, /S\.vendors/);
assert.match(recentSource, /vendor\.active/);
assert.match(recentSource, /vendor\.id/);
assert.match(recentSource, /voucher\.vendorId/);
assert.doesNotMatch(recentSource, /voucher\.vendor\)/);

assert.match(payments, /checkPaymentDuplicates/);
assert.match(payments, /duplicateConfirmationFingerprint/);
assert.match(payments, /duplicateConfirmationToken/);
assert.match(payments, /DUPLICATE_CONFIRMATION_REQUIRED/);
assert.doesNotMatch(payments, /duplicateConfirmed/);
assert.match(payments, /vendorType: selectedVendor \? 'REGISTERED' : 'ONE_TIME'/);
assert.match(payments, /vendor-identity/);
assert.match(state, /'vendorType'/);

assert.match(main, /async function init\(\)/);
assert.match(main, /await navigation\.start\(\)/);
assert.match(main, /finally \{/);
assert.match(main, /\$\('#boot'\)\.classList\.add\('hidden'\)/);

assert.match(css, /#nf\.entry-form #recentVendors \.vchip[\s\S]*?min-height: 44px/);
assert.match(css, /vendor-identity/);

console.log(
  'Frontend reliability contracts: verified vendor-only suggestions, row-bound duplicate confirmation, explicit payee type, and awaited session startup.',
);
