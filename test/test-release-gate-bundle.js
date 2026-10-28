'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_OPERATIONAL_GATES,
  REQUIRED_SOURCE_CHECKS,
  validateReleaseGateBundle,
} = require('../scripts/validate-release-gate-bundle');
const { buildRecoveryEvidence } = require('./fixtures/recovery-evidence');

const repository = 'tchouhanjsm/cash-voucher';
const ref = 'refs/heads/client-main';
const commitSha = 'a'.repeat(40);

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

function hasCode(bundle, code) {
  return validateReleaseGateBundle(bundle).errors.some((error) => error.code === code);
}

const valid = validateReleaseGateBundle(buildBundle());
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

const recoveryAfterBundle = buildBundle();
recoveryAfterBundle.recoveryEvidence.recordedAt = '2026-10-28T00:02:00.000Z';
assert.ok(hasCode(recoveryAfterBundle, 'RECOVERY_AFTER_BUNDLE'));

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

const unsafeOperationalReference = buildBundle();
unsafeOperationalReference.operationalGates.customerAcceptanceApproved.evidenceRef =
  'owner@example.com';
assert.ok(hasCode(unsafeOperationalReference, 'OPERATIONAL_EVIDENCE_REFERENCE'));

const unknownRootField = buildBundle();
unknownRootField.privateNotes = 'must be rejected';
assert.ok(hasCode(unknownRootField, 'UNKNOWN_FIELD'));

const missingRecoveryProof = buildBundle();
delete missingRecoveryProof.recoveryEvidence.receipts;
assert.ok(hasCode(missingRecoveryProof, 'RECOVERY_RECEIPTS'));

console.log(
  'Release gate bundle contract OK — same-SHA source checks, staging preflight boundaries,',
  'recovery evidence and all operational gate references are required.',
);
