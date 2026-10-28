'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  GOVERNANCE_EVIDENCE_TYPE,
  REQUIRED_GOVERNANCE_CHECK_GROUPS,
  REQUIRED_OPERATIONAL_GATES,
  REQUIRED_SOURCE_CHECKS,
  SOURCE_CHECK_WORKFLOW_NAMES,
  resolveOperationalEvidenceDirectory,
  validateReleaseGateBundle,
  verifyOperationalEvidenceDigests,
  verifySourceRunProvenance,
  SOURCE_WORKFLOW_FILES,
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
    const runId = String(50101 + index);
    sourceChecks[name] = {
      conclusion: 'success',
      headSha: commitSha,
      runId,
      repository,
      workflowName: SOURCE_CHECK_WORKFLOW_NAMES[name],
      event: 'push',
      ref,
      runUrl: 'https://github.com/' + repository + '/actions/runs/' + runId,
    };
  });

  const operationalGates = {};
  REQUIRED_OPERATIONAL_GATES.forEach((name, index) => {
    operationalGates[name] = {
      status: 'pass',
      evidenceRef: 'OPS-' + String(60101 + index),
      evidenceSha256: String(index + 1).padStart(64, '0'),
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
  return validateReleaseGateBundle(bundle, validationTime).errors.some(
    (error) => error.code === code,
  );
}

async function runProvenanceTests() {
  const bundle = buildBundle();
  const fakeRun = (key, evidence) => ({
    id: Number(evidence.runId),
    path: '.github/workflows/' + SOURCE_WORKFLOW_FILES[key],
    repository: { full_name: repository },
    head_branch: 'client-main',
    event: 'push',
    head_sha: commitSha,
    status: 'completed',
    conclusion: 'success',
    html_url: 'https://github.com/' + repository + '/actions/runs/' + evidence.runId,
  });
  const passing = await verifySourceRunProvenance(bundle, async (runId) => {
    const key = REQUIRED_SOURCE_CHECKS.find((name) => bundle.sourceChecks[name].runId === runId);
    assert.ok(key);
    return fakeRun(key, bundle.sourceChecks[key]);
  });
  assert.equal(passing.ok, true, JSON.stringify(passing.errors));
  assert.equal(passing.verifiedCount, 4);

  const cases = [
    [
      (run) => {
        run.repository.full_name = 'attacker/fork';
      },
      'SOURCE_PROVENANCE_REPOSITORY_MISMATCH',
    ],
    [
      (run) => {
        run.path = '.github/workflows/release.yml';
      },
      'SOURCE_PROVENANCE_WORKFLOW_MISMATCH',
    ],
    [
      (run) => {
        run.head_branch = 'main';
      },
      'SOURCE_PROVENANCE_REF_MISMATCH',
    ],
    [
      (run) => {
        run.event = 'pull_request';
      },
      'SOURCE_PROVENANCE_EVENT_MISMATCH',
    ],
    [
      (run) => {
        run.head_sha = 'b'.repeat(40);
      },
      'SOURCE_PROVENANCE_SHA_MISMATCH',
    ],
    [
      (run) => {
        run.conclusion = 'failure';
      },
      'SOURCE_PROVENANCE_NOT_SUCCESSFUL',
    ],
    [
      (run) => {
        run.status = 'in_progress';
      },
      'SOURCE_PROVENANCE_NOT_SUCCESSFUL',
    ],
    [
      (run) => {
        run.html_url = 'https://example.test/forged';
      },
      'SOURCE_PROVENANCE_URL_MISMATCH',
    ],
    [
      (run) => {
        run.id = 99999;
      },
      'SOURCE_PROVENANCE_RUN_ID_MISMATCH',
    ],
  ];
  for (const [mutate, expected] of cases) {
    const result = await verifySourceRunProvenance(bundle, async (runId) => {
      const key = REQUIRED_SOURCE_CHECKS.find((name) => bundle.sourceChecks[name].runId === runId);
      const run = fakeRun(key, bundle.sourceChecks[key]);
      if (key === 'ciQuality') mutate(run);
      return run;
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((error) => error.code === expected),
      expected,
    );
  }
  const missing = await verifySourceRunProvenance(bundle, async () => null);
  assert.ok(missing.errors.some((error) => error.code === 'SOURCE_PROVENANCE_RUN_MISSING'));
  const lookupFailure = await verifySourceRunProvenance(bundle, async () => {
    throw new Error('sensitive API detail');
  });
  assert.ok(lookupFailure.errors.some((error) => error.code === 'SOURCE_PROVENANCE_LOOKUP_FAILED'));
  assert.equal(JSON.stringify(lookupFailure).includes('sensitive API detail'), false);
  const malformed = buildBundle();
  malformed.sourceChecks.fullFlight.headSha = 'b'.repeat(40);
  const shouldNotQuery = await verifySourceRunProvenance(malformed, async () => {
    throw new Error('must not query');
  });
  assert.ok(
    shouldNotQuery.errors.some((error) => error.code === 'SOURCE_PROVENANCE_STRUCTURE_BLOCKED'),
  );
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

const wrongSourceRepository = buildBundle();
wrongSourceRepository.sourceChecks.ciQuality.repository = 'another/repository';
assert.ok(hasCode(wrongSourceRepository, 'SOURCE_CHECK_REPOSITORY'));

const wrongWorkflowName = buildBundle();
wrongWorkflowName.sourceChecks.browserE2e.workflowName = 'CI';
assert.ok(hasCode(wrongWorkflowName, 'SOURCE_CHECK_WORKFLOW'));

const pullRequestRun = buildBundle();
pullRequestRun.sourceChecks.ciQuality.event = 'pull_request';
assert.ok(hasCode(pullRequestRun, 'SOURCE_CHECK_EVENT'));

const wrongSourceBranch = buildBundle();
wrongSourceBranch.sourceChecks.fullFlight.ref = 'refs/heads/main';
assert.ok(hasCode(wrongSourceBranch, 'SOURCE_CHECK_REF'));

const wrongSourceRunUrl = buildBundle();
wrongSourceRunUrl.sourceChecks.autonomousMonitor.runUrl = 'https://example.test/forged-run';
assert.ok(hasCode(wrongSourceRunUrl, 'SOURCE_CHECK_RUN_URL'));

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

const missingOperationalDigest = buildBundle();
delete missingOperationalDigest.operationalGates.liveStagingUatPassed.evidenceSha256;
assert.ok(hasCode(missingOperationalDigest, 'MISSING_FIELD'));

const malformedOperationalDigest = buildBundle();
malformedOperationalDigest.operationalGates.customerAcceptanceApproved.evidenceSha256 =
  'not-a-sha256-digest';
assert.ok(hasCode(malformedOperationalDigest, 'OPERATIONAL_EVIDENCE_DIGEST'));

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

function writeEvidenceFiles(directory, bundle) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const payloads = new Map();
  Object.entries(bundle.operationalGates).forEach(([name, gate]) => {
    let bytes;
    if (name === 'ownerBranchProtectionVerified') {
      const governanceEvidence = {
        schemaVersion: 1,
        evidenceType: GOVERNANCE_EVIDENCE_TYPE,
        repository,
        observedAt: gate.verifiedAt,
        ok: true,
        defaultBranch: 'client-main',
        integrationPolicy: 'classic-branch-protection',
        requiredCheckGroups: REQUIRED_GOVERNANCE_CHECK_GROUPS,
        integrationRulesetIds: [],
        legacyFreezeRulesetIds: [102],
        readOnly: true,
        errors: [],
      };
      bytes = Buffer.from(JSON.stringify(governanceEvidence, null, 2) + String.fromCharCode(10));
    } else {
      bytes = Buffer.from(
        'Synthetic evidence fixture for ' + gate.evidenceRef + String.fromCharCode(10),
      );
    }
    gate.evidenceSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(path.join(directory, gate.evidenceRef + '.evidence'), bytes, {
      mode: 0o600,
      flag: 'wx',
    });
    payloads.set(gate.evidenceRef, bytes);
  });
  return payloads;
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-gate-bundle-'));
try {
  const inputPath = path.join(tempDir, 'bundle.json');
  const evidenceDirectory = path.join(tempDir, 'private-evidence');
  const passingReportPath = path.join(tempDir, 'private-report-output', 'passing-report.json');
  const passingBundle = buildCurrentBundle();
  const evidencePayloads = writeEvidenceFiles(evidenceDirectory, passingBundle);
  fs.writeFileSync(inputPath, JSON.stringify(passingBundle), { mode: 0o600 });
  const missingEvidenceDirectoryRun = spawnSync(
    process.execPath,
    [path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'), inputPath],
    { encoding: 'utf8' },
  );
  assert.equal(missingEvidenceDirectoryRun.status, 2);
  assert.match(missingEvidenceDirectoryRun.stderr, /--evidence-dir/);

  const directDigestCheck = verifyOperationalEvidenceDigests(
    passingBundle,
    resolveOperationalEvidenceDirectory(evidenceDirectory),
  );
  assert.deepEqual(directDigestCheck.errors, []);
  assert.equal(directDigestCheck.verifiedCount, 8);

  const governanceGate = passingBundle.operationalGates.ownerBranchProtectionVerified;
  const governancePath = path.join(
    evidenceDirectory,
    governanceGate.evidenceRef + '.evidence',
  );
  const validGovernanceBytes = fs.readFileSync(governancePath);
  const badGovernanceBundle = JSON.parse(JSON.stringify(passingBundle));
  const badGovernanceReport = JSON.parse(validGovernanceBytes.toString('utf8'));
  badGovernanceReport.defaultBranch = 'main';
  const badGovernanceBytes = Buffer.from(
    JSON.stringify(badGovernanceReport, null, 2) + String.fromCharCode(10),
  );
  fs.writeFileSync(governancePath, badGovernanceBytes, { mode: 0o600 });
  badGovernanceBundle.operationalGates.ownerBranchProtectionVerified.evidenceSha256 =
    crypto.createHash('sha256').update(badGovernanceBytes).digest('hex');
  const badGovernanceCheck = verifyOperationalEvidenceDigests(
    badGovernanceBundle,
    resolveOperationalEvidenceDirectory(evidenceDirectory),
  );
  assert.ok(
    badGovernanceCheck.errors.some((error) => error.code === 'GOVERNANCE_DEFAULT_BRANCH'),
  );
  assert.equal(badGovernanceCheck.verifiedCount, 7);
  fs.writeFileSync(governancePath, validGovernanceBytes, { mode: 0o600 });

  const timestampMismatchReport = JSON.parse(validGovernanceBytes.toString('utf8'));
  timestampMismatchReport.observedAt = '2026-10-27T23:29:00.000Z';
  const timestampMismatchBytes = Buffer.from(
    JSON.stringify(timestampMismatchReport, null, 2) + String.fromCharCode(10),
  );
  fs.writeFileSync(governancePath, timestampMismatchBytes, { mode: 0o600 });
  const timestampMismatchBundle = JSON.parse(JSON.stringify(passingBundle));
  timestampMismatchBundle.operationalGates.ownerBranchProtectionVerified.evidenceSha256 =
    crypto.createHash('sha256').update(timestampMismatchBytes).digest('hex');
  const timestampMismatchCheck = verifyOperationalEvidenceDigests(
    timestampMismatchBundle,
    resolveOperationalEvidenceDirectory(evidenceDirectory),
  );
  assert.ok(
    timestampMismatchCheck.errors.some(
      (error) => error.code === 'GOVERNANCE_TIMESTAMP_MISMATCH',
    ),
  );
  fs.writeFileSync(governancePath, validGovernanceBytes, { mode: 0o600 });


  if (process.platform !== 'win32') {
    const permissionGate = passingBundle.operationalGates.liveStagingUatPassed;
    const permissionPath = path.join(evidenceDirectory, permissionGate.evidenceRef + '.evidence');
    fs.chmodSync(permissionPath, 0o644);
    const permissionCheck = verifyOperationalEvidenceDigests(
      passingBundle,
      resolveOperationalEvidenceDirectory(evidenceDirectory),
    );
    assert.ok(
      permissionCheck.errors.some(
        (error) => error.code === 'OPERATIONAL_EVIDENCE_FILE_PERMISSIONS',
      ),
    );
    fs.chmodSync(permissionPath, 0o600);
  }

  const oversizedGate = passingBundle.operationalGates.liveRoleAuthorizationVerified;
  const oversizedRecordPath = path.join(evidenceDirectory, oversizedGate.evidenceRef + '.evidence');
  const heldOversizedRecord = fs.readFileSync(oversizedRecordPath);
  fs.truncateSync(oversizedRecordPath, 10 * 1024 * 1024 + 1);
  const oversizedCheck = verifyOperationalEvidenceDigests(
    passingBundle,
    resolveOperationalEvidenceDirectory(evidenceDirectory),
  );
  assert.ok(
    oversizedCheck.errors.some((error) => error.code === 'OPERATIONAL_EVIDENCE_FILE_TOO_LARGE'),
  );
  fs.writeFileSync(oversizedRecordPath, heldOversizedRecord, { mode: 0o600 });

  const unsafeReferenceBundle = buildCurrentBundle();
  unsafeReferenceBundle.operationalGates.liveStagingUatPassed.evidenceRef = '../../escape';
  const unsafeReferenceCheck = verifyOperationalEvidenceDigests(
    unsafeReferenceBundle,
    resolveOperationalEvidenceDirectory(evidenceDirectory),
  );
  assert.ok(
    unsafeReferenceCheck.errors.some((error) => error.code === 'OPERATIONAL_EVIDENCE_REF_UNSAFE'),
  );

  const passingRun = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputPath,
      '--evidence-dir=' + evidenceDirectory,
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
  assert.equal(passingReport.summary.operationalEvidenceDigestsVerified, 8);
  assert.deepEqual(passingReport.errorCodes, []);
  assert.equal(passingReportText.includes('https://github.com'), false);
  assert.equal(passingReportText.includes('scriptFingerprint'), false);

  assert.equal(passingReport.summary.operationalEvidenceDigestsVerified, 8);
  assert.throws(
    () => resolveOperationalEvidenceDirectory(path.join(__dirname, 'fixtures')),
    /EVIDENCE_DIR_INSIDE_REPOSITORY/,
  );

  const evidenceDirectoryAlias = path.join(tempDir, 'evidence-directory-alias');
  fs.symlinkSync(evidenceDirectory, evidenceDirectoryAlias, 'dir');
  assert.throws(
    () => resolveOperationalEvidenceDirectory(evidenceDirectoryAlias),
    /EVIDENCE_DIR_UNSAFE/,
  );

  if (process.platform !== 'win32') {
    fs.chmodSync(evidenceDirectory, 0o755);
    assert.throws(
      () => resolveOperationalEvidenceDirectory(evidenceDirectory),
      /EVIDENCE_DIR_PERMISSIONS/,
    );
    fs.chmodSync(evidenceDirectory, 0o700);
  }

  const digestMismatchGate = passingBundle.operationalGates.liveStagingUatPassed;
  const digestMismatchPath = path.join(
    evidenceDirectory,
    digestMismatchGate.evidenceRef + '.evidence',
  );
  fs.writeFileSync(digestMismatchPath, 'tampered operational record', { mode: 0o600 });
  const digestMismatchReportPath = path.join(tempDir, 'digest-mismatch-report.json');
  const digestMismatchRun = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputPath,
      '--evidence-dir=' + evidenceDirectory,
      '--report=' + digestMismatchReportPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(digestMismatchRun.status, 1);
  const digestMismatchReportText = fs.readFileSync(digestMismatchReportPath, 'utf8');
  const digestMismatchReport = JSON.parse(digestMismatchReportText);
  assert.equal(digestMismatchReport.outcome, 'blocked');
  assert.ok(digestMismatchReport.errorCodes.includes('OPERATIONAL_EVIDENCE_HASH_MISMATCH'));
  assert.equal(digestMismatchReportText.includes(digestMismatchGate.evidenceRef), false);
  assert.equal(digestMismatchReportText.includes(digestMismatchGate.evidenceSha256), false);
  fs.writeFileSync(digestMismatchPath, evidencePayloads.get(digestMismatchGate.evidenceRef), {
    mode: 0o600,
  });

  const missingRecordGate = passingBundle.operationalGates.printPdfVerified;
  const missingRecordPath = path.join(
    evidenceDirectory,
    missingRecordGate.evidenceRef + '.evidence',
  );
  const heldMissingRecord = fs.readFileSync(missingRecordPath);
  fs.unlinkSync(missingRecordPath);
  const missingRecordReportPath = path.join(tempDir, 'missing-record-report.json');
  const missingRecordRun = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputPath,
      '--evidence-dir=' + evidenceDirectory,
      '--report=' + missingRecordReportPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(missingRecordRun.status, 1);
  assert.ok(
    JSON.parse(fs.readFileSync(missingRecordReportPath, 'utf8')).errorCodes.includes(
      'OPERATIONAL_EVIDENCE_FILE_MISSING',
    ),
  );
  fs.writeFileSync(missingRecordPath, heldMissingRecord, { mode: 0o600 });

  const symlinkRecordGate = passingBundle.operationalGates.accessibilityVerified;
  const symlinkRecordPath = path.join(
    evidenceDirectory,
    symlinkRecordGate.evidenceRef + '.evidence',
  );
  const symlinkRecordTarget = path.join(tempDir, 'outside-evidence-target');
  fs.renameSync(symlinkRecordPath, symlinkRecordTarget);
  fs.symlinkSync(symlinkRecordTarget, symlinkRecordPath);
  const symlinkRecordReportPath = path.join(tempDir, 'symlink-record-report.json');
  const symlinkRecordRun = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputPath,
      '--evidence-dir=' + evidenceDirectory,
      '--report=' + symlinkRecordReportPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(symlinkRecordRun.status, 1);
  assert.ok(
    JSON.parse(fs.readFileSync(symlinkRecordReportPath, 'utf8')).errorCodes.includes(
      'OPERATIONAL_EVIDENCE_FILE_UNSAFE',
    ),
  );
  fs.unlinkSync(symlinkRecordPath);
  fs.renameSync(symlinkRecordTarget, symlinkRecordPath);

  const previousReportBytes = fs.readFileSync(passingReportPath);
  const overwriteExistingReport = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputPath,
      '--evidence-dir=' + evidenceDirectory,
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
      '--evidence-dir=' + evidenceDirectory,
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
      '--evidence-dir=' + evidenceDirectory,
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
      '--evidence-dir=' + evidenceDirectory,
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
      '--evidence-dir=' + evidenceDirectory,
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
    [
      path.join(__dirname, '..', 'scripts', 'validate-release-gate-bundle.js'),
      inputSymlink,
      '--evidence-dir=' + evidenceDirectory,
    ],
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
      '--evidence-dir=' + evidenceDirectory,
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
      '--evidence-dir=' + evidenceDirectory,
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
      '--evidence-dir=' + evidenceDirectory,
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

runProvenanceTests()
  .then(() => {
    console.log(
      'Release gate bundle contract OK — same-SHA source checks, staging preflight boundaries,',
      'recovery evidence and all operational gate references are required.',
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
