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
  /python -m pip install -r requirements-e2e\.txt/,
  'manual Full Flight installs the pinned Python browser test dependencies.',
);
assert.match(
  workflow,
  /cache-dependency-path: requirements-e2e\.txt/,
  'manual Full Flight caches only against the pinned E2E requirements.',
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
  ciWorkflow.includes('workflow_call:') && browserWorkflow.includes('workflow_call:'),
  'CI / Quality and Browser E2E are reusable by the release workflow.',
);
assert.match(ciWorkflow, /branches: \[client-main\]/);
assert.match(browserWorkflow, /branches: \[client-main\]/);
assert.doesNotMatch(ciWorkflow, /client\/\*\*/);
assert.doesNotMatch(browserWorkflow, /client\/\*\*/);
assert.ok(
  ciWorkflow.includes('github.event.pull_request.head.repo.full_name || github.repository') &&
    ciWorkflow.includes('github.event.pull_request.head.ref || github.ref_name') &&
    ciWorkflow.includes('cancel-in-progress: true'),
  'CI concurrency is bounded to the active source head.',
);
assert.ok(
  browserWorkflow.includes('github.event.pull_request.head.repo.full_name || github.repository') &&
    browserWorkflow.includes('github.event.pull_request.head.ref || github.ref_name') &&
    browserWorkflow.includes('cancel-in-progress: true'),
  'Browser E2E concurrency is bounded to the active source head.',
);
assert.match(
  ciWorkflow,
  /types: \[opened, synchronize, reopened, edited\]/,
  'CI reruns the PR handoff contract when the description is edited.',
);
assert.match(ciWorkflow, /github.event.action != 'edited'/);
assert.match(ciWorkflow, /node scripts\/check-pr-quality\.js/);
assert.ok(
  ciWorkflow.includes("github.event.action == 'edited' || steps.dependencies.outcome == 'success'"),
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

const releaseWorkflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
const e2eRequirements = fs.readFileSync(path.join(root, 'requirements-e2e.txt'), 'utf8');
assert.match(releaseWorkflow, /uses: \.\/\.github\/workflows\/ci\.yml/);
assert.match(releaseWorkflow, /uses: \.\/\.github\/workflows\/e2e\.yml/);
assert.match(releaseWorkflow, /git merge-base --is-ancestor/);
assert.match(releaseWorkflow, /^permissions:\n {2}contents: read$/m);
assert.match(releaseWorkflow, /publish:[\s\S]*?permissions:\n {6}contents: write/);
assert.match(releaseWorkflow, /needs: \[release-guard, quality, browser\]/);
assert.ok(
  !/playwright/.test(releaseWorkflow),
  'release does not maintain a second E2E dependency/test implementation.',
);
assert.match(e2eRequirements, /^playwright==1\.64\.1$/m);
assert.match(e2eRequirements, /^pyee==13\.0\.1$/m);
assert.match(e2eRequirements, /^greenlet==3\.5\.6$/m);
assert.match(e2eRequirements, /^typing-extensions==4\.16\.0$/m);

console.log('Workflow policy OK — CI and Browser E2E gate PRs; Full Flight is manual on demand.');
