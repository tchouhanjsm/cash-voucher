'use strict';

const assert = require('node:assert/strict');

async function run() {
  const { createAuditReconciliationCsv } = await import('../frontend/core/audit-export.js');
  const validScan = {
    eventCategory: 'ALL',
    scannedRows: 10,
    scanRange: { firstRow: 91, lastRow: 100, hasOlderPage: true },
    scanDiagnostics: {
      recognizedRows: 6,
      unstructuredRows: 2,
      unsupportedRows: 2,
      duplicateEventRows: 1,
      missingEventIdRows: 0,
      unknownEventTypeRows: 0,
      malformedChangeRows: 0,
      truncatedChangeRows: 0,
    },
    integrityFindings: {
      items: [
        {
          code: 'DUPLICATE_EVENT_ID',
          auditRow: 100,
          relatedAuditRow: 96,
          eventId: '=HYPERLINK("https://example.invalid","audit")',
          eventType: 'VOUCHER_UPDATED',
        },
      ],
      truncated: false,
    },
  };
  const csv = createAuditReconciliationCsv([validScan], '2026-10-29T06:00:00.000Z');

  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"recordType","schemaVersion","exportedAt"/);
  assert.match(csv, /"SCAN_SUMMARY","1","2026-10-29T06:00:00[.]000Z"/);
  assert.match(csv, /recordType.*scanFirstRow/);
  assert.match(csv, /scanHasOlderPage/);
  assert.match(csv, /"SCAN_SUMMARY".*"true"/);
  assert.match(csv, /"SCAN_SUMMARY"/);
  assert.match(csv, /"FINDING"/);
  assert.match(csv, /"DUPLICATE_EVENT_ID","100","96"/);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example[.]invalid"",""audit""\)"/);
  assert.doesNotMatch(
    csv,
    /voucher secret|vendor private name|owner@example[.]invalid|receipt base64/i,
  );
  assert.throws(
    () =>
      createAuditReconciliationCsv([
        {
          ...validScan,
          integrityFindings: {
            items: [{ ...validScan.integrityFindings.items[0], code: 'UNTRUSTED_CODE' }],
            truncated: false,
          },
        },
      ]),
    /invalid finding or source-row reference/,
  );
  assert.throws(
    () =>
      createAuditReconciliationCsv([
        {
          ...validScan,
          integrityFindings: {
            items: [{ ...validScan.integrityFindings.items[0], auditRow: 120 }],
            truncated: false,
          },
        },
      ]),
    /invalid finding or source-row reference/,
  );
  const newerScan = {
    ...validScan,
    scanRange: { firstRow: 91, lastRow: 100, hasOlderPage: true },
    integrityFindings: { items: [], truncated: false },
  };
  const olderScanWithCrossPageDuplicate = {
    ...validScan,
    scanRange: { firstRow: 81, lastRow: 90, hasOlderPage: false },
    integrityFindings: {
      items: [
        {
          ...validScan.integrityFindings.items[0],
          auditRow: 90,
          relatedAuditRow: 100,
        },
      ],
      truncated: false,
    },
  };
  const crossPageCsv = createAuditReconciliationCsv(
    [newerScan, olderScanWithCrossPageDuplicate],
    '2026-10-29T06:00:00.000Z',
  );
  assert.match(crossPageCsv, /"DUPLICATE_EVENT_ID","90","100"/);
  assert.throws(
    () => createAuditReconciliationCsv([olderScanWithCrossPageDuplicate, newerScan]),
    /ordered newest to oldest, contiguous and non-overlapping/,
  );
  assert.throws(
    () =>
      createAuditReconciliationCsv([
        newerScan,
        {
          ...validScan,
          scanRange: { firstRow: 90, lastRow: 99, hasOlderPage: false },
          integrityFindings: { items: [], truncated: false },
        },
      ]),
    /ordered newest to oldest, contiguous and non-overlapping/,
  );
  assert.throws(
    () => createAuditReconciliationCsv([newerScan]),
    /related source-row reference outside exported scan ranges/,
  );
  assert.throws(
    () => createAuditReconciliationCsv([validScan], '2026-10-29'),
    /valid export timestamp/,
  );
  assert.throws(
    () => createAuditReconciliationCsv(Array.from({ length: 101 }, () => validScan)),
    /one to 100 validated audit scan ranges/,
  );
  assert.throws(
    () =>
      createAuditReconciliationCsv([
        {
          ...validScan,
          scanDiagnostics: { ...validScan.scanDiagnostics, recognizedRows: 7 },
        },
      ]),
    /validated scan contract/,
  );
  const emptyScan = {
    eventCategory: 'ALL',
    scannedRows: 0,
    scanRange: null,
    scanDiagnostics: Object.fromEntries(
      Object.keys(validScan.scanDiagnostics).map((key) => [key, 0]),
    ),
    integrityFindings: { items: [], truncated: false },
  };
  assert.match(createAuditReconciliationCsv([emptyScan]), /"SCAN_SUMMARY"/);
  console.log(
    'Audit reconciliation CSV contract OK — bounded ranges, safe cells, source-row integrity and redacted field scope.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
