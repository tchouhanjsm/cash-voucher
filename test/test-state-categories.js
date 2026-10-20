const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../frontend/core/state.js'), 'utf8');

async function run() {
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const {
    S,
    categories,
    rcats,
    CASH_IMPACT_CHOICES,
    normalizeCashImpact,
    normalizeVoucherCollection,
    suggestCashImpact,
  } = await import(moduleUrl);
  const hostile = { toString: null, valueOf: null };

  S.settings = {
    categories: [' Office ', hostile, null, 42, 'Other', 'Office', ''],
    receiptCategories: [' Cash received ', hostile, false, 'Cash received'],
  };
  assert.deepEqual(categories(), ['Office', 'Other', 'Staff Salary']);
  assert.deepEqual(rcats(), ['Cash received']);

  S.settings = {
    categories: hostile,
    receiptCategories: 'Cash received',
  };
  assert.deepEqual(categories(), ['Other', 'Staff Salary']);
  assert.deepEqual(rcats(), ['Other']);

  S.settings = {
    categories: [hostile, null, 42, false, ''],
    receiptCategories: [],
  };
  assert.deepEqual(categories(), ['Other', 'Staff Salary']);
  assert.deepEqual(rcats(), ['Other']);

  S.settings = {
    categories: ['Travel', 'Meals'],
    receiptCategories: ['Refunds', 'Other'],
  };
  assert.deepEqual(categories(), ['Travel', 'Meals', 'Staff Salary']);
  assert.deepEqual(rcats(), ['Refunds', 'Other']);

  assert.deepEqual(CASH_IMPACT_CHOICES, ['CASH_IN', 'CASH_OUT', 'NO_CASH']);
  assert.equal(suggestCashImpact('PAYMENT', 'Bank Charges'), 'NO_CASH');
  assert.equal(suggestCashImpact('PAYMENT', 'Vendor Payment'), 'CASH_OUT');
  assert.equal(suggestCashImpact('RECEIPT', 'Bank Withdrawal'), 'CASH_IN');
  assert.equal(normalizeCashImpact('TRANSFER'), 'UNCLASSIFIED');

  const baseVoucher = {
    id: 'legacy-1',
    no: 201,
    date: '2026-10-13',
    type: 'PAYMENT',
    status: 'ACTIVE',
    vendor: 'Legacy vendor',
    category: 'Other',
    notes: '',
    createdBy: 'staff@test.com',
    createdAt: '',
    updatedBy: '',
    updatedAt: '',
    cancelReason: '',
  };
  const legacy = normalizeVoucherCollection([
    baseVoucher,
    { ...baseVoucher, id: 'bad-impact', cashImpact: '<img>' },
  ]);
  assert.equal(legacy.rows[0].cashImpact, 'UNCLASSIFIED');
  assert.equal(legacy.rows[1].cashImpact, 'UNCLASSIFIED');
  assert.equal(legacy.malformedFieldCount, 1);

  console.log(
    'Cash impact OK — suggestions, controlled vocabulary, and legacy normalization covered.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
