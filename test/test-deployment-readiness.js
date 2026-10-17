'use strict';

const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

const g = create();
g.props.OWNER_EMAIL = 'readiness-owner@test.com';
g.props.OWNER_PASSWORD = 'Owner#Start2026';
g.setup();

const anonymous = g.call('deploymentReadiness');
assert.equal(anonymous.ok, false, 'deployment readiness is not accessible anonymously');
assert.equal(anonymous.code, 'SESSION');

const login = g.call('login', {
  email: 'readiness-owner@test.com',
  password: 'Owner#Start2026',
});
assert.equal(login.ok, true);
const changedPassword = g.call('changePassword', {
  token: login.data.token,
  oldPassword: 'Owner#Start2026',
  newPassword: 'Owner#Final2026',
});
assert.equal(changedPassword.ok, true);

const readiness = g.call('deploymentReadiness', { token: changedPassword.data.token });
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
  token: changedPassword.data.token,
  name: 'Readiness Staff',
  email: 'readiness-staff@test.com',
  role: 'staff',
  password: 'Temp#OtherPass2026',
});
assert.equal(createStaff.ok, true);
const staffLogin = g.call('login', {
  email: 'readiness-staff@test.com',
  password: 'Temp#OtherPass2026',
});
assert.equal(staffLogin.ok, true);
const staffPasswordChange = g.call('changePassword', {
  token: staffLogin.data.token,
  oldPassword: 'Temp#OtherPass2026',
  newPassword: 'Manager#Final2026',
});
assert.equal(staffPasswordChange.ok, true);
const denied = g.call('deploymentReadiness', { token: staffPasswordChange.data.token });
assert.equal(denied.ok, false);
assert.equal(denied.code, 'FORBIDDEN', 'staging target identifiers are owner/settings-only');

const actions = g.registeredActions();
assert.ok(actions.includes('deploymentReadiness'));
assert.ok(!g.writeActions().includes('deploymentReadiness'));

console.log(
  'Deployment readiness OK — resource/schema/trigger diagnostics are read-only and settings-authorized.',
);
