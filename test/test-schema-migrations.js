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

// PaymentMethod is additive and must never infer historical payment rails.
const paymentMethodMock = setupMock();
const vouchers = paymentMethodMock.sheets.Vouchers;
vouchers.rows[0] = vouchers.rows[0].slice(0, 22);
const legacyVoucher = new Array(22).fill('');
legacyVoucher[0] = 'legacy-payment-method-id';
legacyVoucher[1] = 77;
legacyVoucher[2] = '2026-10-01';
legacyVoucher[3] = 'Legacy unknown payment';
legacyVoucher[4] = 450;
legacyVoucher[5] = 'Other';
legacyVoucher[7] = 'ACTIVE';
legacyVoucher[15] = 'PAYMENT';
legacyVoucher[16] = 'CASH_OUT';
vouchers.rows.push(legacyVoucher);
assert.match(paymentMethodMock.migrateVoucherPaymentMethodField(), /Added PaymentMethod/);
assert.equal(vouchers.rows[0][22], 'PaymentMethod');
assert.equal(vouchers.rows[1][0], 'legacy-payment-method-id');
assert.equal(vouchers.rows[1][16], 'CASH_OUT');
assert.equal(vouchers.rows[1][22] || '', '');
assert.match(paymentMethodMock.migrateVoucherPaymentMethodField(), /already exists/);

const paymentConflictMock = setupMock();
paymentConflictMock.sheets.Vouchers.rows[0] = paymentConflictMock.sheets.Vouchers.rows[0].slice(
  0,
  22,
);
paymentConflictMock.sheets.Vouchers.rows[1] ||= [];
paymentConflictMock.sheets.Vouchers.rows[1][22] = 'occupied';
assert.throws(
  () => paymentConflictMock.migrateVoucherPaymentMethodField(),
  /Vouchers column W already contains data/,
);

// VendorType must be additive, idempotent and must never infer historical classifications.
const vendorTypeMock = setupMock();
const vendorTypeVouchers = vendorTypeMock.sheets.Vouchers;
vendorTypeVouchers.rows[0] = vendorTypeVouchers.rows[0].slice(0, 23);
const historicalVoucher = new Array(23).fill('');
historicalVoucher[0] = 'historical-unverified-voucher';
historicalVoucher[3] = 'Historical Payee';
historicalVoucher[4] = 250;
historicalVoucher[15] = 'PAYMENT';
historicalVoucher[16] = 'CASH_OUT';
vendorTypeVouchers.rows.push(historicalVoucher.slice());
assert.match(vendorTypeMock.migrateVoucherVendorTypeField(), /Added VendorType in X/);
assert.equal(vendorTypeVouchers.rows[0][23], 'VendorType');
assert.deepEqual(vendorTypeVouchers.rows[1].slice(0, 23), historicalVoucher);
assert.equal(vendorTypeVouchers.rows[1][23] || '', '');
assert.match(vendorTypeMock.migrateVoucherVendorTypeField(), /already exists/);

const vendorTypeConflictMock = setupMock();
vendorTypeConflictMock.sheets.Vouchers.rows[0] = vendorTypeConflictMock.sheets.Vouchers.rows[0].slice(0, 23);
vendorTypeConflictMock.sheets.Vouchers.rows[1] ||= [];
vendorTypeConflictMock.sheets.Vouchers.rows[1][23] = 'occupied';
assert.throws(
  () => vendorTypeConflictMock.migrateVoucherVendorTypeField(),
  /Vouchers column X already contains data/,
);

// Vendor defaults must be additive, idempotent and fail closed on occupied H:I.
const vendorMock = setupMock();
const vendors = vendorMock.sheets.Vendors;
vendors.rows[0] = vendors.rows[0].slice(0, 7);
const legacyVendor = [
  'legacy-vendor-defaults-id',
  'Legacy Supplier',
  'Legacy Company',
  '1234567890',
  true,
  'owner@test.com',
  '2026-10-01T00:00:00Z',
];
vendors.rows.push(legacyVendor.slice());
assert.match(vendorMock.migrateVendorDefaultsSchema(), /Added vendor defaults/);
assert.deepEqual(vendors.rows[0].slice(7, 9), ['DefaultCategory', 'DefaultPaymentMethod']);
assert.deepEqual(vendors.rows[1].slice(0, 7), legacyVendor);
assert.equal(vendors.rows[1][7] || '', '');
assert.equal(vendors.rows[1][8] || '', '');
assert.match(vendorMock.migrateVendorDefaultsSchema(), /already exist/);

const vendorConflictMock = setupMock();
vendorConflictMock.sheets.Vendors.rows[0] = vendorConflictMock.sheets.Vendors.rows[0].slice(0, 7);
vendorConflictMock.sheets.Vendors.rows[1] ||= [];
vendorConflictMock.sheets.Vendors.rows[1][7] = 'occupied';
assert.throws(
  () => vendorConflictMock.migrateVendorDefaultsSchema(),
  /Vendors columns H:I already contain data/,
);

console.log('schema migration regression tests: passed');
