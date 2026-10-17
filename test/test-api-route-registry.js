'use strict';

const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

const g = create();
g.props.OWNER_EMAIL = 'route-owner@test.com';
g.props.OWNER_PASSWORD = 'OwnerPass2036';
g.setup();

const actions = g.registeredActions();
const writes = g.writeActions();

assert.ok(actions.length > 0, 'backend route registry must not be empty');
assert.equal(new Set(actions).size, actions.length, 'API action names must be unique');
assert.ok(writes.length > 0, 'write classification must not be empty');
assert.ok(
  writes.every((action) => actions.includes(action)),
  'every declared write action must exist in the authoritative action registry',
);

const requiredFinancialWrites = [
  'createVouchers',
  'updateVoucher',
  'cancelVoucher',
  'approveVoucher',
  'rejectVoucher',
  'addReceipt',
  'createCashClose',
  'recordCashCloseCorrection',
  'saveSettings',
  'saveUser',
  'resetPassword',
  'toggleVendor',
];

assert.ok(
  requiredFinancialWrites.every((action) => writes.includes(action)),
  'financial and privileged mutation routes must remain explicitly classified as writes',
);

for (const action of actions) {
  const result = g.call(action);
  assert.equal(result.ok, false, action + ' must not succeed without an authenticated session');
  if (action !== 'login') {
    assert.equal(
      result.code,
      'SESSION',
      action + ' must fail closed at the authentication boundary',
    );
  }
}

for (const readAction of [
  'bootstrap',
  'auditLog',
  'recordedMovementReport',
  'dataQualityReport',
  'backupStatus',
  'backupIntegrityReport',
  'deploymentReadiness',
]) {
  assert.ok(actions.includes(readAction), readAction + ' must remain explicitly registered');
  assert.ok(!writes.includes(readAction), readAction + ' must not be classified as a write');
}

console.log(
  'API route registry OK — ' +
    actions.length +
    ' registered actions; ' +
    writes.length +
    ' write routes classified; unauthenticated calls fail closed.',
);
