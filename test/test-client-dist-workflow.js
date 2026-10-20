'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/client-dist.yml'),
  'utf8',
);

assert.ok(workflow.includes('name: Client staging dist zip'));
assert.ok(workflow.includes('CV_ENVIRONMENT: staging'));
assert.ok(!workflow.includes('options: [staging, production]'));
assert.ok(workflow.includes('RELEASE_COMMIT: ${{ github.sha }}'));
assert.ok(workflow.includes('release-manifest.json'));
assert.ok(workflow.includes('unzip -t'));
assert.ok(workflow.includes("grep -qx 'index.html' zip-contents.txt"));
assert.ok(workflow.includes('Content-Security-Policy'));
assert.ok(workflow.includes('RewriteCond %%{HTTPS} off'));
assert.ok(workflow.includes('retention-days: 3'));
assert.ok(!/ftp|scp|rsync|clasp push|deploy-webapp/i.test(workflow));

console.log(
  'Client ZIP workflow contract OK — staging-only, manifest, archive and security checks.',
);
