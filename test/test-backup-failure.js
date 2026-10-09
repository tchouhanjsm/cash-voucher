'use strict';

const assert = require('assert');
const { create } = require('./mock-gas');

const g = create();
const properties = {
  setProperty(key, value) {
    this[key] = String(value);
  },
};

let partialTrashed = false;
g.recordBackupFailure(
  properties,
  {
    setTrashed(value) {
      partialTrashed = value;
    },
  },
  false,
  new Error('receipt copy failed'),
);
assert.strictEqual(partialTrashed, true);
assert.strictEqual(properties.BACKUP_LAST_ERROR, 'receipt copy failed');

let completeTrashed = false;
g.recordBackupFailure(
  properties,
  {
    setTrashed(value) {
      completeTrashed = value;
    },
  },
  true,
  new Error('retention pruning failed'),
);
assert.strictEqual(completeTrashed, false);
assert.strictEqual(properties.BACKUP_LAST_ERROR, 'retention pruning failed');

g.recordBackupFailure(
  properties,
  {
    setTrashed() {
      throw new Error('Drive permission denied');
    },
  },
  false,
  new Error('receipt copy failed'),
);
assert.match(properties.BACKUP_LAST_ERROR, /receipt copy failed/);
assert.match(properties.BACKUP_LAST_ERROR, /Drive permission denied/);

g.recordBackupFailure(properties, null, false, new Error('x'.repeat(500)));
assert.strictEqual(properties.BACKUP_LAST_ERROR.length, 300);

console.log('Backup failure handling OK — partial cleanup, complete snapshot preservation, error reporting and bounds.');
