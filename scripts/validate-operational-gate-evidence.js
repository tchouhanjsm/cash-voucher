'use strict';

const REPOSITORY = 'tchouhanjsm/cash-voucher';
const OPERATIONAL_GATE_EVIDENCE_TYPE = 'cash-voucher-operational-gate-evidence';
const SHA1 = /^[a-f0-9]{40}$/i;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SAFE_REFERENCE = /^[A-Z][A-Z0-9]{1,11}-[A-Z0-9][A-Z0-9._-]{1,70}$/;

const OPERATIONAL_GATE_CHECKS = Object.freeze({
  liveStagingUatPassed: Object.freeze([
    'dedicatedAccounts',
    'roleMatrix',
    'voucherCreateReadback',
    'editAndVoid',
    'refreshPersistence',
    'receiptConsistency',
    'noProductionMutation',
  ]),
  liveSecurityHeadersVerified: Object.freeze([
    'httpsRedirect',
    'strictTransportSecurity',
    'contentSecurityPolicy',
    'frameAncestors',
    'nosniff',
    'referrerPolicy',
  ]),
  liveRoleAuthorizationVerified: Object.freeze([
    'ownerAccess',
    'managerAccess',
    'staffRestrictions',
    'crossRoleDenial',
    'receiptAccessControl',
    'safeUnauthorizedResponses',
  ]),
  offlineReconnectVerified: Object.freeze([
    'offlineIndicator',
    'offlineReadOnlyBehavior',
    'queuedWriteVisibility',
    'reconnectSync',
    'duplicatePrevention',
    'conflictHandling',
  ]),
  printPdfVerified: Object.freeze([
    'voucherPreview',
    'paperLayout',
    'currencyAndDates',
    'pageBreaks',
    'browserPrint',
    'pdfOutput',
  ]),
  accessibilityVerified: Object.freeze([
    'keyboardNavigation',
    'visibleFocus',
    'labelsAndNames',
    'contrast',
    'zoomAndReflow',
    'screenReaderSmoke',
  ]),
  customerAcceptanceApproved: Object.freeze([
    'scopeReviewed',
    'criticalWorkflowsAccepted',
    'knownLimitationsAccepted',
    'dataOwnershipAccepted',
    'supportHandoverAccepted',
  ]),
});

const OPERATIONAL_GATE_REVIEWER_ROLES = Object.freeze({
  liveStagingUatPassed: Object.freeze(['owner', 'qa', 'staging-operator']),
  liveSecurityHeadersVerified: Object.freeze(['owner', 'security-reviewer']),
  liveRoleAuthorizationVerified: Object.freeze(['owner', 'qa', 'security-reviewer']),
  offlineReconnectVerified: Object.freeze(['owner', 'qa', 'customer-representative']),
  printPdfVerified: Object.freeze(['owner', 'qa', 'customer-representative']),
  accessibilityVerified: Object.freeze(['owner', 'qa', 'accessibility-reviewer']),
  customerAcceptanceApproved: Object.freeze(['customer-representative']),
});

const OPERATIONAL_GATE_VERIFICATION_METHODS = Object.freeze({
  liveStagingUatPassed: 'manual-live-uat',
  liveSecurityHeadersVerified: 'http-header-capture',
  liveRoleAuthorizationVerified: 'authorization-matrix',
  offlineReconnectVerified: 'device-reconnect-test',
  printPdfVerified: 'browser-print-pdf-test',
  accessibilityVerified: 'automated-and-manual-accessibility',
  customerAcceptanceApproved: 'customer-signoff',
});

const REQUIRED_EVIDENCE_FIELDS = [
  'schemaVersion',
  'evidenceType',
  'repository',
  'gate',
  'outcome',
  'evidenceRef',
  'verifiedAt',
  'testedClientMainSha',
  'reviewerRole',
  'verificationMethod',
  'sourceRecordRefs',
  'checks',
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function add(errors, code, message) {
  errors.push({ code, message });
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function exactKeys(value, keys, location, errors) {
  if (!isRecord(value)) {
    add(errors, 'OPERATIONAL_RECORD_OBJECT_REQUIRED', location + ' must be a JSON object.');
    return;
  }
  Object.keys(value).forEach((key) => {
    if (!keys.includes(key)) {
      add(errors, 'OPERATIONAL_RECORD_UNKNOWN_FIELD', location + ' contains an unsupported field.');
    }
  });
  keys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      add(errors, 'OPERATIONAL_RECORD_MISSING_FIELD', location + ' is missing a required field.');
    }
  });
}

/**
 * Validates the bytes retained for one non-governance operational gate.
 * This checks shape and bindings, not claim truth, reviewer identity or source authenticity.
 */
function validateOperationalGateEvidence(bytes, gateName, gate, commitSha) {
  const errors = [];
  const expectedChecks = OPERATIONAL_GATE_CHECKS[gateName];
  if (!expectedChecks) {
    return {
      ok: false,
      errors: [
        {
          code: 'OPERATIONAL_RECORD_GATE_UNSUPPORTED',
          message: 'No operational evidence contract exists for the requested gate.',
        },
      ],
    };
  }

  let evidence;
  try {
    evidence = JSON.parse(bytes.toString('utf8'));
  } catch {
    return {
      ok: false,
      errors: [
        {
          code: 'OPERATIONAL_RECORD_INVALID_JSON',
          message: 'Operational gate evidence must be a valid JSON record.',
        },
      ],
    };
  }
  if (!isRecord(evidence)) {
    return {
      ok: false,
      errors: [
        {
          code: 'OPERATIONAL_RECORD_OBJECT_REQUIRED',
          message: 'Operational gate evidence must be a JSON object.',
        },
      ],
    };
  }

  exactKeys(evidence, REQUIRED_EVIDENCE_FIELDS, 'operationalEvidence', errors);
  if (evidence.schemaVersion !== 1) {
    add(errors, 'OPERATIONAL_RECORD_VERSION', 'Unsupported operational evidence schema version.');
  }
  if (evidence.evidenceType !== OPERATIONAL_GATE_EVIDENCE_TYPE) {
    add(errors, 'OPERATIONAL_RECORD_TYPE', 'Unexpected operational evidence type.');
  }
  if (evidence.repository !== REPOSITORY) {
    add(
      errors,
      'OPERATIONAL_RECORD_REPOSITORY_MISMATCH',
      'Operational evidence must identify the expected repository.',
    );
  }
  if (evidence.gate !== gateName) {
    add(
      errors,
      'OPERATIONAL_RECORD_GATE_MISMATCH',
      'Operational evidence must identify the exact gate it supports.',
    );
  }
  if (!isRecord(gate) || evidence.evidenceRef !== gate.evidenceRef) {
    add(
      errors,
      'OPERATIONAL_RECORD_REFERENCE_MISMATCH',
      'Operational evidence reference must match the bundle gate.',
    );
  }
  if (evidence.outcome !== 'pass') {
    add(errors, 'OPERATIONAL_RECORD_NOT_PASSED', 'Operational evidence outcome must be pass.');
  }
  if (!validTimestamp(evidence.verifiedAt)) {
    add(
      errors,
      'OPERATIONAL_RECORD_TIMESTAMP_INVALID',
      'Operational evidence must use a canonical UTC verification timestamp.',
    );
  } else if (!isRecord(gate) || evidence.verifiedAt !== gate.verifiedAt) {
    add(
      errors,
      'OPERATIONAL_RECORD_TIMESTAMP_MISMATCH',
      'Operational evidence timestamp must exactly match the bundle gate.',
    );
  }
  if (
    typeof evidence.testedClientMainSha !== 'string' ||
    !SHA1.test(evidence.testedClientMainSha)
  ) {
    add(
      errors,
      'OPERATIONAL_RECORD_SHA_INVALID',
      'Operational evidence must include a full client-main SHA.',
    );
  } else if (evidence.testedClientMainSha.toLowerCase() !== String(commitSha || '').toLowerCase()) {
    add(
      errors,
      'OPERATIONAL_RECORD_SHA_MISMATCH',
      'Operational evidence must match the release bundle SHA.',
    );
  } else if (
    isRecord(gate) &&
    evidence.testedClientMainSha.toLowerCase() !==
      String(gate.testedClientMainSha || '').toLowerCase()
  ) {
    add(
      errors,
      'OPERATIONAL_RECORD_GATE_SHA_MISMATCH',
      'Operational evidence SHA must match the bundle gate SHA.',
    );
  }

  if (!OPERATIONAL_GATE_REVIEWER_ROLES[gateName].includes(evidence.reviewerRole)) {
    add(
      errors,
      'OPERATIONAL_RECORD_REVIEWER_ROLE',
      'Operational evidence reviewer role is not allowed for this gate.',
    );
  }
  if (evidence.verificationMethod !== OPERATIONAL_GATE_VERIFICATION_METHODS[gateName]) {
    add(
      errors,
      'OPERATIONAL_RECORD_METHOD_MISMATCH',
      'Operational evidence must use the gate-specific verification method.',
    );
  }

  if (
    !Array.isArray(evidence.sourceRecordRefs) ||
    evidence.sourceRecordRefs.length < 1 ||
    evidence.sourceRecordRefs.length > 8
  ) {
    add(
      errors,
      'OPERATIONAL_RECORD_SOURCE_REFS',
      'Operational evidence must reference one to eight supporting records.',
    );
  } else {
    const referencesValid = evidence.sourceRecordRefs.every(
      (reference) => typeof reference === 'string' && SAFE_REFERENCE.test(reference),
    );
    if (!referencesValid) {
      add(
        errors,
        'OPERATIONAL_RECORD_SOURCE_REF_UNSAFE',
        'Supporting record references must be safe non-path identifiers.',
      );
    }
    if (new Set(evidence.sourceRecordRefs).size !== evidence.sourceRecordRefs.length) {
      add(
        errors,
        'OPERATIONAL_RECORD_SOURCE_REF_DUPLICATE',
        'Supporting record references must be distinct.',
      );
    }
    if (isRecord(gate) && evidence.sourceRecordRefs.includes(gate.evidenceRef)) {
      add(
        errors,
        'OPERATIONAL_RECORD_SOURCE_REF_SELF',
        'A record cannot list itself as supporting evidence.',
      );
    }
  }

  exactKeys(evidence.checks, expectedChecks, 'operationalEvidence.checks', errors);
  if (isRecord(evidence.checks)) {
    expectedChecks.forEach((check) => {
      if (evidence.checks[check] !== true) {
        add(
          errors,
          'OPERATIONAL_RECORD_CHECK_FAILED',
          'Every required gate-specific check must be explicitly true.',
        );
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  OPERATIONAL_GATE_CHECKS,
  OPERATIONAL_GATE_REVIEWER_ROLES,
  OPERATIONAL_GATE_VERIFICATION_METHODS,
  OPERATIONAL_GATE_EVIDENCE_TYPE,
  validateOperationalGateEvidence,
};
