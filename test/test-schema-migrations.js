'use strict';

const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

function setupMock() {
  const mock = create();
  mock.props.OWNER_EMAIL = 'Owner@Test.com';
  mock.props.OWNER_PASSWORD = 'Owner#Start2026';
  mock.setup();
  return mock;
}

// PaymentMethod migration must be additive and must not infer historical payment rails.
const paymentMethodMock = setupMock();
const vouchers = paymentMethodMock.sheets.Vouchers;
vouchers.rows[0] = vouchers.rows[0].slice(0, 22);
vouchers.rows.push([
  'legacy-payment-method-id', 77, '2026-10-01', 'Legacy cash unknown', 450, 'Other', '',
  'ACTIVE', 'legacy@test.com', '2026-10-01T00:00:00Z', '', '', '', '',
  'legacy-payment-method-client', 'PAYMENT', 'CASH_OUT', '', '', '', '', '',
]);
assert.match(paymentMethodMock.migrateVoucherPaymentMethodField(), /Added PaymentMethod/);
assert.equal(vouchers.rows[0][22], 'PaymentMethod');
assert.equal(vouchers.rows[1][0], 'legacy-payment-method-id');
assert.equal(vouchers.rows[1][16], 'CASH_OUT');
assert.equal(vouchers.rows[1][22] || '', '');
assert.match(paymentMethodMock.migrateVoucherPaymentMethodField(), /already exists/);

const paymentConflictMock = setupMock();
paymentConflictMock.sheets.Vouchers.rows[0] =
  paymentConflictMock.sheets.Vouchers.rows[0].slice(0, 22);
paymentConflictMock.sheets.Vouchers.rows[1] ||= [];
paymentConflictMock.sheets.Vouchers.rows[1][22] = 'occupied';
assert.throws(
  () => paymentConflictMock.migrateVoucherPaymentMethodField(),
  /Vouchers column W already contains data/,
);

// Vendor defaults migration must preserve values and leave new defaults blank.
const vendorMock = setupMock();
const vendors = vendorMock.sheets.Vendors;
vendors.rows[0] = vendors.rows[0].slice(0, 7);
vendors.rows.push([
  'legacy-vendor-defaults-id', 'Legacy Supplier', 'Legacy Company', '1234567890',
  true, 'owner@test.com', '2026-10-01T00:00:00Z',
]);
assert.match(vendorMock.migrateVendorDefaultsSchema(), /Added vendor defaults/);
assert.deepEqual(vendors.rows[0].slice(7, 9), ['DefaultCategory', 'DefaultPaymentMethod']);
assert.deepEqual(vendors.rows[1].slice(0, 7), [
  'legacy-vendor-defaults-id', 'Legacy Supplier', 'Legacy Company', '1234567890',
  true, 'owner@test.com', '2026-10-01T00:00:00Z',
]);
assert.deepEqual(vendors.rows[1].slice(7, 9), ['', '']);
assert.match(vendorMock.migrateVendorDefaultsSchema(), /already exist/);

const vendorConflictMock = setupMock();
vendorConflictMock.sheets.Vendors.rows[0] =
  vendorConflictMock.sheets.Vendors.rows[0].slice(0, 7);
vendorConflictMock.sheets.Vendors.rows[1] ||= [];
vendorConflictMock.sheets.Vendors.rows[1][7] = 'unrelated-data';
assert.throws(
  () => vendorConflictMock.migrateVendorDefaultsSchema(),
  /Vendors columns H:I already contain data/,
);

console.log('schema migration regression tests: passed');
