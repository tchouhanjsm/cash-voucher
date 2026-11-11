'use strict';

const assert = require('node:assert/strict');

async function run() {
  const { createAuditReconciliationCsv, createStructuredVoucherAuditCsv } =
    await import('../frontend/core/audit-export.js');
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
    () => createAuditReconciliationCsv([olderScanWithCrossPageDuplicate]),
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
  const structuredVoucher = {
    id: '22222222-2222-4222-8222-222222222222',
    voucherNo: '81001',
    date: '2026-11-10',
    vendor: 'Structured Supplier',
  };
  const structuredEvents = [
    {
      id: '33333333-3333-4333-8333-333333333333',
      actorUserId: '44444444-4444-4444-8444-444444444444',
      actorEmail: 'owner@example.invalid',
      eventType: 'VOUCHER_UPDATED',
      targetType: 'voucher',
      targetId: structuredVoucher.id,
      before: { vendor: 'Old supplier', sessionToken: 'do-not-export-session-secret' },
      after: { vendor: '=HYPERLINK("https://example.invalid","safe")' },
      reason: 'Corrected vendor name',
      occurredAtUtc: '2026-11-10 06:30:00.123456',
    },
  ];
  const structuredCsv = createStructuredVoucherAuditCsv(
    {
      voucher: structuredVoucher,
      eventCategory: 'ALL',
      events: structuredEvents,
      hasMore: true,
    },
    '2026-11-10T06:31:00.000Z',
  );
  assert.ok(structuredCsv.startsWith('\uFEFF'));
  assert.match(structuredCsv, /"sourceSystem","sourceScope","voucherId"/);
  assert.match(structuredCsv, /"laravel-sql-audit_events","voucher_id"/);
  assert.match(structuredCsv, /"COVERAGE"/);
  assert.ok(structuredCsv.includes('not a point-in-time snapshot'));
  assert.match(structuredCsv, /"VOUCHER_UPDATED"/);
  assert.ok(structuredCsv.includes('""vendor"":""=HYPERLINK('));
  assert.doesNotMatch(structuredCsv, /,"=HYPERLINK\(/);
  assert.ok(structuredCsv.includes('sessionToken'));
  assert.ok(structuredCsv.includes('[REDACTED]'));
  assert.doesNotMatch(structuredCsv, /do-not-export-session-secret/);
  assert.throws(
    () =>
      createStructuredVoucherAuditCsv(
        {
          voucher: structuredVoucher,
          eventCategory: 'ALL',
          events: [{ ...structuredEvents[0], targetId: '55555555-5555-4555-8555-555555555555' }],
          hasMore: false,
        },
        '2026-11-10T06:31:00.000Z',
      ),
    /invalid or out-of-scope event/,
  );
  assert.throws(
    () =>
      createStructuredVoucherAuditCsv(
        {
          voucher: structuredVoucher,
          eventCategory: 'ALL',
          events: structuredEvents,
          hasMore: 'unknown',
        },
        '2026-11-10T06:31:00.000Z',
      ),
    /metadata does not match/,
  );
  console.log(
    'Audit CSV contracts OK — legacy scan evidence and source-aware SQL events remain separate, bounded and spreadsheet-safe.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
