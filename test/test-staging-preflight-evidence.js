'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildStagingPreflightEvidence,
  readProductionApiUrl,
  validateStagingConfiguration,
  writeStagingPreflightEvidence,
} = require('../scripts/staging-preflight');

const ownerEmail = 'staging-owner@example.test';
const managerEmail = 'staging-manager@example.test';
const ownerPassword = 'OWNER-PASSWORD-MUST-NOT-LEAK';
const managerPassword = 'MANAGER-PASSWORD-MUST-NOT-LEAK';
const apiUrl = 'https://script.google.com/macros/s/staging-deployment-fixture/exec';
const productionApiUrl =
  'https://script.google.com/macros/s/production-deployment-fixture/exec';
const clasp = JSON.stringify({
  tokens: {
    default: {
      refresh_token: 'CLASP-REFRESH-TOKEN-MUST-NOT-LEAK',
      client_id: 'CLASP-CLIENT-ID-MUST-NOT-LEAK',
      client_secret: 'CLASP-CLIENT-SECRET-MUST-NOT-LEAK',
    },
  },
});
const fixture = {
  CV_STAGING_ONLY_MODE: 'true',
  CV_STAGING_SCRIPT_ID: 'STAGING-SCRIPT-ID-MUST-NOT-LEAK',
  CV_STAGING_DEPLOYMENT_ID: 'staging-deployment-fixture',
  CV_STAGING_API_URL: apiUrl,
  CV_STAGING_SPREADSHEET_ID: 'STAGING-SHEET-ID-MUST-NOT-LEAK',
  CV_STAGING_RECEIPT_FOLDER_ID: 'STAGING-RECEIPT-ID-MUST-NOT-LEAK',
  CV_STAGING_BACKUP_FOLDER_ID: 'STAGING-BACKUP-ID-MUST-NOT-LEAK',
  CV_STAGING_UAT_OWNER_EMAIL: ownerEmail,
  CV_STAGING_UAT_OWNER_PASSWORD: ownerPassword,
  CV_STAGING_UAT_MANAGER_EMAIL: managerEmail,
  CV_STAGING_UAT_MANAGER_PASSWORD: managerPassword,
  CLASPRC_JSON: clasp,
  GITHUB_REF: 'refs/heads/client-main',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_REPOSITORY: 'tchouhanjsm/cash-voucher',
  GITHUB_RUN_ID: '40910344511',
};

const result = validateStagingConfiguration(fixture, { mode: 'readiness' });
assert.equal(result.ok, true, result.errors.join('; '));
assert.equal(readProductionApiUrl(fixture), '');
const evidence = buildStagingPreflightEvidence(result, fixture);
assert.equal(evidence.outcome, 'configuration-pass');
assert.equal(evidence.source.ref, 'refs/heads/client-main');
assert.equal(evidence.source.commitSha, 'a'.repeat(40));
assert.equal(
  evidence.workflowRun.url,
  'https://github.com/tchouhanjsm/cash-voucher/actions/runs/40910344511',
);
assert.deepEqual(evidence.categories, {
  stagingResourceSeparation: 'pass',
  productionResourceInventory: 'not-configured-staging-only',
  stagingEndpoint: 'pass',
  dedicatedUatAccounts: 'pass',
  claspCredentialShape: 'pass',
  stagingOnlyMode: 'pass',
});
assert.equal(evidence.boundaries.remoteConnectivityTested, false);
assert.equal(evidence.boundaries.ownershipIndependentlyVerified, false);
assert.equal(evidence.boundaries.productionResourceCrossCheckPerformed, false);
assert.equal(evidence.boundaries.productionEnvironmentConfigured, false);
assert.equal(evidence.boundaries.deploymentChanged, false);
assert.equal(evidence.boundaries.backupRestoreVerified, false);

const serialized = JSON.stringify(evidence);
for (const privateValue of [
  apiUrl,
  ownerEmail,
  managerEmail,
  ownerPassword,
  managerPassword,
  clasp,
  fixture.CV_STAGING_SCRIPT_ID,
  fixture.CV_STAGING_SPREADSHEET_ID,
  fixture.CV_STAGING_RECEIPT_FOLDER_ID,
  fixture.CV_STAGING_BACKUP_FOLDER_ID,
]) {
  assert.equal(
    serialized.includes(privateValue),
    false,
    'Evidence must not include private configuration values.',
  );
}

const blockedMissingStagingOnlyMode = validateStagingConfiguration(
  { ...fixture, CV_STAGING_ONLY_MODE: undefined },
  { mode: 'readiness' },
);
assert.equal(blockedMissingStagingOnlyMode.ok, false);
assert.match(blockedMissingStagingOnlyMode.errors.join('; '), /CV_STAGING_ONLY_MODE/);

const blockedDuplicateStagingIds = validateStagingConfiguration(
  { ...fixture, CV_STAGING_BACKUP_FOLDER_ID: fixture.CV_STAGING_SCRIPT_ID },
  { mode: 'readiness' },
);
assert.equal(blockedDuplicateStagingIds.ok, false);
assert.match(blockedDuplicateStagingIds.errors.join('; '), /five distinct resources/);

const blockedEndpointMismatch = validateStagingConfiguration(
  { ...fixture, CV_STAGING_API_URL: 'https://script.google.com/macros/s/another-id/exec' },
  { mode: 'readiness' },
);
assert.equal(blockedEndpointMismatch.ok, false);
assert.match(blockedEndpointMismatch.errors.join('; '), /does not match CV_STAGING_DEPLOYMENT_ID/);

const blockedPartialProductionInventory = validateStagingConfiguration(
  { ...fixture, CV_PRODUCTION_SCRIPT_ID: 'PRODUCTION-SCRIPT-ID' },
  { mode: 'readiness' },
);
assert.equal(blockedPartialProductionInventory.ok, false);
assert.match(blockedPartialProductionInventory.errors.join('; '), /all four CV_PRODUCTION/);

const productionInventoryFixture = {
  ...fixture,
  CV_STAGING_ONLY_MODE: 'false',
  CV_PRODUCTION_API_URL: productionApiUrl,
  CV_PRODUCTION_SCRIPT_ID: 'PRODUCTION-SCRIPT-ID-MUST-NOT-LEAK',
  CV_PRODUCTION_SPREADSHEET_ID: 'PRODUCTION-SHEET-ID-MUST-NOT-LEAK',
  CV_PRODUCTION_RECEIPT_FOLDER_ID: 'PRODUCTION-RECEIPT-ID-MUST-NOT-LEAK',
  CV_PRODUCTION_BACKUP_FOLDER_ID: 'PRODUCTION-BACKUP-ID-MUST-NOT-LEAK',
};
const productionCompared = validateStagingConfiguration(productionInventoryFixture, {
  mode: 'readiness',
});
assert.equal(productionCompared.ok, true, productionCompared.errors.join('; '));
assert.equal(productionCompared.checks.productionCrossCheckPerformed, true);

const blockedProductionOverlap = validateStagingConfiguration(
  {
    ...productionInventoryFixture,
    CV_PRODUCTION_SPREADSHEET_ID: fixture.CV_STAGING_SPREADSHEET_ID,
  },
  { mode: 'readiness' },
);
assert.equal(blockedProductionOverlap.ok, false);
assert.match(blockedProductionOverlap.errors.join('; '), /also configured as a production resource/);

const blockedSameDeployment = validateStagingConfiguration(
  {
    ...productionInventoryFixture,
    CV_PRODUCTION_API_URL: apiUrl,
  },
  { mode: 'readiness' },
);
assert.equal(blockedSameDeployment.ok, false);
assert.match(blockedSameDeployment.errors.join('; '), /matches the production deployment ID/);

const blockedProductionUrlWithoutInventory = validateStagingConfiguration(
  { ...fixture, CV_PRODUCTION_API_URL: productionApiUrl },
  { mode: 'readiness' },
);
assert.equal(blockedProductionUrlWithoutInventory.ok, false);
assert.match(blockedProductionUrlWithoutInventory.errors.join('; '), /all four CV_PRODUCTION/);

const deployResult = validateStagingConfiguration(
  {
    ...fixture,
    CV_STAGING_DEPLOY_CONFIRMATION: 'STAGING-ONLY',
  },
  { mode: 'deploy' },
);
assert.equal(deployResult.ok, true, deployResult.errors.join('; '));

const blockedDeployWithoutConfirmation = validateStagingConfiguration(
  { ...fixture, CV_STAGING_DEPLOY_CONFIRMATION: '' },
  { mode: 'deploy' },
);
assert.equal(blockedDeployWithoutConfirmation.ok, false);
assert.match(blockedDeployWithoutConfirmation.errors.join('; '), /STAGING-ONLY confirmation/);

const blocked = validateStagingConfiguration(
  { ...fixture, CV_STAGING_SCRIPT_ID: '', CLASPRC_JSON: '' },
  { mode: 'readiness' },
);
assert.equal(blocked.ok, false);
const blockedEvidence = buildStagingPreflightEvidence(blocked, fixture);
assert.equal(blockedEvidence.outcome, 'blocked');
assert.equal(blockedEvidence.categories.stagingResourceSeparation, 'blocked');
assert.equal(JSON.stringify(blockedEvidence).includes('MUST-NOT-LEAK'), false);

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
  assert.match(summary, /no remote connectivity.*was verified/);
  assert.match(summary, /not-configured-staging-only/);
  assert.equal(summary.includes(apiUrl), false);
  assert.equal(summary.includes(ownerPassword), false);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log(
  'Staging preflight evidence OK — screenshot-aligned vars/secrets contract, explicit staging-only mode, optional complete production inventory, privacy and fail-closed comparisons verified.',
);
