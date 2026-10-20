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

assert.match(ci, /push:\n\s+branches:\s*\[client-main, 'client\/\*\*'\]/);
assert.match(ci, /pull_request:\n\s+branches:\s*\[client-main\]/);
assert.doesNotMatch(ci, /branches:\s*\[main, client-main/);
assert.match(browser, /push:\n\s+branches:\s*\[client-main, 'client\/\*\*'\]/);
assert.match(browser, /pull_request:\n\s+branches:\s*\[client-main\]/);
assert.match(flight, /push:\n\s+branches:\s*\[client-main, 'client\/\*\*'\]/);
assert.match(flight, /pull_request:\n\s+branches:\s*\[client-main\]/);
assert.match(staging, /ACTION_REF" != "refs\/heads\/client-main"/);
assert.match(hook, /refs\/heads\/main/);
assert.match(hook, /refs\/heads\/client-main/);
assert.match(handbook, /client-main.*only integration branch|only integration branch.*client-main/i);
assert.match(handbook, /main.*frozen\/read-only|frozen\/read-only.*main/i);

console.log('Client-main policy OK — CI, E2E, Flight Test, staging guard, local pre-push hook and documentation consistently use client-main.');
