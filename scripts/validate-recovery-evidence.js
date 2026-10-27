'use strict';

const fs = require('node:fs');

const REQUIRED_SHEETS = [
  'Users',
  'Vouchers',
  'Vendors',
  'Settings',
  'AuditLog',
  'CashCloses',
  'CashCloseCorrections',
];
const SHA1 = /^[a-f0-9]{40}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SENSITIVE_KEY = new RegExp(
  [
    'password',
    'secret',
    'token',
    'credential',
    'email',
    'api.?url',
    'raw.?transcript',
    'raw.?log',
    '(?:script|spreadsheet|receipt|backup|deployment|resource|folder)[_-]?id',
  ].join('|'),
  'i',
);
const RESOURCE_KEYS = [
  'scriptFingerprint',
  'deploymentFingerprint',
  'spreadsheetFingerprint',
  'receiptFolderFingerprint',
  'backupFolderFingerprint',
];
const REQUIRED_CHECKS = [
  'sourceSnapshotIntegrityPassed',
  'recoveryDestinationIsolated',
  'restoreCompleted',
  'requiredSheetsAndHeadersVerified',
  'rowCountsReconciled',
  'voucherIdsAndNumbersReconciled',
  'receiptManifestReconciled',
  'sampleReceiptReadbackPassed',
  'productionUnchanged',
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function addError(errors, code, message) {
  errors.push({ code, message });
}

function rejectUnknownKeys(value, allowedKeys, path, errors) {
  if (!isRecord(value)) return;
  Object.keys(value).forEach((key) => {
    if (!allowedKeys.includes(key)) {
      addError(
        errors,
        'UNKNOWN_FIELD',
        'Unexpected evidence field is not allowed (' + path + '.' + key + ').',
      );
    }
  });
}

function inspectSensitiveKeys(value, path, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      inspectSensitiveKeys(item, path + '[' + index + ']', errors);
    });
    return;
  }
  if (!isRecord(value)) return;

  Object.keys(value).forEach((key) => {
    if (SENSITIVE_KEY.test(key)) {
      addError(
        errors,
        'SENSITIVE_FIELD',
        'Evidence must not contain sensitive field names (' + path + '.' + key + ').',
      );
    }
    inspectSensitiveKeys(value[key], path + '.' + key, errors);
  });
}

function validateRecoveryEvidence(evidence) {
  const errors = [];
  const add = (code, message) => addError(errors, code, message);
  if (!isRecord(evidence)) {
    return { ok: false, errors: [{ code: 'ROOT', message: 'Evidence must be a JSON object.' }] };
  }

  rejectUnknownKeys(
    evidence,
    [
      'schemaVersion',
      'evidenceType',
      'recordedAt',
      'source',
      'resources',
      'restore',
      'operator',
      'ownerApproval',
      'checks',
      'sheets',
      'voucherReconciliation',
      'receipts',
      'productionState',
    ],
    '$',
    errors,
  );
  inspectSensitiveKeys(evidence, '$', errors);

  if (evidence.schemaVersion !== 1) {
    add('SCHEMA_VERSION', 'schemaVersion must equal 1.');
  }
  if (evidence.evidenceType !== 'cash-voucher-recovery-drill') {
    add('EVIDENCE_TYPE', 'evidenceType must be cash-voucher-recovery-drill.');
  }
  if (!validTimestamp(evidence.recordedAt)) {
    add('RECORDED_AT', 'recordedAt must be a canonical UTC timestamp.');
  }

  const source = evidence.source;
  if (!isRecord(source)) {
    add('SOURCE', 'source metadata is required.');
  } else {
    rejectUnknownKeys(
      source,
      [
        'clientMainSha',
        'snapshotFingerprint',
        'snapshotCreatedAt',
        'manifestSha256',
        'integrityReportState',
      ],
      '$.source',
      errors,
    );
    if (typeof source.clientMainSha !== 'string' || !SHA1.test(source.clientMainSha)) {
      add('SOURCE_SHA', 'source.clientMainSha must be a full 40-character commit SHA.');
    }
    if (typeof source.snapshotFingerprint !== 'string' || !SHA256.test(source.snapshotFingerprint)) {
      add(
        'SNAPSHOT_FINGERPRINT',
        'source.snapshotFingerprint must be a SHA-256 fingerprint, not a raw resource identifier.',
      );
    }
    if (typeof source.manifestSha256 !== 'string' || !SHA256.test(source.manifestSha256)) {
      add('MANIFEST_DIGEST', 'source.manifestSha256 must be a SHA-256 digest.');
    }
    if (!validTimestamp(source.snapshotCreatedAt)) {
      add('SNAPSHOT_TIMESTAMP', 'source.snapshotCreatedAt must be a canonical UTC timestamp.');
    } else if (
      validTimestamp(evidence.recordedAt) &&
      Date.parse(source.snapshotCreatedAt) > Date.parse(evidence.recordedAt)
    ) {
      add('SNAPSHOT_FUTURE', 'The source snapshot cannot be newer than the recorded evidence.');
    }
    if (source.integrityReportState !== 'pass') {
      add('SNAPSHOT_INTEGRITY', 'The selected snapshot must have a passing integrity report.');
    }
  }

  const resources = evidence.resources;
  const fingerprints = [];
  if (!isRecord(resources) || !isRecord(resources.production) || !isRecord(resources.recovery)) {
    add('RESOURCES', 'Production and recovery resource fingerprint inventories are required.');
  } else {
    rejectUnknownKeys(resources, ['production', 'recovery'], '$.resources', errors);
    ['production', 'recovery'].forEach((environment) => {
      rejectUnknownKeys(resources[environment], RESOURCE_KEYS, '$.resources.' + environment, errors);
      RESOURCE_KEYS.forEach((key) => {
        const fingerprint = resources[environment][key];
        if (typeof fingerprint !== 'string' || !SHA256.test(fingerprint)) {
          add(
            'RESOURCE_FINGERPRINT',
            'resources.' + environment + '.' + key + ' must be a SHA-256 fingerprint.',
          );
        } else {
          fingerprints.push({
            environment,
            key,
            fingerprint: fingerprint.toLowerCase(),
          });
        }
      });
    });

    const seen = new Set();
    fingerprints.forEach((item) => {
      if (seen.has(item.fingerprint)) {
        add(
          'RESOURCE_COLLISION',
          'Production and recovery resource fingerprints must all be distinct.',
        );
      }
      seen.add(item.fingerprint);
    });
    if (
      isRecord(source) &&
      typeof source.snapshotFingerprint === 'string' &&
      SHA256.test(source.snapshotFingerprint) &&
      seen.has(source.snapshotFingerprint.toLowerCase())
    ) {
      add(
        'SNAPSHOT_COLLISION',
        'The selected snapshot fingerprint must differ from every configured resource fingerprint.',
      );
    }
  }

  const restore = evidence.restore;
  if (!isRecord(restore)) {
    add('RESTORE', 'Restore execution metadata is required.');
  } else {
    rejectUnknownKeys(
      restore,
      ['result', 'startedAt', 'completedAt', 'deployedVersion', 'deployedClientMainSha'],
      '$.restore',
      errors,
    );
    if (restore.result !== 'success') {
      add('RESTORE_RESULT', 'The restore result must be success.');
    }
    if (!validTimestamp(restore.startedAt) || !validTimestamp(restore.completedAt)) {
      add('RESTORE_TIMESTAMPS', 'Restore start and completion must be canonical UTC timestamps.');
    } else {
      if (Date.parse(restore.completedAt) < Date.parse(restore.startedAt)) {
        add('RESTORE_ORDER', 'Restore completion cannot precede its start.');
      }
      if (
        validTimestamp(evidence.recordedAt) &&
        Date.parse(restore.completedAt) > Date.parse(evidence.recordedAt)
      ) {
        add('RESTORE_FUTURE', 'Restore completion cannot be newer than the recorded evidence.');
      }
    }
    if (
      typeof restore.deployedClientMainSha !== 'string' ||
      !SHA1.test(restore.deployedClientMainSha)
    ) {
      add('DEPLOYED_SHA', 'restore.deployedClientMainSha must be a full 40-character commit SHA.');
    } else if (
      isRecord(source) &&
      typeof source.clientMainSha === 'string' &&
      SHA1.test(source.clientMainSha) &&
      restore.deployedClientMainSha.toLowerCase() !== source.clientMainSha.toLowerCase()
    ) {
      add('DEPLOYED_SHA_MISMATCH', 'The recorded restore source SHA must match the selected integration SHA.');
    }
    if (
      isRecord(source) &&
      validTimestamp(source.snapshotCreatedAt) &&
      validTimestamp(restore.startedAt) &&
      Date.parse(source.snapshotCreatedAt) > Date.parse(restore.startedAt)
    ) {
      add('SNAPSHOT_AFTER_RESTORE_START', 'The selected snapshot must predate the restore operation.');
    }
    if (
      typeof restore.deployedVersion !== 'string' ||
      !restore.deployedVersion.trim() ||
      restore.deployedVersion.length > 100
    ) {
      add('DEPLOYED_VERSION', 'A bounded deployed version label is required.');
    }
  }

  const operator = evidence.operator;
  if (isRecord(operator)) rejectUnknownKeys(operator, ['role'], '$.operator', errors);
  if (!isRecord(operator) || !['owner', 'qa'].includes(operator.role)) {
    add('OPERATOR', 'operator.role must be owner or qa; do not include a name or email address.');
  }
  const approval = evidence.ownerApproval;
  if (isRecord(approval)) {
    rejectUnknownKeys(approval, ['approved', 'approvedAt', 'reference'], '$.ownerApproval', errors);
  }
  const approvalReferenceValid =
    isRecord(approval) &&
    typeof approval.reference === 'string' &&
    /^[A-Za-z0-9._/-]{3,80}$/.test(approval.reference);
  if (
    !isRecord(approval) ||
    approval.approved !== true ||
    !validTimestamp(approval.approvedAt) ||
    !approvalReferenceValid
  ) {
    add(
      'OWNER_APPROVAL',
      'A recorded owner approval, UTC timestamp and non-sensitive change reference are required.',
    );
  } else {
    if (
      validTimestamp(evidence.recordedAt) &&
      Date.parse(approval.approvedAt) > Date.parse(evidence.recordedAt)
    ) {
      add('OWNER_APPROVAL_ORDER', 'Owner approval cannot be newer than the recorded evidence.');
    }
    if (
      isRecord(restore) &&
      validTimestamp(restore.startedAt) &&
      Date.parse(approval.approvedAt) > Date.parse(restore.startedAt)
    ) {
      add('OWNER_APPROVAL_AFTER_RESTORE', 'Owner approval must precede the restore operation.');
    }
  }

  const checks = evidence.checks;
  if (!isRecord(checks)) {
    add('CHECKS', 'Explicit recovery gate attestations are required.');
  } else {
    rejectUnknownKeys(checks, REQUIRED_CHECKS, '$.checks', errors);
    REQUIRED_CHECKS.forEach((key) => {
      if (checks[key] !== true) {
        add('CHECK_' + key.toUpperCase(), 'Recovery gate ' + key + ' must be explicitly true.');
      }
    });
  }

  const sheets = evidence.sheets;
  if (!isRecord(sheets)) {
    add('SHEETS', 'Per-sheet schema and row-count reconciliation is required.');
  } else {
    rejectUnknownKeys(sheets, REQUIRED_SHEETS, '$.sheets', errors);
    REQUIRED_SHEETS.forEach((name) => {
      const sheet = sheets[name];
      if (!isRecord(sheet)) {
        add('SHEET_MISSING', 'Required sheet evidence is missing for ' + name + '.');
        return;
      }
      rejectUnknownKeys(
        sheet,
        ['sourceRows', 'recoveryRows', 'sourceHeaderSha256', 'recoveryHeaderSha256'],
        '$.sheets.' + name,
        errors,
      );
      if (!validCount(sheet.sourceRows) || !validCount(sheet.recoveryRows)) {
        add('SHEET_COUNTS', 'Row counts must be non-negative safe integers for ' + name + '.');
      } else if (sheet.sourceRows !== sheet.recoveryRows) {
        add('SHEET_COUNT_MISMATCH', 'Source and recovery row counts differ for ' + name + '.');
      }
      const sourceHeaderValid =
        typeof sheet.sourceHeaderSha256 === 'string' && SHA256.test(sheet.sourceHeaderSha256);
      const recoveryHeaderValid =
        typeof sheet.recoveryHeaderSha256 === 'string' && SHA256.test(sheet.recoveryHeaderSha256);
      if (!sourceHeaderValid || !recoveryHeaderValid) {
        add('SHEET_HEADER_DIGEST', 'Header digests must be SHA-256 values for ' + name + '.');
      } else if (sheet.sourceHeaderSha256.toLowerCase() !== sheet.recoveryHeaderSha256.toLowerCase()) {
        add('SHEET_HEADER_MISMATCH', 'Source and recovery header digests differ for ' + name + '.');
      }
    });
  }

  const voucher = evidence.voucherReconciliation;
  if (!isRecord(voucher)) {
    add('VOUCHERS', 'Voucher ID and numbering reconciliation is required.');
  } else {
    rejectUnknownKeys(
      voucher,
      [
        'sourceIdSetSha256',
        'recoveryIdSetSha256',
        'sourceNumberSequenceSha256',
        'recoveryNumberSequenceSha256',
        'duplicateIds',
        'missingIds',
        'unexpectedIds',
      ],
      '$.voucherReconciliation',
      errors,
    );
    const voucherDigests = [
      'sourceIdSetSha256',
      'recoveryIdSetSha256',
      'sourceNumberSequenceSha256',
      'recoveryNumberSequenceSha256',
    ];
    voucherDigests.forEach((key) => {
      if (typeof voucher[key] !== 'string' || !SHA256.test(voucher[key])) {
        add('VOUCHER_DIGEST', 'voucherReconciliation.' + key + ' must be a SHA-256 digest.');
      }
    });
    if (
      SHA256.test(String(voucher.sourceIdSetSha256 || '')) &&
      SHA256.test(String(voucher.recoveryIdSetSha256 || '')) &&
      voucher.sourceIdSetSha256.toLowerCase() !== voucher.recoveryIdSetSha256.toLowerCase()
    ) {
      add('VOUCHER_ID_MISMATCH', 'Source and recovery voucher ID-set digests differ.');
    }
    if (
      SHA256.test(String(voucher.sourceNumberSequenceSha256 || '')) &&
      SHA256.test(String(voucher.recoveryNumberSequenceSha256 || '')) &&
      voucher.sourceNumberSequenceSha256.toLowerCase() !==
        voucher.recoveryNumberSequenceSha256.toLowerCase()
    ) {
      add('VOUCHER_NUMBER_MISMATCH', 'Source and recovery voucher-number sequence digests differ.');
    }
    ['duplicateIds', 'missingIds', 'unexpectedIds'].forEach((key) => {
      if (!validCount(voucher[key])) {
        add('VOUCHER_COUNT', 'voucherReconciliation.' + key + ' must be a non-negative integer.');
      } else if (voucher[key] !== 0) {
        add('VOUCHER_COUNT_NONZERO', 'voucherReconciliation.' + key + ' must be zero.');
      }
    });
  }

  const receipts = evidence.receipts;
  if (!isRecord(receipts)) {
    add('RECEIPTS', 'Receipt-manifest and read-back reconciliation is required.');
  } else {
    rejectUnknownKeys(
      receipts,
      [
        'manifestRecords',
        'recoveryFiles',
        'missingCopies',
        'nameMismatches',
        'sampleReadbacks',
        'sampleReadbackFailures',
      ],
      '$.receipts',
      errors,
    );
    const receiptCounts = [
      'manifestRecords',
      'recoveryFiles',
      'missingCopies',
      'nameMismatches',
      'sampleReadbacks',
      'sampleReadbackFailures',
    ];
    receiptCounts.forEach((key) => {
      if (!validCount(receipts[key])) {
        add('RECEIPT_COUNT', 'receipts.' + key + ' must be a non-negative integer.');
      }
    });
    if (
      validCount(receipts.manifestRecords) &&
      validCount(receipts.recoveryFiles) &&
      receipts.manifestRecords !== receipts.recoveryFiles
    ) {
      add('RECEIPT_COUNT_MISMATCH', 'Manifest record count and recovered receipt-file count differ.');
    }
    ['missingCopies', 'nameMismatches', 'sampleReadbackFailures'].forEach((key) => {
      if (validCount(receipts[key]) && receipts[key] !== 0) {
        add('RECEIPT_RECONCILIATION', 'receipts.' + key + ' must be zero.');
      }
    });
    if (
      validCount(receipts.manifestRecords) &&
      receipts.manifestRecords > 0 &&
      validCount(receipts.sampleReadbacks) &&
      receipts.sampleReadbacks < 1
    ) {
      add(
        'RECEIPT_SAMPLE',
        'At least one receipt read-back must be recorded when the manifest is non-empty.',
      );
    }
    if (
      validCount(receipts.sampleReadbacks) &&
      validCount(receipts.sampleReadbackFailures) &&
      receipts.sampleReadbackFailures > receipts.sampleReadbacks
    ) {
      add('RECEIPT_SAMPLE_COUNTS', 'Receipt read-back failures cannot exceed attempted read-backs.');
    }
  }

  const productionState = evidence.productionState;
  if (isRecord(productionState)) {
    rejectUnknownKeys(
      productionState,
      ['beforeSha256', 'afterSha256'],
      '$.productionState',
      errors,
    );
  }
  const beforeStateValid =
    isRecord(productionState) &&
    typeof productionState.beforeSha256 === 'string' &&
    SHA256.test(productionState.beforeSha256);
  const afterStateValid =
    isRecord(productionState) &&
    typeof productionState.afterSha256 === 'string' &&
    SHA256.test(productionState.afterSha256);
  if (!beforeStateValid || !afterStateValid) {
    add('PRODUCTION_STATE', 'Before/after production-state fingerprints are required.');
  } else if (
    productionState.beforeSha256.toLowerCase() !== productionState.afterSha256.toLowerCase()
  ) {
    add(
      'PRODUCTION_CHANGED',
      'Production-state fingerprints differ; the recovery drill must not be accepted.',
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    summary:
      errors.length === 0
        ? {
            requiredSheets: REQUIRED_SHEETS.length,
            sourceCommit: source.clientMainSha,
            restoreResult: restore.result,
            sourceSnapshotIntegrity: source.integrityReportState,
            releaseBoundary: 'evidence-contract-only',
          }
        : undefined,
  };
}

function main() {
  const inputPath = String(process.argv[2] || '').trim();
  if (!inputPath) {
    console.error('Usage: node scripts/validate-recovery-evidence.js <private-evidence.json>');
    process.exitCode = 2;
    return;
  }

  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch {
    console.error('RECOVERY EVIDENCE FAILED: input is unreadable or is not valid JSON.');
    process.exitCode = 1;
    return;
  }

  const result = validateRecoveryEvidence(evidence);
  if (!result.ok) {
    console.error('RECOVERY EVIDENCE FAILED: ' + result.errors.length + ' validation issue(s).');
    result.errors.forEach((error) => {
      console.error('- [' + error.code + '] ' + error.message);
    });
    process.exitCode = 1;
    return;
  }

  console.log(
    'Recovery evidence contract passed for ' + result.summary.requiredSheets + ' required sheets.',
  );
  console.log(
    'This validates completeness and internal consistency only; it does not authenticate the operator or independently prove that live resources were inspected.',
  );
}

if (require.main === module) main();

module.exports = { REQUIRED_SHEETS, validateRecoveryEvidence };
