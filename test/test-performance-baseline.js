'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { create } = require('./mock-gas');

const WARMUP_RUNS = 1;
const SAMPLE_COUNT = 5;
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

function summarizeSamples(samples) {
  const rounded = samples.map((sample) => Number(sample.toFixed(3)));
  const sorted = [...rounded].sort((left, right) => left - right);
  return {
    sampleCount: rounded.length,
    samplesMs: rounded,
    minMs: sorted[0],
    medianMs: sorted[Math.floor(sorted.length / 2)],
    maxMs: sorted[sorted.length - 1],
  };
}

function measure(operation, validate) {
  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    validate(operation());
  }

  const samples = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const startedAt = performance.now();
    const result = operation();
    const elapsedMs = performance.now() - startedAt;
    validate(result);
    samples.push(elapsedMs);
  }

  return summarizeSamples(samples);
}

for (const target of [100, 500, 1000]) {
  while (seeded < target) {
    seedVoucher(seeded);
    seeded += 1;
  }

  const nextNumber = g.sheets.Settings.rows.find((row) => row[0] === 'nextVoucherNo');
  assert.ok(nextNumber, 'fixture setting for the next voucher number exists');
  nextNumber[1] = String(201 + seeded);

  const bootstrap = measure(
    () => g.call('bootstrap', { token }),
    (result) => {
      assert.ok(result.ok, 'bootstrap succeeds at seeded size ' + target);
      assert.equal(
        result.data.vouchers.length,
        target,
        'bootstrap returns all seeded records at size ' + target,
      );
    },
  );

  const recordedMovementReport = measure(
    () =>
      g.call('recordedMovementReport', {
        token,
        from: '2026-10-01',
        to: '2026-10-01',
        type: 'PAYMENT',
        status: 'ALL',
      }),
    (result) => {
      assert.ok(result.ok, 'report succeeds at seeded size ' + target);
      assert.equal(result.data.count, target, 'report summary retains every seeded row');
      assert.equal(result.data.items.length, target, 'report payload retains every seeded row');
      assert.equal(
        result.data.activePaymentTotal,
        expectedTotal,
        'report total equals the deterministic seeded workload',
      );
    },
  );

  measurements.push({
    seededVoucherRows: target,
    bootstrap,
    recordedMovementReport,
    reportItems: target,
    activePaymentTotal: expectedTotal,
  });
}

const baseline = {
  schemaVersion: 1,
  benchmark: 'cash-voucher-seeded-mock-workload',
  capturedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  workload: {
    source: 'test/mock-gas.js in-memory Google services mock',
    seededRowCounts: [100, 500, 1000],
    warmupRunsPerOperation: WARMUP_RUNS,
    measuredSamplesPerOperation: SAMPLE_COUNT,
    operations: ['bootstrap', 'recordedMovementReport'],
  },
  interpretation:
    'Diagnostic mock-only timings; not a production SLO, live Apps Script/Sheets latency, concurrency result, or optimization threshold.',
  measurements,
};

const serialized = JSON.stringify(baseline, null, 2) + '\n';
const outputPath = process.env.CV_PERFORMANCE_BASELINE_OUT;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized, 'utf8');
}

console.log('Cash Voucher seeded mock performance baseline: ' + JSON.stringify(baseline));
