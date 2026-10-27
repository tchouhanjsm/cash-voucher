'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_SHEETS,
  validateRecoveryEvidence,
} = require('../scripts/validate-recovery-evidence');

function digest(number) {
  return Number(number).toString(16).padStart(64, '0');
}

function buildEvidence() {
  const production = {};
  const recovery = {};
  const resourceKeys = [
    'scriptFingerprint',
    'deploymentFingerprint',
    'spreadsheetFingerprint',
    'receiptFolderFingerprint',
    'backupFolderFingerprint',
  ];
  resourceKeys.forEach((key, index) => {
    production[key] = digest(index + 1);
    recovery[key] = digest(index + 6);
  });

  const sheets = {};
  REQUIRED_SHEETS.forEach((name, index) => {
    sheets[name] = {
      sourceRows: index + 2,
      recoveryRows: index + 2,
      sourceHeaderSha256: digest(index + 100),
      recoveryHeaderSha256: digest(index + 100),
    };
  });

  const timestamp = (second) =>
    '2026-10-27T05:30:' + String(second).padStart(2, '0') + '.000Z';
  return {
    schemaVersion: 1,
    evidenceType: 'cash-voucher-recovery-drill',
    recordedAt: timestamp(40),
    source: {
      clientMainSha: 'a'.repeat(40),
      snapshotFingerprint: digest(50),
      snapshotCreatedAt: '2026-10-26T02:00:00.000Z',
      manifestSha256: digest(51),
      integrityReportState: 'pass',
    },
    resources: { production, recovery },
    restore: {
      result: 'success',
      startedAt: timestamp(10),
      completedAt: timestamp(30),
      deployedVersion: 'recovery-v2026-10-27-1',
      deployedClientMainSha: 'a'.repeat(40),
    },
    operator: { role: 'qa' },
    ownerApproval: {
      approved: true,
      approvedAt: timestamp(5),
      reference: 'RECOVERY-DRILL-2026-10-27',
    },
    checks: {
      sourceSnapshotIntegrityPassed: true,
      recoveryDestinationIsolated: true,
      restoreCompleted: true,
      requiredSheetsAndHeadersVerified: true,
      rowCountsReconciled: true,
      voucherIdsAndNumbersReconciled: true,
      receiptManifestReconciled: true,
      sampleReceiptReadbackPassed: true,
      productionUnchanged: true,
    },
    sheets,
    voucherReconciliation: {
      sourceIdSetSha256: digest(60),
      recoveryIdSetSha256: digest(60),
      sourceNumberSequenceSha256: digest(61),
      recoveryNumberSequenceSha256: digest(61),
      duplicateIds: 0,
      missingIds: 0,
      unexpectedIds: 0,
    },
    receipts: {
      manifestRecords: 2,
      recoveryFiles: 2,
      missingCopies: 0,
      nameMismatches: 0,
      sampleReadbacks: 2,
      sampleReadbackFailures: 0,
    },
    productionState: { beforeSha256: digest(70), afterSha256: digest(70) },
  };
}

function hasError(evidence, code) {
  return validateRecoveryEvidence(evidence).errors.some((item) => item.code === code);
}

assert.equal(validateRecoveryEvidence(buildEvidence()).ok, true);

const sameTarget = buildEvidence();
sameTarget.resources.recovery.spreadsheetFingerprint =
  sameTarget.resources.production.spreadsheetFingerprint;
assert.ok(hasError(sameTarget, 'RESOURCE_COLLISION'));

const sourceSnapshotCollision = buildEvidence();
sourceSnapshotCollision.source.snapshotFingerprint =
  sourceSnapshotCollision.resources.production.backupFolderFingerprint;
assert.ok(hasError(sourceSnapshotCollision, 'SNAPSHOT_COLLISION'));

const failedIntegrity = buildEvidence();
failedIntegrity.source.integrityReportState = 'warning';
assert.ok(hasError(failedIntegrity, 'SNAPSHOT_INTEGRITY'));

const rowMismatch = buildEvidence();
rowMismatch.sheets.Vouchers.recoveryRows += 1;
assert.ok(hasError(rowMismatch, 'SHEET_COUNT_MISMATCH'));

const headerMismatch = buildEvidence();
headerMismatch.sheets.Users.recoveryHeaderSha256 = digest(999);
assert.ok(hasError(headerMismatch, 'SHEET_HEADER_MISMATCH'));

const voucherMismatch = buildEvidence();
voucherMismatch.voucherReconciliation.recoveryIdSetSha256 = digest(777);
assert.ok(hasError(voucherMismatch, 'VOUCHER_ID_MISMATCH'));

const duplicateVoucher = buildEvidence();
duplicateVoucher.voucherReconciliation.duplicateIds = 1;
assert.ok(hasError(duplicateVoucher, 'VOUCHER_COUNT_NONZERO'));

const receiptMismatch = buildEvidence();
receiptMismatch.receipts.missingCopies = 1;
assert.ok(hasError(receiptMismatch, 'RECEIPT_RECONCILIATION'));

const noReceiptReadback = buildEvidence();
noReceiptReadback.receipts.sampleReadbacks = 0;
assert.ok(hasError(noReceiptReadback, 'RECEIPT_SAMPLE'));

const productionChanged = buildEvidence();
productionChanged.productionState.afterSha256 = digest(999);
assert.ok(hasError(productionChanged, 'PRODUCTION_CHANGED'));

const missingSheet = buildEvidence();
delete missingSheet.sheets.CashCloses;
assert.ok(hasError(missingSheet, 'SHEET_MISSING'));

const secretLeak = buildEvidence();
secretLeak.metadata = { spreadsheetId: 'must-not-be-recorded' };
assert.ok(hasError(secretLeak, 'SENSITIVE_FIELD'));
assert.ok(hasError(secretLeak, 'UNKNOWN_FIELD'));

const unexpectedField = buildEvidence();
unexpectedField.notes = 'unapproved evidence fields are rejected';
assert.ok(hasError(unexpectedField, 'UNKNOWN_FIELD'));

const missingApproval = buildEvidence();
missingApproval.ownerApproval.approved = false;
assert.ok(hasError(missingApproval, 'OWNER_APPROVAL'));

const badTimestamp = buildEvidence();
badTimestamp.restore.completedAt = '2026-02-30T05:30:30.000Z';
assert.ok(hasError(badTimestamp, 'RESTORE_TIMESTAMPS'));

const invalidSha = buildEvidence();
invalidSha.source.clientMainSha = 'not-a-sha';
assert.ok(hasError(invalidSha, 'SOURCE_SHA'));

console.log(
  [
    'Recovery evidence contract OK — isolated fingerprints, snapshot integrity,',
    'seven-sheet/header/count reconciliation, voucher sequence, receipt read-back,',
    'owner approval and unchanged production.',
  ].join(' '),
);
