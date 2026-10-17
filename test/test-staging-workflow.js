'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/staging-uat.yml'), 'utf8');
const deploy = fs.readFileSync(path.join(root, 'scripts/deploy-staging.js'), 'utf8');
const preflight = fs.readFileSync(path.join(root, 'scripts/staging-preflight.js'), 'utf8');
const uat = fs.readFileSync(path.join(root, 'test/uat_staging.py'), 'utf8');
const localServer = fs.readFileSync(path.join(root, 'scripts/staging-web-server.js'), 'utf8');

assert.match(workflow, /^on:\n {2}workflow_dispatch:/m, 'staging workflow must be manual-only');
assert.doesNotMatch(
  workflow,
  /^\s+(push|pull_request):/m,
  'staging workflow must not deploy on push or PR',
);
assert.match(workflow, /ACTION_REF: \$\{\{ github\.ref \}\}/);
assert.match(workflow, /ACTION_REF" != "refs\/heads\/main"/);
assert.match(workflow, /CONFIRMATION" != "STAGING-ONLY"/);
assert.match(workflow, /CONFIRM_WRITES" != "true"/);
assert.match(workflow, /environment:\n {6}name: staging/m);
assert.match(workflow, /needs: \[validate, guard\]/);
assert.match(workflow, /confirm_staging_writes/);
assert.match(workflow, /CV_STAGING_DEPLOY_CONFIRMATION/);
assert.match(workflow, /CLASPRC_JSON: \$\{\{ secrets\.CLASPRC_JSON \}\}/);
assert.match(
  workflow,
  /CV_STAGING_UAT_OWNER_PASSWORD: \$\{\{ secrets\.CV_STAGING_UAT_OWNER_PASSWORD \}\}/,
);
assert.match(
  workflow,
  /CV_STAGING_UAT_MANAGER_PASSWORD: \$\{\{ secrets\.CV_STAGING_UAT_MANAGER_PASSWORD \}\}/,
);
assert.doesNotMatch(workflow, /CV_STAGING_UAT_(OWNER|MANAGER)_PIN/);

const validationJob = workflow.split('  guard:\n')[0];
assert.doesNotMatch(
  validationJob,
  /secrets\./,
  'untrusted-source validation job must not receive staging secrets',
);
assert.doesNotMatch(
  validationJob,
  /CV_STAGING_API_URL:/,
  'validation job must not receive staging endpoint configuration',
);

assert.match(preflight, /The staging API URL resolves to the production endpoint/);
assert.match(
  preflight,
  /At least one staging resource identifier is also configured as a production resource/,
);
assert.match(preflight, /STAGING-ONLY/);
assert.match(deploy, /path\.join\(tempHome, '\.clasprc\.json'\)/);
assert.match(deploy, /path\.join\(projectRoot, '\.clasp\.json'\)/);
assert.match(deploy, /list-deployments/);
assert.match(deploy, /create-deployment/);
assert.match(deploy, /fs\.rmSync\(workspace, \{ recursive: true, force: true \}\)/);
assert.match(deploy, /fs\.rmSync\(tempHome, \{ recursive: true, force: true \}\)/);
assert.match(uat, /deploymentReadiness/);
assert.match(uat, /CV_STAGING_UAT_CONFIRM_WRITES/);
assert.match(uat, /cancelVoucher/);
assert.match(localServer, /Cache-Control': 'no-store'/);
assert.match(localServer, /function stagingServiceWorker/);
assert.doesNotMatch(localServer, /caches\.open/);

console.log(
  'Staging workflow guard OK — manual trigger, main-only gate, explicit write consent, isolated deployment config, no-cache test shell and protected resource checks.',
);
