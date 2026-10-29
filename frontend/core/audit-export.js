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
