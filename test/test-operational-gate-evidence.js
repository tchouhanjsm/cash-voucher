'use strict';

const assert = require('node:assert/strict');
const {
  OPERATIONAL_GATE_CHECKS,
  OPERATIONAL_GATE_REVIEWER_ROLES,
  OPERATIONAL_GATE_VERIFICATION_METHODS,
  OPERATIONAL_GATE_EVIDENCE_TYPE,
  validateOperationalGateEvidence,
} = require('../scripts/validate-operational-gate-evidence');

const repository = 'tchouhanjsm/cash-voucher';
const clientMainSha = 'a'.repeat(40);
const verifiedAt = '2026-10-28T10:00:00.000Z';

function buildGate(name) {
  return {
    status: 'pass',
    evidenceRef: 'OPS-' + String(62000 + Object.keys(OPERATIONAL_GATE_CHECKS).indexOf(name)),
    verifiedAt,
    testedClientMainSha: clientMainSha,
  };
}

function buildEvidence(name, gate, overrides = {}) {
  const index = Object.keys(OPERATIONAL_GATE_CHECKS).indexOf(name);
  return {
    schemaVersion: 1,
    evidenceType: OPERATIONAL_GATE_EVIDENCE_TYPE,
    repository,
    gate: name,
    outcome: 'pass',
    evidenceRef: gate.evidenceRef,
    verifiedAt: gate.verifiedAt,
    testedClientMainSha: clientMainSha,
    reviewerRole: OPERATIONAL_GATE_REVIEWER_ROLES[name][0],
    verificationMethod: OPERATIONAL_GATE_VERIFICATION_METHODS[name],
    sourceRecordRefs: [
      'RUN-' + String(72100 + index).padStart(5, '0'),
      'QA-' + String(72200 + index).padStart(5, '0'),
    ],
    checks: Object.fromEntries(OPERATIONAL_GATE_CHECKS[name].map((check) => [check, true])),
    ...overrides,
  };
}

function validate(name, evidence, gate = buildGate(name)) {
  return validateOperationalGateEvidence(Buffer.from(JSON.stringify(evidence)), name, gate, clientMainSha);
}

for (const name of Object.keys(OPERATIONAL_GATE_CHECKS)) {
  const result = validate(name, buildEvidence(name, buildGate(name)));
  assert.equal(result.ok, true, name + ': ' + JSON.stringify(result.errors));
}
assert.equal(Object.keys(OPERATIONAL_GATE_CHECKS).length, 7);

function expectFailure(name, overrides, code) {
  const result = validate(name, buildEvidence(name, buildGate(name), overrides));
  assert.equal(result.ok, false, code);
  assert.ok(result.errors.some((error) => error.code === code), JSON.stringify(result.errors));
}

expectFailure('liveStagingUatPassed', { evidenceType: 'arbitrary-file' }, 'OPERATIONAL_RECORD_TYPE');
expectFailure('liveStagingUatPassed', { repository: 'fork/other-app' }, 'OPERATIONAL_RECORD_REPOSITORY_MISMATCH');
expectFailure('liveStagingUatPassed', { gate: 'liveSecurityHeadersVerified' }, 'OPERATIONAL_RECORD_GATE_MISMATCH');
expectFailure('liveStagingUatPassed', { evidenceRef: 'OPS-99999' }, 'OPERATIONAL_RECORD_REFERENCE_MISMATCH');
expectFailure('liveStagingUatPassed', { outcome: 'blocked' }, 'OPERATIONAL_RECORD_NOT_PASSED');
expectFailure('liveStagingUatPassed', { verifiedAt: '2026-02-30T10:00:00.000Z' }, 'OPERATIONAL_RECORD_TIMESTAMP_INVALID');
expectFailure('liveStagingUatPassed', { verifiedAt: '2026-10-28T09:00:00.000Z' }, 'OPERATIONAL_RECORD_TIMESTAMP_MISMATCH');
expectFailure('liveStagingUatPassed', { testedClientMainSha: 'b'.repeat(40) }, 'OPERATIONAL_RECORD_SHA_MISMATCH');
expectFailure('liveStagingUatPassed', { reviewerRole: 'untrusted-role' }, 'OPERATIONAL_RECORD_REVIEWER_ROLE');
expectFailure('liveStagingUatPassed', { verificationMethod: 'self-attestation-only' }, 'OPERATIONAL_RECORD_METHOD_MISMATCH');
expectFailure('liveStagingUatPassed', { sourceRecordRefs: [] }, 'OPERATIONAL_RECORD_SOURCE_REFS');
expectFailure('liveStagingUatPassed', { sourceRecordRefs: ['../private/file'] }, 'OPERATIONAL_RECORD_SOURCE_REF_UNSAFE');
expectFailure('liveStagingUatPassed', { sourceRecordRefs: ['QA-12345', 'QA-12345'] }, 'OPERATIONAL_RECORD_SOURCE_REF_DUPLICATE');
expectFailure('liveStagingUatPassed', { sourceRecordRefs: [buildGate('liveStagingUatPassed').evidenceRef] }, 'OPERATIONAL_RECORD_SOURCE_REF_SELF');
expectFailure(
  'liveStagingUatPassed',
  { checks: { ...buildEvidence('liveStagingUatPassed', buildGate('liveStagingUatPassed')).checks, voucherCreateReadback: false } },
  'OPERATIONAL_RECORD_CHECK_FAILED',
);
expectFailure('liveSecurityHeadersVerified', { checks: { httpsRedirect: true } }, 'OPERATIONAL_RECORD_MISSING_FIELD');
expectFailure('customerAcceptanceApproved', { reviewerRole: 'owner' }, 'OPERATIONAL_RECORD_REVIEWER_ROLE');

const unknownGate = validateOperationalGateEvidence(Buffer.from('{}'), 'not-a-release-gate', buildGate('liveStagingUatPassed'), clientMainSha);
assert.ok(unknownGate.errors.some((error) => error.code === 'OPERATIONAL_RECORD_GATE_UNSUPPORTED'));
const invalidJson = validateOperationalGateEvidence(Buffer.from('{invalid'), 'liveStagingUatPassed', buildGate('liveStagingUatPassed'), clientMainSha);
assert.ok(invalidJson.errors.some((error) => error.code === 'OPERATIONAL_RECORD_INVALID_JSON'));
const evidence = buildEvidence('liveStagingUatPassed', buildGate('liveStagingUatPassed'));
const shaDrift = validateOperationalGateEvidence(Buffer.from(JSON.stringify(evidence)), 'liveStagingUatPassed', { ...buildGate('liveStagingUatPassed'), testedClientMainSha: 'b'.repeat(40) }, clientMainSha);
assert.ok(shaDrift.errors.some((error) => error.code === 'OPERATIONAL_RECORD_GATE_SHA_MISMATCH'));

console.log(
  'Operational gate evidence contract OK — seven gate-specific JSON schemas, exact source-SHA/time/reference binding, reviewer/method constraints and explicit required checks.',
);
