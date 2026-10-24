'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'frontend/features/payments.js'),
  'utf8',
);
const match = source.match(/function isRecordRejection\\(error\\) \\{([\\s\\S]*?)\\n  \\}/);
assert.ok(match, 'offline queue rejection classifier must be present');

const isRecordRejection = new Function('error', match[1]);
for (const code of ['VALIDATION', 'CONFLICT', 'CASH_PERIOD_CLOSED']) {
  assert.equal(isRecordRejection({ code }), true, code + ' is a terminal per-record rejection');
}
for (const code of ['NET', 'SESSION', 'BUSY', 'SERVER']) {
  assert.equal(isRecordRejection({ code }), false, code + ' must remain retryable or stop the batch');
}

console.log('Offline rejection policy OK — closed business dates are sent to review instead of retrying forever.');
