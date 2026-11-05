'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function read(path) {
  return fs.readFileSync(require.resolve(path), 'utf8');
}

const formOptions = read('../frontend/core/form-options.js');
const utils = read('../frontend/core/utils.js');
const payments = read('../frontend/features/payments.js');
const register = read('../frontend/features/register.js');
const main = read('../frontend/main.js');
const state = read('../frontend/core/state.js');
const css = read('../frontend-ui-kit.css');

assert.match(formOptions, /vendor\.active/);
assert.match(formOptions, /vendor\.id/);
assert.doesNotMatch(formOptions, /S\.vouchers|cv\.cache|cache\.vn/);
assert.match(formOptions, /esc\(name\)/, 'vendor option values use the shared HTML escaper');

const scalarStart = utils.indexOf('export const scalarText = (value) =>');
const scalarEndMarker = '\n};';
const scalarEnd = utils.indexOf(scalarEndMarker, scalarStart);
assert.ok(
  scalarStart >= 0 && scalarEnd > scalarStart,
  'the shared production text normalizer is present',
);
const scalarDefinition = utils.slice(scalarStart, scalarEnd + scalarEndMarker.length);
const escStart = utils.indexOf('export const esc = (value) =>');
const escEndMarker = '\n  );';
const escEnd = utils.indexOf(escEndMarker, escStart);
assert.ok(escStart >= 0 && escEnd > escStart, 'the shared production HTML escaper is present');
const escDefinition = utils.slice(escStart, escEnd + escEndMarker.length);
const escSandbox = {};
vm.runInNewContext(
  scalarDefinition.replace('export const scalarText =', 'const scalarText =') +
    '\n' +
    escDefinition.replace('export const esc =', 'const esc =') +
    '\nglobalThis.esc = esc;',
  escSandbox,
);
assert.equal(
  escSandbox.esc(`A&B <img src=x onerror=alert(1)>"' नमस्ते`),
  'A&amp;B &lt;img src=x onerror=alert(1)&gt;&quot;&#39; नमस्ते',
  'HTML-sensitive characters are escaped while Unicode payee names remain intact',
);

const recentStart = payments.indexOf('function recentVendors(');
const recentEnd = payments.indexOf('function renderRecentVendors()', recentStart);
assert.ok(recentStart >= 0 && recentEnd > recentStart, 'recent vendor selector is present');
const recentSource = payments.slice(recentStart, recentEnd);
assert.match(recentSource, /S\.vendors/);
assert.match(recentSource, /vendor\.active/);
assert.match(recentSource, /vendor\.id/);
assert.match(recentSource, /voucher\.vendorId/);
assert.match(recentSource, /lastUsed\.has\(vendor\.id\)/);
assert.doesNotMatch(recentSource, /voucher\.vendor\)/);

assert.match(payments, /checkPaymentDuplicates/);
assert.match(payments, /duplicateConfirmationFingerprint/);
assert.match(payments, /duplicateConfirmationToken/);
assert.match(payments, /DUPLICATE_CONFIRMATION_REQUIRED/);
assert.doesNotMatch(payments, /duplicateConfirmed/);
assert.match(payments, /vendorType: selectedVendor \? 'REGISTERED' : 'ONE_TIME'/);
assert.match(payments, /vendor-identity/);
assert.match(payments, /cash-movement-fieldset/);
assert.match(payments, /CASH_IMPACT_CHOICES\.includes\(cashImpact\)/);
assert.match(payments, /function updateApprovalThresholdHint\(row\)/);
assert.match(payments, /Payments of ₹10,000 or more need approval by an owner or manager/);
assert.doesNotMatch(
  payments,
  /paymentMethod === 'CASH' \? \(NT === 'RECEIPT' \? 'CASH_IN' : 'CASH_OUT'\)/,
  'entry save never infers physical drawer movement from method or voucher type',
);
const saveStart = payments.indexOf('async function saveNew');
const saveNext = payments.indexOf('\n  async function ', saveStart + 1);
assert.ok(saveStart >= 0 && saveNext > saveStart, 'New Entry save handler is present');
const saveSource = payments.slice(saveStart, saveNext);
assert.match(saveSource, /const cashImpact = \$\('\.cash-impact:checked', r\)\?\.value \|\| ''/);
assert.doesNotMatch(saveSource, /paymentMethod\s*===|NT\s*===\s*'RECEIPT'\s*\?\s*'CASH_IN'/);
assert.match(saveSource, /const rows = \$\$\('#rows \.erow'\);/);
assert.match(saveSource, /rows\.forEach\(clearRowError\)/);
const batchStart = payments.indexOf('function updateBatchSummary()');
const batchEnd = payments.indexOf('function vNew()', batchStart);
assert.ok(batchStart >= 0 && batchEnd > batchStart, 'multi-entry summary updater is present');
assert.match(
  payments.slice(batchStart, batchEnd),
  /const rows = \\$\\$\\('#rows \\.erow'\\);/,
  'multi-entry summary iterates every row rather than a single DOM element',
);
assert.match(state, /'vendorType'/);

assert.match(main, /async function init\(\)/);
assert.match(main, /await navigation\.start\(\)/);
assert.match(main, /finally \{/);
assert.match(main, /\$\('#boot'\)\.classList\.add\('hidden'\)/);

assert.match(css, /#nf\.entry-form #recentVendors \.vchip[\s\S]*?min-height: 44px/);
assert.match(css, /vendor-identity/);

assert.match(
  payments,
  /<form id="nf" class="card entry-form" data-workspace="entry-form-workspace"/,
);
assert.match(
  payments,
  /\$\{vendorList\(\)\}/,
  'vendor option markup uses the shared escaped renderer',
);
const recentRenderStart = payments.indexOf('function renderRecentVendors()');
const recentRenderEnd = payments.indexOf('\n  document.addEventListener', recentRenderStart);
assert.ok(
  recentRenderStart >= 0 && recentRenderEnd > recentRenderStart,
  'recent payee chips use a dedicated renderer',
);
const recentRenderSource = payments.slice(recentRenderStart, recentRenderEnd);
assert.match(recentRenderSource, /chip\.textContent = vendor\.name/);
assert.doesNotMatch(
  recentRenderSource,
  /innerHTML/,
  'recent vendor names never enter an HTML parser',
);
assert.match(
  register,
  /value="\$\{esc\(R\.q\)\}"/,
  'register search terms are escaped before rendering',
);
assert.match(register, /\$\{esc\(vendor\)\}/, 'register vendor facet values are escaped');
assert.match(register, /\$\{esc\(category\)\}/, 'register category facet values are escaped');
assert.match(register, /value="\$\{esc\(R\.from\)\}"/, 'register start dates are escaped');
assert.match(register, /value="\$\{esc\(R\.to\)\}"/, 'register end dates are escaped');
assert.match(register, /value="\$\{esc\(user\)\}"/, 'register user facet values are escaped');
assert.match(register, /\$\{esc\(nm\(user\)\)\}/, 'register user labels are escaped');

console.log(
  'Frontend reliability contracts: verified vendor-only suggestions, row-bound duplicate confirmation, explicit payee type, and awaited session startup.',
);
