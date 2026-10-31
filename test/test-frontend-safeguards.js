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
assert.doesNotMatch(recentSource, /voucher\.vendor\)/);

assert.match(payments, /checkPaymentDuplicates/);
assert.match(payments, /duplicateConfirmationFingerprint/);
assert.match(payments, /duplicateConfirmationToken/);
assert.match(payments, /DUPLICATE_CONFIRMATION_REQUIRED/);
assert.doesNotMatch(payments, /duplicateConfirmed/);
assert.match(payments, /vendorType: selectedVendor \? 'REGISTERED' : 'ONE_TIME'/);
assert.match(payments, /vendor-identity/);
const saveStart = payments.indexOf('async function saveNew');
const saveNext = payments.indexOf('\n  async function ', saveStart + 1);
assert.ok(saveStart >= 0 && saveNext > saveStart, 'New Entry save handler is present');
const saveSource = payments.slice(saveStart, saveNext);
assert.match(saveSource, /const rows = \$\$\('#rows \.erow'\);/);
assert.match(saveSource, /rows\.forEach\(clearRowError\)/);
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
