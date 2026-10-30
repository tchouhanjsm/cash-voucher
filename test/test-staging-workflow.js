'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/staging-uat.yml'), 'utf8');
const clientDistWorkflow = fs.readFileSync(
  path.join(root, '.github/workflows/client-dist.yml'),
  'utf8',
);
const deploy = fs.readFileSync(path.join(root, 'scripts/deploy-staging.js'), 'utf8');
const preflight = fs.readFileSync(path.join(root, 'scripts/staging-preflight.js'), 'utf8');
const runbook = fs.readFileSync(path.join(root, 'docs/APPS-SCRIPT-RELEASE-RUNBOOK.md'), 'utf8');
const audit = fs.readFileSync(path.join(root, 'docs/STAGING-RELEASE-AUDIT.md'), 'utf8');

const vars = [
  'CV_STAGING_API_URL',
  'CV_STAGING_BACKUP_FOLDER_ID',
  'CV_STAGING_DEPLOYMENT_ID',
  'CV_STAGING_RECEIPT_FOLDER_ID',
  'CV_STAGING_SCRIPT_ID',
  'CV_STAGING_SPREADSHEET_ID',
];
const secrets = [
  'CLASPRC_JSON',
  'CV_STAGING_UAT_MANAGER_EMAIL',
  'CV_STAGING_UAT_MANAGER_PASSWORD',
  'CV_STAGING_UAT_OWNER_EMAIL',
  'CV_STAGING_UAT_OWNER_PASSWORD',
];

assert.match(workflow, /^on:\n {2}workflow_dispatch:/m);
assert.doesNotMatch(workflow, /^\s+(push|pull_request):/m);
assert.match(workflow, /ACTION_REF" != "refs\/heads\/client-main"/);
assert.match(workflow, /CONFIRMATION" != "STAGING-ONLY"/);
assert.match(workflow, /CONFIRM_WRITES" != "true"/);
assert.equal((workflow.match(/CV_STAGING_RESOURCE_ISOLATION_ATTESTATION:/g) || []).length, 0);
assert.doesNotMatch(workflow, /CV_PRODUCTION_/);
assert.doesNotMatch(clientDistWorkflow, /CV_PRODUCTION_/);

for (const key of vars) {
  assert.ok(
    workflow.includes(key + ': ${{ vars.' + key + ' }}'),
    'UAT reads Environment variable: ' + key,
  );
  assert.ok(
    clientDistWorkflow.includes(key + ': ${{ vars.' + key + ' }}'),
    'ZIP reads Environment variable: ' + key,
  );
  assert.ok(!workflow.includes(key + ': ${{ secrets.' + key + ' }}'));
  assert.ok(!clientDistWorkflow.includes(key + ': ${{ secrets.' + key + ' }}'));
}
for (const key of secrets) {
  assert.ok(
    workflow.includes(key + ': ${{ secrets.' + key + ' }}'),
    'authentication remains a secret: ' + key,
  );
}

assert.match(preflight, /staging-only/);
assert.doesNotMatch(preflight, /readProductionApiUrl|OWNER-VERIFIED-STAGING-ONLY/);
assert.match(preflight, /must not receive production resource IDs/);
assert.match(preflight, /five configured staging resources/);
assert.match(preflight, /tokens\.default/);
assert.match(deploy, /list-deployments/);
assert.match(deploy, /create-deployment/);
assert.ok(deploy.includes('cleanupTemporaryDirectories([workspace, tempHome])'));

assert.match(clientDistWorkflow, /^on:\n {2}workflow_dispatch:/m);
assert.doesNotMatch(clientDistWorkflow, /^\s+(push|pull_request):/m);
assert.match(clientDistWorkflow, /CV_ENVIRONMENT: staging/);
assert.match(clientDistWorkflow, /npm run staging:preflight -- --mode=artifact/);
assert.ok(
  clientDistWorkflow.indexOf('npm run staging:preflight -- --mode=artifact') <
    clientDistWorkflow.indexOf('npm run build:web'),
);
assert.match(clientDistWorkflow, /fileCount: files\.length \+ 2/);
assert.match(clientDistWorkflow, /sha256sum "\$ZIP_NAME" > "\$ZIP_NAME\.sha256"/);
assert.doesNotMatch(clientDistWorkflow, /clasp push|staging:deploy|CV_ENVIRONMENT:\s*production/);

const validateJob = workflow.split('  validate:\n')[1].split('  preflight-readiness:\n')[0];
assert.doesNotMatch(validateJob, /secrets\./);
const readinessJob = workflow.split('  preflight-readiness:\n')[1].split('  guard:\n')[0];
assert.match(readinessJob, /github\.ref == 'refs\/heads\/client-main'/);
assert.match(readinessJob, /inputs\.operation == 'validate-only'/);
assert.match(readinessJob, /environment:\n {6}name: staging/);
assert.match(readinessJob, /node scripts\/staging-preflight\.js --mode=readiness/);
const readinessStep = readinessJob
  .split('      - name: Validate configuration only (no remote access or writes)\n')[1]
  .split('      - name: Upload sanitized preflight evidence\n')[0];
for (const key of vars) {
  assert.ok(readinessStep.includes(key + ': ${{ vars.' + key + ' }}'));
}
for (const key of secrets) {
  assert.ok(readinessStep.includes(key + ': ${{ secrets.' + key + ' }}'));
}
assert.doesNotMatch(readinessJob, /staging:deploy|uat:staging|clasp push|curl/);
assert.doesNotMatch(
  readinessJob.split('      - name: Upload sanitized preflight evidence\n')[1],
  /secrets\./,
);

const deployJob = workflow.split('  deploy:\n')[1].split('  uat:\n')[0];
const uatJob = workflow.split('  uat:\n')[1];
assert.doesNotMatch(deployJob.split('    steps:\n')[0], /secrets\./);
assert.doesNotMatch(uatJob.split('    steps:\n')[0], /secrets\./);
assert.doesNotMatch(uatJob, /CLASPRC_JSON/);

function step(job, name) {
  const marker = '      - name: ' + name + '\n';
  const start = job.indexOf(marker);
  assert.ok(start >= 0, 'missing step: ' + name);
  const end = job.indexOf('\n      - name: ', start + marker.length);
  return job.slice(start, end < 0 ? job.length : end);
}

const selectedSteps = [
  step(deployJob, 'Validate isolated deployment configuration'),
  step(deployJob, 'Update the existing staging deployment only'),
  step(deployJob, 'Verify target before testing'),
  step(deployJob, 'Run staging UAT'),
  step(uatJob, 'Validate isolated staging target'),
  step(uatJob, 'Run staging UAT without deploying'),
];

for (const block of selectedSteps) {
  for (const key of vars) {
    assert.ok(block.includes(key + ': ${{ vars.' + key + ' }}'));
  }
  for (const key of secrets.filter((item) => item !== 'CLASPRC_JSON')) {
    assert.ok(block.includes(key + ': ${{ secrets.' + key + ' }}'));
  }
}
assert.match(selectedSteps[0], /CLASPRC_JSON: \$\{\{ secrets\.CLASPRC_JSON \}\}/);
assert.match(selectedSteps[1], /CLASPRC_JSON: \$\{\{ secrets\.CLASPRC_JSON \}\}/);
assert.doesNotMatch(selectedSteps.slice(2).join('\n'), /CLASPRC_JSON/);
assert.match(selectedSteps[3], /CV_STAGING_UAT_CONFIRM_WRITES/);
assert.match(selectedSteps[5], /CV_STAGING_UAT_CONFIRM_WRITES/);

assert.match(runbook, /Environment variables/);
assert.match(runbook, /Environment secrets/);
assert.match(runbook, /production resource inventory/);
assert.match(audit, /Root causes/);
assert.match(audit, /Environment context mismatch/);
assert.match(audit, /#40910344511/);

console.log(
  'Staging workflow contract OK — screenshot SOT mappings, staging-only policy, manual guards and step-scoped credentials.',
);
