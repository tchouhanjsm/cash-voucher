const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../frontend/core/recovery-validation.js'), 'utf8');

async function run() {
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const { validateClientId, validateOptionalClientId, validateRecoveryRecords } =
    await import(moduleUrl);
  const ownerKey = 'https://example.test/app|staff@test.com';
  const maxDate = '2026-10-13';
  const validRecord = {
    clientId: 'client-001',
    ownerKey,
    status: 'failed',
    failure: 'Rejected',
    entry: {
      clientId: 'client-001',
      date: '2026-10-12',
      type: 'PAYMENT',
      vendor: 'Offline Vendor',
      amount: 75,
      category: 'Other',
      notes: '',
      receipts: [{ mime: 'image/png', data: 'AQID', ignored: 'not forwarded' }],
      ignored: 'not forwarded',
    },
  };

  const valid = validateRecoveryRecords([validRecord], ownerKey, maxDate);
  assert.equal(valid.unboundCount, 0);
  assert.deepEqual(valid.records[0], {
    clientId: 'client-001',
    ownerKey,
    entry: {
      clientId: 'client-001',
      date: '2026-10-12',
      type: 'PAYMENT',
      vendor: 'Offline Vendor',
      amount: 75,
      category: 'Other',
      notes: '',
      receipts: [{ mime: 'image/png', data: 'AQID' }],
    },
  });

  const unbound = structuredClone(validRecord);
  delete unbound.ownerKey;
  delete unbound.entry.category;
  delete unbound.entry.notes;
  const legacy = validateRecoveryRecords([unbound], ownerKey, maxDate);
  assert.equal(legacy.unboundCount, 1);
  assert.equal(legacy.records[0].ownerKey, '');
  assert.equal(legacy.records[0].entry.category, 'Other');
  assert.equal(legacy.records[0].entry.notes, '');

  const hostile = { toString: null, valueOf: null };
  assert.throws(() => validateClientId(hostile), /invalid payment ID/i);
  assert.throws(() => validateOptionalClientId(hostile), /invalid payment ID/i);
  assert.equal(validateOptionalClientId(undefined), '');
  assert.equal(validateOptionalClientId('  '), '');
  assert.equal(validateClientId(' client-002 '), 'client-002');

  const expectInvalid = (mutate, pattern) => {
    const candidate = structuredClone(validRecord);
    mutate(candidate);
    assert.throws(() => validateRecoveryRecords([candidate], ownerKey, maxDate), pattern);
  };

  expectInvalid((item) => (item.clientId = hostile), /invalid payment ID/i);
  expectInvalid((item) => (item.ownerKey = hostile), /invalid account binding/i);
  expectInvalid((item) => (item.entry.clientId = hostile), /invalid payment ID/i);
  expectInvalid((item) => (item.entry.amount = true), /invalid payment amount/i);
  expectInvalid((item) => (item.entry.date = '2026-02-30'), /invalid payment date/i);
  expectInvalid(
    (item) => (item.entry.receipts = [{ mime: hostile, data: 'AQID' }]),
    /invalid or oversized receipt/i,
  );
  expectInvalid(
    (item) => (item.entry.receipts = [{ mime: 'image/png', data: 'A'.repeat(2_200_001) }]),
    /invalid or oversized receipt/i,
  );
  expectInvalid((item) => (item.entry.category = hostile), /invalid category or note/i);
  expectInvalid(
    (item) => (item.ownerKey = 'https://other.test/app|other@test.com'),
    /another endpoint or user/i,
  );
  assert.throws(
    () => validateRecoveryRecords([validRecord, validRecord], ownerKey, maxDate),
    /duplicate payment IDs/i,
  );
  assert.throws(() => validateRecoveryRecords([], ownerKey, maxDate), /no pending payments/i);
  assert.throws(
    () => validateRecoveryRecords([validRecord], ownerKey, 'not-a-date'),
    /date range could not be validated/i,
  );
  assert.throws(
    () => validateRecoveryRecords(Array(501).fill(validRecord), ownerKey, maxDate),
    /500-payment limit/i,
  );

  console.log(
    'Recovery validation OK — scalar-only IDs/bindings, strict payment schema, receipt bounds, and safe legacy defaults covered.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
