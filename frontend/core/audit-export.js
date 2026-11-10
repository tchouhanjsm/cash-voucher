import { csvCell } from './utils.js';

const MAX_SCAN_RANGES = 100;
const SCHEMA_VERSION = 1;
const UTC_TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/;
const MAX_FINDINGS_PER_RANGE = 25;
const EVENT_CATEGORIES = new Set([
  'ALL',
  'CREATED',
  'UPDATED',
  'CANCELLED',
  'APPROVED',
  'REJECTED',
  'RECEIPT_ATTACHED',
  'OTHER',
]);
const FINDING_CODES = new Set([
  'DUPLICATE_EVENT_ID',
  'MISSING_EVENT_ID',
  'UNKNOWN_EVENT_TYPE',
  'MALFORMED_CHANGES',
  'TRUNCATED_CHANGES',
]);
const DIAGNOSTIC_FIELDS = [
  'recognizedRows',
  'unstructuredRows',
  'unsupportedRows',
  'duplicateEventRows',
  'missingEventIdRows',
  'unknownEventTypeRows',
  'malformedChangeRows',
  'truncatedChangeRows',
];
const HEADERS = [
  'recordType',
  'schemaVersion',
  'exportedAt',
  'eventCategory',
  'scanIndex',
  'scanFirstRow',
  'scanLastRow',
  'scanHasOlderPage',
  'scannedRows',
  ...DIAGNOSTIC_FIELDS,
  'findingSamplesTruncated',
  'findingCode',
  'auditRow',
  'relatedAuditRow',
  'eventId',
  'eventType',
];

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateScan(scan) {
  if (
    !isRecord(scan) ||
    !EVENT_CATEGORIES.has(scan.eventCategory) ||
    !Number.isSafeInteger(scan.scannedRows) ||
    scan.scannedRows < 0 ||
    scan.scannedRows > 500 ||
    !isRecord(scan.scanDiagnostics) ||
    !DIAGNOSTIC_FIELDS.every(
      (field) =>
        Number.isSafeInteger(scan.scanDiagnostics[field]) &&
        scan.scanDiagnostics[field] >= 0 &&
        scan.scanDiagnostics[field] <= 500,
    ) ||
    scan.scanDiagnostics.recognizedRows +
      scan.scanDiagnostics.unstructuredRows +
      scan.scanDiagnostics.unsupportedRows !==
      scan.scannedRows ||
    !isRecord(scan.integrityFindings) ||
    !Array.isArray(scan.integrityFindings.items) ||
    scan.integrityFindings.items.length > MAX_FINDINGS_PER_RANGE ||
    typeof scan.integrityFindings.truncated !== 'boolean'
  ) {
    throw new TypeError('Audit review evidence does not match the validated scan contract.');
  }

  if (scan.scannedRows === 0) {
    if (scan.scanRange !== null || scan.integrityFindings.items.length) {
      throw new TypeError('Empty audit ranges cannot contain row references or findings.');
    }
  } else if (
    !isRecord(scan.scanRange) ||
    !Number.isSafeInteger(scan.scanRange.firstRow) ||
    scan.scanRange.firstRow < 2 ||
    !Number.isSafeInteger(scan.scanRange.lastRow) ||
    scan.scanRange.lastRow < scan.scanRange.firstRow ||
    scan.scanRange.lastRow - scan.scanRange.firstRow + 1 !== scan.scannedRows ||
    typeof scan.scanRange.hasOlderPage !== 'boolean'
  ) {
    throw new TypeError('Audit review evidence contains an invalid source-row range.');
  }

  scan.integrityFindings.items.forEach((finding) => {
    if (
      !isRecord(finding) ||
      !FINDING_CODES.has(finding.code) ||
      !Number.isSafeInteger(finding.auditRow) ||
      !scan.scanRange ||
      finding.auditRow < scan.scanRange.firstRow ||
      finding.auditRow > scan.scanRange.lastRow ||
      !(
        finding.relatedAuditRow === null ||
        (Number.isSafeInteger(finding.relatedAuditRow) &&
          finding.relatedAuditRow >= 2 &&
          finding.relatedAuditRow !== finding.auditRow)
      ) ||
      typeof finding.eventId !== 'string' ||
      finding.eventId.length > 100 ||
      typeof finding.eventType !== 'string' ||
      finding.eventType.length > 100
    ) {
      throw new TypeError(
        'Audit review evidence contains an invalid finding or source-row reference.',
      );
    }
  });
}

export function createAuditReconciliationCsv(scans, exportedAt = new Date().toISOString()) {
  if (
    !Array.isArray(scans) ||
    scans.length < 1 ||
    scans.length > MAX_SCAN_RANGES ||
    typeof exportedAt !== 'string' ||
    !UTC_TIMESTAMP.test(exportedAt) ||
    !Number.isFinite(Date.parse(exportedAt)) ||
    new Date(exportedAt).toISOString() !== exportedAt
  ) {
    throw new TypeError(
      'Export one to 100 validated audit scan ranges with a valid export timestamp.',
    );
  }

  let previousRange = null;
  const coveredRanges = [];
  scans.forEach((scan) => {
    validateScan(scan);
    if (!scan.scanRange) return;
    if (previousRange && scan.scanRange.lastRow + 1 !== previousRange.firstRow) {
      throw new TypeError(
        'Audit review scan ranges must be ordered newest to oldest, contiguous and non-overlapping.',
      );
    }
    previousRange = scan.scanRange;
    coveredRanges.push(scan.scanRange);
  });
  scans.forEach((scan) => {
    scan.integrityFindings.items.forEach((finding) => {
      if (
        finding.relatedAuditRow !== null &&
        !coveredRanges.some(
          (range) =>
            finding.relatedAuditRow >= range.firstRow && finding.relatedAuditRow <= range.lastRow,
        )
      ) {
        throw new TypeError(
          'Audit review evidence contains a related source-row reference outside exported scan ranges.',
        );
      }
    });
  });
  const csvRows = [HEADERS];
  scans.forEach((scan, index) => {
    const diagnostics = DIAGNOSTIC_FIELDS.map((field) => scan.scanDiagnostics[field]);
    const range = scan.scanRange;
    const common = [
      SCHEMA_VERSION,
      exportedAt,
      scan.eventCategory,
      index + 1,
      range ? range.firstRow : '',
      range ? range.lastRow : '',
      range ? range.hasOlderPage : '',
      scan.scannedRows,
      ...diagnostics,
      scan.integrityFindings.truncated,
    ];
    csvRows.push(['SCAN_SUMMARY', ...common, '', '', '', '', '']);
    scan.integrityFindings.items.forEach((finding) => {
      csvRows.push([
        'FINDING',
        ...common,
        finding.code,
        finding.auditRow,
        finding.relatedAuditRow === null ? '' : finding.relatedAuditRow,
        finding.eventId,
        finding.eventType,
      ]);
    });
  });

  return '\uFEFF' + csvRows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const STRUCTURED_EVENT_LIMIT = 1000;
const AUDIT_EVENT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRUCTURED_AUDIT_HEADERS = [
  'recordType',
  'schemaVersion',
  'exportedAt',
  'sourceSystem',
  'sourceScope',
  'voucherId',
  'voucherNo',
  'eventCategory',
  'loadedEvents',
  'moreEventsAvailable',
  'coverageStatement',
  'eventId',
  'occurredAtUtc',
  'actorUserId',
  'actorEmail',
  'eventType',
  'targetType',
  'targetId',
  'reason',
  'beforeJson',
  'afterJson',
];

function isSnapshot(value) {
  return value === null || isRecord(value);
}

/**
 * Export only the structured SQL audit events actually loaded by the browser.
 * The coverage row explicitly disclaims a point-in-time snapshot and unlinked
 * legacy spreadsheet rows; no spreadsheet row number or global completeness
 * claim is fabricated.
 */
export function createStructuredVoucherAuditCsv(
  { voucher, eventCategory, events, hasMore },
  exportedAt = new Date().toISOString(),
) {
  if (
    !isRecord(voucher) ||
    typeof voucher.id !== 'string' ||
    !AUDIT_EVENT_UUID.test(voucher.id) ||
    typeof voucher.voucherNo !== 'string' ||
    typeof voucher.date !== 'string' ||
    typeof voucher.vendor !== 'string' ||
    !EVENT_CATEGORIES.has(eventCategory) ||
    !Array.isArray(events) ||
    events.length > STRUCTURED_EVENT_LIMIT ||
    typeof hasMore !== 'boolean' ||
    typeof exportedAt !== 'string' ||
    !UTC_TIMESTAMP.test(exportedAt) ||
    !Number.isFinite(Date.parse(exportedAt)) ||
    new Date(exportedAt).toISOString() !== exportedAt
  ) {
    throw new TypeError(
      'Structured audit export metadata does not match the validated source contract.',
    );
  }

  events.forEach((event) => {
    if (
      !isRecord(event) ||
      typeof event.id !== 'string' ||
      !AUDIT_EVENT_UUID.test(event.id) ||
      !(
        event.actorUserId === null ||
        (typeof event.actorUserId === 'string' && AUDIT_EVENT_UUID.test(event.actorUserId))
      ) ||
      typeof event.actorEmail !== 'string' ||
      event.actorEmail.length > 254 ||
      typeof event.eventType !== 'string' ||
      !/^[A-Z][A-Z0-9_]{1,79}$/.test(event.eventType) ||
      event.targetType !== 'voucher' ||
      event.targetId !== voucher.id ||
      typeof event.reason !== 'string' ||
      event.reason.length > 500 ||
      typeof event.occurredAtUtc !== 'string' ||
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(event.occurredAtUtc) ||
      !isSnapshot(event.before) ||
      !isSnapshot(event.after)
    ) {
      throw new TypeError('Structured audit export contains an invalid or out-of-scope event.');
    }
  });

  const coverageStatement =
    'Loaded pages from Laravel SQL audit_events only; not a point-in-time snapshot; legacy spreadsheet rows without a stable voucher ID are excluded.';
  const common = [
    1,
    exportedAt,
    'laravel-sql-audit_events',
    'voucher_id',
    voucher.id,
    voucher.voucherNo,
    eventCategory,
    events.length,
    hasMore,
    coverageStatement,
  ];
  const rows = [STRUCTURED_AUDIT_HEADERS];
  rows.push(['COVERAGE', ...common, '', '', '', '', '', '', '', '', '', '']);
  events.forEach((event) => {
    rows.push([
      'EVENT',
      ...common,
      event.id,
      event.occurredAtUtc,
      event.actorUserId ?? '',
      event.actorEmail,
      event.eventType,
      event.targetType,
      event.targetId,
      event.reason,
      event.before === null ? '' : JSON.stringify(event.before),
      event.after === null ? '' : JSON.stringify(event.after),
    ]);
  });

  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
