'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const ci = read('.github/workflows/ci.yml');
const browser = read('.github/workflows/e2e.yml');
const flight = read('.github/workflows/flight-test.yml');
const staging = read('.github/workflows/staging-uat.yml');
const hook = read('.githooks/pre-push');
const handbook = read('docs/DEVELOPMENT-WORKFLOW.md');

assert.match(ci, /target-branch-policy:/, 'CI must include the PR target policy job');
assert.match(ci, /BASE_REF: \$\{\{ github\.event\.pull_request\.base\.ref \}\}/);
assert.match(ci, /\$BASE_REF.*client-main/s, 'policy must compare the PR base to client-main');
assert.doesNotMatch(ci, /pull_request:\n\s+branches:\s*\[main\]/);
assert.match(browser, /pull_request:\n\s+workflow_dispatch:/, 'Browser E2E must run for PRs');
assert.match(flight, /push:\n\s+branches:\s+\['client\/\*\*'\]/, 'Flight Test must run on client branches');
assert.match(flight, /pull_request:\n\s+workflow_dispatch:/, 'Flight Test must run for PRs');
assert.match(staging, /ACTION_REF" != "refs\/heads\/client-main"/);
assert.match(hook, /refs\/heads\/main/);
assert.match(hook, /refs\/heads\/client-main/);
assert.match(handbook, /client-main.*only integration branch|only integration branch.*client-main/i);
assert.match(handbook, /main.*frozen\/read-only|frozen\/read-only.*main/i);

console.log('Client-main branch policy OK — PR target gate, CI triggers, staging guard, local push guard and engineering guidance are aligned.');
