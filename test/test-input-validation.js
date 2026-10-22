'use strict';

const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

const g = create();
g.props.OWNER_EMAIL = 'Owner@Test.com';
g.props.OWNER_PASSWORD = 'Owner#Start2026';
g.setup();

const initialLogin = g.call('login', {
  email: 'owner@test.com',
  password: 'Owner#Start2026',
});
assert.ok(initialLogin.ok, 'owner can sign in for validation regression tests');

const passwordChange = g.call('changePassword', {
  token: initialLogin.data.token,
  oldPassword: 'Owner#Start2026',
  newPassword: 'Owner#Final2026',
});
assert.ok(passwordChange.ok, 'owner completes the forced password change');
const token = passwordChange.data.token;
const call = (action, payload = {}) => g.call(action, { token, ...payload });

const invalidNames = [
  '<script>alert(1)</script>',
  '<svg onload=alert(1)>',
  'DROP TABLE Users;--',
  '123456789',
  '!!!!!!!!!',
  'name\u200Bhidden',
  'a'.repeat(81),
  { supplied: 'object instead of a string' },
  ['array', 'instead', 'of', 'a', 'string'],
];

let rejectedUserCount = 0;
invalidNames.forEach((name, index) => {
  const before = g.sheets.Users.rows.length;
  const result = call('saveUser', {
    name,
    email: 'invalid-name-' + index + '@test.com',
    role: 'staff',
    password: 'Staff#Temp2026',
  });
  assert.equal(result.ok, false, 'invalid user name is rejected: case ' + index);
  assert.equal(
    result.code,
    'VALIDATION',
    'invalid user name returns validation error: case ' + index,
  );
  assert.equal(
    g.sheets.Users.rows.length,
    before,
    'invalid user name does not write a row: case ' + index,
  );
  rejectedUserCount++;
});

const unicodeUser = call('saveUser', {
  name: 'सुरेश चौहान',
  email: 'unicode-name@test.com',
  role: 'staff',
  password: 'Staff#Temp2026',
});
assert.ok(unicodeUser.ok, 'legitimate Hindi Unicode names are accepted');

const invalidVendorNames = [
  '<script>alert(1)</script>',
  'DROP TABLE Vendors;--',
  '123456789',
  '!!!!!!!!!',
  'vendor\u202Ename',
  { supplied: 'object instead of a string' },
];
let rejectedVendorCount = 0;
invalidVendorNames.forEach((name, index) => {
  const before = g.sheets.Vendors.rows.length;
  const result = call('saveVendor', { name, company: 'Example Company' });
  assert.equal(result.ok, false, 'invalid vendor name is rejected: case ' + index);
  assert.equal(
    result.code,
    'VALIDATION',
    'invalid vendor name returns validation error: case ' + index,
  );
  assert.equal(
    g.sheets.Vendors.rows.length,
    before,
    'invalid vendor name does not write a row: case ' + index,
  );
  rejectedVendorCount++;
});

const invalidCompanyBefore = g.sheets.Vendors.rows.length;
const invalidCompany = call('saveVendor', {
  name: 'Valid Company Name',
  company: '<img src=x onerror=alert(1)>',
});
assert.equal(invalidCompany.ok, false, 'markup in optional company name is rejected');
assert.equal(invalidCompany.code, 'VALIDATION', 'invalid company name returns validation error');
assert.equal(
  g.sheets.Vendors.rows.length,
  invalidCompanyBefore,
  'invalid company name does not create a vendor row',
);

const validVendor = call('saveVendor', {
  name: 'M/s Garh Jaisal & Co.',
  company: 'Garh Jaisal Hospitality Pvt. Ltd.',
  mobile: '+91 98765 43210',
});
assert.ok(validVendor.ok, 'legitimate business punctuation is accepted');

const today = new Date().toISOString().slice(0, 10);
const voucherCountBeforeInvalidNames = g.sheets.Vouchers.rows.length;
let rejectedVoucherCount = 0;
invalidNames.slice(0, 6).forEach((vendor, index) => {
  const result = call('createVouchers', {
    entries: [
      {
        date: today,
        vendor,
        amount: 12.5,
        cashImpact: 'CASH_OUT',
      },
    ],
  });
  assert.equal(result.ok, false, 'invalid voucher vendor is rejected: case ' + index);
  assert.equal(
    result.code,
    'VALIDATION',
    'invalid voucher vendor returns validation error: case ' + index,
  );
  assert.equal(
    g.sheets.Vouchers.rows.length,
    voucherCountBeforeInvalidNames,
    'invalid voucher vendor does not create a financial row: case ' + index,
  );
  rejectedVoucherCount++;
});

const formulaNote = '=HYPERLINK("https://example.test","click")';
const voucher = call('createVouchers', {
  entries: [
    {
      date: today,
      vendor: 'Formula Safety Test Vendor',
      amount: 12.5,
      notes: formulaNote,
      cashImpact: 'CASH_OUT',
    },
  ],
});
assert.ok(voucher.ok, 'valid voucher entry is accepted');
const noteIndex = g.sheets.Vouchers.rows[0].indexOf('Notes');
const storedVoucher = g.sheets.Vouchers.rows.find((row) => row[0] === voucher.data.created[0].id);
assert.ok(storedVoucher, 'created voucher row is present');
assert.equal(
  storedVoucher[noteIndex],
  "'" + formulaNote,
  'existing spreadsheet formula-injection protection remains active for free-text notes',
);

const settingsMap = Object.fromEntries(
  g.sheets.Settings.rows.slice(1).map((row) => [String(row[0]), String(row[1])]),
);
const settingsPayload = {
  propertyName: 'Valid Property Name',
  propertyAddress: settingsMap.propertyAddress || '',
  categories: JSON.parse(settingsMap.categories || '["Other"]'),
  nextVoucherNo: Number(settingsMap.nextVoucherNo || 201),
  nextReceiptNo: Number(settingsMap.nextReceiptNo || 1),
  openingBalance: Number(settingsMap.openingBalance || 0),
  receiptCategories: JSON.parse(settingsMap.receiptCategories || '["Other"]'),
};
for (const propertyName of invalidNames.slice(0, 5)) {
  const result = call('saveSettings', { ...settingsPayload, propertyName });
  assert.equal(result.ok, false, 'invalid property name is rejected');
  assert.equal(result.code, 'VALIDATION', 'invalid property name returns validation error');
}
const badCategories = call('saveSettings', {
  ...settingsPayload,
  categories: ['Valid Category', '<script>alert(1)</script>'],
});
assert.equal(badCategories.ok, false, 'malformed custom category is rejected');
assert.equal(badCategories.code, 'VALIDATION', 'malformed category returns validation error');

console.log(
  'Input validation regression passed — ' +
    rejectedUserCount +
    ' invalid user names, ' +
    rejectedVendorCount +
    ' invalid vendor names, ' +
    rejectedVoucherCount +
    ' invalid voucher vendor names, Unicode compatibility, settings categories and formula injection.',
);
