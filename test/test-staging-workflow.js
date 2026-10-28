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
const uatRunner = fs.readFileSync(path.join(root, 'scripts/run-staging-uat.sh'), 'utf8');
const releaseRunbook = fs.readFileSync(
  path.join(root, 'docs/APPS-SCRIPT-RELEASE-RUNBOOK.md'),
  'utf8',
);
const stagingAudit = fs.readFileSync(path.join(root, 'docs/STAGING-RELEASE-AUDIT.md'), 'utf8');

assert.match(workflow, /^on:\n {2}workflow_dispatch:/m, 'staging workflow must be manual-only');
assert.doesNotMatch(
  workflow,
  /^\s+(push|pull_request):/m,
  'staging workflow must not deploy on push or PR',
);
assert.match(workflow, /ACTION_REF: \$\{\{ github\.ref \}\}/);
assert.match(workflow, /name: Require client-main, staging-only confirmation and write consent/);
assert.match(stagingAudit, /staging Environment must restrict deployments to .*client-main/);
assert.match(stagingAudit, /dispatch deploy-and-uat or uat-only from client-main/i);
assert.match(stagingAudit, /CV_STAGING_UAT_OWNER_PASSWORD/);
assert.match(stagingAudit, /STAGING-ONLY/);
assert.doesNotMatch(
  stagingAudit,
  /restrict deployments to main|dispatch deploy-and-uat or uat-only from main/i,
  'staging audit must not contradict the workflow guard by directing operators to main',
);

assert.match(workflow, /ACTION_REF" != "refs\/heads\/client-main"/);
assert.match(
  releaseRunbook,
  /restrict its deployment branch to `client-main`/,
  'GitHub staging Environment restriction must allow the branch guarded by the workflow',
);
assert.doesNotMatch(
  releaseRunbook,
  /restrict its deployment branch to `main`/,
  'runbook must not instruct an Environment restriction that blocks client-main dispatch',
);
assert.match(releaseRunbook, /\*\*deploy-and-uat\*\* runs only from `client-main`/);
assert.match(
  releaseRunbook,
  /Merging a change to `backend\/\*\.gs` does \*\*not\*\* update the Google Apps Script project/,
);
assert.match(workflow, /CONFIRMATION" != "STAGING-ONLY"/);
assert.match(workflow, /CONFIRM_WRITES" != "true"/);
assert.match(workflow, /environment:\n {6}name: staging/m);
assert.match(workflow, /needs: \[validate, guard\]/);
assert.match(workflow, /confirm_staging_writes/);
assert.match(workflow, /CV_STAGING_DEPLOY_CONFIRMATION/);
assert.equal(
  (workflow.match(/CV_STAGING_RESOURCE_ISOLATION_ATTESTATION:/g) || []).length,
  0,
  'write-capable staging jobs must not receive the artifact-only isolation attestation',
);
assert.match(
  preflight,
  /Write-capable staging operations \(deploy and UAT\) require all four production resource reference IDs; OWNER-VERIFIED-STAGING-ONLY attestation is not sufficient/,
);
assert.match(
  releaseRunbook,
  /Write-capable `deploy` and `uat` preflight[\s\S]*owner attestation is not a substitute for the inventory/i,
);
assert.match(preflight, /tokens\.default/);
assert.match(preflight, /OWNER-VERIFIED-STAGING-ONLY/);
assert.match(releaseRunbook, /CV_STAGING_RESOURCE_ISOLATION_ATTESTATION/);
assert.match(releaseRunbook, /git switch client-main/);
assert.match(releaseRunbook, /git pull --ff-only origin client-main/);
assert.doesNotMatch(releaseRunbook, /git switch main/);
assert.match(releaseRunbook, /Selected branches and tags[\s\S]*client-main/);
assert.match(releaseRunbook, /tokens\.default/);
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

const validationJob = workflow.split('  validate:\n')[1].split('  preflight-readiness:\n')[0];
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
assert.match(uat, /dashboardSummary/);
assert.match(uat, /registerPage/);
assert.match(uat, /STAGING DASHBOARD CONTRACT FAILED/);
assert.match(uat, /"limit": 20/);
assert.match(uat, /verify_live_read_models\(owner_page, business_date\)/);
assert.match(uat, /ZoneInfo\("Asia\/Kolkata"\)/);
assert.match(uat, /CV_STAGING_UAT_CONFIRM_WRITES/);
assert.match(uat, /cancelVoucher/);
assert.match(workflow, /id: deployment_preflight/);
assert.match(workflow, /id: update_deployment/);
assert.match(workflow, /id: target_recheck/);
assert.match(workflow, /id: staging_uat/);
assert.equal(
  (workflow.match(/name: Upload sanitized staging evidence/g) || []).length,
  2,
  'deploy and UAT-only jobs both publish a sanitized evidence artifact',
);
assert.equal(
  (workflow.match(/retention-days: 90/g) || []).length,
  3,
  'deploy, UAT-only and read-only preflight artifacts have bounded retention',
);
assert.ok(
  workflow.includes(
    'CV_EVIDENCE_OUTPUT_PATH: ${{ runner.temp }}/cash-voucher-staging-evidence.json',
  ),
  'evidence is written to the runner temporary directory',
);
assert.match(uatRunner, /mktemp -d/);
assert.match(uatRunner, /set -o noclobber/);
assert.match(uatRunner, /env -i/);
assert.match(uatRunner, /env -u GITHUB_OUTPUT -u GITHUB_ENV -u GITHUB_PATH -u GITHUB_STEP_SUMMARY/);
assert.doesNotMatch(uatRunner, /\/tmp\/cash-voucher-staging-(?:uat|server)\.log/);
assert.doesNotMatch(uatRunner, /tee "\$\{UAT_LOG_FILE\}"/);
assert.match(uatRunner, /detailed transcript is withheld from workflow logs/);
assert.equal(
  (
    workflow.match(
      /CV_STAGING_UAT_LOG_FILE: \$\{\{ steps\.staging_uat\.outputs\.uat_log_file \}\}/g,
    ) || []
  ).length,
  2,
  'deploy and UAT evidence must read only the private generated transcript',
);
assert.equal(
  (
    workflow.match(
      /CV_STAGING_UAT_LOG_DIR: \$\{\{ steps\.staging_uat\.outputs\.uat_log_dir \}\}/g,
    ) || []
  ).length,
  2,
  'deploy and UAT evidence cleanup use only the per-run private directory',
);
assert.doesNotMatch(
  workflow,
  /CV_STAGING_UAT_LOG_FILE: \$\{\{ runner\.temp \}\}\/cash-voucher-staging-uat\.log/,
);
assert.match(localServer, /mode: 'artifact'/);
assert.doesNotMatch(localServer, /mode: 'uat'/);
assert.match(localServer, /Cache-Control': 'no-store'/);
assert.match(localServer, /function stagingServiceWorker/);
assert.doesNotMatch(localServer, /caches\.open/);

const clientDistWorkflow = fs.readFileSync(
  path.join(root, '.github/workflows/client-dist.yml'),
  'utf8',
);
assert.match(
  clientDistWorkflow,
  /^on:\n {2}workflow_dispatch:/m,
  'client ZIP workflow must be manually dispatchable from the integration branch',
);
assert.doesNotMatch(
  clientDistWorkflow,
  /^\s+(push|pull_request):/m,
  'client ZIP generation must not run automatically on pushes or PRs',
);
assert.match(clientDistWorkflow, /CV_ENVIRONMENT: staging/);
assert.match(clientDistWorkflow, /CV_API_URL: \$\{\{ secrets\.CV_STAGING_API_URL \}\}/);
assert.doesNotMatch(clientDistWorkflow, /inputs\.api_url/);
assert.match(clientDistWorkflow, /name: Require client-main for staging artifact/);
assert.ok(clientDistWorkflow.includes('if [ "$ACTION_REF" != "refs/heads/client-main" ]'));
assert.match(clientDistWorkflow, /needs: \[guard\]/);
assert.match(clientDistWorkflow, /environment:\n {6}name: staging/);
assert.match(clientDistWorkflow, /npm run staging:preflight -- --mode=artifact/);
assert.ok(
  clientDistWorkflow.indexOf('npm run staging:preflight -- --mode=artifact') <
    clientDistWorkflow.indexOf('npm run build:web'),
  'staging target isolation must pass before the client ZIP is built',
);
const clientDistGuard = clientDistWorkflow.split('  build:\n')[0];
assert.doesNotMatch(clientDistGuard, /secrets\./, 'branch guard must run without staging secrets');
for (const key of [
  'CV_STAGING_API_URL',
  'CV_STAGING_SCRIPT_ID',
  'CV_STAGING_DEPLOYMENT_ID',
  'CV_STAGING_SPREADSHEET_ID',
  'CV_STAGING_RECEIPT_FOLDER_ID',
  'CV_STAGING_BACKUP_FOLDER_ID',
  'CV_PRODUCTION_SCRIPT_ID',
  'CV_PRODUCTION_SPREADSHEET_ID',
  'CV_PRODUCTION_RECEIPT_FOLDER_ID',
  'CV_PRODUCTION_BACKUP_FOLDER_ID',
]) {
  assert.ok(
    clientDistWorkflow.includes(key + ': ${{ secrets.' + key + ' }}'),
    'staging ZIP must read target identity from Environment secret: ' + key,
  );
  assert.ok(
    workflow.includes(key + ': ${{ secrets.' + key + ' }}'),
    'staging UAT must read target identity from Environment secret: ' + key,
  );
}
assert.ok(
  clientDistWorkflow.includes(
    'EXPECTED_STAGING_DEPLOYMENT_ID: ${{ secrets.CV_STAGING_DEPLOYMENT_ID }}',
  ),
  'ZIP config/manifest verification uses the staging deployment ID secret',
);
assert.doesNotMatch(
  workflow,
  /vars\.CV_(?:STAGING|PRODUCTION)_(?:SCRIPT_ID|DEPLOYMENT_ID|API_URL|SPREADSHEET_ID|RECEIPT_FOLDER_ID|BACKUP_FOLDER_ID)/,
  'resource identifiers and API URL must not be sourced from unmasked workflow variables',
);
assert.doesNotMatch(
  clientDistWorkflow,
  /vars\.CV_(?:STAGING|PRODUCTION)_(?:SCRIPT_ID|DEPLOYMENT_ID|API_URL|SPREADSHEET_ID|RECEIPT_FOLDER_ID|BACKUP_FOLDER_ID)/,
  'ZIP workflow must not source resource identifiers from unmasked variables',
);
assert.ok(
  clientDistWorkflow.includes(
    'CV_STAGING_RESOURCE_ISOLATION_ATTESTATION: ${{ vars.CV_STAGING_RESOURCE_ISOLATION_ATTESTATION }}',
  ),
);
assert.ok(
  clientDistWorkflow.includes(
    'localApiOverride || ${JSON.stringify(new URL(expectedUrl).toString())}',
  ),
  'ZIP config validation must match the generated local override expression and endpoint',
);
assert.match(clientDistWorkflow, /name: Client staging dist zip/);
for (const securityContract of [
  'Header always set X-Content-Type-Options "nosniff"',
  'Header always set X-Frame-Options "DENY"',
  'Header always set Referrer-Policy "strict-origin-when-cross-origin"',
  'Header always set Permissions-Policy',
  "object-src 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "frame-ancestors 'none'",
  'Unsafe or external script source found',
]) {
  assert.ok(
    clientDistWorkflow.includes(securityContract),
    'staging ZIP workflow must enforce security contract: ' + securityContract,
  );
}
assert.match(clientDistWorkflow, /release-manifest\.json/);
assert.match(
  clientDistWorkflow,
  /ZIP_NAME="cv-\$\{CLIENT_CODE\}-staging-\$\{GITHUB_SHA\}\.zip"/,
  'ZIP file must use the full commit SHA expected by artifact upload',
);
const clientDistUpload =
  clientDistWorkflow.split('      - uses: actions/upload-artifact@v4')[1] || '';
const clientZipName = 'cv-${{ inputs.client_code }}-staging-${{ github.sha }}.zip';
assert.match(clientDistUpload, /path:\s*\|/);
assert.ok(
  clientDistUpload.includes(clientZipName),
  'artifact upload includes the full-SHA staging ZIP',
);
assert.ok(
  clientDistUpload.includes(`${clientZipName}.sha256`),
  'artifact upload includes the detached ZIP checksum',
);
assert.match(clientDistWorkflow, /actions\/upload-artifact@v4/);
assert.match(clientDistWorkflow, /artifactVersion: 2/);
assert.match(clientDistWorkflow, /checksumAlgorithm: 'SHA-256'/);
assert.match(clientDistWorkflow, /checksumsFile: 'SHA256SUMS\.txt'/);
assert.match(clientDistWorkflow, /sha256sum "\$ZIP_NAME" > "\$ZIP_NAME\.sha256"/);
assert.match(clientDistWorkflow, /retention-days: 14/);
assert.match(
  clientDistWorkflow,
  /Confirm integration commit is still current before publishing the artifact/,
);
assert.doesNotMatch(
  clientDistWorkflow,
  /CV_ENVIRONMENT:\s*production|clasp push|staging:deploy/,
  'client ZIP workflow must remain an artifact-only staging build',
);

assert.match(
  stagingAudit,
  /workflow run #39587669660[\s\S]*CV_PRODUCTION_SCRIPT_ID[\s\S]*CLASPRC_JSON/,
  'staging audit must preserve the original failed-preflight evidence',
);
assert.match(
  stagingAudit,
  /workflow run #39596101014[\s\S]*tokens\.default[\s\S]*No restriction/,
  'staging audit must record the modern Clasp credential-format finding and branch-restriction follow-up',
);
assert.match(
  stagingAudit,
  /do not rerun it or relax preflight/,
  'staging recovery instructions must not bypass safety gates',
);

function extractWorkflowJob(name, nextName) {
  const start = workflow.indexOf('  ' + name + ':\n');
  const end = nextName ? workflow.indexOf('  ' + nextName + ':\n', start + 1) : workflow.length;
  assert.ok(start >= 0 && end > start, 'workflow job exists: ' + name);
  return workflow.slice(start, end);
}

function extractWorkflowStep(job, name) {
  const marker = '      - name: ' + name + '\n';
  const start = job.indexOf(marker);
  assert.ok(start >= 0, 'workflow step exists: ' + name);
  const end = job.indexOf('\n      - name: ', start + marker.length);
  return job.slice(start, end < 0 ? job.length : end);
}

function assertNoStepSecrets(step, description) {
  assert.doesNotMatch(step, /\$\{\{\s*secrets\./, description);
}

const deployJob = extractWorkflowJob('deploy', 'uat');
const uatOnlyJob = extractWorkflowJob('uat');
const deployHeader = deployJob.split('    steps:\n')[0];
const uatOnlyHeader = uatOnlyJob.split('    steps:\n')[0];
assertNoStepSecrets(deployHeader, 'deploy job header must not expose secrets to every step');
assertNoStepSecrets(uatOnlyHeader, 'uat job header must not expose secrets to every step');
assert.doesNotMatch(
  uatOnlyJob,
  /CLASPRC_JSON|secrets\.CLASPRC_JSON/,
  'UAT-only must never receive the Clasp OAuth credential',
);

for (const stepName of [
  'Checkout',
  'Setup Node.js',
  'Setup Python',
  'Install dependencies',
  'Install Playwright',
  'Assemble sanitized staging execution evidence',
  'Upload sanitized staging evidence',
]) {
  assertNoStepSecrets(
    extractWorkflowStep(deployJob, stepName),
    'deploy job step must be credential-free: ' + stepName,
  );
}
for (const stepName of [
  'Checkout',
  'Setup Node.js',
  'Setup Python',
  'Install dependencies',
  'Assemble sanitized staging execution evidence',
  'Upload sanitized staging evidence',
]) {
  assertNoStepSecrets(
    extractWorkflowStep(uatOnlyJob, stepName),
    'UAT-only job step must be credential-free: ' + stepName,
  );
}

const deployConfigPreflight = extractWorkflowStep(
  deployJob,
  'Validate isolated deployment configuration',
);
const deployMutation = extractWorkflowStep(
  deployJob,
  'Update the existing staging deployment only',
);
const deployTargetRecheck = extractWorkflowStep(deployJob, 'Verify target before testing');
const deployUatStep = extractWorkflowStep(deployJob, 'Run staging UAT');
const uatTargetPreflight = extractWorkflowStep(uatOnlyJob, 'Validate isolated staging target');
const uatOnlyStep = extractWorkflowStep(uatOnlyJob, 'Run staging UAT without deploying');

for (const key of [
  'CV_STAGING_SCRIPT_ID',
  'CV_PRODUCTION_SCRIPT_ID',
  'CV_STAGING_DEPLOYMENT_ID',
  'CV_STAGING_API_URL',
  'CV_STAGING_SPREADSHEET_ID',
  'CV_PRODUCTION_SPREADSHEET_ID',
  'CV_STAGING_RECEIPT_FOLDER_ID',
  'CV_PRODUCTION_RECEIPT_FOLDER_ID',
  'CV_STAGING_BACKUP_FOLDER_ID',
  'CV_PRODUCTION_BACKUP_FOLDER_ID',
]) {
  assert.ok(
    deployConfigPreflight.includes(key + ': ${{ secrets.' + key + ' }}'),
    'deploy preflight receives required resource-isolation input: ' + key,
  );
  assert.ok(
    deployMutation.includes(key + ': ${{ secrets.' + key + ' }}'),
    'deployment step receives required target identity input: ' + key,
  );
  assert.ok(
    deployTargetRecheck.includes(key + ': ${{ secrets.' + key + ' }}'),
    'post-deploy target recheck receives required resource input: ' + key,
  );
  assert.ok(
    deployUatStep.includes(key + ': ${{ secrets.' + key + ' }}'),
    'deploy UAT step receives required target input: ' + key,
  );
  assert.ok(
    uatTargetPreflight.includes(key + ': ${{ secrets.' + key + ' }}'),
    'UAT-only preflight receives required target input: ' + key,
  );
  assert.ok(
    uatOnlyStep.includes(key + ': ${{ secrets.' + key + ' }}'),
    'UAT-only execution receives required target input: ' + key,
  );
}
assert.match(deployConfigPreflight, /CLASPRC_JSON: \$\{\{ secrets\.CLASPRC_JSON \}\}/);
assert.match(deployMutation, /CLASPRC_JSON: \$\{\{ secrets\.CLASPRC_JSON \}\}/);
assert.doesNotMatch(deployTargetRecheck, /CLASPRC_JSON/);
assert.doesNotMatch(deployUatStep, /CLASPRC_JSON/);
assert.doesNotMatch(uatTargetPreflight, /CLASPRC_JSON/);
assert.doesNotMatch(uatOnlyStep, /CLASPRC_JSON/);
assert.match(
  deployUatStep,
  /CV_STAGING_UAT_CONFIRM_WRITES: \$\{\{ inputs\.confirm_staging_writes \}\}/,
);
assert.match(
  uatOnlyStep,
  /CV_STAGING_UAT_CONFIRM_WRITES: \$\{\{ inputs\.confirm_staging_writes \}\}/,
);
assert.doesNotMatch(deployConfigPreflight, /CV_STAGING_UAT_CONFIRM_WRITES/);
assert.doesNotMatch(deployTargetRecheck, /CV_STAGING_UAT_CONFIRM_WRITES/);
assert.doesNotMatch(uatTargetPreflight, /CV_STAGING_UAT_CONFIRM_WRITES/);

const readinessJob = workflow.split('  preflight-readiness:\n')[1].split('  guard:\n')[0];
assert.match(readinessJob, /github\.ref == 'refs\/heads\/client-main'/);
assert.match(readinessJob, /inputs\.operation == 'validate-only'/);
assert.match(readinessJob, /needs: \[validate\]/);
assert.match(readinessJob, /environment:\n {6}name: staging/);
assert.match(readinessJob, /node scripts\/staging-preflight\.js --mode=readiness/);
const readinessHeader = readinessJob.split('    steps:\n')[0];
assert.doesNotMatch(readinessHeader, /secrets\./);
const readinessValidationStep = readinessJob
  .split('      - name: Validate configuration only (no remote access or writes)\n')[1]
  .split('      - name: Upload sanitized preflight evidence\n')[0];
assert.match(readinessValidationStep, /secrets\.CLASPRC_JSON/);
assert.match(readinessValidationStep, /secrets\.CV_STAGING_SCRIPT_ID/);
assert.doesNotMatch(readinessJob, /npm ci|npm run staging:preflight/);
const readinessUploadStep = readinessJob.split(
  '      - name: Upload sanitized preflight evidence\n',
)[1];
assert.doesNotMatch(readinessUploadStep, /secrets\./);
assert.match(readinessJob, /CV_STAGING_PREFLIGHT_EVIDENCE_PATH/);
assert.match(readinessJob, /retention-days: 90/);
assert.doesNotMatch(readinessJob, /staging:deploy|uat:staging|clasp push|curl/);
assert.doesNotMatch(workflow.split('  preflight-readiness:\n')[0], /secrets\./);

console.log(
  'Staging workflow guard OK — manual trigger, client-main-only gate, explicit write consent, isolated deployment config, no-cache test shell and protected resource checks.',
);
