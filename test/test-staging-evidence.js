'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildStagingEvidence,
  summarizeUat,
  writeStagingEvidence,
} = require('../scripts/staging-evidence');

const secretEmail = 'private-owner@example.test';
const secretPassword = 'DO-NOT-LEAK-ThisPassword9';
const secretApiUrl = 'https://script.google.com/macros/s/private-staging-deployment/exec';
const secretScriptId = 'private-staging-script-id';
const baseEnv = {
  CV_STAGING_OPERATION: 'deploy-and-uat',
  CV_EVIDENCE_JOB_OUTCOME: 'success',
  CV_EVIDENCE_PREFLIGHT_OUTCOME: 'success',
  CV_EVIDENCE_DEPLOY_OUTCOME: 'success',
  CV_EVIDENCE_TARGET_RECHECK_OUTCOME: 'success',
  CV_EVIDENCE_UAT_OUTCOME: 'success',
  CV_STAGING_UAT_OWNER_EMAIL: secretEmail,
  CV_STAGING_UAT_OWNER_PASSWORD: secretPassword,
  CV_STAGING_API_URL: secretApiUrl,
  CV_STAGING_SCRIPT_ID: secretScriptId,
  CV_PRODUCTION_SCRIPT_ID: 'private-production-script-id',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_REF: 'refs/heads/client-main',
  GITHUB_REPOSITORY: 'tchouhanjsm/cash-voucher',
  GITHUB_WORKFLOW: 'Staging UAT',
  GITHUB_RUN_ID: '12345',
  GITHUB_RUN_ATTEMPT: '2',
  GITHUB_SERVER_URL: 'https://github.com',
};

const successfulLog = [
  'PASS: owner session is authorized',
  'PASS: staging dashboardSummary returns the expected dashboard read model',
  'PASS: staging registerPage returns a bounded paginated register read model',
  'PASS: the UAT payment is cancelled with a retained audit trace',
  'STAGING UAT: 4 checks passed, 0 failures.',
].join('\n');

const success = buildStagingEvidence(baseEnv, successfulLog);
assert.equal(success.schemaVersion, 2);
assert.equal(success.operation, 'deploy-and-uat');
assert.equal(success.source.ref, 'refs/heads/client-main');
assert.equal(success.source.commitSha, 'a'.repeat(40));
assert.equal(success.workflowRun.runId, '12345');
assert.equal(success.workflowRun.runAttempt, '2');
assert.equal(
  success.workflowRun.url,
  'https://github.com/tchouhanjsm/cash-voucher/actions/runs/12345',
);
assert.equal(success.jobOutcome, 'success');
assert.equal(success.steps.preflight, 'success');
assert.equal(success.steps.deployment, 'success');
assert.equal(success.uat.status, 'passed');
assert.equal(success.uat.checksPassed, 4);
assert.deepEqual(success.liveReadModels, {
  dashboardSummary: 'passed',
  registerPage: 'passed',
});
assert.equal(success.uat.cleanupStatus, 'cancelled-audit-retained');
assert.match(success.uat.transcriptSha256, /^[a-f0-9]{64}$/);
assert.deepEqual(success.disclosure, {
  credentialsIncluded: false,
  resourceIdentifiersIncluded: false,
  apiEndpointsIncluded: false,
  rawTranscriptIncluded: false,
});

const serialized = JSON.stringify(success);
for (const sensitiveValue of [
  secretEmail,
  secretPassword,
  secretApiUrl,
  secretScriptId,
  'private-production-script-id',
  'PASS: owner session is authorized',
]) {
  assert.equal(
    serialized.includes(sensitiveValue),
    false,
    'artifact must exclude sensitive inputs and raw UAT output',
  );
}

const failedLog = [
  'PASS: source preflight completed',
  'CLEANUP: test marker was not uniquely recoverable; owner review is required.',
  'STAGING UAT FAILED: assertion failed',
].join('\n');
const failed = summarizeUat(failedLog, 'failure');
assert.equal(failed.status, 'failed');
assert.equal(failed.checksPassed, 1);
assert.equal(failed.cleanupStatus, 'owner-review-required');
assert.equal(failed.summaryPresent, false);

const skipped = summarizeUat('', 'skipped');
assert.equal(skipped.status, 'not-run');
assert.equal(skipped.checksPassed, null);
assert.equal(skipped.cleanupStatus, 'not-run');
assert.equal(skipped.transcriptSha256, null);
assert.equal(
  buildStagingEvidence(
    { ...baseEnv, CV_EVIDENCE_UAT_OUTCOME: 'skipped' },
    '',
  ).liveReadModels.dashboardSummary,
  'not-run',
  'skipped UAT must not claim live dashboard coverage',
);

assert.throws(
  () => buildStagingEvidence({ ...baseEnv, GITHUB_REF: 'refs/heads/main' }, successfulLog),
  /client-main/,
);
assert.throws(
  () => buildStagingEvidence({ ...baseEnv, GITHUB_SHA: 'short-sha' }, successfulLog),
  /40-character/,
);
assert.throws(
  () =>
    buildStagingEvidence({ ...baseEnv, CV_STAGING_OPERATION: 'production-deploy' }, successfulLog),
  /Unsupported staging operation/,
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cash-voucher-evidence-test-'));
try {
  const outputPath = path.join(tempDir, 'staging-evidence.json');
  const summaryPath = path.join(tempDir, 'summary.md');
  const evidence = writeStagingEvidence(
    {
      ...baseEnv,
      CV_EVIDENCE_OUTPUT_PATH: outputPath,
      GITHUB_STEP_SUMMARY: summaryPath,
    },
    successfulLog,
  );
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).uat.status, 'passed');
  assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
  const markdown = fs.readFileSync(summaryPath, 'utf8');
  assert.match(markdown, /Sanitized staging execution evidence/);
  assert.match(markdown, /Test-payment cleanup: cancelled-audit-retained/);
  assert.match(markdown, /Live dashboardSummary contract: passed/);
  assert.match(markdown, /Live registerPage contract: passed/);
  assert.equal(markdown.includes(secretApiUrl), false);
  assert.equal(evidence.uat.checksPassed, 4);
  assert.deepEqual(evidence.liveReadModels, {
    dashboardSummary: 'passed',
    registerPage: 'passed',
  });
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log(
  'Staging evidence OK — exact source/run identity, sanitized summary, pass count, cleanup status and fail-closed cases.',
);
