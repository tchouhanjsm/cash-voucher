'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/flight-test.yml'),
  'utf8',
);

assert.match(workflow, /const transientHttpStatuses = new Set\(\[500, 502, 503, 504\]\);/);
assert.match(workflow, /const maxTransientRetries = 2;/);
assert.match(workflow, /let transientRetriesUsed = 0;/);
assert.match(
  workflow,
  /!transientHttpStatuses\.has\(error\.status\)[\s\S]*transientRetriesUsed >= maxTransientRetries/,
);
assert.match(workflow, /transientRetriesUsed \+= 1;/);
assert.match(workflow, /await listWorkflowRunsWithRetry\(workflow\)/);
assert.match(workflow, /run\.head_sha === sha/);
assert.match(workflow, /run\.head_branch === branch/);
assert.match(workflow, /run\.event === event/);
assert.match(workflow, /core\.setFailed/);

console.log('Full Flight workflow guard OK — exact SHA and bounded transient 5xx retries.');
