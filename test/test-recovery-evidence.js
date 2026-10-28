'use strict';

const assert = require('node:assert/strict');
const {
  REQUIRED_SHEETS,
  validateRecoveryEvidence,
} = require('../scripts/validate-recovery-evidence');

const { buildRecoveryEvidence, digest } = require('./fixtures/recovery-evidence');

function hasError(evidence, code) {
  return validateRecoveryEvidence(evidence).errors.some((item) => item.code === code);
}

assert.equal(validateRecoveryEvidence(buildRecoveryEvidence()).ok, true);

const sameTarget = buildRecoveryEvidence();
sameTarget.resources.recovery.spreadsheetFingerprint =
  sameTarget.resources.production.spreadsheetFingerprint;
assert.ok(hasError(sameTarget, 'RESOURCE_COLLISION'));

const sourceSnapshotCollision = buildRecoveryEvidence();
sourceSnapshotCollision.source.snapshotFingerprint =
  sourceSnapshotCollision.resources.production.backupFolderFingerprint;
assert.ok(hasError(sourceSnapshotCollision, 'SNAPSHOT_COLLISION'));

const failedIntegrity = buildRecoveryEvidence();
failedIntegrity.source.integrityReportState = 'warning';
assert.ok(hasError(failedIntegrity, 'SNAPSHOT_INTEGRITY'));

const rowMismatch = buildRecoveryEvidence();
rowMismatch.sheets.Vouchers.recoveryRows += 1;
assert.ok(hasError(rowMismatch, 'SHEET_COUNT_MISMATCH'));

const headerMismatch = buildRecoveryEvidence();
headerMismatch.sheets.Users.recoveryHeaderSha256 = digest(999);
assert.ok(hasError(headerMismatch, 'SHEET_HEADER_MISMATCH'));

const voucherMismatch = buildRecoveryEvidence();
voucherMismatch.voucherReconciliation.recoveryIdSetSha256 = digest(777);
assert.ok(hasError(voucherMismatch, 'VOUCHER_ID_MISMATCH'));

const duplicateVoucher = buildRecoveryEvidence();
duplicateVoucher.voucherReconciliation.duplicateIds = 1;
assert.ok(hasError(duplicateVoucher, 'VOUCHER_COUNT_NONZERO'));

const receiptMismatch = buildRecoveryEvidence();
receiptMismatch.receipts.missingCopies = 1;
assert.ok(hasError(receiptMismatch, 'RECEIPT_RECONCILIATION'));

const noReceiptReadback = buildRecoveryEvidence();
noReceiptReadback.receipts.sampleReadbacks = 0;
assert.ok(hasError(noReceiptReadback, 'RECEIPT_SAMPLE'));

const productionChanged = buildRecoveryEvidence();
productionChanged.productionState.afterSha256 = digest(999);
assert.ok(hasError(productionChanged, 'PRODUCTION_CHANGED'));

const missingSheet = buildRecoveryEvidence();
delete missingSheet.sheets.CashCloses;
assert.ok(hasError(missingSheet, 'SHEET_MISSING'));

const secretLeak = buildRecoveryEvidence();
secretLeak.metadata = { spreadsheetId: 'must-not-be-recorded' };
assert.ok(hasError(secretLeak, 'SENSITIVE_FIELD'));
assert.ok(hasError(secretLeak, 'UNKNOWN_FIELD'));

const unexpectedField = buildRecoveryEvidence();
unexpectedField.notes = 'unapproved evidence fields are rejected';
assert.ok(hasError(unexpectedField, 'UNKNOWN_FIELD'));

const missingApproval = buildRecoveryEvidence();
missingApproval.ownerApproval.approved = false;
assert.ok(hasError(missingApproval, 'OWNER_APPROVAL'));

const lateApproval = buildRecoveryEvidence();
lateApproval.ownerApproval.approvedAt = '2026-10-27T05:30:20.000Z';
assert.ok(hasError(lateApproval, 'OWNER_APPROVAL_AFTER_RESTORE'));

const deployedShaMismatch = buildRecoveryEvidence();
deployedShaMismatch.restore.deployedClientMainSha = 'b'.repeat(40);
assert.ok(hasError(deployedShaMismatch, 'DEPLOYED_SHA_MISMATCH'));

const unsafeVersionLabels = [
  'https://script.google.com/macros/s/private-id/exec',
  'operator@example.com',
  'projects/123/deployments/98765',
  'script-id-123456789012345678901234567890',
  'version 42',
];
unsafeVersionLabels.forEach((version) => {
  const unsafeVersion = buildRecoveryEvidence();
  unsafeVersion.restore.deployedVersion = version;
  assert.ok(
    hasError(unsafeVersion, 'DEPLOYED_VERSION'),
    'unsafe deployed version label is rejected: ' + version,
  );
});

const supportedVersionLabel = buildRecoveryEvidence();
supportedVersionLabel.restore.deployedVersion = 'version-42';
assert.equal(validateRecoveryEvidence(supportedVersionLabel).ok, true);

const snapshotAfterRestoreStart = buildRecoveryEvidence();
snapshotAfterRestoreStart.source.snapshotCreatedAt = '2026-10-27T05:30:11.000Z';
assert.ok(hasError(snapshotAfterRestoreStart, 'SNAPSHOT_AFTER_RESTORE_START'));

const badTimestamp = buildRecoveryEvidence();
badTimestamp.restore.completedAt = '2026-02-30T05:30:30.000Z';
assert.ok(hasError(badTimestamp, 'RESTORE_TIMESTAMPS'));

const invalidSha = buildRecoveryEvidence();
invalidSha.source.clientMainSha = 'not-a-sha';
assert.ok(hasError(invalidSha, 'SOURCE_SHA'));

console.log(
  [
    'Recovery evidence contract OK — isolated fingerprints, snapshot integrity,',
    'seven-sheet/header/count reconciliation, voucher sequence, receipt read-back,',
    'owner approval and unchanged production.',
  ].join(' '),
);
