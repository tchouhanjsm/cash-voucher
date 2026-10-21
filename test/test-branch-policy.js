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
const currentStrategy = read('docs/CLIENT-MAIN-ENGINEERING-STRATEGY-2026-10-21.md');
const boardStrategy = read('docs/CEO-BOARD-STRATEGY.md');
const executionPlan = read('docs/EXECUTION-PLAN-2026-10-21.md');
const branchPolicy = read('docs/CLIENT-MAIN-BRANCH-POLICY.md');
const stagingAudit = read('docs/STAGING-RELEASE-AUDIT.md');

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
assert.match(
  handbook,
  /client-main.*only integration branch|only integration branch.*client-main/i,
);
assert.match(handbook, /main.*frozen\/read-only|frozen\/read-only.*main/i);

assert.match(currentStrategy, /client-main is the only active integration branch/);
assert.match(currentStrategy, /main is legacy\/read-only/);
assert.match(boardStrategy, /release readiness before feature expansion/i);
assert.match(executionPlan, /No production migration\/deployment/i);
assert.match(executionPlan, /## Immediate pipeline — preserve this order/);
assert.match(executionPlan, /migrateVoucherPaymentMethodField\(\)/);
assert.match(executionPlan, /migrateVendorDefaultsSchema\(\)/);
assert.match(executionPlan, /Restore that backup into a \*\*separate recovery Sheet\/folder\*\*/);
assert.match(executionPlan, /Only after stages 2–5 pass/);
assert.match(stagingAudit, /migrateVoucherPaymentMethodField\(\)/);
assert.match(stagingAudit, /migrateVendorDefaultsSchema\(\)/);
assert.match(stagingAudit, /Deploy backend first/);
assert.match(stagingAudit, /manual guarded UAT from client-main/);
assert.match(stagingAudit, /main remains untouched/);
assert.match(branchPolicy, /\[CEO and board product strategy\]\(CEO-BOARD-STRATEGY\.md\)/);
assert.match(
  branchPolicy,
  /\[Client-main engineering and release strategy\]\(CLIENT-MAIN-ENGINEERING-STRATEGY-2026-10-21\.md\)/,
);

console.log(
  'Client-main policy OK — CI, E2E, Flight Test, strategy documents and staging guard align.',
);
