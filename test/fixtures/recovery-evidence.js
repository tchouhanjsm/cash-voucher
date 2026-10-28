'use strict';

const { REQUIRED_SHEETS } = require('../../scripts/validate-recovery-evidence');

function digest(number) {
  return Number(number).toString(16).padStart(64, '0');
}

function buildRecoveryEvidence(commitSha = 'a'.repeat(40)) {
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

  const timestamp = (second) => '2026-10-27T05:30:' + String(second).padStart(2, '0') + '.000Z';
  return {
    schemaVersion: 1,
    evidenceType: 'cash-voucher-recovery-drill',
    recordedAt: timestamp(40),
    source: {
      clientMainSha: commitSha,
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
      deployedClientMainSha: commitSha,
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

module.exports = { buildRecoveryEvidence, digest };
