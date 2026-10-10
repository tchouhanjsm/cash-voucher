'use strict';

const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

const g = create();
const folders = Array.from({ length: 12 }, (_, index) => {
  const day = String(index + 1).padStart(2, '0');
  return {
    id: 'backup-2026-10-' + day + '_020000',
    name: 'backup-2026-10-' + day + '_020000',
    createdAt: '2026-10-' + day + 'T02:00:00.000Z',
  };
});

function validInspection() {
  return {
    sheet: {
      present: true,
      readable: true,
      missingSheets: [],
      invalidHeaders: [],
      rowCounts: { Users: 2, Vouchers: 14, Vendors: 4, Settings: 8, AuditLog: 21 },
    },
    manifest: {
      present: true,
      readable: true,
      headerValid: true,
      recordCount: 2,
      uniqueIds: true,
      copiesPresent: true,
    },
    receipts: { present: true, count: 2 },
  };
}

const report = g.backupIntegrityReportWithServices({
  now: () => '2026-10-10T00:00:00.000Z',
  listBackupFolders: () => folders,
  inspectSnapshot: (folder) => {
    if (folder.name === 'backup-2026-10-12_020000') {
      const inspection = validInspection();
      inspection.manifest.copiesPresent = false;
      return inspection;
    }
    if (folder.name === 'backup-2026-10-11_020000') {
      throw new Error('Drive access denied');
    }
    const inspection = validInspection();
    if (folder.name === 'backup-2026-10-10_020000') {
      inspection.sheet.invalidHeaders = ['Vouchers'];
    }
    return inspection;
  },
});

assert.equal(report.inspected, 10, 'inspects no more than the latest ten snapshots');
assert.equal(
  report.snapshots[0].name,
  'backup-2026-10-12_020000',
  'snapshots are sorted newest first',
);
assert.equal(
  report.snapshots[0].state,
  'fail',
  'a missing manifest receipt copy fails the snapshot',
);
assert.equal(report.snapshots[1].state, 'fail', 'an unreadable snapshot fails closed');
assert.equal(
  report.snapshots[2].state,
  'warning',
  'a current-schema mismatch is warned about without claiming the snapshot is corrupt',
);
assert.ok(
  report.snapshots[0].checks.some(
    (check) => check.code === 'RECEIPT_REFERENCES' && check.state === 'fail',
  ),
  'receipt-reference failure is visible',
);
assert.equal(report.failCount, 2, 'failed snapshot count is explicit');
assert.equal(report.warningCount, 1, 'schema compatibility warnings are counted separately');
assert.equal(report.passCount, 7, 'fully passing snapshot count is explicit');
assert.match(report.note, /does not prove a restore will succeed/);
assert.equal(
  report.snapshots.some((snapshot) => snapshot.name === 'backup-2026-10-02_020000'),
  false,
  'older snapshots outside the ten-item window are omitted',
);

console.log(
  'Backup integrity report OK — bounded scan, newest-first ordering, fail-closed inspection and receipt-reference checks.',
);
