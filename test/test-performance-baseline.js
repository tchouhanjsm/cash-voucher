'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { create } = require('./mock-gas');

const g = create();
g.props.OWNER_EMAIL = 'perf-owner@test.com';
g.props.OWNER_PIN = '483921';
g.setup();

const login = g.call('login', { email: 'perf-owner@test.com', pin: '483921' });
assert.ok(login.ok, 'performance fixture owner login succeeds');
const change = g.call('changePin', {
  token: login.data.token,
  oldPin: '483921',
  newPin: '579246',
});
assert.ok(change.ok, 'performance fixture completes required first PIN change');
const token = change.data.token;
const voucherSheet = g.sheets.Vouchers;
const headers = voucherSheet.rows[0];
let seeded = 0;
let expectedTotal = 0;
const measurements = [];

function seedVoucher(index) {
  const amount = (index % 97) + 1;
  const record = {
    VoucherID: 'performance-voucher-' + index,
    VoucherNo: 201 + index,
    Date: '2026-10-01',
    Vendor: 'Seed Vendor ' + (index % 31),
    VendorID: '',
    Amount: amount,
    Category: 'Other',
    Notes: '',
    Status: 'ACTIVE',
    CreatedBy: 'perf-owner@test.com',
    CreatedAt: '2026-10-01T12:00:00Z',
    UpdatedBy: '',
    UpdatedAt: '',
    Receipts: '',
    CancelReason: '',
    ClientID: 'performance-client-' + index,
    Type: 'PAYMENT',
    CashImpact: 'CASH_OUT',
    ApprovalStatus: 'NOT_REQUIRED',
    ApprovedBy: '',
    ApprovedAt: '',
    ApprovalReason: '',
  };

  voucherSheet.rows.push(headers.map((header) => record[header] ?? ''));
  expectedTotal += amount;
}

for (const target of [100, 500, 1000]) {
  while (seeded < target) {
    seedVoucher(seeded);
    seeded += 1;
  }

  const nextNumber = g.sheets.Settings.rows.find((row) => row[0] === 'nextVoucherNo');
  assert.ok(nextNumber, 'fixture setting for the next voucher number exists');
  nextNumber[1] = String(201 + seeded);

  const bootstrapStart = performance.now();
  const bootstrap = g.call('bootstrap', { token });
  const bootstrapMs = Number((performance.now() - bootstrapStart).toFixed(3));
  assert.ok(bootstrap.ok, 'bootstrap succeeds at seeded size ' + target);
  assert.equal(
    bootstrap.data.vouchers.length,
    target,
    'bootstrap returns all seeded records at size ' + target,
  );

  const reportStart = performance.now();
  const report = g.call('recordedMovementReport', {
    token,
    from: '2026-10-01',
    to: '2026-10-01',
    type: 'PAYMENT',
    status: 'ALL',
  });
  const reportMs = Number((performance.now() - reportStart).toFixed(3));
  assert.ok(report.ok, 'report succeeds at seeded size ' + target);
  assert.equal(report.data.count, target, 'report summary retains every seeded row');
  assert.equal(report.data.items.length, target, 'report payload retains every seeded row');
  assert.equal(
    report.data.activePaymentTotal,
    expectedTotal,
    'report total equals the deterministic seeded workload',
  );

  measurements.push({
    seededVoucherRows: target,
    bootstrapMs,
    reportMs,
    reportItems: report.data.items.length,
    activePaymentTotal: expectedTotal,
  });
}

console.log(
  'Seeded mock-only application workload baseline (diagnostic measurements, not production SLOs): ' +
    JSON.stringify(measurements),
);
