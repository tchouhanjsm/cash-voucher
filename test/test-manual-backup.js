'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Apps Script hides functions ending in "_" from the editor's Run menu, so the operator
// needs a public entry point for a manual backup.
const source = fs.readFileSync(path.join(__dirname, '../backend/20-backup.gs'), 'utf8');
const match = source.match(/function (runBackupNow)\(\) \{\s*return backupData_\(\);\s*\}/);
assert.ok(
  match,
  'backend/20-backup.gs must expose a public runBackupNow() that calls backupData_()',
);
assert.ok(!match[1].endsWith('_'), 'the manual backup entry point must be public');
assert.ok(/function backupData_\(\)/.test(source), 'the scheduled backup handler is unchanged');
console.log('Manual backup entry point OK — runBackupNow() is public.');
