const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../frontend/core/state.js'), 'utf8');

async function run() {
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const { S, categories, rcats } = await import(moduleUrl);
  const hostile = { toString: null, valueOf: null };

  S.settings = {
    categories: [' Office ', hostile, null, 42, 'Other', 'Office', ''],
    receiptCategories: [' Cash received ', hostile, false, 'Cash received'],
  };
  assert.deepEqual(categories(), ['Office', 'Other']);
  assert.deepEqual(rcats(), ['Cash received']);

  S.settings = {
    categories: hostile,
    receiptCategories: 'Cash received',
  };
  assert.deepEqual(categories(), ['Other']);
  assert.deepEqual(rcats(), ['Other']);

  S.settings = {
    categories: [hostile, null, 42, false, ''],
    receiptCategories: [],
  };
  assert.deepEqual(categories(), ['Other']);
  assert.deepEqual(rcats(), ['Other']);

  S.settings = {
    categories: ['Travel', 'Meals'],
    receiptCategories: ['Refunds', 'Other'],
  };
  assert.deepEqual(categories(), ['Travel', 'Meals']);
  assert.deepEqual(rcats(), ['Refunds', 'Other']);

  console.log('Category settings OK — scalar-only lists, stable order, deduplication and fallback covered.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
