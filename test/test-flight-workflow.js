'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/flight-test.yml'), 'utf8');
const browserWorkflow = fs.readFileSync(path.join(root, '.github/workflows/e2e.yml'), 'utf8');
const ciWorkflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.match(
  workflow,
  /^on:[ \t]*\n[ \t]+workflow_dispatch:[ \t]*$/m,
  'Full Flight is started only by an explicit manual dispatch.',
);
assert.doesNotMatch(
  workflow,
  /^\s{2}(?:push|pull_request):/m,
  'Full Flight does not add duplicate PR or push status checks.',
);
assert.match(workflow, /full-flight:/, 'manual Full Flight has one explicit job.');
assert.match(workflow, /timeout-minutes:\s*45/, 'manual Full Flight has a bounded timeout.');
assert.match(
  workflow,
  /Run complete chained test suite\s*\n\s+run: npm run test:flight/,
  'manual Full Flight runs the complete validation and dependency-audit chain.',
);
assert.match(
  workflow,
  /python -m playwright install --with-deps chromium/,
  'manual Full Flight installs the browser required by the E2E suite.',
);
assert.match(
  workflow,
  /cancel-in-progress: false/,
  'a manually requested release suite is not cancelled by another run.',
);
assert.ok(
  packageJson.scripts?.['test:flight'] ===
    'npm run check && npm run test:e2e && npm run audit:deps',
  'the full-suite command retains quality checks, browser journeys and dependency audit.',
);

assert.ok(
  ciWorkflow.includes(
    'group: ci-${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.head.repo.full_name || github.repository }}-${{ github.event.pull_request.head.ref || github.ref_name }}',
  ),
  'CI push and pull_request runs have separate concurrency groups.',
);
assert.ok(
  browserWorkflow.includes(
    'group: e2e-${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.head.repo.full_name || github.repository }}-${{ github.event.pull_request.head.ref || github.ref_name }}',
  ),
  'Browser E2E push and pull_request runs have separate concurrency groups.',
);
assert.match(
  ciWorkflow,
  /types: \[opened, synchronize, reopened, edited\]/,
  'CI reruns the PR handoff contract when the description is edited.',
);
assert.match(
  browserWorkflow,
  /pull_request:/,
  'focused browser regressions still run on pull requests.',
);
assert.doesNotMatch(
  ciWorkflow,
  /Temporary formatting diagnostic for PR 242|npx prettier --write/,
  'CI must not mutate source files with a PR-specific formatting workaround.',
);

console.log('Workflow policy OK — CI and Browser E2E gate PRs; Full Flight is manual on demand.');
