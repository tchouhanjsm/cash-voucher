'use strict';

const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

const g = create();
g.props.OWNER_EMAIL = 'readiness-owner@test.com';
g.props.OWNER_PASSWORD = 'OwnerPass2036';
g.setup();

const anonymous = g.call('deploymentReadiness');
assert.equal(anonymous.ok, false, 'deployment readiness is not accessible anonymously');
assert.equal(anonymous.code, 'SESSION');

const login = g.call('login', {
  email: 'readiness-owner@test.com',
  password: 'OwnerPass2036',
});
assert.equal(login.ok, true);
const changedPin = g.call('changePassword', {
  token: login.data.token,
  oldPassword: 'OwnerPass2036',
  newPassword: 'UpdatedOwnerPass7',
});
assert.equal(changedPin.ok, true);

const readiness = g.call('deploymentReadiness', { token: changedPin.data.token });
assert.equal(readiness.ok, true);
assert.equal(readiness.data.scriptId, 'MOCK_SCRIPT_ID');
assert.equal(readiness.data.spreadsheetId, 'SS1');
assert.ok(readiness.data.receiptFolderId);
assert.ok(readiness.data.backupFolderId);
assert.equal(readiness.data.checks.spreadsheetReadable, true);
assert.deepEqual(readiness.data.checks.missingSheets, []);
assert.deepEqual(readiness.data.checks.invalidHeaders, []);
assert.equal(readiness.data.checks.receiptFolderReadable, true);
assert.equal(readiness.data.checks.backupFolderReadable, true);
assert.equal(readiness.data.checks.backupTriggerInstalled, true);

const createStaff = g.call('saveUser', {
  token: changedPin.data.token,
  name: 'Readiness Staff',
  email: 'readiness-staff@test.com',
  role: 'staff',
  password: '628491',
});
assert.equal(createStaff.ok, true);
const staffLogin = g.call('login', {
  email: 'readiness-staff@test.com',
  password: '628491',
});
assert.equal(staffLogin.ok, true);
const staffPinChange = g.call('changePassword', {
  token: staffLogin.data.token,
  oldPassword: '628491',
  newPassword: '739284',
});
assert.equal(staffPinChange.ok, true);
const denied = g.call('deploymentReadiness', { token: staffPinChange.data.token });
assert.equal(denied.ok, false);
assert.equal(denied.code, 'FORBIDDEN', 'staging target identifiers are owner/settings-only');

const actions = g.registeredActions();
assert.ok(actions.includes('deploymentReadiness'));
assert.ok(!g.writeActions().includes('deploymentReadiness'));

console.log(
  'Deployment readiness OK — resource/schema/trigger diagnostics are read-only and settings-authorized.',
);
