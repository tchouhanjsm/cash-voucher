'use strict';

const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

const g = create();
const ownerEmail = 'onboarding-owner@example.test';
g.props.OWNER_EMAIL = ownerEmail;
g.props.OWNER_PASSWORD = 'Owner#Start2026';
g.setup();

g.props.CV_ENVIRONMENT = 'staging';
g.props.CV_DEPLOYMENT_ID = 'MOCK_DEPLOYMENT';
g.props.CV_STAGING_SCRIPT_ID = 'MOCK_SCRIPT_ID';
g.props.CV_STAGING_SPREADSHEET_ID = 'SS1';
g.props.CV_STAGING_DEPLOYMENT_ID = 'MOCK_DEPLOYMENT';
g.props.CV_STAGING_RECEIPT_FOLDER_ID = g.props.RECEIPT_FOLDER_ID;
g.props.CV_STAGING_BACKUP_FOLDER_ID = g.props.BACKUP_FOLDER_ID;
g.props.BACKUP_LAST_SUCCESS = new Date().toISOString();
g.props.BACKUP_LAST_ATTEMPT = g.props.BACKUP_LAST_SUCCESS;
g.props.ONBOARDING_STATE_V1_STAGING = JSON.stringify({
  schemaVersion: 1,
  stage: 'preflight',
  confirmations: {},
  initializedAt: '',
  updatedAt: '',
});

function loginAndChange(email, password, next) {
  const login = g.call('login', { email, password });
  assert.equal(login.ok, true);
  const changed = g.call('changePassword', {
    token: login.data.token,
    oldPassword: password,
    newPassword: next,
  });
  assert.equal(changed.ok, true);
  return changed.data.token;
}

const token = loginAndChange(ownerEmail, 'Owner#Start2026', 'Owner#Final2026');

function request(action, payload = {}) {
  return g.call(action, {
    token,
    environment: 'staging',
    deploymentId: 'MOCK_DEPLOYMENT',
    ...payload,
  });
}

const mismatch = g.call('onboardingState', {
  token,
  environment: 'production',
  deploymentId: 'MOCK_DEPLOYMENT',
});
assert.equal(mismatch.ok, false);
assert.equal(mismatch.code, 'ENVIRONMENT_MISMATCH');

const wrongDeployment = request('onboardingState', { deploymentId: 'WRONG' });
assert.equal(wrongDeployment.ok, false);
assert.equal(wrongDeployment.code, 'ENVIRONMENT_MISMATCH');
assert.match(wrongDeployment.error, /clientDeployment/);
assert.doesNotMatch(wrongDeployment.error, /MOCK_DEPLOYMENT/);

g.props.CV_STAGING_DEPLOYMENT_ID = 'WRONG_SERVER_DEPLOYMENT';
const wrongServerDeployment = request('onboardingState');
assert.equal(wrongServerDeployment.ok, false);
assert.equal(wrongServerDeployment.code, 'ENVIRONMENT_MISMATCH');
assert.match(wrongServerDeployment.error, /serverDeployment/);
assert.doesNotMatch(wrongServerDeployment.error, /WRONG_SERVER_DEPLOYMENT/);
g.props.CV_STAGING_DEPLOYMENT_ID = 'MOCK_DEPLOYMENT';

const state = request('onboardingState');
assert.equal(state.ok, true);
assert.equal(state.data.stage, 'preflight');

const earlyWrite = request('createVouchers', { rows: [] });
assert.equal(earlyWrite.ok, false);
assert.equal(earlyWrite.code, 'ONBOARDING_GATE');

const staff = request('saveUser', {
  name: 'Staff',
  email: 'onboarding-staff@example.test',
  role: 'staff',
  password: 'Staff#Start2026',
});
assert.equal(staff.ok, true);

const manager = request('saveUser', {
  name: 'Manager',
  email: 'onboarding-manager@example.test',
  role: 'manager',
  password: 'Manager#Start2026',
});
assert.equal(manager.ok, true);

loginAndChange('onboarding-staff@example.test', 'Staff#Start2026', 'Staff#Final2026');
loginAndChange('onboarding-manager@example.test', 'Manager#Start2026', 'Manager#Final2026');

const blocked = request('onboardingAdvance');
assert.equal(blocked.ok, false);
assert.equal(blocked.code, 'ONBOARDING_BLOCKED');

const settings = request('saveSettings', {
  propertyName: 'Onboarding Test Property',
  propertyAddress: '',
  categories: ['Test', 'Other'],
  receiptCategories: ['Other'],
  nextVoucherNo: 201,
  nextReceiptNo: 1,
  openingBalance: 0,
});
assert.equal(settings.ok, true);

const stagingStart = request('onboardingAdvance');
assert.equal(stagingStart.ok, true);
assert.equal(stagingStart.data.stage, 'stagingUat');

const staffLogin = g.call('login', {
  email: 'onboarding-staff@example.test',
  password: 'Staff#Final2026',
});
const staffConfirm = g.call('onboardingConfirm', {
  token: staffLogin.data.token,
  environment: 'staging',
  deploymentId: 'MOCK_DEPLOYMENT',
  stepId: 'voucherAndReceipt',
  status: 'pass',
  evidence: 'Tested voucher and attached a receipt.',
});
assert.equal(staffConfirm.ok, false);
assert.equal(staffConfirm.code, 'FORBIDDEN');

const outOfOrder = request('onboardingConfirm', {
  stepId: 'voucherAndReceipt',
  status: 'pass',
  evidence: 'Verified staged voucher and receipt path.',
});
assert.equal(outOfOrder.ok, false);
assert.equal(outOfOrder.code, 'ONBOARDING_ORDER');

const shortEvidence = request('onboardingConfirm', {
  stepId: 'loginAndRoles',
  status: 'pass',
  evidence: 'ok',
});
assert.equal(shortEvidence.ok, false);
assert.equal(shortEvidence.code, 'VALIDATION');

const stagingEvidence = [
  ['loginAndRoles', 'Owner and staff role permissions verified in the staging browser test.'],
  ['voucherAndReceipt', 'Created a staging voucher and checked the uploaded receipt.'],
  ['highValueApproval', 'Verified approval at INR 10000 and prevented self-approval.'],
  ['cashClose', 'Completed cash close and reconciled the expected drawer balance.'],
  ['offlineSync', 'Synced the intended device offline queue and confirmed no duplicates.'],
  ['restoreDrill', 'Restored the backup to a separate recovery Sheet and reconciled records.'],
  ['ownerUatSignoff', 'Owner reviewed the staging test evidence and accepted UAT results.'],
];
for (const [stepId, evidence] of stagingEvidence) {
  const confirmation = request('onboardingConfirm', { stepId, status: 'pass', evidence });
  assert.equal(confirmation.ok, true, 'staging step passes in order: ' + stepId);
}
const stagingComplete = request('onboardingAdvance');
assert.equal(stagingComplete.ok, true);
assert.equal(stagingComplete.data.stage, 'complete');
const stagingWriteAfterUat = request('createVouchers', { entries: [] });
assert.equal(stagingWriteAfterUat.ok, false);
assert.equal(stagingWriteAfterUat.code, 'ONBOARDING_GATE');

const unset = create({ onboardingEnvironment: false });
unset.props.OWNER_EMAIL = 'unset-env@example.test';
unset.props.OWNER_PASSWORD = 'Owner#Start2026';
unset.setup();
const unsetLogin = unset.call('login', {
  email: 'unset-env@example.test',
  password: 'Owner#Start2026',
});
const unsetChange = unset.call('changePassword', {
  token: unsetLogin.data.token,
  oldPassword: 'Owner#Start2026',
  newPassword: 'Owner#Final2026',
});
const unsetWrite = unset.call('createVouchers', { token: unsetChange.data.token, rows: [] });
assert.equal(unsetWrite.ok, false);
assert.equal(unsetWrite.code, 'ENVIRONMENT_MISMATCH');

const production = create();
production.props.OWNER_EMAIL = 'prod-owner@example.test';
production.props.OWNER_PASSWORD = 'Owner#Start2026';
production.setup();
production.props.CV_ENVIRONMENT = 'production';
production.props.CV_DEPLOYMENT_ID = 'PROD_DEPLOYMENT';
production.props.CV_PRODUCTION_SCRIPT_ID = 'MOCK_SCRIPT_ID';
production.props.CV_PRODUCTION_SPREADSHEET_ID = 'SS1';
production.props.CV_PRODUCTION_DEPLOYMENT_ID = 'PROD_DEPLOYMENT';
production.props.CV_PRODUCTION_RECEIPT_FOLDER_ID = production.props.RECEIPT_FOLDER_ID;
production.props.CV_PRODUCTION_BACKUP_FOLDER_ID = production.props.BACKUP_FOLDER_ID;

production.props.BACKUP_LAST_SUCCESS = new Date().toISOString();
production.props.BACKUP_LAST_ATTEMPT = production.props.BACKUP_LAST_SUCCESS;
production.props.ONBOARDING_STATE_V1_PRODUCTION = JSON.stringify({
  schemaVersion: 1,
  stage: 'preflight',
  confirmations: {},
  initializedAt: '',
  updatedAt: '',
});

const productionLogin = production.call('login', {
  email: 'prod-owner@example.test',
  password: 'Owner#Start2026',
});
const productionChange = production.call('changePassword', {
  token: productionLogin.data.token,
  oldPassword: 'Owner#Start2026',
  newPassword: 'Owner#Final2026',
});
const productionRequest = (action, payload = {}) =>
  production.call(action, {
    token: productionChange.data.token,
    environment: 'production',
    deploymentId: 'PROD_DEPLOYMENT',
    ...payload,
  });

const productionWrite = productionRequest('createVouchers', { entries: [] });
assert.equal(productionWrite.ok, false);
assert.equal(productionWrite.code, 'ONBOARDING_GATE');

const productionManager = productionRequest('saveUser', {
  name: 'Production Manager',
  email: 'prod-manager@example.test',
  role: 'manager',
  password: 'Manager#Start2026',
});
assert.equal(productionManager.ok, true);
const productionStaff = productionRequest('saveUser', {
  name: 'Production Staff',
  email: 'prod-staff@example.test',
  role: 'staff',
  password: 'Staff#Start2026',
});
assert.equal(productionStaff.ok, true);

for (const [email, password, nextPassword] of [
  ['prod-manager@example.test', 'Manager#Start2026', 'Manager#Final2026'],
  ['prod-staff@example.test', 'Staff#Start2026', 'Staff#Final2026'],
]) {
  const login = production.call('login', { email, password });
  const changed = production.call('changePassword', {
    token: login.data.token,
    oldPassword: password,
    newPassword: nextPassword,
  });
  assert.equal(changed.ok, true);
}
const productionSettings = productionRequest('saveSettings', {
  propertyName: 'Production Onboarding Test Property',
  propertyAddress: '',
  categories: ['Test', 'Other'],
  receiptCategories: ['Other'],
  nextVoucherNo: 201,
  nextReceiptNo: 1,
  openingBalance: 0,
});
assert.equal(productionSettings.ok, true);

const productionPreflight = productionRequest('onboardingState');
assert.equal(productionPreflight.ok, true);
assert.equal(productionPreflight.data.stage, 'preflight');
assert.equal(productionPreflight.data.stageReady, true);
const productionAcceptance = productionRequest('onboardingAdvance');
assert.equal(productionAcceptance.ok, true);
assert.equal(productionAcceptance.data.stage, 'productionAcceptance');

for (const [stepId, evidence] of [
  ['restoreDrill', 'Restored production backup to a separate recovery Sheet and reconciled data.'],
  ['offlineLimitations', 'Owner acknowledged offline queue and backup recovery limitations.'],
  ['ownerAcceptance', 'Owner independently accepted production readiness and release evidence.'],
]) {
  const confirmation = productionRequest('onboardingConfirm', {
    stepId,
    status: 'pass',
    evidence,
  });
  assert.equal(confirmation.ok, true, 'production step passes in order: ' + stepId);
}
const accepted = productionRequest('onboardingAdvance');
assert.equal(accepted.ok, true);
assert.equal(accepted.data.stage, 'complete');
assert.equal(accepted.data.releaseAllowed, true);
const acceptedWrite = productionRequest('createVouchers', { entries: [] });
assert.notEqual(acceptedWrite.code, 'ONBOARDING_GATE');

console.log(
  'Onboarding tests passed: blocked preflight, staging completion, owner-only confirmations, and production acceptance.',
);
