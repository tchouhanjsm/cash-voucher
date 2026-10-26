const g = create();

const manifestHeader = ['originalFileId', 'backupFileId', 'name', 'createdAt'];
const validManifestRow = [
  'source-receipt-1',
  'backup-receipt-1',
  'receipt.jpg',
  '2026-10-12T02:00:00.000Z',
];
const receiptFiles = [{ getId: () => 'backup-receipt-1', getName: () => 'receipt.jpg' }];
const validManifest = g.inspectReceiptManifest(
  [manifestHeader, validManifestRow],
  true,
  receiptFiles,
);
assert.equal(validManifest.headerValid, true);
assert.equal(validManifest.recordCount, 1);
assert.equal(validManifest.recordsValid, true);
assert.equal(validManifest.uniqueIds, true);
assert.equal(validManifest.copiesPresent, true);
assert.equal(validManifest.copyNamesMatch, true);

const invalidTimestamp = g.inspectReceiptManifest(
  [manifestHeader, [...validManifestRow.slice(0, 3), 'not-a-timestamp']],
  true,
  receiptFiles,
);
assert.equal(invalidTimestamp.recordsValid, false, 'timestamps must be canonical UTC ISO strings');

const malformedRow = g.inspectReceiptManifest(
  [manifestHeader, validManifestRow.slice(0, 3)],
  true,
  receiptFiles,
);
assert.equal(malformedRow.recordsValid, false, 'manifest rows must contain exactly four fields');

const sameSourceAndCopy = g.inspectReceiptManifest(
  [manifestHeader, ['same-id', 'same-id', 'receipt.jpg', '2026-10-12T02:00:00.000Z']],
  true,
  [{ getId: () => 'same-id', getName: () => 'receipt.jpg' }],
);
assert.equal(sameSourceAndCopy.recordsValid, false, 'source and backup IDs must differ');
assert.equal(sameSourceAndCopy.uniqueIds, false, 'source/copy ID collision must fail');

const renamedCopy = g.inspectReceiptManifest([manifestHeader, validManifestRow], true, [
  { getId: () => 'backup-receipt-1', getName: () => 'renamed.jpg' },
]);
assert.equal(renamedCopy.copyNamesMatch, false, 'manifest must detect renamed receipt copies');

const absentCopy = g.inspectReceiptManifest([manifestHeader, validManifestRow], true, []);
assert.equal(absentCopy.copiesPresent, false, 'manifest must detect missing receipt copies');

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
      recordsValid: true,
      uniqueIds: true,
      copiesPresent: true,
      copyNamesMatch: true,
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

function reportWithInspection(inspection) {
  return g.backupIntegrityReportWithServices({
    now: () => '2026-10-13T00:00:00.000Z',
    listBackupFolders: () => [
      {
        id: 'backup-2026-10-13_020000',
        name: 'backup-2026-10-13_020000',
        createdAt: '2026-10-13T02:00:00.000Z',
      },
    ],
    inspectSnapshot: () => inspection,
  });
}

const malformedManifest = validInspection();
malformedManifest.manifest.recordsValid = false;
const malformedManifestReport = reportWithInspection(malformedManifest);
assert.equal(malformedManifestReport.snapshots[0].state, 'fail');
assert.ok(
  malformedManifestReport.snapshots[0].checks.some(
    (check) => check.code === 'MANIFEST_RECORDS' && check.state === 'fail',
  ),
  'missing IDs, invalid names, malformed timestamps or wrong-width rows fail the manifest gate',
);

const mismatchedReceiptName = validInspection();
mismatchedReceiptName.manifest.copyNamesMatch = false;
const mismatchedReceiptNameReport = reportWithInspection(mismatchedReceiptName);
assert.equal(mismatchedReceiptNameReport.snapshots[0].state, 'fail');
assert.ok(
  mismatchedReceiptNameReport.snapshots[0].checks.some(
    (check) => check.code === 'RECEIPT_NAMES' && check.state === 'fail',
  ),
  'renamed receipt copies fail the manifest cross-check',
);

const collidingIds = validInspection();
collidingIds.manifest.uniqueIds = false;
const collidingIdsReport = reportWithInspection(collidingIds);
assert.equal(collidingIdsReport.snapshots[0].state, 'fail');
assert.ok(
  collidingIdsReport.snapshots[0].checks.some(
    (check) => check.code === 'RECEIPT_REFERENCES' && check.state === 'fail',
  ),
  'duplicate IDs and source/copy ID collisions fail closed',
);

console.log(
  'Backup integrity report OK — bounded scan, newest-first ordering, fail-closed inspection and receipt-reference checks.',
);
