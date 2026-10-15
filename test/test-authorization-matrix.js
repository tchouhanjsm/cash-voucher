'use strict';

const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

const g = create();
g.props.OWNER_EMAIL = 'owner@auth-matrix.test';
g.props.OWNER_PIN = '483921';
g.setup();

const DATE = '2026-10-15';
const accountSpecs = {
  owner: {
    email: 'owner@auth-matrix.test',
    temporaryPin: '483921',
    firstPin: '579246',
    rotatePin: '625193',
    name: 'Test Owner',
    role: 'owner',
    existing: true,
  },
  manager: {
    email: 'manager@auth-matrix.test',
    temporaryPin: '724681',
    firstPin: '681529',
    rotatePin: '259681',
    name: 'Test Manager',
    role: 'manager',
  },
  staff: {
    email: 'staff@auth-matrix.test',
    temporaryPin: '835274',
    firstPin: '731946',
    rotatePin: '946281',
    name: 'Test Staff',
    role: 'staff',
  },
  staff2: {
    email: 'staff2@auth-matrix.test',
    temporaryPin: '926481',
    firstPin: '594827',
    rotatePin: '817264',
    name: 'Second Test Staff',
    role: 'staff',
  },
  accountant: {
    email: 'accountant@auth-matrix.test',
    temporaryPin: '592743',
    firstPin: '384715',
    rotatePin: '726195',
    name: 'Test Accountant',
    role: 'accountant',
  },
};

function call(action, account, payload = {}) {
  return g.call(action, { token: account.token, ...payload });
}
function assertNotForbidden(result, message) {
  assert.notEqual(result.code, 'FORBIDDEN', message);
}
function loginAndChange(spec) {
  const login = g.call('login', { email: spec.email, pin: spec.temporaryPin });
  assert.ok(login.ok, spec.role + ' login with temporary PIN succeeds');
  const changed = g.call('changePin', {
    token: login.data.token,
    oldPin: spec.temporaryPin,
    newPin: spec.firstPin,
  });
  assert.ok(changed.ok, spec.role + ' can complete first-login PIN change');
  return { ...spec, token: changed.data.token, pin: spec.firstPin };
}

const ownerLogin = g.call('login', {
  email: accountSpecs.owner.email,
  pin: accountSpecs.owner.temporaryPin,
});
assert.ok(ownerLogin.ok, 'initial owner login succeeds');
const ownerChanged = g.call('changePin', {
  token: ownerLogin.data.token,
  oldPin: accountSpecs.owner.temporaryPin,
  newPin: accountSpecs.owner.firstPin,
});
assert.ok(ownerChanged.ok, 'initial owner PIN change succeeds');
const users = {
  owner: {
    ...accountSpecs.owner,
    token: ownerChanged.data.token,
    pin: accountSpecs.owner.firstPin,
  },
};

for (const key of ['manager', 'staff', 'staff2', 'accountant']) {
  const spec = accountSpecs[key];
  const created = call('saveUser', users.owner, {
    name: spec.name,
    email: spec.email,
    role: spec.role,
    pin: spec.temporaryPin,
  });
  assert.ok(created.ok, 'owner can provision the ' + key + ' fixture');
  users[key] = loginAndChange(spec);
}

const expectedPermissions = {
  staff: { create: 1, viewOwn: 1 },
  manager: {
    create: 1,
    viewAll: 1,
    edit: 1,
    cancel: 1,
    bulk: 1,
    vendors: 1,
    receiptAny: 1,
    cashClose: 1,
    approvePayments: 1,
    reports: 1,
  },
  owner: {
    create: 1,
    viewAll: 1,
    edit: 1,
    cancel: 1,
    bulk: 1,
    vendors: 1,
    receiptAny: 1,
    users: 1,
    settings: 1,
    audit: 1,
    cashClose: 1,
    approvePayments: 1,
    reports: 1,
  },
  accountant: { reports: 1 },
};
assert.deepEqual(g.permissionMap(), expectedPermissions, 'role permission contract matches policy');

const settings = call('saveSettings', users.owner, {
  propertyName: 'Authorization Matrix Test',
  propertyAddress: 'Test Environment Only',
  categories: ['Other'],
  receiptCategories: ['Other'],
  nextVoucherNo: 201,
  nextReceiptNo: 1,
  openingBalance: 4312,
});
assert.ok(settings.ok, 'owner can set a fixture-only opening balance for visibility assertions');

function createVoucher(account, clientId, vendor, amount) {
  const result = call('createVouchers', account, {
    entries: [
      {
        clientId,
        date: DATE,
        vendor,
        amount,
        category: 'Other',
        notes: '',
        type: 'PAYMENT',
        cashImpact: 'CASH_OUT',
      },
    ],
  });
  assert.ok(result.ok, account.role + ' can create an ordinary voucher');
  assert.equal(result.data.created.length, 1, 'fixture creates exactly one voucher');
  return result.data.created[0];
}

const staffVoucher = createVoucher(users.staff, 'auth-staff-client', 'Staff Owner Vendor', 31);
const secondStaffVoucher = createVoucher(
  users.staff2,
  'auth-second-staff-client',
  'Second Staff Vendor',
  32,
);
const managerVoucher = createVoucher(
  users.manager,
  'auth-manager-client',
  'Manager Owner Vendor',
  33,
);

const permissionCases = [
  { action: 'createVouchers', allowed: ['staff', 'manager', 'owner'], payload: { entries: [] } },
  {
    action: 'createVouchers',
    label: 'bulk create',
    allowed: ['manager', 'owner'],
    payload: { bulk: true, entries: [null] },
  },
  { action: 'updateVoucher', allowed: ['manager', 'owner'], payload: { id: 'missing-voucher' } },
  { action: 'cancelVoucher', allowed: ['manager', 'owner'], payload: { id: 'missing-voucher' } },
  { action: 'approveVoucher', allowed: ['manager', 'owner'], payload: { id: 'missing-voucher' } },
  { action: 'rejectVoucher', allowed: ['manager', 'owner'], payload: { id: 'missing-voucher' } },
  { action: 'saveVendor', allowed: ['manager', 'owner'], payload: {} },
  { action: 'toggleVendor', allowed: ['manager', 'owner'], payload: { id: 'missing-vendor' } },
  { action: 'listUsers', allowed: ['owner'], payload: {} },
  { action: 'saveUser', allowed: ['owner'], payload: {} },
  { action: 'resetPin', allowed: ['owner'], payload: {} },
  { action: 'saveSettings', allowed: ['owner'], payload: {} },
  { action: 'auditLog', allowed: ['owner'], payload: {} },
  { action: 'dataQualityReport', allowed: ['owner'], payload: {} },
  { action: 'backupStatus', allowed: ['owner'], payload: {} },
  { action: 'backupIntegrityReport', allowed: ['owner'], payload: {} },
  {
    action: 'recordedMovementReport',
    allowed: ['manager', 'owner', 'accountant'],
    payload: { from: DATE, to: DATE, type: 'ALL', status: 'ALL' },
  },
  { action: 'cashClosePreview', allowed: ['manager', 'owner'], payload: { date: DATE } },
  {
    action: 'createCashClose',
    allowed: ['manager', 'owner'],
    payload: { date: 'not-a-date' },
  },
  {
    action: 'recordCashCloseCorrection',
    allowed: ['manager', 'owner'],
    payload: {},
  },
];

let actionRoleChecks = 0;
for (const testCase of permissionCases) {
  for (const role of ['staff', 'manager', 'owner', 'accountant']) {
    const result = call(testCase.action, users[role], testCase.payload);
    const shouldBeAllowed = testCase.allowed.includes(role);
    if (shouldBeAllowed) {
      assertNotForbidden(
        result,
        (testCase.label || testCase.action) + ' should permit the ' + role + ' role',
      );
    } else {
      assert.equal(
        result.code,
        'FORBIDDEN',
        (testCase.label || testCase.action) + ' must deny the ' + role + ' role',
      );
    }
    actionRoleChecks += 1;
  }
}

const bootstrap = {};
for (const role of ['staff', 'manager', 'owner', 'accountant']) {
  const result = call('bootstrap', users[role]);
  assert.ok(result.ok, role + ' can load the shell bootstrap');
  bootstrap[role] = result.data;
}

assert.deepEqual(
  bootstrap.staff.vouchers.map((voucher) => voucher.id),
  [staffVoucher.id],
  'staff bootstrap shows only vouchers created by that staff identity',
);
assert.deepEqual(
  bootstrap.staff2.vouchers.map((voucher) => voucher.id),
  [secondStaffVoucher.id],
  'second staff bootstrap cannot see another staff member’s vouchers',
);
assert.equal(bootstrap.manager.vouchers.length, 3, 'manager bootstrap sees all fixture vouchers');
assert.ok(
  bootstrap.manager.vouchers.some((voucher) => voucher.id === managerVoucher.id),
  'manager bootstrap contains the voucher created by the manager account',
);
assert.equal(bootstrap.owner.vouchers.length, 3, 'owner bootstrap sees all fixture vouchers');
assert.equal(
  bootstrap.accountant.vouchers.length,
  0,
  'accountant bootstrap contains no register rows',
);
assert.equal(
  bootstrap.accountant.vendors.length,
  0,
  'accountant bootstrap contains no vendor directory',
);
assert.equal(
  bootstrap.owner.settings.openingBalance,
  4312,
  'owner sees configured opening balance',
);
assert.equal(
  bootstrap.manager.settings.openingBalance,
  4312,
  'manager sees configured opening balance',
);
assert.equal(bootstrap.staff.settings.openingBalance, 0, 'staff does not receive opening balance');
assert.equal(
  bootstrap.accountant.settings.openingBalance,
  0,
  'accountant does not receive opening balance',
);
assert.deepEqual(
  Object.keys(bootstrap.staff.names),
  ['staff@auth-matrix.test'],
  'staff bootstrap exposes only the signed-in identity label',
);
assert.deepEqual(
  Object.keys(bootstrap.accountant.names),
  ['accountant@auth-matrix.test'],
  'accountant bootstrap exposes only the signed-in identity label',
);

const visibleReport = {
  from: DATE,
  to: DATE,
  type: 'ALL',
  status: 'ALL',
};
for (const role of ['manager', 'owner', 'accountant']) {
  const report = call('recordedMovementReport', users[role], visibleReport);
  assert.ok(report.ok, role + ' can access the authorized recorded-movement report');
  assert.ok(
    report.data.items.some((item) => item.id === staffVoucher.id),
    role + ' report sees the same staff voucher when reports permission is present',
  );
}

const staffReport = call('recordedMovementReport', users.staff, visibleReport);
assert.equal(staffReport.code, 'FORBIDDEN', 'staff cannot query the cross-user report endpoint');

function checkReceiptRole(action, role, voucher, shouldBeAllowed, label) {
  const result = call(action, users[role], {
    id: voucher.id,
    fileId: 'missing-receipt-id',
    receipt: undefined,
  });
  if (shouldBeAllowed) {
    assertNotForbidden(result, label);
  } else {
    assert.equal(result.code, 'FORBIDDEN', label);
  }
}

checkReceiptRole(
  'getReceipt',
  'staff',
  staffVoucher,
  true,
  'staff can access a receipt on own voucher',
);
checkReceiptRole(
  'getReceipt',
  'staff2',
  staffVoucher,
  false,
  'staff cannot access another user’s receipt',
);
checkReceiptRole('getReceipt', 'manager', staffVoucher, true, 'manager can access a staff receipt');
checkReceiptRole('getReceipt', 'owner', staffVoucher, true, 'owner can access a staff receipt');
checkReceiptRole(
  'getReceipt',
  'accountant',
  staffVoucher,
  false,
  'accountant cannot access receipt files through the voucher endpoint',
);

function checkAddReceiptRole(role, voucher, shouldBeAllowed, label) {
  const result = call('addReceipt', users[role], { id: voucher.id });
  if (shouldBeAllowed) {
    assertNotForbidden(result, label);
  } else {
    assert.equal(result.code, 'FORBIDDEN', label);
  }
}
checkAddReceiptRole('staff', staffVoucher, true, 'staff can attach a receipt to own voucher');
checkAddReceiptRole(
  'staff2',
  staffVoucher,
  false,
  'staff cannot attach a receipt to another user’s voucher',
);
checkAddReceiptRole(
  'manager',
  staffVoucher,
  true,
  'manager can attach a receipt to a staff voucher',
);
checkAddReceiptRole('owner', staffVoucher, true, 'owner can attach a receipt to a staff voucher');
checkAddReceiptRole('accountant', staffVoucher, false, 'accountant cannot attach receipts');

for (const role of ['staff', 'manager', 'owner', 'accountant']) {
  const account = users[role];
  const result = call('changePin', account, {
    oldPin: account.pin,
    newPin: accountSpecs[role].rotatePin,
  });
  assert.ok(result.ok, role + ' may change their own PIN without owner-level permission');
  account.pin = accountSpecs[role].rotatePin;
  account.token = result.data.token;
}

for (const [role, account] of Object.entries(users)) {
  const loggedOut = call('logout', account);
  assert.ok(loggedOut.ok, role + ' may end their own session');
}

console.log(
  'Authorization matrix OK — ' +
    actionRoleChecks +
    ' role/action assertions plus bootstrap data isolation, report access, own/foreign receipt access, PIN self-service and logout.',
);
