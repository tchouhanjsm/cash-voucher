'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  REQUIRED_OPERATIONAL_GATES,
  REQUIRED_SOURCE_CHECKS,
  validateReleaseGateBundle,
} = require('../scripts/validate-release-gate-bundle');
const { buildRecoveryEvidence } = require('./fixtures/recovery-evidence');

const repository = 'tchouhanjsm/cash-voucher';
const ref = 'refs/heads/client-main';
const commitSha = 'a'.repeat(40);
const validationTime = '2026-10-28T00:05:00.000Z';

function buildPreflight() {
  const runId = '50105';
  return {
    schemaVersion: 1,
    evidenceType: 'cash-voucher-staging-configuration-preflight',
    generatedAt: '2026-10-28T00:00:00.000Z',
    source: { repository, ref, commitSha },
    workflowRun: {
      runId,
      url: 'https://github.com/' + repository + '/actions/runs/' + runId,
    },
    outcome: 'configuration-pass',
    categories: {
      stagingResourceSeparation: 'pass',
      productionResourceInventory: 'pass',
      stagingEndpoint: 'pass',
      dedicatedUatAccounts: 'pass',
      claspCredentialShape: 'pass',
    },
    blockers: [],
    boundaries: {
      credentialValuesIncluded: false,
      resourceIdentifiersIncluded: false,
      endpointIncluded: false,
      remoteConnectivityTested: false,
      ownershipIndependentlyVerified: false,
      deploymentChanged: false,
      backupRestoreVerified: false,
    },
  };
}

function buildBundle() {
  const sourceChecks = {};
  REQUIRED_SOURCE_CHECKS.forEach((name, index) => {
    sourceChecks[name] = {
      conclusion: 'success',
      headSha: commitSha,
      runId: String(50101 + index),
    };
  });

  const operationalGates = {};
  REQUIRED_OPERATIONAL_GATES.forEach((name, index) => {
    operationalGates[name] = {
      status: 'pass',
      evidenceRef: 'OPS-' + String(60101 + index),
      verifiedAt: '2026-10-27T23:30:00.000Z',
      ...(name === 'ownerBranchProtectionVerified' ? {} : { testedClientMainSha: commitSha }),
    };
  });

  return {
    schemaVersion: 1,
    evidenceType: 'cash-voucher-release-gate-bundle',
    generatedAt: '2026-10-28T00:01:00.000Z',
    source: { repository, ref, commitSha },
    sourceChecks,
    stagingPreflight: buildPreflight(),
    recoveryEvidence: buildRecoveryEvidence(commitSha),
    operationalGates,
  };
}

function buildCurrentBundle() {
  const bundle = buildBundle();
  const now = Date.now();
  bundle.generatedAt = new Date(now).toISOString();
  bundle.stagingPreflight.generatedAt = new Date(now - 5 * 60 * 1000).toISOString();
  bundle.recoveryEvidence.recordedAt = new Date(now - 60 * 60 * 1000).toISOString();
  Object.values(bundle.operationalGates).forEach((gate) => {
    gate.verifiedAt = new Date(now - 10 * 60 * 1000).toISOString();
  });
  return bundle;
}

function hasCode(bundle, code) {
  return validateReleaseGateBundle(bundle, validationTime).errors.some((error) => error.code === code);
}

const valid = validateReleaseGateBundle(buildBundle(), validationTime);
assert.equal(valid.ok, true, JSON.stringify(valid.errors));
assert.deepEqual(valid.summary, {
  sourceSha: commitSha,
  requiredSourceChecks: 4,
  stagingConfigurationPass: true,
  recoveryEvidenceContractPass: true,
  operationalGatesPassed: 8,
  releaseApproval: 'human-review-required',
});

const shaMismatch = buildBundle();
shaMismatch.sourceChecks.browserE2e.headSha = 'b'.repeat(40);
assert.ok(hasCode(shaMismatch, 'SOURCE_CHECK_SHA_MISMATCH'));

const missingSourceCheck = buildBundle();
delete missingSourceCheck.sourceChecks.fullFlight;
assert.ok(hasCode(missingSourceCheck, 'MISSING_FIELD'));

const duplicateSourceRun = buildBundle();
duplicateSourceRun.sourceChecks.browserE2e.runId = duplicateSourceRun.sourceChecks.ciQuality.runId;
assert.ok(hasCode(duplicateSourceRun, 'SOURCE_CHECK_RUN_ID_DUPLICATE'));

const failedSourceCheck = buildBundle();
failedSourceCheck.sourceChecks.ciQuality.conclusion = 'failure';
assert.ok(hasCode(failedSourceCheck, 'SOURCE_CHECK_FAILED'));

const staleBundle = buildBundle();
staleBundle.generatedAt = '2026-10-27T00:00:00.000Z';
assert.ok(hasCode(staleBundle, 'BUNDLE_STALE'));

const futureBundle = buildBundle();
futureBundle.generatedAt = '2026-10-28T00:11:00.000Z';
assert.ok(hasCode(futureBundle, 'BUNDLE_TIMESTAMP_IN_FUTURE'));

const invalidValidationTime = validateReleaseGateBundle(buildBundle(), 'not-a-timestamp');
assert.ok(invalidValidationTime.errors.some((error) => error.code === 'VALIDATION_TIMESTAMP'));


const blockedPreflight = buildBundle();
blockedPreflight.stagingPreflight.outcome = 'blocked';
blockedPreflight.stagingPreflight.blockers.push('configuration is incomplete');
assert.ok(hasCode(blockedPreflight, 'PREFLIGHT_BLOCKED'));
assert.ok(hasCode(blockedPreflight, 'PREFLIGHT_BLOCKERS'));

const falseLiveClaim = buildBundle();
falseLiveClaim.stagingPreflight.boundaries.ownershipIndependentlyVerified = true;
assert.ok(hasCode(falseLiveClaim, 'PREFLIGHT_BOUNDARY'));

const preflightWrongSha = buildBundle();
preflightWrongSha.stagingPreflight.source.commitSha = 'b'.repeat(40);
assert.ok(hasCode(preflightWrongSha, 'PREFLIGHT_SHA_MISMATCH'));

const preflightAfterBundle = buildBundle();
preflightAfterBundle.stagingPreflight.generatedAt = '2026-10-28T00:02:00.000Z';
assert.ok(hasCode(preflightAfterBundle, 'PREFLIGHT_AFTER_BUNDLE'));

const stalePreflight = buildBundle();
stalePreflight.stagingPreflight.generatedAt = '2026-10-26T23:00:00.000Z';
assert.ok(hasCode(stalePreflight, 'PREFLIGHT_STALE'));

const recoveryAfterBundle = buildBundle();
recoveryAfterBundle.recoveryEvidence.recordedAt = '2026-10-28T00:02:00.000Z';
assert.ok(hasCode(recoveryAfterBundle, 'RECOVERY_AFTER_BUNDLE'));

const staleRecoveryEvidence = buildBundle();
staleRecoveryEvidence.recoveryEvidence.recordedAt = '2026-10-19T00:00:00.000Z';
assert.ok(hasCode(staleRecoveryEvidence, 'RECOVERY_STALE'));

const malformedPreflightUrl = buildBundle();
malformedPreflightUrl.stagingPreflight.workflowRun.url = 'https://example.test/fake-run';
assert.ok(hasCode(malformedPreflightUrl, 'PREFLIGHT_RUN_URL'));

const duplicatePreflightRun = buildBundle();
duplicatePreflightRun.stagingPreflight.workflowRun.runId =
  duplicatePreflightRun.sourceChecks.ciQuality.runId;
duplicatePreflightRun.stagingPreflight.workflowRun.url =
  'https://github.com/' +
  repository +
  '/actions/runs/' +
  duplicatePreflightRun.stagingPreflight.workflowRun.runId;
assert.ok(hasCode(duplicatePreflightRun, 'PREFLIGHT_RUN_ID_DUPLICATE'));

const recoveryWrongSha = buildBundle();
recoveryWrongSha.recoveryEvidence.source.clientMainSha = 'b'.repeat(40);
recoveryWrongSha.recoveryEvidence.restore.deployedClientMainSha = 'b'.repeat(40);
assert.ok(hasCode(recoveryWrongSha, 'RECOVERY_SHA_MISMATCH'));

const failedOperationalGate = buildBundle();
failedOperationalGate.operationalGates.liveSecurityHeadersVerified.status = 'blocked';
assert.ok(hasCode(failedOperationalGate, 'OPERATIONAL_GATE_BLOCKED'));

const staleOperationalGate = buildBundle();
staleOperationalGate.operationalGates.liveStagingUatPassed.verifiedAt = '2026-10-20T23:00:00.000Z';
assert.ok(hasCode(staleOperationalGate, 'OPERATIONAL_EVIDENCE_STALE'));

const futureOperationalGate = buildBundle();
futureOperationalGate.operationalGates.liveSecurityHeadersVerified.verifiedAt =
  '2026-10-28T00:02:00.000Z';
assert.ok(hasCode(futureOperationalGate, 'OPERATIONAL_EVIDENCE_AFTER_BUNDLE'));

const staleApplicationSha = buildBundle();
staleApplicationSha.operationalGates.liveStagingUatPassed.testedClientMainSha = 'b'.repeat(40);
assert.ok(hasCode(staleApplicationSha, 'OPERATIONAL_TEST_SHA_MISMATCH'));

const unsafeOperationalReference = buildBundle();
unsafeOperationalReference.operationalGates.customerAcceptanceApproved.evidenceRef =
  'owner@example.com';
assert.ok(hasCode(unsafeOperationalReference, 'OPERATIONAL_EVIDENCE_REFERENCE'));

const unknownRootField = buildBundle();
unknownRootField.privateNotes = 'must be rejected';
assert.ok(hasCode(unknownRootField, 'UNKNOWN_FIELD'));

const invalidBundleTimestamp = buildBundle();
invalidBundleTimestamp.generatedAt = '2026-02-30T00:00:00.000Z';
assert.ok(hasCode(invalidBundleTimestamp, 'RECORDED_AT'));

const unexpectedRepository = buildBundle();
unexpectedRepository.source.repository = 'example/untrusted';
assert.ok(hasCode(unexpectedRepository, 'SOURCE_REPOSITORY'));

const wrongSourceRef = buildBundle();
wrongSourceRef.source.ref = 'refs/heads/main';
assert.ok(hasCode(wrongSourceRef, 'SOURCE_REF'));

const missingRecoveryProof = buildBundle();
delete missingRecoveryProof.recoveryEvidence.receipts;
assert.ok(hasCode(missingRecoveryProof, 'RECOVERY_RECEIPTS'));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-gate-bundle-'));
try {
  const inputPath = path.join(tempDir, 'bundle.json');
  const passingReportPath = path.join(tempDir, 'private-report-output', 'passing-report.json');
  fs.writeFileSync(inputPath, JSON.stringify(buildCurrentBundle()), { mode: 0o600 });

  const passingRun = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputPath,
      '--report=' + passingReportPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(passingRun.status, 0, passingRun.stderr);
  assert.equal(fs.statSync(passingReportPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(passingReportPath)).mode & 0o777, 0o700);
  const passingReportText = fs.readFileSync(passingReportPath, 'utf8');
  const passingReport = JSON.parse(passingReportText);
  assert.equal(passingReport.outcome, 'contract-pass');
  assert.equal(passingReport.sourceSha, commitSha);
  assert.equal(passingReport.summary.releaseApproval, 'human-review-required');
  assert.deepEqual(passingReport.errorCodes, []);
  assert.equal(passingReportText.includes('https://github.com'), false);
  assert.equal(passingReportText.includes('scriptFingerprint'), false);

  const previousReportBytes = fs.readFileSync(passingReportPath);
  const overwriteExistingReport = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputPath,
      '--report=' + passingReportPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(overwriteExistingReport.status, 1);
  assert.match(overwriteExistingReport.stderr, /sanitized validation report could not be written/);
  assert.deepEqual(fs.readFileSync(passingReportPath), previousReportBytes);

  const blockedBundle = buildCurrentBundle();
  blockedBundle.sourceChecks.ciQuality.headSha = 'b'.repeat(40);
  blockedBundle.privateNotes = 'SENSITIVE-INTERNAL-NOTE';
  fs.writeFileSync(inputPath, JSON.stringify(blockedBundle), { mode: 0o600 });
  const blockedReportPath = path.join(tempDir, 'blocked-report.json');
  const blockedRun = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputPath,
      '--report=' + blockedReportPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(blockedRun.status, 1);
  assert.equal(fs.statSync(blockedReportPath).mode & 0o777, 0o600);
  const blockedReportText = fs.readFileSync(blockedReportPath, 'utf8');
  const blockedReport = JSON.parse(blockedReportText);
  assert.equal(blockedReport.outcome, 'blocked');
  assert.ok(blockedReport.errorCodes.includes('SOURCE_CHECK_SHA_MISMATCH'));
  assert.ok(blockedReport.errorCodes.includes('UNKNOWN_FIELD'));
  assert.equal(blockedReportText.includes('SENSITIVE-INTERNAL-NOTE'), false);
  assert.equal(blockedReportText.includes('https://github.com'), false);

  const overwriteAttempt = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputPath,
      '--report=' + inputPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(overwriteAttempt.status, 2);
  assert.match(overwriteAttempt.stderr, /must not overwrite the input bundle/);

  const repositoryInput = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      path.join(__dirname, 'fixtures', 'recovery-evidence.js'),
    ],
    { encoding: 'utf8' },
  );
  assert.equal(repositoryInput.status, 2);
  assert.match(repositoryInput.stderr, /input bundle must be stored outside the repository/);

  const repositoryReportPath = path.join(__dirname, '..', 'release-validation-test-report.json');
  const repositoryOutput = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputPath,
      '--report=' + repositoryReportPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(repositoryOutput.status, 2);
  assert.match(repositoryOutput.stderr, /validation report must be stored outside the repository/);
  assert.equal(fs.existsSync(repositoryReportPath), false);

  const inputSymlink = path.join(tempDir, 'bundle-link.json');
  fs.symlinkSync(inputPath, inputSymlink);
  const symlinkInputRun = spawnSync(
    process.execPath,
    [path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'), inputSymlink],
    { encoding: 'utf8' },
  );
  assert.equal(symlinkInputRun.status, 2);
  assert.match(symlinkInputRun.stderr, /input bundle must not be a symbolic link/);

  const symlinkTarget = path.join(tempDir, 'report-target.json');
  const symlinkReport = path.join(tempDir, 'report-link.json');
  fs.writeFileSync(symlinkTarget, 'leave this file unchanged', { mode: 0o600 });
  fs.symlinkSync(symlinkTarget, symlinkReport);
  const symlinkReportRun = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputPath,
      '--report=' + symlinkReport,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(symlinkReportRun.status, 2);
  assert.match(symlinkReportRun.stderr, /report output path is unsafe/);
  assert.equal(fs.readFileSync(symlinkTarget, 'utf8'), 'leave this file unchanged');

  const repositoryAlias = path.join(tempDir, 'repository-alias');
  fs.symlinkSync(path.join(__dirname, '..'), repositoryAlias, 'dir');
  const aliasedReportPath = path.join(repositoryAlias, 'private-release-report.json');
  const aliasedRepositoryOutput = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputPath,
      '--report=' + aliasedReportPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(aliasedRepositoryOutput.status, 2);
  assert.match(
    aliasedRepositoryOutput.stderr,
    /validation report must be stored outside the repository/,
  );
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'private-release-report.json')), false);

  const danglingReportTarget = path.join(__dirname, '..', 'dangling-release-report-test.json');
  const danglingReport = path.join(tempDir, 'dangling-report.json');
  fs.symlinkSync(danglingReportTarget, danglingReport);
  const danglingReportRun = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputPath,
      '--report=' + danglingReport,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(danglingReportRun.status, 1);
  assert.match(danglingReportRun.stderr, /sanitized validation report could not be written/);
  assert.equal(fs.existsSync(danglingReportTarget), false);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log(
  'Release gate bundle contract OK — same-SHA source checks, staging preflight boundaries,',
  'recovery evidence and all operational gate references are required.',
);
