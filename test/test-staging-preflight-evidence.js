'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildStagingPreflightEvidence,
  validateStagingConfiguration,
  writeStagingPreflightEvidence,
} = require('../scripts/staging-preflight');

const fixture = {
  CV_STAGING_SCRIPT_ID: 'STAGING-SCRIPT-ID-MUST-NOT-LEAK',
  CV_STAGING_DEPLOYMENT_ID: 'staging-deployment-fixture',
  CV_STAGING_API_URL: 'https://script.google.com/macros/s/staging-deployment-fixture/exec',
  CV_STAGING_SPREADSHEET_ID: 'STAGING-SHEET-ID-MUST-NOT-LEAK',
  CV_STAGING_RECEIPT_FOLDER_ID: 'STAGING-RECEIPT-ID-MUST-NOT-LEAK',
  CV_STAGING_BACKUP_FOLDER_ID: 'STAGING-BACKUP-ID-MUST-NOT-LEAK',
  CV_STAGING_UAT_OWNER_EMAIL: 'staging-owner@example.test',
  CV_STAGING_UAT_OWNER_PASSWORD: 'OWNER-PASSWORD-MUST-NOT-LEAK',
  CV_STAGING_UAT_MANAGER_EMAIL: 'staging-manager@example.test',
  CV_STAGING_UAT_MANAGER_PASSWORD: 'MANAGER-PASSWORD-MUST-NOT-LEAK',
  CLASPRC_JSON: JSON.stringify({
    tokens: {
      default: {
        refresh_token: 'CLASP-REFRESH-TOKEN-MUST-NOT-LEAK',
        client_id: 'CLASP-CLIENT-ID-MUST-NOT-LEAK',
        client_secret: 'CLASP-CLIENT-SECRET-MUST-NOT-LEAK',
      },
    },
  }),
  GITHUB_REF: 'refs/heads/client-main',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_REPOSITORY: 'tchouhanjsm/cash-voucher',
  GITHUB_RUN_ID: '40514299999',
};

const result = validateStagingConfiguration(fixture, { mode: 'readiness' });
assert.equal(result.ok, true, result.errors.join('; '));
assert.equal(result.deploymentScope, 'staging-only');
assert.equal(result.checks.productionResourceReferencesPresent, false);

const evidence = buildStagingPreflightEvidence(result, fixture);
assert.equal(evidence.outcome, 'configuration-pass');
assert.equal(evidence.deploymentScope, 'staging-only');
assert.deepEqual(evidence.categories, {
  stagingResourceSeparation: 'pass',
  productionResourceInventory: 'not-applicable',
  stagingEndpoint: 'pass',
  dedicatedUatAccounts: 'pass',
  claspCredentialShape: 'pass',
});
assert.equal(evidence.boundaries.remoteConnectivityTested, false);
assert.equal(evidence.boundaries.ownershipIndependentlyVerified, false);
assert.equal(evidence.boundaries.backupRestoreVerified, false);

const serialized = JSON.stringify(evidence);
for (const value of [
  fixture.CV_STAGING_API_URL,
  fixture.CV_STAGING_UAT_OWNER_EMAIL,
  fixture.CV_STAGING_UAT_MANAGER_EMAIL,
  fixture.CV_STAGING_UAT_OWNER_PASSWORD,
  fixture.CV_STAGING_UAT_MANAGER_PASSWORD,
  fixture.CLASPRC_JSON,
  fixture.CV_STAGING_SCRIPT_ID,
  fixture.CV_STAGING_SPREADSHEET_ID,
  fixture.CV_STAGING_RECEIPT_FOLDER_ID,
  fixture.CV_STAGING_BACKUP_FOLDER_ID,
]) {
  assert.equal(
    serialized.includes(value),
    false,
    'evidence must not leak configuration or credentials',
  );
}

const missing = validateStagingConfiguration(
  { ...fixture, CV_STAGING_BACKUP_FOLDER_ID: '' },
  { mode: 'readiness' },
);
assert.equal(missing.ok, false);
assert.ok(missing.errors.some((message) => message.includes('CV_STAGING_BACKUP_FOLDER_ID')));

const duplicate = validateStagingConfiguration(
  { ...fixture, CV_STAGING_BACKUP_FOLDER_ID: fixture.CV_STAGING_RECEIPT_FOLDER_ID },
  { mode: 'readiness' },
);
assert.equal(duplicate.ok, false);
assert.ok(
  duplicate.errors.some((message) => message.includes('five configured staging resources')),
);
const unexpectedProduction = validateStagingConfiguration(
  { ...fixture, CV_PRODUCTION_SCRIPT_ID: 'unexpected-production-fixture' },
  { mode: 'readiness' },
);
assert.equal(unexpectedProduction.ok, false);
assert.ok(
  unexpectedProduction.errors.some((message) =>
    message.includes('must not receive production resource IDs'),
  ),
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-preflight-evidence-'));
try {
  const outputPath = path.join(tempDir, 'preflight.json');
  const summaryPath = path.join(tempDir, 'summary.md');
  const written = writeStagingPreflightEvidence(result, {
    ...fixture,
    CV_STAGING_PREFLIGHT_EVIDENCE_PATH: outputPath,
    GITHUB_STEP_SUMMARY: summaryPath,
  });
  assert.equal(written.outcome, 'configuration-pass');
  assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
  const summary = fs.readFileSync(summaryPath, 'utf8');
  assert.match(summary, /Staging configuration preflight \(read-only\)/);
  assert.match(summary, /Scope: staging-only/);
  assert.equal(summary.includes(fixture.CV_STAGING_API_URL), false);
  assert.equal(summary.includes(fixture.CV_STAGING_UAT_OWNER_PASSWORD), false);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log(
  'Staging preflight evidence OK — staging-only scope, production inventory not-applicable, redaction and restrictive file permissions.',
);
