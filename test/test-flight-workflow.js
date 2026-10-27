'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/flight-test.yml'), 'utf8');

const browserWorkflow = fs.readFileSync(path.join(root, '.github/workflows/e2e.yml'), 'utf8');
const browserTimeout = Number(
  browserWorkflow.match(/jobs:\\s*browser:[\\s\\S]*?timeout-minutes:\\s*(\\d+)/)?.[1],
);
const flightTimeout = Number(
  workflow.match(/jobs:\\s*flight:[\\s\\S]*?timeout-minutes:\\s*(\\d+)/)?.[1],
);
const gateWaitMinutes = Number(
  workflow.match(/const deadline = Date\\.now\\(\\) \\+ (\\d+) \\* 60 \\* 1000;/)?.[1],
);

assert.ok(Number.isInteger(browserTimeout) && browserTimeout > 0, 'Browser E2E declares a job timeout.');
assert.ok(Number.isInteger(flightTimeout) && flightTimeout > 0, 'Full Flight declares a job timeout.');
assert.ok(Number.isInteger(gateWaitMinutes) && gateWaitMinutes > 0, 'Full Flight declares an exact-SHA gate deadline.');
assert.ok(
  gateWaitMinutes >= browserTimeout + 5,
  'Full Flight gate deadline must exceed the Browser E2E job timeout by at least five minutes.',
);
assert.ok(
  flightTimeout >= gateWaitMinutes + 5,
  'Full Flight job timeout must exceed its gate deadline by at least five minutes.',
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
