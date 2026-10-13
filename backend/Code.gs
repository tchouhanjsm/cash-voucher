/**
 * Cash Payment Vouchers — API (Google Apps Script, bound to a Google Sheet).
 * Deploy: Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
 * No secrets live in this file. Owner login is created by setup() from Script Properties.
 */
const CFG = {
  TZ: 'Asia/Kolkata',
  SESSION_TTL: 21600, // 6 h
  MAX_FAILS: 5,
  LOCK_SECONDS: 900, // 15 min
  MAX_BULK: 500,
  MAX_NORMAL: 25,
  MAX_RECEIPTS: 3,
  MAX_B64: 2200000, // ~1.6 MB image
  MAX_REQUEST: 8000000,
  BACKUP_RETENTION_DAYS: 90,
  BACKUP_HOUR: 2, // 8 MB JSON request envelope
  MAX_AMOUNT: 10000000,
  PAYMENT_APPROVAL_THRESHOLD: 10000,
  DEFAULT_RCATS: [
    'Room Revenue',
    'Restaurant',
    'Guest Advance',
    'Bank Withdrawal',
    'Refund Received',
    'Owner Deposit',
    'Other',
  ],
  TEXT_COLS: {
    Users: ['A:D', 'F:G', 'I:J'],
    Vouchers: ['A:A', 'C:D', 'F:V'],
    Vendors: ['A:D', 'F:G'],
    Settings: ['A:B'],
    AuditLog: ['A:E'],
    CashCloses: ['A:C', 'E:G', 'M:M', 'O:U'],
    CashCloseCorrections: ['A:I'],
  },
  DEFAULT_CATEGORIES: [
    'Housekeeping',
    'Maintenance',
    'Electrical',
    'Plumbing',
    'Kitchen',
    'Food & Beverage',
    'Laundry',
    'Guest Supplies',
    'Transport',
    'Fuel',
    'Staff Welfare',
    'Staff Advance',
    'Petty Cash',
    'Local Purchase',
    'Vendor Payment',
    'Repairs',
    'Gardening',
    'Security',
    'Office Expense',
    'Stationery',
    'Internet / Telecom',
    'Licenses',
    'Bank Charges',
    'Guest Refund',
    'Other',
  ],
  H: {
    Users: [
      'UserID',
      'Name',
      'Email',
      'Role',
      'Active',
      'Salt',
      'PinHash',
      'MustChangePin',
      'CreatedAt',
      'LastLogin',
    ],
    Vouchers: [
      'VoucherID',
      'VoucherNo',
      'Date',
      'Vendor',
      'Amount',
      'Category',
      'Notes',
      'Status',
      'CreatedBy',
      'CreatedAt',
      'UpdatedBy',
      'UpdatedAt',
      'Receipts',
      'CancelReason',
      'ClientID',
      'Type',
      'CashImpact',
      'ApprovalStatus',
      'ApprovedBy',
      'ApprovedAt',
      'ApprovalReason',
      'VendorID',
    ],
    Vendors: ['VendorID', 'Name', 'Company', 'Mobile', 'Active', 'CreatedBy', 'CreatedAt'],
    Settings: ['Key', 'Value'],
    AuditLog: ['Time', 'User', 'Action', 'Target', 'Details'],
    CashCloses: [
      'CloseID',
      'BusinessDate',
      'DrawerKey',
      'OpeningCash',
      'OpeningSource',
      'OpeningCloseID',
      'OpeningReason',
      'CashInTotal',
      'CashOutTotal',
      'ExpectedCash',
      'CountedCash',
      'Variance',
      'VarianceReason',
      'IncludedVoucherCount',
      'IncludedVoucherIds',
      'IncludedVouchers',
      'CreatedBy',
      'CreatedAt',
      'TimeZone',
      'RequestID',
      'RequestPayload',
    ],
    CashCloseCorrections: [
      'CorrectionID',
      'CloseID',
      'BusinessDate',
      'VoucherID',
      'CorrectionType',
      'Details',
      'Reason',
      'CreatedBy',
      'CreatedAt',
    ],
  },
};
const PERMS = {
  staff: { create: 1, viewOwn: 1 },
  manager: {
    create: 1,
    viewAll: 1,
    edit: 1,
    cancel: 1,
    bulk: 1,
    vendors: 1,
    receiptAny: 1,
    cashClose: 1,
    approvePayments: 1,
    reports: 1,
  },
  owner: {
    create: 1,
    viewAll: 1,
    edit: 1,
    cancel: 1,
    bulk: 1,
    vendors: 1,
    receiptAny: 1,
    users: 1,
    settings: 1,
    audit: 1,
    cashClose: 1,
    approvePayments: 1,
    reports: 1,
  },
  accountant: {
    reports: 1,
  },
};

/* ============ one-time setup (run from the editor) ============ */
/** Script Properties needed once: OWNER_EMAIL, OWNER_PIN (6 digits), optional OWNER_NAME. */
// eslint-disable-next-line no-unused-vars
function setup() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SS_ID')) {
    const a = SpreadsheetApp.getActiveSpreadsheet();
    if (!a)
      throw new Error(
        'This script is not bound to a Sheet. Open it from the Sheet (Extensions > Apps Script) or add Script property SS_ID = your Sheet ID.',
      );
    p.setProperty('SS_ID', a.getId());
  }
  if (!p.getProperty('PEPPER')) p.setProperty('PEPPER', Utilities.getUuid() + Utilities.getUuid());
  Object.keys(CFG.H).forEach(ensureSheet_);
  if (!p.getProperty('RECEIPT_FOLDER_ID'))
    p.setProperty('RECEIPT_FOLDER_ID', DriveApp.createFolder('Cash Voucher Receipts').getId());
  ensureBackupInfrastructure_();
  const set = settings_();
  if (set.propertyName === undefined) setSetting_('propertyName', 'My Property');
  if (set.propertyAddress === undefined) setSetting_('propertyAddress', '');
  if (set.categories === undefined)
    setSetting_('categories', JSON.stringify(CFG.DEFAULT_CATEGORIES));
  if (set.nextVoucherNo === undefined) setSetting_('nextVoucherNo', '201');
  if (set.nextReceiptNo === undefined) setSetting_('nextReceiptNo', '1');
  if (set.openingBalance === undefined) setSetting_('openingBalance', '0');
  if (set.receiptCategories === undefined)
    setSetting_('receiptCategories', JSON.stringify(CFG.DEFAULT_RCATS));
  if (!readAll_('Users').length) {
    const email = String(p.getProperty('OWNER_EMAIL') || '')
      .trim()
      .toLowerCase();
    const pin = String(p.getProperty('OWNER_PIN') || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Set Script Property OWNER_EMAIL first.');
    if (!pinOk_(pin))
      throw new Error('Set Script Property OWNER_PIN to a 6-digit PIN (not 123456 / 111111 etc.).');
    addUser_(p.getProperty('OWNER_NAME') || 'Owner', email, 'owner', pin, true);
    p.deleteProperty('OWNER_PIN');
    audit_({ email: 'system' }, 'SETUP', '', 'Owner created: ' + email);
  }
  Logger.log('Setup complete. Now deploy as a Web app.');
}

/* ============ backup / recovery ============ */
function ensureBackupInfrastructure_() {
  const p = props_();
  if (!p.getProperty('BACKUP_FOLDER_ID'))
    p.setProperty('BACKUP_FOLDER_ID', DriveApp.createFolder('Cash Voucher Backups').getId());
  if (typeof ScriptApp !== 'undefined') installBackupTrigger_();
}
function installBackupTrigger_() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'backupData_') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('backupData_').timeBased().atHour(CFG.BACKUP_HOUR).everyDays(1).create();
}
function csvCell_(value) {
  return '"' + String(value === undefined || value === null ? '' : value).replace(/"/g, '""') + '"';
}
function backupManifestCsv_(manifest) {
  return manifest
    .map(function (row) {
      return row.map(csvCell_).join(',');
    })
    .join('\n');
}
function backupData_() {
  return backupDataWithServices_({
    getLock: () => LockService.getScriptLock(),
    getProperties: () => props_(),
    now: () => new Date(),
    formatDate: (date, timeZone, format) => Utilities.formatDate(date, timeZone, format),
    getTimeZone: () => Session.getScriptTimeZone(),
    getFolderById: (id) => DriveApp.getFolderById(id),
    getFileById: (id) => DriveApp.getFileById(id),
    getReceiptSize: (file) => file.getSize(),
    nowMilliseconds: () => Date.now(),
    pruneBackups: (root) => pruneBackups_(root),
    logger: (message) => Logger.log(message),
    sendFailureAlert: (alert) => {
      const recipient = String(props_().getProperty('OWNER_EMAIL') || '').trim();
      if (!/^\S+@\S+\.\S+$/.test(recipient)) {
        throw new Error('OWNER_EMAIL is not configured; backup failure alert was not sent.');
      }
      MailApp.sendEmail(
        recipient,
        'Cash Voucher backup failed',
        'A Cash Voucher backup attempt could not complete at ' +
          alert.timestamp +
          '.\n\nOpen Cash Voucher Settings to review the last recorded failure and check Apps Script execution logs. ' +
          'If the attempt could not acquire the backup lock, inspect any backup already in progress before retrying. ' +
          'A recorded status does not prove that a restore will succeed.',
      );
    },
    mimeCsv: MimeType.CSV,
  });
}
function backupDataWithServices_(services) {
  let lock;
  let lockAcquired = false;
  let p;
  let snapshot;
  let snapshotComplete = false;
  let startedAtMs = null;
  let receiptBytes = 0;
  let receiptBytesKnown = true;

  try {
    startedAtMs = backupNowMilliseconds_(services);
    lock = services.getLock();
    lock.waitLock(30000);
    lockAcquired = true;

    p = services.getProperties();
    p.setProperty('BACKUP_LAST_ATTEMPT', services.now().toISOString());
    p.deleteProperty('BACKUP_LAST_ERROR');
    const ssId = p.getProperty('SS_ID'),
      sourceReceiptFolderId = p.getProperty('RECEIPT_FOLDER_ID'),
      backupRootId = p.getProperty('BACKUP_FOLDER_ID');
    if (!ssId || !sourceReceiptFolderId || !backupRootId)
      throw new Error('Backup infrastructure is not configured. Run setup() first.');
    const stamp = services.formatDate(services.now(), services.getTimeZone(), 'yyyy-MM-dd_HHmmss'),
      root = services.getFolderById(backupRootId),
      sourceSheet = services.getFileById(ssId);
    snapshot = root.createFolder('backup-' + stamp);
    sourceSheet.makeCopy('Cash Voucher Sheet - ' + stamp, snapshot);
    const receiptBackup = snapshot.createFolder('receipts'),
      sourceReceipts = services.getFolderById(sourceReceiptFolderId),
      files = sourceReceipts.getFiles(),
      manifest = [['originalFileId', 'backupFileId', 'name', 'createdAt']],
      copied = [];
    while (files.hasNext()) {
      const file = files.next();
      if (file.isTrashed()) continue;
      let fileSize = null;
      try {
        fileSize =
          typeof services.getReceiptSize === 'function'
            ? services.getReceiptSize(file)
            : typeof file.getSize === 'function'
              ? file.getSize()
              : null;
      } catch {
        receiptBytesKnown = false;
      }
      if (typeof fileSize === 'number' && isFinite(fileSize) && fileSize >= 0) {
        receiptBytes += fileSize;
      } else {
        receiptBytesKnown = false;
      }
      const copy = file.makeCopy(file.getName(), receiptBackup);
      copied.push(copy.getId());
      manifest.push([
        file.getId(),
        copy.getId(),
        file.getName(),
        file.getDateCreated().toISOString(),
      ]);
    }
    snapshot.createFile('receipt-manifest.csv', backupManifestCsv_(manifest), services.mimeCsv);
    snapshotComplete = true;
    services.pruneBackups(root);
    const successAt = services.now().toISOString();
    const durationMs = Math.max(0, Math.round(backupNowMilliseconds_(services) - startedAtMs));
    p.setProperty('BACKUP_LAST_SUCCESS', successAt);
    p.deleteProperty('BACKUP_LAST_ERROR');
    recordBackupSuccessMetrics_(
      p,
      {
        completedAt: successAt,
        durationMs: durationMs,
        receiptCount: copied.length,
        receiptBytes: receiptBytesKnown ? receiptBytes : null,
        receiptBytesKnown: receiptBytesKnown,
      },
      services.logger,
    );
    clearBackupFailureAlertState_(p, services.logger);
    services.logger(
      'Backup complete: ' +
        snapshot.getName() +
        ', receipts=' +
        copied.length +
        ', receiptBytes=' +
        (receiptBytesKnown ? receiptBytes : 'unknown') +
        ', durationMs=' +
        durationMs,
    );
    return {
      folderId: snapshot.getId(),
      receiptCount: copied.length,
      durationMs: durationMs,
      receiptBytes: receiptBytesKnown ? receiptBytes : null,
    };
  } catch (e) {
    if (p) {
      recordBackupFailure_(p, snapshot, snapshotComplete, e, services.logger);
      notifyBackupFailure_(p, services, e);
    } else {
      services.logger(
        'Could not record backup failure metadata: ' + String(e && e.message ? e.message : e),
      );
      // A lock timeout can occur before the normal status properties are acquired.
      // Notify using separate incident state without overwriting another run's backup status.
      try {
        const alertProperties = services.getProperties();
        notifyBackupFailure_(alertProperties, services, e);
      } catch (alertSetupError) {
        services.logger(
          'Could not prepare backup failure alert: ' +
            String(
              alertSetupError && alertSetupError.message
                ? alertSetupError.message
                : alertSetupError,
            ),
        );
      }
    }
    throw e;
  } finally {
    if (lockAcquired) lock.releaseLock();
  }
}
function backupNowMilliseconds_(services) {
  if (services && typeof services.nowMilliseconds === 'function') {
    const milliseconds = Number(services.nowMilliseconds());
    if (isFinite(milliseconds)) return milliseconds;
  }
  const now = services.now();
  const milliseconds =
    now && typeof now.getTime === 'function' ? now.getTime() : new Date(now).getTime();
  return isFinite(milliseconds) ? milliseconds : Date.now();
}
function recordBackupSuccessMetrics_(p, metrics, logger) {
  try {
    p.setProperty('BACKUP_LAST_SUCCESS_METRICS', JSON.stringify(metrics));
  } catch (error) {
    const log =
      logger ||
      function (message) {
        Logger.log(message);
      };
    log(
      'Could not record backup workload metrics: ' +
        String(error && error.message ? error.message : error),
    );
  }
}
function clearBackupFailureAlertState_(p, logger) {
  const log =
    logger ||
    function (message) {
      Logger.log(message);
    };
  ['BACKUP_ALERT_ACTIVE', 'BACKUP_LAST_ALERT_ERROR'].forEach(function (key) {
    try {
      p.deleteProperty(key);
    } catch (error) {
      log(
        'Could not clear backup alert state: ' +
          String(error && error.message ? error.message : error),
      );
    }
  });
}
function notifyBackupFailure_(p, services, error) {
  const log =
    services.logger ||
    function (message) {
      Logger.log(message);
    };
  if (!p || typeof services.sendFailureAlert !== 'function') return;

  try {
    if (p.getProperty('BACKUP_ALERT_ACTIVE') === '1') return;
    p.setProperty('BACKUP_ALERT_ACTIVE', '1');
  } catch (stateError) {
    log(
      'Could not reserve backup failure alert state: ' +
        String(stateError && stateError.message ? stateError.message : stateError),
    );
    return;
  }

  const message = String(error && error.message ? error.message : error).slice(0, 300);
  let timestamp;
  try {
    timestamp = services.now().toISOString();
  } catch {
    timestamp = new Date().toISOString();
  }

  try {
    services.sendFailureAlert({ timestamp: timestamp, message: message });
    try {
      p.deleteProperty('BACKUP_LAST_ALERT_ERROR');
    } catch (stateError) {
      log(
        'Could not clear prior backup alert delivery error: ' +
          String(stateError && stateError.message ? stateError.message : stateError),
      );
    }
  } catch (alertError) {
    try {
      p.deleteProperty('BACKUP_ALERT_ACTIVE');
    } catch (stateError) {
      log(
        'Could not reset backup failure alert state: ' +
          String(stateError && stateError.message ? stateError.message : stateError),
      );
    }
    const deliveryMessage = String(
      alertError && alertError.message ? alertError.message : alertError,
    ).slice(0, 300);
    try {
      p.setProperty('BACKUP_LAST_ALERT_ERROR', deliveryMessage);
    } catch (stateError) {
      log(
        'Could not record backup alert delivery error: ' +
          String(stateError && stateError.message ? stateError.message : stateError),
      );
    }
    log('Could not send backup failure alert: ' + deliveryMessage);
  }
}
function recordBackupFailure_(p, snapshot, snapshotComplete, error, logger) {
  const log =
    logger ||
    function (message) {
      Logger.log(message);
    };
  let failureMessage = String(error && error.message ? error.message : error);
  if (snapshot && !snapshotComplete) {
    const cleanupMessage = trashIncompleteBackup_(snapshot);
    if (cleanupMessage) {
      const cleanupNote = cleanupMessage.slice(0, 120);
      failureMessage = failureMessage.slice(0, Math.max(0, 300 - cleanupNote.length)) + cleanupNote;
    }
  }
  try {
    p.setProperty('BACKUP_LAST_ERROR', failureMessage.slice(0, 300));
  } catch (metadataError) {
    log(
      'Could not record backup failure metadata: ' +
        String(metadataError && metadataError.message ? metadataError.message : metadataError),
    );
  }
}
function trashIncompleteBackup_(snapshot) {
  if (!snapshot) return '';
  try {
    snapshot.setTrashed(true);
    return '';
  } catch (cleanupError) {
    return (
      '; incomplete snapshot cleanup failed: ' +
      String(cleanupError && cleanupError.message ? cleanupError.message : cleanupError)
    );
  }
}

function dataQualityReport_(user) {
  need_(user, 'settings');
  const sheet = sheet_('Vouchers');
  const grid = sheet.getDataRange().getValues();
  const headers = CFG.H.Vouchers;
  const vouchers = [];
  const issues = [];
  const voucherNumbers = Object.create(null);
  const clientIds = Object.create(null);

  for (let i = 1; i < grid.length; i++) {
    if (
      !grid[i].some(function (value) {
        return value !== '' && value !== null;
      })
    )
      continue;

    const voucher = { _row: i + 1 };
    headers.forEach(function (header, index) {
      voucher[header] = grid[i][index];
    });
    vouchers.push(voucher);
  }

  const add = function (voucher, field, code, message, severity) {
    issues.push({
      severity: severity || 'warning',
      code: code,
      sourceRow: voucher._row,
      voucherId: String(voucher.VoucherID || ''),
      voucherNo: String(voucher.VoucherNo || ''),
      date: isoDate_(voucher.Date),
      type: String(voucher.Type || ''),
      field: field,
      message: message,
    });
  };

  vouchers.forEach(function (voucher) {
    const id = String(voucher.VoucherID || '').trim();
    const type = String(voucher.Type || '').trim();
    const number = String(voucher.VoucherNo || '').trim();
    const status = String(voucher.Status || '').trim();
    const date = isoDate_(voucher.Date);
    const amount = Number(voucher.Amount);
    const clientId = String(voucher.ClientID || '').trim();

    if (!id) add(voucher, 'VoucherID', 'VOUCHER_ID_MISSING', 'Voucher ID is missing.', 'error');

    if (!/^[0-9]+$/.test(number) || Number(number) < 1) {
      add(
        voucher,
        'VoucherNo',
        'VOUCHER_NUMBER_INVALID',
        'Voucher number must be a positive integer.',
        'error',
      );
    } else {
      const numberKey = type + ':' + number;
      if (voucherNumbers[numberKey]) {
        add(
          voucher,
          'VoucherNo',
          'VOUCHER_NUMBER_DUPLICATE',
          'Voucher number is duplicated within this voucher type.',
          'error',
        );
      } else {
        voucherNumbers[numberKey] = true;
      }
    }

    if (!validDate_(date))
      add(
        voucher,
        'Date',
        'DATE_INVALID',
        'Voucher date is missing or outside the supported date range.',
        'error',
      );

    if (!String(voucher.Vendor || '').trim())
      add(voucher, 'Vendor', 'VENDOR_MISSING', 'Counterparty/vendor is missing.');

    if (!isFinite(amount) || amount <= 0 || amount > CFG.MAX_AMOUNT) {
      add(
        voucher,
        'Amount',
        'AMOUNT_INVALID',
        'Amount must be positive and within the supported limit.',
        'error',
      );
    }

    if (!String(voucher.Category || '').trim())
      add(voucher, 'Category', 'CATEGORY_MISSING', 'Category is missing.');

    if (type !== 'PAYMENT' && type !== 'RECEIPT')
      add(voucher, 'Type', 'TYPE_INVALID', 'Voucher type must be PAYMENT or RECEIPT.', 'error');

    if (status !== 'ACTIVE' && status !== 'CANCELLED')
      add(voucher, 'Status', 'STATUS_INVALID', 'Voucher status is not recognized.', 'error');

    if (!String(voucher.CreatedBy || '').trim())
      add(voucher, 'CreatedBy', 'CREATOR_MISSING', 'Creator attribution is missing.');

    if (clientId) {
      if (clientIds[clientId]) {
        add(
          voucher,
          'ClientID',
          'CLIENT_ID_DUPLICATE',
          'Client ID is associated with more than one voucher.',
          'error',
        );
      } else {
        clientIds[clientId] = true;
      }
    }
  });

  const visibleIssues = issues.slice(0, 500);
  return {
    generatedAt: nowIso_(),
    scanned: vouchers.length,
    issueCount: issues.length,
    errors: issues.filter(function (issue) {
      return issue.severity === 'error';
    }).length,
    warnings: issues.filter(function (issue) {
      return issue.severity !== 'error';
    }).length,
    truncated: issues.length > visibleIssues.length,
    issues: visibleIssues,
  };
}

function recordedMovementReport_(user, req) {
  need_(user, 'reports');
  const from = String(req.from || '').trim();
  const to = String(req.to || '').trim();

  if (!validDate_(from) || !validDate_(to) || from > to) {
    throw err_('Choose a valid reporting date range.', 'VALIDATION');
  }

  const type = String(req.type || 'ALL').trim();
  if (type !== 'ALL' && type !== 'PAYMENT' && type !== 'RECEIPT') {
    throw err_('Choose a valid voucher type.', 'VALIDATION');
  }

  const status = String(req.status || 'ACTIVE').trim();
  if (status !== 'ALL' && status !== 'ACTIVE' && status !== 'CANCELLED') {
    throw err_('Choose a valid voucher status.', 'VALIDATION');
  }

  const vendorIdByName = {};
  const ambiguousVendorNames = {};
  readAll_('Vendors').forEach(function (vendor) {
    const key = String(vendor.Name || '').trim().toLowerCase();
    if (!key) return;
    if (Object.prototype.hasOwnProperty.call(vendorIdByName, key)) {
      vendorIdByName[key] = '';
      ambiguousVendorNames[key] = true;
    } else {
      vendorIdByName[key] = String(vendor.VendorID || '');
    }
  });
  const items = readAll_('Vouchers')
    .filter(function (voucher) {
      const date = isoDate_(voucher.Date);
      return (
        date >= from &&
        date <= to &&
        (type === 'ALL' || voucher.Type === type) &&
        (status === 'ALL' || voucher.Status === status)
      );
    })
    .sort(function (a, b) {
      return (
        isoDate_(a.Date).localeCompare(isoDate_(b.Date)) ||
        String(a.Type).localeCompare(String(b.Type)) ||
        Number(a.VoucherNo) - Number(b.VoucherNo)
      );
    })
    .map(function (voucher) {
      return {
        id: String(voucher.VoucherID || ''),
        voucherNo: String(voucher.VoucherNo || ''),
        date: isoDate_(voucher.Date),
        vendor: String(voucher.Vendor || ''),
        vendorId:
          String(voucher.VendorID || '') ||
          vendorIdByName[String(voucher.Vendor || '').trim().toLowerCase()] || '',
        category: String(voucher.Category || ''),
        notes: String(voucher.Notes || ''),
        type: String(voucher.Type || ''),
        status: String(voucher.Status || ''),
        amount: Number(voucher.Amount) || 0,
        createdBy: String(voucher.CreatedBy || ''),
        cancelReason: String(voucher.CancelReason || ''),
        approvalStatus: approvalStatus_(voucher),
        approvedBy: String(voucher.ApprovedBy || ''),
        approvedAt: tsStr_(voucher.ApprovedAt),
        approvalReason: String(voucher.ApprovalReason || ''),
      };
    });

  const active = items.filter(function (item) {
    return item.status === 'ACTIVE';
  });
  const eligiblePayments = function (list) {
    return list.filter(function (item) {
      return (
        item.type !== 'PAYMENT' ||
        ['NOT_REQUIRED', 'APPROVED'].indexOf(item.approvalStatus) >= 0
      );
    });
  };
  const sum = function (list, wantedType) {
    return eligiblePayments(list)
      .filter(function (item) {
        return !wantedType || item.type === wantedType;
      })
      .reduce(function (total, item) {
        return total + item.amount;
      }, 0);
  };

  return {
    generatedAt: nowIso_(),
    from: from,
    to: to,
    type: type,
    status: status,
    count: items.length,
    activeCount: active.length,
    cancelledCount: items.length - active.length,
    pendingApprovalCount: items.filter(function (item) {
      return (
        item.status === 'ACTIVE' &&
        item.type === 'PAYMENT' &&
        item.approvalStatus === 'PENDING'
      );
    }).length,
    unmatchedVendorCount: items.filter(function (item) {
      return !item.vendorId;
    }).length,
    ambiguousVendorCount: Object.keys(ambiguousVendorNames).length,
    approvalExceptionCount: items.filter(function (item) {
      return (
        item.status === 'ACTIVE' &&
        item.type === 'PAYMENT' &&
        ['NOT_REQUIRED', 'APPROVED'].indexOf(item.approvalStatus) < 0
      );
    }).length,
    paymentTotal: sum(items, 'PAYMENT'),
    receiptTotal: sum(items, 'RECEIPT'),
    activePaymentTotal: sum(active, 'PAYMENT'),
    activeReceiptTotal: sum(active, 'RECEIPT'),
    items: items,
  };
}

function backupIntegrityReport_(user) {
  need_(user, 'settings');
  const backupRootId = props_().getProperty('BACKUP_FOLDER_ID');
  if (!backupRootId) throw err_('Backup folder is not configured.', 'VALIDATION');

  return backupIntegrityReportWithServices_({
    now: function () {
      return nowIso_();
    },
    listBackupFolders: function () {
      const root = DriveApp.getFolderById(backupRootId);
      const folders = [];
      const iterator = root.getFolders();
      while (iterator.hasNext()) {
        const folder = iterator.next();
        if (!/^backup-\d{4}-\d{2}-\d{2}_\d{6}$/.test(folder.getName())) continue;
        folders.push({
          id: folder.getId(),
          name: folder.getName(),
          createdAt: folder.getDateCreated().toISOString(),
        });
      }
      return folders;
    },
    inspectSnapshot: function (snapshot) {
      const folder = DriveApp.getFolderById(snapshot.id);
      const files = [];
      const fileIterator = folder.getFiles();
      while (fileIterator.hasNext()) {
        const file = fileIterator.next();
        if (!file.isTrashed()) {
          files.push({
            id: file.getId(),
            name: file.getName(),
            mimeType: file.getMimeType(),
            file: file,
          });
        }
      }

      const sheetFile = files.find(function (file) {
        return (
          file.mimeType === 'application/vnd.google-apps.spreadsheet' &&
          file.name.indexOf('Cash Voucher Sheet - ') === 0
        );
      });
      const manifestFile = files.find(function (file) {
        return file.name === 'receipt-manifest.csv';
      });
      let receiptFolder = null;
      const folderIterator = folder.getFolders();
      while (folderIterator.hasNext()) {
        const child = folderIterator.next();
        if (child.getName() === 'receipts') {
          receiptFolder = child;
          break;
        }
      }

      const receiptFiles = [];
      if (receiptFolder) {
        const receiptIterator = receiptFolder.getFiles();
        while (receiptIterator.hasNext()) {
          const file = receiptIterator.next();
          if (!file.isTrashed()) receiptFiles.push(file);
        }
      }

      let manifestRows = [];
      let manifestReadable = false;
      if (manifestFile) {
        try {
          manifestRows = Utilities.parseCsv(manifestFile.file.getBlob().getDataAsString());
          manifestReadable = true;
        } catch {
          manifestReadable = false;
        }
      }

      let sheetReadable = false;
      let missingSheets = [];
      let invalidHeaders = [];
      const rowCounts = {};
      if (sheetFile) {
        try {
          const spreadsheet = SpreadsheetApp.openById(sheetFile.id);
          Object.keys(CFG.H).forEach(function (sheetName) {
            const sheet = spreadsheet.getSheetByName(sheetName);
            if (!sheet) {
              missingSheets.push(sheetName);
              return;
            }
            rowCounts[sheetName] = sheet.getLastRow();
            const expectedHeaders = CFG.H[sheetName];
            const actualHeaders = sheet
              .getRange(1, 1, 1, expectedHeaders.length)
              .getValues()[0]
              .map(function (value) {
                return String(value || '');
              });
            if (
              expectedHeaders.some(function (header, index) {
                return actualHeaders[index] !== header;
              })
            ) {
              invalidHeaders.push(sheetName);
            }
          });
          sheetReadable = true;
        } catch {
          sheetReadable = false;
        }
      }

      const manifestHeader = ['originalFileId', 'backupFileId', 'name', 'createdAt'];
      const header = manifestRows.length ? manifestRows[0] : [];
      const manifestHeaderValid =
        manifestReadable &&
        manifestHeader.every(function (name, index) {
          return header[index] === name;
        }) &&
        header.length === manifestHeader.length;
      const records = manifestRows.slice(1).filter(function (row) {
        return row.some(function (value) {
          return String(value || '') !== '';
        });
      });
      const originals = records.map(function (row) {
        return String(row[0] || '');
      });
      const backupIds = records.map(function (row) {
        return String(row[1] || '');
      });
      const receiptIds = receiptFiles.map(function (file) {
        return file.getId();
      });
      const unique = function (values) {
        return values.every(function (value, index) {
          return Boolean(value) && values.indexOf(value) === index;
        });
      };
      const copiesPresent = backupIds.every(function (id) {
        return receiptIds.indexOf(id) !== -1;
      });

      return {
        sheet: {
          present: Boolean(sheetFile),
          readable: sheetReadable,
          missingSheets: missingSheets,
          invalidHeaders: invalidHeaders,
          rowCounts: rowCounts,
        },
        manifest: {
          present: Boolean(manifestFile),
          readable: manifestReadable,
          headerValid: manifestHeaderValid,
          recordCount: records.length,
          uniqueIds: unique(originals) && unique(backupIds),
          copiesPresent: copiesPresent,
        },
        receipts: {
          present: Boolean(receiptFolder),
          count: receiptFiles.length,
        },
      };
    },
  });
}

function backupIntegrityReportWithServices_(services) {
  const folders = services
    .listBackupFolders()
    .slice()
    .sort(function (a, b) {
      return String(b.name).localeCompare(String(a.name));
    })
    .slice(0, 10);

  const snapshots = folders.map(function (folder) {
    const checks = [];
    let inspection;
    try {
      inspection = services.inspectSnapshot(folder);
    } catch {
      inspection = null;
    }

    const add = function (code, passed, detail, warning) {
      checks.push({
        code: code,
        state: passed ? 'pass' : warning ? 'warning' : 'fail',
        detail: detail,
      });
    };

    if (!inspection) {
      add('SNAPSHOT_READABLE', false, 'Snapshot contents could not be inspected.');
    } else {
      add(
        'SHEET_COPY',
        inspection.sheet.present,
        inspection.sheet.present ? 'Spreadsheet copy is present.' : 'Spreadsheet copy is missing.',
      );
      add(
        'SHEET_READABLE',
        inspection.sheet.readable,
        inspection.sheet.readable
          ? 'Spreadsheet copy opened successfully.'
          : 'Spreadsheet copy could not be opened.',
      );
      add(
        'REQUIRED_SHEETS',
        inspection.sheet.missingSheets.length === 0,
        inspection.sheet.missingSheets.length
          ? 'Missing tabs: ' + inspection.sheet.missingSheets.join(', ')
          : 'All required tabs are present.',
      );
      add(
        'HEADER_SCHEMA',
        inspection.sheet.invalidHeaders.length === 0,
        inspection.sheet.invalidHeaders.length
          ? 'Header mismatch in: ' +
              inspection.sheet.invalidHeaders.join(', ') +
              '. The snapshot may predate the current schema; review before restore.'
          : 'Required headers match the current schema.',
        inspection.sheet.invalidHeaders.length > 0,
      );
      add(
        'RECEIPT_FOLDER',
        inspection.receipts.present,
        inspection.receipts.present
          ? 'Receipt backup folder is present.'
          : 'Receipt backup folder is missing.',
      );
      add(
        'MANIFEST',
        inspection.manifest.present &&
          inspection.manifest.readable &&
          inspection.manifest.headerValid,
        inspection.manifest.present &&
          inspection.manifest.readable &&
          inspection.manifest.headerValid
          ? 'Receipt manifest is readable and has the expected columns.'
          : 'Receipt manifest is missing, unreadable or has unexpected columns.',
      );
      add(
        'RECEIPT_COUNT',
        inspection.manifest.recordCount === inspection.receipts.count,
        'Manifest records: ' +
          inspection.manifest.recordCount +
          '; copied receipt files found: ' +
          inspection.receipts.count +
          '.',
      );
      add(
        'RECEIPT_REFERENCES',
        inspection.manifest.uniqueIds && inspection.manifest.copiesPresent,
        inspection.manifest.uniqueIds && inspection.manifest.copiesPresent
          ? 'Manifest receipt references are unique and resolve inside the receipt folder.'
          : 'Manifest receipt references are duplicated or a referenced copy is missing.',
      );
    }

    const failed = checks.some(function (check) {
      return check.state === 'fail';
    });
    const warning = checks.some(function (check) {
      return check.state === 'warning';
    });
    return {
      name: String(folder.name || ''),
      createdAt: String(folder.createdAt || ''),
      state: failed ? 'fail' : warning ? 'warning' : 'pass',
      checks: checks,
      rowCounts: inspection ? inspection.sheet.rowCounts : {},
      receiptCount: inspection ? inspection.receipts.count : 0,
      manifestCount: inspection ? inspection.manifest.recordCount : 0,
    };
  });

  return {
    generatedAt: services.now(),
    inspected: snapshots.length,
    limit: 10,
    passCount: snapshots.filter(function (snapshot) {
      return snapshot.state === 'pass';
    }).length,
    warningCount: snapshots.filter(function (snapshot) {
      return snapshot.state === 'warning';
    }).length,
    failCount: snapshots.filter(function (snapshot) {
      return snapshot.state === 'fail';
    }).length,
    snapshots: snapshots,
    note: 'Structural inspection only. A successful report does not prove a restore will succeed; restore into a separate recovery destination and validate it.',
  };
}

function backupStatus_(user) {
  need_(user, 'settings');
  const p = props_();
  const lastError = String(p.getProperty('BACKUP_LAST_ERROR') || '');
  const configured = Boolean(
    p.getProperty('SS_ID') &&
    p.getProperty('RECEIPT_FOLDER_ID') &&
    p.getProperty('BACKUP_FOLDER_ID'),
  );
  const lastAttempt = p.getProperty('BACKUP_LAST_ATTEMPT') || '';
  const lastSuccess = p.getProperty('BACKUP_LAST_SUCCESS') || '';
  const lastAlertError = String(p.getProperty('BACKUP_LAST_ALERT_ERROR') || '').slice(0, 300);
  let metrics = null;
  try {
    const storedMetrics = JSON.parse(p.getProperty('BACKUP_LAST_SUCCESS_METRICS') || 'null');
    if (storedMetrics && storedMetrics.completedAt === lastSuccess) metrics = storedMetrics;
  } catch {
    metrics = null;
  }
  let state;

  if (!configured) {
    state = 'not_configured';
  } else if (lastError) {
    state = 'failed';
  } else if (!lastSuccess) {
    state = lastAttempt ? 'incomplete' : 'never_run';
  } else {
    const successTime = Date.parse(lastSuccess);
    const attemptTime = lastAttempt ? Date.parse(lastAttempt) : null;
    const invalidAttempt = lastAttempt && !isFinite(attemptTime);
    const newerAttempt = lastAttempt && attemptTime > successTime;
    if (!isFinite(successTime) || invalidAttempt || newerAttempt) {
      state = 'incomplete';
    } else {
      state = 'success';
    }
  }

  return {
    configured: configured,
    state: state,
    retentionDays: CFG.BACKUP_RETENTION_DAYS,
    lastAttempt: lastAttempt,
    lastSuccess: lastSuccess,
    lastError: lastError.slice(0, 300),
    lastAlertError: lastAlertError,
    lastSuccessDurationMs:
      metrics &&
      typeof metrics.durationMs === 'number' &&
      isFinite(metrics.durationMs) &&
      metrics.durationMs >= 0
        ? metrics.durationMs
        : null,
    lastSuccessReceiptCount:
      metrics &&
      typeof metrics.receiptCount === 'number' &&
      isFinite(metrics.receiptCount) &&
      metrics.receiptCount >= 0
        ? metrics.receiptCount
        : null,
    lastSuccessReceiptBytesKnown: Boolean(
      metrics &&
      metrics.receiptBytesKnown === true &&
      typeof metrics.receiptBytes === 'number' &&
      isFinite(metrics.receiptBytes) &&
      metrics.receiptBytes >= 0,
    ),
    lastSuccessReceiptBytes:
      metrics &&
      metrics.receiptBytesKnown === true &&
      typeof metrics.receiptBytes === 'number' &&
      isFinite(metrics.receiptBytes) &&
      metrics.receiptBytes >= 0
        ? metrics.receiptBytes
        : null,
  };
}
function pruneBackups_(root) {
  const cutoff = Date.now() - CFG.BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    folders = [],
    it = root.getFolders();
  while (it.hasNext()) {
    const folder = it.next();
    if (/^backup-\d{4}-\d{2}-\d{2}_\d{6}$/.test(folder.getName())) folders.push(folder);
  }
  folders.forEach(function (folder) {
    if (folder.getDateCreated().getTime() < cutoff) folder.setTrashed(true);
  });
}

/* ============ web app entry ============ */
// eslint-disable-next-line no-unused-vars
function doGet() {
  return ContentService.createTextOutput('Cash Vouchers API is running.');
}
// eslint-disable-next-line no-unused-vars
function doPost(e) {
  let out;
  try {
    const raw = String((e && e.postData && e.postData.contents) || '');
    if (!raw) throw err_('Request body is required.', 'VALIDATION');
    if (raw.length > CFG.MAX_REQUEST) throw err_('Request is too large.', 'PAYLOAD');

    let req;
    try {
      req = JSON.parse(raw);
    } catch {
      throw err_('Invalid request format.', 'VALIDATION');
    }

    validateRequest_(req);
    out = { ok: true, data: route_(req) };
  } catch (err) {
    out = {
      ok: false,
      error: err.userMessage || 'Something went wrong. Please try again.',
      code: err.code || 'SERVER',
    };
    if (!err.userMessage) console.error((err && err.stack) || err);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

const ACTIONS = {
  bootstrap: bootstrap_,
  createVouchers: createVouchers_,
  updateVoucher: updateVoucher_,
  cancelVoucher: cancelVoucher_,
  approveVoucher: approveVoucher_,
  rejectVoucher: rejectVoucher_,
  addReceipt: addReceipt_,
  getReceipt: getReceipt_,
  saveVendor: saveVendor_,
  toggleVendor: toggleVendor_,
  listUsers: listUsers_,
  saveUser: saveUser_,
  resetPin: resetPin_,
  changePin: changePin_,
  saveSettings: saveSettings_,
  auditLog: auditLog_,
  backupStatus: backupStatus_,
  backupIntegrityReport: backupIntegrityReport_,
  dataQualityReport: dataQualityReport_,
  recordedMovementReport: recordedMovementReport_,
  cashClosePreview: cashClosePreview_,
  createCashClose: createCashClose_,
  recordCashCloseCorrection: recordCashCloseCorrection_,
  logout: logout_,
};
const WRITES = {
  createVouchers: 1,
  updateVoucher: 1,
  cancelVoucher: 1,
  approveVoucher: 1,
  rejectVoucher: 1,
  addReceipt: 1,
  saveVendor: 1,
  toggleVendor: 1,
  saveUser: 1,
  resetPin: 1,
  changePin: 1,
  createCashClose: 1,
  recordCashCloseCorrection: 1,
  saveSettings: 1,
};

function validateRequest_(req) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) {
    throw err_('Invalid request.', 'VALIDATION');
  }

  const action = typeof req.action === 'string' ? req.action.trim() : '';
  if (!action) throw err_('Action is required.', 'VALIDATION');
  if (action.length > 50) throw err_('Invalid action.', 'VALIDATION');
  if (action !== 'login' && action !== 'logout' && typeof req.token !== 'string') {
    throw err_('Session token is required.', 'SESSION');
  }
}

function route_(req) {
  validateRequest_(req);
  if (req.action === 'login') return login_(req);
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, req.action)) {
    throw err_('Unknown action.', 'NOT_FOUND');
  }
  const fn = ACTIONS[req.action];

  if (!Object.prototype.hasOwnProperty.call(WRITES, req.action)) {
    const user = auth_(req.token);
    if (user.mustChange && req.action !== 'changePin' && req.action !== 'logout')
      throw err_('Please change your PIN first.', 'PIN_CHANGE');
    return fn(user, req);
  }

  return withScriptLock_(function () {
    const user = auth_(req.token);
    if (user.mustChange && req.action !== 'changePin' && req.action !== 'logout')
      throw err_('Please change your PIN first.', 'PIN_CHANGE');
    return fn(user, req);
  }, 'The service is busy. No changes were made. Please retry shortly.');
}
/* ============ helpers ============ */
function err_(msg, code) {
  const e = new Error(msg);
  e.userMessage = msg;
  e.code = code || 'SERVER';
  return e;
}

function finiteNumber_(value, label) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) throw err_('Invalid ' + label + '.', 'VALIDATION');
  const number = Number(text);
  if (!isFinite(number)) throw err_('Invalid ' + label + '.', 'VALIDATION');
  return number;
}

function positiveInteger_(value, label) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!/^\d+$/.test(text)) throw err_('Invalid ' + label + '.', 'VALIDATION');
  const number = Number(text);
  if (!isFinite(number) || !Number.isInteger(number) || number < 1) {
    throw err_('Invalid ' + label + '.', 'VALIDATION');
  }
  return number;
}

function trashFiles_(ids) {
  (ids || []).forEach(function (id) {
    try {
      if (id) DriveApp.getFileById(id).setTrashed(true);
    } catch (e) {
      console.error('Receipt cleanup failed for ' + id + ':', e);
    }
  });
}
function props_() {
  return PropertiesService.getScriptProperties();
}
function sheet_(n) {
  const id = props_().getProperty('SS_ID');
  if (!id) throw err_('Server is not set up yet. Run setup() in the script editor.');
  const s = SpreadsheetApp.openById(id).getSheetByName(n);
  if (!s && (n === 'CashCloses' || n === 'CashCloseCorrections')) {
    throw err_(
      'Daily Cash Close storage is missing. After a verified backup, run migrateDailyCashCloseSchema() once before using this feature.',
      'SCHEMA_MIGRATION',
    );
  }
  if (!s) throw err_('Sheet "' + n + '" is missing. Run setup() again.');
  validateSheetSchema_(s, n);
  return s;
}
function validateSheetSchema_(s, name) {
  const expected = CFG.H[name];
  if (!expected) throw err_('Unknown sheet schema.', 'SERVER');
  const actual = s.getRange(1, 1, 1, expected.length).getValues()[0];
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      if (name === 'Vouchers' && i === 16 && (actual[i] === '' || actual[i] === null)) {
        throw err_(
          'The Vouchers sheet is missing CashImpact. Run migrateCashImpactField() once in the Apps Script editor before using this version.',
          'SCHEMA_MIGRATION',
        );
      }
      if (name === 'Vouchers' && i >= 17 && i <= 20 && (actual[i] === '' || actual[i] === null)) {
        throw err_(
          'The Vouchers sheet is missing payment approval fields. After a verified backup, run migrateVoucherApprovalFields() once in the Apps Script editor before using this version.',
          'SCHEMA_MIGRATION',
        );
      }
      if (name === 'Vouchers' && i === 21 && (actual[i] === '' || actual[i] === null)) {
        throw err_(
          'The Vouchers sheet is missing stable vendor IDs. After a verified backup, run migrateVoucherVendorIdField() once in the Apps Script editor before using this version.',
          'SCHEMA_MIGRATION',
        );
      }
      throw err_('Sheet "' + name + '" has an invalid header. Run setup() to repair it.', 'SCHEMA');
    }
  }
}
function ensureSheet_(name) {
  const ss = SpreadsheetApp.openById(props_().getProperty('SS_ID'));
  let s = ss.getSheetByName(name) || ss.insertSheet(name);
  const h = CFG.H[name];
  s.getRange(1, 1, 1, h.length).setValues([h]); // also adds new columns to sheets from older versions
  // Plain-text columns stop Sheets turning '10-11', phone numbers or ISO timestamps into dates/numbers.
  (CFG.TEXT_COLS[name] || []).forEach(function (a) {
    s.getRange(a).setNumberFormat('@');
  });
  return s;
}
/** One-time additive migration. Run manually in Apps Script editor before deploying this version. */
// eslint-disable-next-line no-unused-vars
function migrateCashImpactField() {
  const id = props_().getProperty('SS_ID');
  if (!id) throw new Error('Missing SS_ID Script Property; no changes were made.');
  const spreadsheet = SpreadsheetApp.openById(id);
  const sheet = spreadsheet.getSheetByName('Vouchers');
  if (!sheet) throw new Error('Vouchers sheet is missing; no changes were made.');
  const expected = CFG.H.Vouchers.slice(0, 17);
  const headers = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
  if (
    expected.every(function (header, index) {
      return headers[index] === header;
    })
  ) {
    return 'CashImpact column already exists; no changes were made.';
  }
  if (
    !expected.slice(0, -1).every(function (header, index) {
      return headers[index] === header;
    })
  ) {
    throw new Error(
      'Existing Vouchers headers do not match the supported prior schema; no changes were made.',
    );
  }
  const extraHeader = headers[expected.length - 1];
  if (extraHeader !== '' && extraHeader !== null) {
    throw new Error('The next Vouchers column is already occupied; no changes were made.');
  }
  sheet.getRange(1, expected.length, 1, 1).setValues([['CashImpact']]);
  sheet.getRange('Q:Q').setNumberFormat('@');
  return 'Added CashImpact header. Historical rows remain blank and are treated as UNCLASSIFIED.';
}
/** Add the approval fields after CashImpact. Run manually once after a verified backup; never backfill historical vouchers. */
// eslint-disable-next-line no-unused-vars
function migrateVoucherApprovalFields() {
  const id = props_().getProperty('SS_ID');
  if (!id) throw new Error('Missing SS_ID Script Property; no changes were made.');
  const spreadsheet = SpreadsheetApp.openById(id);
  const sheet = spreadsheet.getSheetByName('Vouchers');
  if (!sheet) throw new Error('Vouchers sheet is missing; no changes were made.');

  const expected = CFG.H.Vouchers;
  const priorHeaders = expected.slice(0, 17);
  const approvalHeaders = expected.slice(17, 21);
  const actualPriorHeaders = sheet.getRange(1, 1, 1, priorHeaders.length).getValues()[0];
  const actualApprovalHeaders = sheet
    .getRange(1, 18, 1, approvalHeaders.length)
    .getValues()[0];
  if (
    priorHeaders.every(function (header, index) {
      return actualPriorHeaders[index] === header;
    }) &&
    approvalHeaders.every(function (header, index) {
      return actualApprovalHeaders[index] === header;
    })
  ) {
    return 'Payment approval fields already exist; no changes were made.';
  }

  if (
    !priorHeaders.every(function (header, index) {
      return actualPriorHeaders[index] === header;
    })
  ) {
    throw new Error(
      'Vouchers must have the reviewed A:Q schema including CashImpact before approval migration; no changes were made.',
    );
  }

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const trailing = sheet.getRange(1, 18, lastRow, approvalHeaders.length).getValues();
  const occupied = trailing.some(function (row) {
    return row.some(function (value) {
      return value !== '' && value !== null;
    });
  });
  if (occupied) {
    throw new Error(
      'One or more approval columns R:U already contain a header or data; no changes were made.',
    );
  }

  sheet.getRange(1, 18, 1, approvalHeaders.length).setValues([approvalHeaders]);
  sheet.getRange('R:U').setNumberFormat('@');
  return 'Added ApprovalStatus, ApprovedBy, ApprovedAt and ApprovalReason in R:U. Historical approval cells remain blank; no historical voucher was backfilled.';
}
/** Add the stable VendorID link after payment approval fields; never backfill historical rows. */
// eslint-disable-next-line no-unused-vars
function migrateVoucherVendorIdField() {
  const id = props_().getProperty('SS_ID');
  if (!id) throw new Error('Missing SS_ID Script Property; no changes were made.');
  const spreadsheet = SpreadsheetApp.openById(id);
  const sheet = spreadsheet.getSheetByName('Vouchers');
  if (!sheet) throw new Error('Vouchers sheet is missing; no changes were made.');

  const priorHeaders = CFG.H.Vouchers.slice(0, 21);
  const actualPriorHeaders = sheet.getRange(1, 1, 1, priorHeaders.length).getValues()[0];
  if (
    !priorHeaders.every(function (header, index) {
      return actualPriorHeaders[index] === header;
    })
  ) {
    throw new Error(
      'Vouchers must have the reviewed A:U schema including payment approval fields before VendorID migration; no changes were made.',
    );
  }

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const trailing = sheet.getRange(1, 22, lastRow, 1).getValues();
  const occupied = trailing.some(function (row) {
    return row[0] !== '' && row[0] !== null;
  });
  if (occupied) {
    if (trailing[0][0] === 'VendorID') {
      return 'VendorID column already exists; no changes were made.';
    }
    throw new Error('Vouchers column V already contains a header or data; no changes were made.');
  }

  sheet.getRange(1, 22, 1, 1).setValues([['VendorID']]);
  sheet.getRange('V:V').setNumberFormat('@');
  return 'Added VendorID in V. Historical vouchers remain unlinked; no historical voucher was backfilled.';
}
/** Add dedicated close/correction tabs without rewriting existing voucher rows. Run manually once before deploying this feature. */
// eslint-disable-next-line no-unused-vars
function migrateDailyCashCloseSchema() {
  const id = props_().getProperty('SS_ID');
  if (!id) throw new Error('Missing SS_ID Script Property; no changes were made.');
  const spreadsheet = SpreadsheetApp.openById(id);
  const voucherSheet = spreadsheet.getSheetByName('Vouchers');
  if (!voucherSheet) throw new Error('Vouchers sheet is missing; no changes were made.');
  const voucherHeaders = voucherSheet.getRange(1, 1, 1, CFG.H.Vouchers.length).getValues()[0];
  if (
    !CFG.H.Vouchers.every(function (header, index) {
      return voucherHeaders[index] === header;
    })
  ) {
    throw new Error(
      'Vouchers must have the reviewed CashImpact header first. Run migrateCashImpactField() before this migration; no close tabs were changed.',
    );
  }
  const names = ['CashCloses', 'CashCloseCorrections'];
  names.forEach(function (name) {
    const expected = CFG.H[name];
    const existing = spreadsheet.getSheetByName(name);
    if (!existing) return;
    const headers = existing.getRange(1, 1, 1, expected.length).getValues()[0];
    if (
      expected.every(function (header, index) {
        return headers[index] === header;
      })
    )
      return;
    const blank =
      existing.getLastRow() <= 1 &&
      headers.every(function (header) {
        return header === '' || header === null;
      });
    if (!blank)
      throw new Error(
        'Existing ' +
          name +
          ' tab has unexpected headers/data; no changes were made. Review it manually before retrying.',
      );
  });
  names.forEach(function (name) {
    const expected = CFG.H[name];
    const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
    const headers = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
    if (
      !expected.every(function (header, index) {
        return headers[index] === header;
      })
    )
      sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    (CFG.TEXT_COLS[name] || []).forEach(function (range) {
      sheet.getRange(range).setNumberFormat('@');
    });
  });
  return 'Daily Cash Close tabs are ready. Existing voucher and settings rows were not rewritten.';
}
function readAll_(name) {
  const v = sheet_(name).getDataRange().getValues(),
    h = v[0] || [];
  const out = [];
  for (let i = 1; i < v.length; i++) {
    if (v[i][0] === '' || v[i][0] === null) continue;
    const o = { _row: i + 1 };
    h.forEach(function (k, j) {
      o[k] = v[i][j];
    });
    out.push(o);
  }
  return out;
}
function toRow_(name, o) {
  return CFG.H[name].map(function (k) {
    return o[k] === undefined ? '' : o[k];
  });
}
function appendRows_(name, objs) {
  if (!objs.length) return;
  const s = sheet_(name),
    rows = objs.map(function (o) {
      return toRow_(name, o);
    });
  s.getRange(s.getLastRow() + 1, 1, rows.length, CFG.H[name].length).setValues(rows);
}
function updateRow_(name, row, patch) {
  const s = sheet_(name),
    h = CFG.H[name],
    r = s.getRange(row, 1, 1, h.length),
    cur = r.getValues()[0];
  h.forEach(function (k, j) {
    if (patch[k] !== undefined) cur[j] = patch[k];
  });
  r.setValues([cur]);
}
function settings_() {
  const o = {};
  readAll_('Settings').forEach(function (r) {
    o[r.Key] = r.Value;
  });
  return o;
}
function setSetting_(k, v) {
  const row = readAll_('Settings').filter(function (r) {
    return r.Key === k;
  })[0];
  if (row) updateRow_('Settings', row._row, { Value: v });
  else appendRows_('Settings', [{ Key: k, Value: v }]);
}
function receiptCategories_() {
  try {
    return JSON.parse(settings_().receiptCategories) || CFG.DEFAULT_RCATS;
  } catch {
    return CFG.DEFAULT_RCATS;
  }
}
function categories_() {
  try {
    return JSON.parse(settings_().categories) || CFG.DEFAULT_CATEGORIES;
  } catch {
    return CFG.DEFAULT_CATEGORIES;
  }
}
function nowIso_() {
  return Utilities.formatDate(new Date(), CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss");
}
function todayIso_(plusDays) {
  return Utilities.formatDate(
    new Date(Date.now() + (plusDays || 0) * 86400000),
    CFG.TZ,
    'yyyy-MM-dd',
  );
}
function tsStr_(v) {
  return v instanceof Date
    ? Utilities.formatDate(v, CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss")
    : String(v || '');
}
function isoDate_(v) {
  return v instanceof Date ? Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd') : String(v || '');
}
function clean_(v, max) {
  let s = String(v === undefined || v === null ? '' : v)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]+/g, ' ')
    .trim()
    .slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // block spreadsheet formula injection
  return s;
}
function clientId_(v) {
  const text = String(v === undefined || v === null ? '' : v).trim();
  if (!text) return '';
  if (text.length > 60) throw err_('Invalid client ID.', 'VALIDATION');

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 31 || code === 127) throw err_('Invalid client ID.', 'VALIDATION');
  }

  return text;
}
function pinOk_(p) {
  return /^\d{6}$/.test(p) && !/^(\d)\1{5}$/.test(p) && p !== '123456' && p !== '654321';
}
function hashPin_(salt, pin) {
  const sig = Utilities.computeHmacSha256Signature(
    salt + ':' + pin,
    props_().getProperty('PEPPER'),
  );
  return sig
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');
}
function same_(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function addUser_(name, email, role, pin, must) {
  const salt = Utilities.getUuid();
  const u = {
    UserID: Utilities.getUuid(),
    Name: clean_(name, 80),
    Email: email,
    Role: role,
    Active: true,
    Salt: salt,
    PinHash: hashPin_(salt, pin),
    MustChangePin: !!must,
    CreatedAt: nowIso_(),
    LastLogin: '',
  };
  appendRows_('Users', [u]);
  return u;
}
function pubUser_(u) {
  return {
    id: u.UserID,
    name: u.Name,
    email: u.Email,
    role: u.Role,
    active: u.Active === true || u.Active === 'TRUE',
    mustChangePin: u.MustChangePin === true || u.MustChangePin === 'TRUE',
  };
}
function audit_(user, action, target, details, detailsMaxLength) {
  try {
    appendRows_('AuditLog', [
      {
        Time: nowIso_(),
        User: user.email,
        Action: action,
        Target: target || '',
        Details: clean_(details, detailsMaxLength || 300),
      },
    ]);
  } catch (e) {
    console.error(e);
  }
}
function auditEventDetails_(eventType, entityType, entityId, reason, changes, summary) {
  return JSON.stringify({
    version: 1,
    eventId: Utilities.getUuid(),
    eventType: String(eventType || ''),
    entityType: String(entityType || ''),
    entityId: String(entityId || ''),
    reason: String(reason || ''),
    summary: String(summary || ''),
    changes: Array.isArray(changes) ? changes : [],
  });
}
function auditEvent_(
  user,
  action,
  target,
  eventType,
  entityType,
  entityId,
  reason,
  changes,
  summary,
) {
  audit_(
    user,
    action,
    target,
    auditEventDetails_(eventType, entityType, entityId, reason, changes, summary),
    5000,
  );
}
function auditEventRows_(events) {
  if (!Array.isArray(events) || !events.length) return;
  const timestamp = nowIso_();
  try {
    appendRows_(
      'AuditLog',
      events.map(function (event) {
        return {
          Time: event.Time || event.time || timestamp,
          User: event.User || event.user || '',
          Action: event.Action || event.action || '',
          Target: event.Target || event.target || '',
          Details: clean_(event.Details || event.details || '', 5000),
        };
      }),
    );
  } catch (e) {
    // Audit persistence is best-effort; it must not make a completed voucher write appear to fail.
    console.error('Audit event batch append failed:', e);
  }
}
function can_(user, perm) {
  if (!user || !Object.prototype.hasOwnProperty.call(PERMS, user.role)) return false;
  const permissions = PERMS[user.role];
  return Object.prototype.hasOwnProperty.call(permissions, perm) && !!permissions[perm];
}
function need_(user, perm) {
  if (!can_(user, perm)) {
    audit_(user, 'DENIED', perm, '');
    throw err_('You do not have permission to do that.', 'FORBIDDEN');
  }
}

/* ============ auth ============ */
function findUserByEmail_(email) {
  return readAll_('Users').filter(function (u) {
    return String(u.Email).toLowerCase() === email;
  })[0];
}
function withScriptLock_(work, busyMessage) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch {
    throw err_(
      busyMessage || 'The service is busy. No changes were made. Please retry shortly.',
      'BUSY',
    );
  }

  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}
function login_(req) {
  return withScriptLock_(function () {
    const email = String(req.email || '')
        .trim()
        .toLowerCase(),
      pin = String(req.pin || '').trim();
    const cache = CacheService.getScriptCache(),
      fk = 'f:' + email;
    const fails = Number(cache.get(fk) || 0);
    if (fails >= CFG.MAX_FAILS) throw err_('Too many attempts. Try again in 15 minutes.', 'LOCKED');
    const u = findUserByEmail_(email);
    const active = u && (u.Active === true || u.Active === 'TRUE');
    if (!u || !active || !same_(hashPin_(u.Salt, pin), u.PinHash)) {
      cache.put(fk, String(fails + 1), CFG.LOCK_SECONDS);
      if (u) audit_({ email: email }, 'LOGIN_FAILED', '', '');
      throw err_('Invalid email or PIN.');
    }
    cache.remove(fk);
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('s:' + token, JSON.stringify({ email: email, salt: u.Salt }), CFG.SESSION_TTL);
    updateRow_('Users', u._row, { LastLogin: nowIso_() });
    audit_({ email: email }, 'LOGIN', '', '');
    return { token: token, user: pubUser_(u) };
  }, 'Authentication is busy. No login attempt was recorded. Please retry shortly.');
}
function auth_(token) {
  const raw = token && CacheService.getScriptCache().get('s:' + token);
  if (!raw) throw err_('Session expired. Please sign in again.', 'SESSION');
  const s = JSON.parse(raw),
    u = findUserByEmail_(s.email);
  if (!u || !(u.Active === true || u.Active === 'TRUE') || u.Salt !== s.salt)
    throw err_('Session expired. Please sign in again.', 'SESSION');
  const p = pubUser_(u);
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    mustChange: p.mustChangePin,
    _row: u._row,
    _u: u,
  };
}
function logout_(user, req) {
  CacheService.getScriptCache().remove('s:' + req.token);
  return { ok: true };
}

/* ============ bootstrap ============ */
function vOut_(o) {
  return {
    id: o.VoucherID,
    no: Number(o.VoucherNo),
    date: isoDate_(o.Date),
    vendor: String(o.Vendor),
    vendorId: String(o.VendorID || ''),
    amount: Number(o.Amount),
    category: String(o.Category || ''),
    notes: String(o.Notes || ''),
    type: o.Type === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT',
    status: String(o.Status || 'ACTIVE'),
    createdBy: String(o.CreatedBy || ''),
    createdAt: tsStr_(o.CreatedAt),
    updatedBy: String(o.UpdatedBy || ''),
    updatedAt: tsStr_(o.UpdatedAt),
    receipts: o.Receipts ? String(o.Receipts).split(',').filter(Boolean) : [],
    cancelReason: String(o.CancelReason || ''),
    cashImpact: CASH_IMPACT_CHOICES.indexOf(o.CashImpact) >= 0 ? o.CashImpact : 'UNCLASSIFIED',
    approvalStatus: approvalStatus_(o),
    approvedBy: String(o.ApprovedBy || ''),
    approvedAt: tsStr_(o.ApprovedAt),
    approvalReason: String(o.ApprovalReason || ''),
  };
}
function bootstrap_(user) {
  const all = can_(user, 'viewAll');
  const canViewRegister = all || can_(user, 'viewOwn');
  const vouchers = canViewRegister
    ? readAll_('Vouchers')
        .filter(function (o) {
          return all || String(o.CreatedBy).toLowerCase() === user.email;
        })
        .map(vOut_)
    : [];
  const st = settings_();
  const vendors = readAll_('Vendors').map(function (v) {
    return {
      id: v.VendorID,
      name: String(v.Name),
      company: String(v.Company || ''),
      mobile: String(v.Mobile || ''),
      active: v.Active === true || v.Active === 'TRUE',
    };
  });
  const names = {};
  if (all)
    readAll_('Users').forEach(function (u) {
      names[String(u.Email).toLowerCase()] = u.Name;
    });
  else names[user.email] = user.name;
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      perms: Object.prototype.hasOwnProperty.call(PERMS, user.role) ? PERMS[user.role] : {},
    },
    settings: {
      propertyName: st.propertyName || '',
      propertyAddress: st.propertyAddress || '',
      categories: categories_(),
      receiptCategories: receiptCategories_(),
      nextVoucherNo: Number(st.nextVoucherNo || 201),
      nextReceiptNo: Number(st.nextReceiptNo || 1),
      openingBalance: all ? Number(st.openingBalance || 0) : 0,
    },
    vouchers: vouchers,
    vendors: user.role === 'accountant' ? [] : vendors,
    names: names,
  };
}

/* ============ vouchers ============ */
function validDate_(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return (
    !isNaN(t.getTime()) &&
    t.toISOString().slice(0, 10) === d &&
    d <= todayIso_(1) &&
    d >= '2000-01-01'
  );
}
function saveReceipt_(r, no, i) {
  if (!r || !/^image\/(jpeg|png|webp)$/.test(r.mime))
    throw err_('Receipt must be a JPG, PNG or WebP image.');
  if (!r.data || r.data.length > CFG.MAX_B64) throw err_('Receipt image is too large.');
  const ext = r.mime.split('/')[1].replace('jpeg', 'jpg');
  const blob = Utilities.newBlob(
    Utilities.base64Decode(r.data),
    r.mime,
    'V' + no + '-' + (Date.now() % 100000) + '-' + i + '.' + ext,
  );
  return DriveApp.getFolderById(props_().getProperty('RECEIPT_FOLDER_ID')).createFile(blob).getId();
}
function nextNumber_(configured, existing, isReceipt, fallback) {
  const current = positiveInteger_(
    configured || String(fallback),
    isReceipt ? 'next receipt number' : 'next voucher number',
  );
  const max = existing
    .filter(function (v) {
      return (v.Type === 'RECEIPT') === isReceipt;
    })
    .reduce(function (m, v) {
      return Math.max(m, positiveInteger_(v.VoucherNo, 'voucher number'));
    }, 0);
  return Math.max(current, max + 1);
}

const CASH_IMPACT_CHOICES = ['CASH_IN', 'CASH_OUT', 'NO_CASH'];
const PAYMENT_APPROVAL_STATUSES = ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'];
function approvalStatus_(voucher) {
  const raw = voucher && voucher.ApprovalStatus;
  if (raw === undefined || raw === null || raw === '') return 'NOT_REQUIRED';
  return PAYMENT_APPROVAL_STATUSES.indexOf(raw) >= 0 ? raw : 'REVIEW_REQUIRED';
}
function vendorIdLookup_() {
  const byName = Object.create(null);
  const ambiguous = Object.create(null);
  readAll_('Vendors').forEach(function (vendor) {
    const key = String(vendor.Name || '').trim().toLowerCase();
    if (!key || ambiguous[key]) return;
    if (Object.prototype.hasOwnProperty.call(byName, key)) {
      delete byName[key];
      ambiguous[key] = true;
    } else {
      byName[key] = String(vendor.VendorID || '');
    }
  });
  return { byName: byName, ambiguous: ambiguous };
}
function vendorIdForName_(name, lookup) {
  const key = String(name || '').trim().toLowerCase();
  const index = lookup || vendorIdLookup_();
  if (!key || index.ambiguous[key]) return '';
  return String(index.byName[key] || '');
}
function isEligibleApprovalPayment_(voucher) {
  if (!voucher || voucher.Type !== 'PAYMENT') return false;
  const rawAmount = voucher.Amount;
  if (
    rawAmount === '' ||
    rawAmount === null ||
    rawAmount === undefined ||
    typeof rawAmount === 'boolean'
  ) return false;
  const amount = Number(rawAmount);
  return (
    isFinite(amount) &&
    amount >= CFG.PAYMENT_APPROVAL_THRESHOLD &&
    amount <= CFG.MAX_AMOUNT &&
    Number.isSafeInteger(Math.round(amount * 100))
  );
}
function cashImpact_(value, prefix) {
  if (typeof value !== 'string' || CASH_IMPACT_CHOICES.indexOf(value) < 0) {
    throw err_((prefix || '') + 'cash impact must be CASH_IN, CASH_OUT, or NO_CASH.', 'VALIDATION');
  }
  return value;
}

const CASH_CLOSE_DRAWER = 'MAIN';
const CASH_CLOSE_CORRECTION_TYPES = ['VOUCHER', 'CASH_COUNT', 'OPENING_CASH', 'OTHER'];
function cashCloseAmountPaise_(value, label) {
  if (typeof value !== 'string' && typeof value !== 'number')
    throw err_('Enter a valid ' + label + ' amount.', 'VALIDATION');
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text))
    throw err_('Enter a valid ' + label + ' amount using up to two decimal places.', 'VALIDATION');
  const amount = Number(text);
  if (!isFinite(amount) || amount < 0 || amount > CFG.MAX_AMOUNT)
    throw err_(label + ' is outside the supported amount range.', 'VALIDATION');
  const paise = Math.round(amount * 100);
  if (!Number.isSafeInteger(paise)) throw err_('Invalid ' + label + ' amount.', 'VALIDATION');
  return paise;
}
function cashCloseAmountNumber_(value, label) {
  const amount = Number(value);
  if (
    value === '' ||
    value === null ||
    value === undefined ||
    typeof value === 'boolean' ||
    !isFinite(amount) ||
    amount < 0 ||
    amount > CFG.MAX_AMOUNT
  )
    throw err_(
      'Stored cash-close ' + label + ' is invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  const paise = Math.round(amount * 100);
  if (!Number.isSafeInteger(paise))
    throw err_('Stored cash-close ' + label + ' is invalid.', 'CASH_CLOSE_DATA');
  return paise;
}
function cashClosePreviousDate_(date) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function cashDateClosed_(date) {
  return readAll_('CashCloses').some(function (close) {
    return (
      String(close.BusinessDate || '') === date &&
      String(close.DrawerKey || CASH_CLOSE_DRAWER) === CASH_CLOSE_DRAWER
    );
  });
}
function cashCloseDateError_() {
  return err_(
    'This business date is closed. The original close is immutable; record an attributed correction note from Daily Cash Close instead of editing or cancelling the voucher.',
    'CASH_PERIOD_CLOSED',
  );
}
function cashCloseCalculatePeriod_(date) {
  const items = [],
    unclassified = [],
    invalidVouchers = [],
    pendingApprovals = [];
  let cashInPaise = 0,
    cashOutPaise = 0,
    noCashCount = 0;
  readAll_('Vouchers')
    .filter(function (voucher) {
      return isoDate_(voucher.Date) === date && String(voucher.Status || '') === 'ACTIVE';
    })
    .sort(function (a, b) {
      return Number(a.VoucherNo) - Number(b.VoucherNo);
    })
    .forEach(function (voucher) {
      const approvalStatus = approvalStatus_(voucher);
      if (
        voucher.Type === 'PAYMENT' &&
        ['NOT_REQUIRED', 'APPROVED'].indexOf(approvalStatus) < 0
      ) {
        pendingApprovals.push({
          id: String(voucher.VoucherID || ''),
          no: 'P-' + String(voucher.VoucherNo || ''),
          date: isoDate_(voucher.Date),
          vendor: String(voucher.Vendor || ''),
          amount: Number(voucher.Amount) || null,
          approvalStatus: approvalStatus,
          reason:
            approvalStatus === 'PENDING'
              ? 'Payment approval is required.'
              : approvalStatus === 'REJECTED'
                ? 'Payment was rejected; cancel or correct it before closing.'
                : 'Approval state is invalid and needs review.',
        });
        return;
      }
      const impact =
        CASH_IMPACT_CHOICES.indexOf(voucher.CashImpact) >= 0 ? voucher.CashImpact : 'UNCLASSIFIED';
      const rawAmount = voucher.Amount,
        amount = Number(rawAmount);
      const amountValid =
        rawAmount !== '' &&
        rawAmount !== null &&
        rawAmount !== undefined &&
        typeof rawAmount !== 'boolean' &&
        isFinite(amount) &&
        amount > 0 &&
        amount <= CFG.MAX_AMOUNT &&
        Number.isSafeInteger(Math.round(amount * 100));
      const amountPaise = amountValid ? Math.round(amount * 100) : null;
      const item = {
        id: String(voucher.VoucherID || ''),
        no: String(voucher.Type === 'RECEIPT' ? 'R-' : 'P-') + String(voucher.VoucherNo || ''),
        date: isoDate_(voucher.Date),
        vendor: String(voucher.Vendor || ''),
        amount: amountValid ? amountPaise / 100 : null,
        cashImpact: impact,
      };
      items.push(item);
      if (!amountValid)
        invalidVouchers.push({
          id: item.id,
          no: item.no,
          vendor: item.vendor,
          amount: rawAmount === null || rawAmount === undefined ? '' : String(rawAmount),
          reason: 'Amount is missing, invalid, negative, zero, or outside the supported range.',
        });
      if (impact === 'UNCLASSIFIED')
        unclassified.push({
          id: item.id,
          no: item.no,
          date: item.date,
          vendor: item.vendor,
          amount: item.amount,
          reason: 'Physical cash impact is unresolved.',
        });
      if (!amountValid || impact === 'UNCLASSIFIED') return;
      if (impact === 'CASH_IN') cashInPaise += amountPaise;
      else if (impact === 'CASH_OUT') cashOutPaise += amountPaise;
      else if (impact === 'NO_CASH') noCashCount++;
    });
  return {
    items,
    unclassified,
    invalidVouchers,
    pendingApprovals,
    cashInPaise,
    cashOutPaise,
    noCashCount,
  };
}
function cashCloseCorrectionOut_(row) {
  return {
    id: String(row.CorrectionID || ''),
    closeId: String(row.CloseID || ''),
    date: String(row.BusinessDate || ''),
    voucherId: String(row.VoucherID || ''),
    type: String(row.CorrectionType || 'OTHER'),
    details: String(row.Details || ''),
    reason: String(row.Reason || ''),
    createdBy: String(row.CreatedBy || ''),
    createdAt: tsStr_(row.CreatedAt),
  };
}
function cashCloseOut_(row) {
  let vouchers = [],
    ids = [];
  try {
    const raw = String(row.IncludedVouchers || '');
    if (!raw) throw new Error('Missing voucher snapshot');
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('Invalid voucher snapshot');
    vouchers = value.filter(function (item) {
      return item && typeof item === 'object' && typeof item.id === 'string';
    });
  } catch (error) {
    throw err_(
      'Saved cash-close voucher snapshot is invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }
  try {
    const raw = String(row.IncludedVoucherIds || '');
    if (!raw) throw new Error('Missing voucher ID snapshot');
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('Invalid voucher ID snapshot');
    ids = value.filter(function (id) {
      return typeof id === 'string';
    });
  } catch (error) {
    throw err_(
      'Saved cash-close voucher IDs are invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }
  return {
    id: String(row.CloseID || ''),
    date: String(row.BusinessDate || ''),
    drawerKey: String(row.DrawerKey || CASH_CLOSE_DRAWER),
    openingCash: Number(row.OpeningCash),
    openingSource: String(row.OpeningSource || ''),
    openingCloseId: String(row.OpeningCloseID || ''),
    openingReason: String(row.OpeningReason || ''),
    cashInTotal: Number(row.CashInTotal),
    cashOutTotal: Number(row.CashOutTotal),
    expectedCash: Number(row.ExpectedCash),
    countedCash: Number(row.CountedCash),
    variance: Number(row.Variance),
    varianceReason: String(row.VarianceReason || ''),
    includedVoucherCount: Number(row.IncludedVoucherCount) || ids.length || vouchers.length,
    includedVoucherIds: ids,
    includedVouchers: vouchers,
    createdBy: String(row.CreatedBy || ''),
    createdAt: tsStr_(row.CreatedAt),
    timeZone: String(row.TimeZone || CFG.TZ),
  };
}
function cashCloseWithCorrections_(row, corrections) {
  const out = cashCloseOut_(row);
  out.corrections = corrections
    .filter(function (correction) {
      return String(correction.CloseID || '') === out.id;
    })
    .sort(function (a, b) {
      return tsStr_(a.CreatedAt).localeCompare(tsStr_(b.CreatedAt));
    })
    .map(cashCloseCorrectionOut_)
    .slice(-100);
  return out;
}
function cashClosePayload_(
  date,
  openingPaise,
  openingSource,
  openingReason,
  countedPaise,
  varianceReason,
) {
  return JSON.stringify({
    date,
    openingPaise,
    openingSource,
    openingReason,
    countedPaise,
    varianceReason,
  });
}
function cashClosePreview_(user, req) {
  need_(user, 'cashClose');
  const date = String(req.date || todayIso_(0)).trim();
  if (!validDate_(date) || date > todayIso_(0))
    throw err_('Choose a valid business date that is not in the future.', 'VALIDATION');
  const closes = readAll_('CashCloses').filter(function (row) {
    return String(row.DrawerKey || CASH_CLOSE_DRAWER) === CASH_CLOSE_DRAWER;
  });
  const corrections = readAll_('CashCloseCorrections');
  const byDate = function (targetDate) {
    return closes.filter(function (row) {
      return String(row.BusinessDate || '') === targetDate;
    })[0];
  };
  const selected = byDate(date),
    previous = byDate(cashClosePreviousDate_(date));
  const laterDates = closes.filter(function (row) {
    return String(row.BusinessDate || '') > date;
  });
  laterDates.sort(function (a, b) {
    return String(a.BusinessDate || '').localeCompare(String(b.BusinessDate || ''));
  });
  const laterClose = laterDates[0] || null;
  const recentCloses = closes
    .slice()
    .sort(function (a, b) {
      return String(b.BusinessDate || '').localeCompare(String(a.BusinessDate || ''));
    })
    .slice(0, 10)
    .map(function (row) {
      return cashCloseWithCorrections_(row, corrections);
    });
  if (selected)
    return {
      date,
      today: todayIso_(0),
      closed: true,
      close: cashCloseWithCorrections_(selected, corrections),
      recentCloses,
      timeZone: CFG.TZ,
    };
  const period = cashCloseCalculatePeriod_(date);
  let openingPaise = null,
    openingSource = '',
    openingReason = '',
    openingReady = false;
  if (previous) {
    openingPaise = cashCloseAmountNumber_(previous.CountedCash, 'prior counted cash');
    openingSource = 'PREVIOUS_CLOSE';
    openingReady = true;
  } else if (req.openingCash !== undefined && req.openingCash !== '') {
    openingPaise = cashCloseAmountPaise_(req.openingCash, 'opening cash');
    openingSource = 'MANUAL';
    openingReason = clean_(req.openingReason, 200);
    openingReady = openingReason.length >= 3;
  }
  const expectedPaise =
    openingPaise === null ? null : openingPaise + period.cashInPaise - period.cashOutPaise;
  const blocked =
    period.pendingApprovals.length > 0 ||
    period.unclassified.length > 0 ||
    period.invalidVouchers.length > 0;
  const expectedValid =
    expectedPaise !== null && expectedPaise >= 0 && Number.isSafeInteger(expectedPaise);
  return {
    date,
    today: todayIso_(0),
    closed: false,
    blockedByLaterClose: !!laterClose,
    laterCloseDate: laterClose ? String(laterClose.BusinessDate || '') : '',
    requiresManualOpening: !previous,
    previousClose: previous ? cashCloseOut_(previous) : null,
    openingCash: openingPaise === null ? null : openingPaise / 100,
    openingSource,
    openingReason,
    openingReady,
    cashInTotal: period.cashInPaise / 100,
    cashOutTotal: period.cashOutPaise / 100,
    noCashCount: period.noCashCount,
    activeVoucherCount: period.items.length + period.pendingApprovals.length,
    includedVouchers: period.items,
    pendingApprovals: period.pendingApprovals,
    unclassified: period.unclassified,
    invalidVouchers: period.invalidVouchers,
    expectedCash: expectedValid && !blocked && openingReady ? expectedPaise / 100 : null,
    readyToClose: expectedValid && !blocked && openingReady && !laterClose,
    expectedInvalid: expectedPaise !== null && expectedPaise < 0,
    recentCloses,
    timeZone: CFG.TZ,
  };
}
function createCashClose_(user, req) {
  need_(user, 'cashClose');
  const date = String(req.date || '').trim();
  if (!validDate_(date) || date > todayIso_(0))
    throw err_('Choose a valid business date that is not in the future.', 'VALIDATION');
  const requestId = clientId_(req.requestId);
  if (!requestId) throw err_('A close request ID is required. Refresh and retry.', 'VALIDATION');
  const countedPaise = cashCloseAmountPaise_(req.countedCash, 'counted cash');
  const varianceReason = clean_(req.varianceReason, 200);
  const previousDate = cashClosePreviousDate_(date),
    closes = readAll_('CashCloses');
  const sameDate = closes.filter(function (row) {
    return (
      String(row.BusinessDate || '') === date &&
      String(row.DrawerKey || CASH_CLOSE_DRAWER) === CASH_CLOSE_DRAWER
    );
  })[0];
  const previous = closes.filter(function (row) {
    return (
      String(row.BusinessDate || '') === previousDate &&
      String(row.DrawerKey || CASH_CLOSE_DRAWER) === CASH_CLOSE_DRAWER
    );
  })[0];
  let openingPaise,
    openingSource,
    openingReason = '',
    openingCloseId = '';
  if (previous) {
    openingPaise = cashCloseAmountNumber_(previous.CountedCash, 'prior counted cash');
    openingSource = 'PREVIOUS_CLOSE';
    openingCloseId = String(previous.CloseID || '');
  } else {
    openingPaise = cashCloseAmountPaise_(req.openingCash, 'opening cash');
    openingSource = 'MANUAL';
    openingReason = clean_(req.openingReason, 200);
    if (openingReason.length < 3)
      throw err_(
        'Explain the manual opening amount or gap in at least 3 characters.',
        'VALIDATION',
      );
  }
  const payload = cashClosePayload_(
    date,
    openingPaise,
    openingSource,
    openingReason,
    countedPaise,
    varianceReason,
  );
  const existingRequest = closes.filter(function (row) {
    return String(row.RequestID || '') === requestId;
  })[0];
  if (existingRequest) {
    if (String(existingRequest.RequestPayload || '') === payload)
      return cashCloseOut_(existingRequest);
    throw err_(
      'This close request ID was already used with different values. Refresh and review the existing close.',
      'IDEMPOTENCY_CONFLICT',
    );
  }
  if (sameDate)
    throw err_(
      'This business date is already closed. The original close cannot be overwritten.',
      'CASH_CLOSE_EXISTS',
    );
  const laterDates = closes.filter(function (row) {
    return (
      String(row.DrawerKey || CASH_CLOSE_DRAWER) === CASH_CLOSE_DRAWER &&
      String(row.BusinessDate || '') > date
    );
  });
  laterDates.sort(function (a, b) {
    return String(a.BusinessDate || '').localeCompare(String(b.BusinessDate || ''));
  });
  const laterClose = laterDates[0];
  if (laterClose)
    throw err_(
      'Cannot close ' +
        date +
        ' because the later business date ' +
        String(laterClose.BusinessDate || '') +
        ' is already closed. Finalize dates in chronological order; no close was saved.',
      'CASH_CLOSE_OUT_OF_ORDER',
    );
  const period = cashCloseCalculatePeriod_(date);
  if (period.pendingApprovals.length) {
    const ids = period.pendingApprovals
      .slice(0, 8)
      .map(function (row) {
        return row.no;
      })
      .join(', ');
    throw err_(
      'Cannot close this date: ' +
        period.pendingApprovals.length +
        ' active payment voucher(s) are not approved' +
        (ids ? ' (' + ids + ')' : '') +
        '. Approve or cancel them first; no close was saved.',
      'CASH_CLOSE_APPROVAL_PENDING',
    );
  }
  if (period.unclassified.length) {
    const ids = period.unclassified
      .slice(0, 8)
      .map(function (row) {
        return row.no;
      })
      .join(', ');
    throw err_(
      'Cannot close this date: ' +
        period.unclassified.length +
        ' active voucher(s) have UNCLASSIFIED cash impact' +
        (ids ? ' (' + ids + ')' : '') +
        '. Classify them first; no close was saved.',
      'CASH_CLOSE_UNCLASSIFIED',
    );
  }
  if (period.invalidVouchers.length) {
    const ids = period.invalidVouchers
      .slice(0, 8)
      .map(function (row) {
        return row.no;
      })
      .join(', ');
    throw err_(
      'Cannot close this date because ' +
        period.invalidVouchers.length +
        ' active voucher(s) have invalid amounts' +
        (ids ? ' (' + ids + ')' : '') +
        '. Correct the source records first; no close was saved.',
      'CASH_CLOSE_DATA',
    );
  }
  const expectedPaise = openingPaise + period.cashInPaise - period.cashOutPaise;
  if (!Number.isSafeInteger(expectedPaise) || expectedPaise < 0)
    throw err_(
      'Expected cash is invalid or negative. Review the opening amount and cash-impact classifications; no close was saved.',
      'CASH_CLOSE_DATA',
    );
  const variancePaise = countedPaise - expectedPaise;
  if (variancePaise !== 0 && varianceReason.length < 3)
    throw err_('Explain the non-zero cash variance in at least 3 characters.', 'VALIDATION');
  const includedIds = period.items.map(function (row) {
    return row.id;
  });
  const includedVouchers = JSON.stringify(period.items),
    includedVoucherIds = JSON.stringify(includedIds);
  if (includedVouchers.length > 45000 || includedVoucherIds.length > 45000)
    throw err_(
      'This date has too many voucher details for one close snapshot. No close was saved; contact the owner before retrying.',
      'CASH_CLOSE_DATA',
    );
  const close = {
    CloseID: Utilities.getUuid(),
    BusinessDate: date,
    DrawerKey: CASH_CLOSE_DRAWER,
    OpeningCash: openingPaise / 100,
    OpeningSource: openingSource,
    OpeningCloseID: openingCloseId,
    OpeningReason: openingReason,
    CashInTotal: period.cashInPaise / 100,
    CashOutTotal: period.cashOutPaise / 100,
    ExpectedCash: expectedPaise / 100,
    CountedCash: countedPaise / 100,
    Variance: variancePaise / 100,
    VarianceReason: varianceReason,
    IncludedVoucherCount: period.items.length,
    IncludedVoucherIds: includedVoucherIds,
    IncludedVouchers: includedVouchers,
    CreatedBy: user.email,
    CreatedAt: nowIso_(),
    TimeZone: CFG.TZ,
    RequestID: requestId,
    RequestPayload: payload,
  };
  // The close row is the commit point: original totals and inclusion snapshot are stored together.
  appendRows_('CashCloses', [close]);
  auditEvent_(
    user,
    'CASH_CLOSE',
    date,
    'DAILY_CASH_CLOSE_FINALIZED',
    'cashClose',
    close.CloseID,
    varianceReason || openingReason,
    [
      { field: 'businessDate', before: null, after: date },
      { field: 'openingCash', before: null, after: close.OpeningCash },
      { field: 'openingSource', before: null, after: close.OpeningSource },
      { field: 'cashInTotal', before: null, after: close.CashInTotal },
      { field: 'cashOutTotal', before: null, after: close.CashOutTotal },
      { field: 'expectedCash', before: null, after: close.ExpectedCash },
      { field: 'countedCash', before: null, after: close.CountedCash },
      { field: 'variance', before: null, after: close.Variance },
      { field: 'includedVoucherCount', before: null, after: close.IncludedVoucherCount },
    ],
    'Daily cash close finalized',
  );
  return cashCloseOut_(close);
}
function recordCashCloseCorrection_(user, req) {
  need_(user, 'cashClose');
  const closeId = clean_(req.closeId, 100);
  const close = readAll_('CashCloses').filter(function (row) {
    return String(row.CloseID || '') === closeId;
  })[0];
  if (!close) throw err_('Select a saved cash close before recording a correction.', 'NOT_FOUND');
  const type = String(req.type || 'OTHER');
  if (CASH_CLOSE_CORRECTION_TYPES.indexOf(type) < 0)
    throw err_('Choose a valid correction type.', 'VALIDATION');
  const voucherId = clean_(req.voucherId, 100);
  let includedIds;
  try {
    const raw = String(close.IncludedVoucherIds || '');
    if (!raw) throw new Error('Missing voucher IDs');
    includedIds = JSON.parse(raw);
    if (!Array.isArray(includedIds)) throw new Error('Invalid voucher IDs');
  } catch (error) {
    throw err_(
      'Saved cash-close voucher IDs are invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }
  if (voucherId && includedIds.indexOf(voucherId) < 0)
    throw err_(
      'The linked voucher is not part of this close snapshot. Review the voucher ID.',
      'VALIDATION',
    );
  const details = clean_(req.details, 1000),
    reason = clean_(req.reason, 200);
  if (details.length < 3)
    throw err_('Describe the correction in at least 3 characters.', 'VALIDATION');
  if (reason.length < 3)
    throw err_('Give a correction reason in at least 3 characters.', 'VALIDATION');
  const record = {
    CorrectionID: Utilities.getUuid(),
    CloseID: String(close.CloseID),
    BusinessDate: String(close.BusinessDate),
    VoucherID: voucherId,
    CorrectionType: type,
    Details: details,
    Reason: reason,
    CreatedBy: user.email,
    CreatedAt: nowIso_(),
  };
  appendRows_('CashCloseCorrections', [record]);
  auditEvent_(
    user,
    'CASH_CLOSE_CORRECTION',
    String(close.BusinessDate),
    'CASH_CLOSE_CORRECTION_RECORDED',
    'cashClose',
    String(close.CloseID),
    reason,
    [
      { field: 'correctionType', before: null, after: type },
      { field: 'details', before: null, after: details },
      { field: 'voucherId', before: null, after: voucherId || '' },
    ],
    'Attributed correction note recorded; close totals unchanged',
  );
  return cashCloseCorrectionOut_(record);
}

function sameClientVoucherPayload_(voucher, entry) {
  return (
    isoDate_(voucher.Date) === entry.date &&
    String(voucher.Vendor || '') === entry.vendor &&
    Number(voucher.Amount) === Number(entry.amount) &&
    String(voucher.Category || '') === entry.category &&
    String(voucher.Notes || '') === entry.notes &&
    (voucher.Type === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT') === entry.type &&
    String(voucher.CashImpact || 'UNCLASSIFIED') === entry.cashImpact
  );
}

function createVouchers_(user, req) {
  need_(user, 'create');
  const entries = req.entries;
  if (!Array.isArray(entries) || !entries.length) throw err_('Add at least one payment.');
  if (req.bulk) {
    need_(user, 'bulk');
    if (entries.length > CFG.MAX_BULK) throw err_('Maximum ' + CFG.MAX_BULK + ' rows per import.');
  } else if (entries.length > CFG.MAX_NORMAL)
    throw err_('Maximum ' + CFG.MAX_NORMAL + ' payments at once. Use Bulk Upload.');
  const catsP = categories_(),
    catsR = receiptCategories_(),
    existing = readAll_('Vouchers'),
    vendorLookup = vendorIdLookup_(),
    closedDates = readAll_('CashCloses').map(function (close) {
      return String(close.BusinessDate || '');
    }),
    byClient = {};
  existing.forEach(function (o) {
    if (o.ClientID) byClient[o.ClientID] = o;
  });
  const clean = [];
  entries.forEach(function (en, i) {
    const row = 'Row ' + (i + 1) + ': ';
    const date = String(en.date || '');
    if (!validDate_(date)) throw err_(row + 'invalid date.');
    if (closedDates.indexOf(date) >= 0) throw cashCloseDateError_();
    const vendor = clean_(en.vendor, 200);
    if (!vendor) throw err_(row + 'vendor is required.');
    const amount = Math.round(finiteNumber_(en.amount, row + 'amount') * 100) / 100;
    if (amount <= 0 || amount > CFG.MAX_AMOUNT) throw err_(row + 'invalid amount.');
    const rec = Array.isArray(en.receipts) ? en.receipts : [];
    if (rec.length > CFG.MAX_RECEIPTS) throw err_(row + 'too many receipts.');
    const type = en.type === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT',
      cats = type === 'RECEIPT' ? catsR : catsP;
    clean.push({
      type: type,
      date: date,
      vendor: vendor,
      vendorId: vendorIdForName_(vendor, vendorLookup),
      amount: amount,
      category: cats.indexOf(en.category) >= 0 ? en.category : 'Other',
      cashImpact: cashImpact_(en.cashImpact, row),
      notes: clean_(en.notes, 500),
      clientId: clientId_(en.clientId),
      receipts: rec,
    });
  });
  const st = settings_();
  let next = nextNumber_(st.nextVoucherNo, existing, false, 201),
    nextR = nextNumber_(st.nextReceiptNo, existing, true, 1),
    created = [],
    skipped = 0,
    newObjs = [];
  const createdFileIds = [];
  try {
    clean.forEach(function (c) {
      if (c.clientId && byClient[c.clientId]) {
        const duplicate = byClient[c.clientId];
        if (!canSee_(user, duplicate)) throw err_('This client ID is already in use.', 'CONFLICT');
        if (!sameClientVoucherPayload_(duplicate, c)) {
          throw err_(
            'This client ID is already associated with different voucher details. Review the pending item before retrying.',
            'CONFLICT',
          );
        }
        skipped++;
        created.push(vOut_(duplicate));
        return;
      }
      const no = c.type === 'RECEIPT' ? nextR++ : next++,
        ids = [];
      c.receipts.forEach(function (r, i) {
        const id = saveReceipt_(r, no, i);
        ids.push(id);
        createdFileIds.push(id);
      });
      const o = {
        VoucherID: Utilities.getUuid(),
        VoucherNo: no,
        Date: c.date,
        Vendor: c.vendor,
        VendorID: c.vendorId,
        Amount: c.amount,
        Category: c.category,
        Notes: c.notes,
        Status: 'ACTIVE',
        CreatedBy: user.email,
        CreatedAt: nowIso_(),
        UpdatedBy: '',
        UpdatedAt: '',
        Receipts: ids.join(','),
        CancelReason: '',
        ClientID: c.clientId,
        Type: c.type,
        CashImpact: c.cashImpact,
        ApprovalStatus:
          c.type === 'PAYMENT' && c.amount >= CFG.PAYMENT_APPROVAL_THRESHOLD
            ? 'PENDING'
            : 'NOT_REQUIRED',
        ApprovedBy: '',
        ApprovedAt: '',
        ApprovalReason: '',
      };
      if (c.clientId) byClient[c.clientId] = o;
      newObjs.push(o);
      created.push(vOut_(o));
    });
    appendRows_('Vouchers', newObjs);
    setSetting_('nextVoucherNo', String(next));
    setSetting_('nextReceiptNo', String(nextR));
  } catch (e) {
    trashFiles_(createdFileIds);
    throw e;
  }
  const bulkBatchId = req.bulk ? Utilities.getUuid() : '';
  const auditEvents = newObjs.map(function (voucher) {
    const changes = [
      { field: 'date', before: null, after: voucher.Date },
      { field: 'vendor', before: null, after: String(voucher.Vendor || '') },
      { field: 'vendorId', before: null, after: String(voucher.VendorID || '') },
      { field: 'amount', before: null, after: Number(voucher.Amount) },
      { field: 'category', before: null, after: String(voucher.Category || '') },
      { field: 'notes', before: null, after: String(voucher.Notes || '') },
      { field: 'type', before: null, after: String(voucher.Type || 'PAYMENT') },
      { field: 'status', before: null, after: String(voucher.Status || 'ACTIVE') },
      { field: 'approvalStatus', before: null, after: approvalStatus_(voucher) },
      { field: 'cashImpact', before: null, after: String(voucher.CashImpact || 'UNCLASSIFIED') },
      {
        field: 'receiptCount',
        before: null,
        after: String(voucher.Receipts || '')
          .split(',')
          .filter(Boolean).length,
      },
    ];
    return {
      User: user.email,
      Action: req.bulk ? 'BULK_CREATE' : 'CREATE',
      Target: '#' + voucher.VoucherNo,
      Details: auditEventDetails_(
        req.bulk ? 'VOUCHER_BULK_CREATED' : 'VOUCHER_CREATED',
        'voucher',
        voucher.VoucherID,
        '',
        changes,
        req.bulk ? 'Created by bulk import; batch ' + bulkBatchId : 'Voucher created',
      ),
    };
  });
  if (req.bulk) {
    auditEvents.push({
      User: user.email,
      Action: 'BULK_IMPORT',
      Target: '',
      Details: auditEventDetails_(
        'BULK_IMPORT_COMPLETED',
        'bulkImport',
        bulkBatchId,
        '',
        [
          { field: 'createdCount', before: 0, after: newObjs.length },
          { field: 'skippedCount', before: 0, after: skipped },
        ],
        'Bulk import completed',
      ),
    });
  }
  auditEventRows_(auditEvents);
  return { created: created, skipped: skipped };
}
function findVoucher_(id) {
  const o = readAll_('Vouchers').filter(function (v) {
    return v.VoucherID === id;
  })[0];
  if (!o) throw err_('Voucher not found.');
  return o;
}
function updateVoucher_(user, req) {
  need_(user, 'edit');
  const o = findVoucher_(req.id);
  if (o.Status !== 'ACTIVE') throw err_('Cancelled vouchers cannot be edited.');
  if (cashDateClosed_(isoDate_(o.Date))) throw cashCloseDateError_();

  const f = req.fields || {};
  const patch = {};
  const changes = [];

  function recordChange(field, property, before, after) {
    if (before === after) return;
    patch[property] = after;
    changes.push({ field: field, before: before, after: after });
  }

  if (f.date !== undefined) {
    if (!validDate_(String(f.date))) throw err_('Invalid date.', 'VALIDATION');
    if (cashDateClosed_(String(f.date))) throw cashCloseDateError_();
    recordChange('date', 'Date', isoDate_(o.Date), String(f.date));
  }
  if (f.vendor !== undefined) {
    const vendor = clean_(f.vendor, 200);
    if (!vendor) throw err_('Vendor is required.', 'VALIDATION');
    recordChange('vendor', 'Vendor', String(o.Vendor || ''), vendor);
    recordChange(
      'vendorId',
      'VendorID',
      String(o.VendorID || ''),
      vendorIdForName_(vendor),
    );
  }
  if (f.amount !== undefined) {
    const amount = Math.round(Number(f.amount) * 100) / 100;
    if (!isFinite(amount) || amount <= 0 || amount > CFG.MAX_AMOUNT) {
      throw err_('Invalid amount.', 'VALIDATION');
    }
    recordChange('amount', 'Amount', Number(o.Amount), amount);
  }
  if (f.category !== undefined) {
    const category =
      (o.Type === 'RECEIPT' ? receiptCategories_() : categories_()).indexOf(f.category) >= 0
        ? f.category
        : 'Other';
    recordChange('category', 'Category', String(o.Category || ''), category);
  }
  if (f.notes !== undefined) {
    recordChange('notes', 'Notes', String(o.Notes || ''), clean_(f.notes, 500));
  }
  if (f.cashImpact !== undefined) {
    recordChange(
      'cashImpact',
      'CashImpact',
      String(o.CashImpact || 'UNCLASSIFIED'),
      cashImpact_(f.cashImpact, ''),
    );
  }
  if (CASH_IMPACT_CHOICES.indexOf(o.CashImpact) < 0 && f.cashImpact === undefined) {
    throw err_(
      'This historical voucher has no cash-impact classification. Choose one before saving.',
      'VALIDATION',
    );
  }

  if (!changes.length) {
    throw err_('No changes were detected. The voucher was not updated.', 'VALIDATION');
  }

  if (typeof req.reason !== 'string') {
    throw err_('Please give a correction reason of 3 to 200 characters.', 'VALIDATION');
  }
  const rawReason = req.reason.trim();
  if (rawReason.length > 200) {
    throw err_('Correction reason must be 200 characters or fewer.', 'VALIDATION');
  }
  const reason = clean_(rawReason, 200);
  if (reason.length < 3) {
    throw err_('Please give a correction reason of 3 to 200 characters.', 'VALIDATION');
  }

  const priorApprovalStatus = approvalStatus_(o);
  const priorAmount = Number(o.Amount);
  const nextAmount = Number(patch.Amount === undefined ? o.Amount : patch.Amount);
  const crossedApprovalThreshold =
    o.Type === 'PAYMENT' &&
    priorAmount < CFG.PAYMENT_APPROVAL_THRESHOLD &&
    nextAmount >= CFG.PAYMENT_APPROVAL_THRESHOLD;
  const approvalManaged = ['PENDING', 'APPROVED', 'REJECTED', 'REVIEW_REQUIRED'].indexOf(
    priorApprovalStatus,
  ) >= 0;
  // Existing blank/NOT_REQUIRED approval fields are not retroactively backfilled.
  // Re-review only vouchers already in the approval workflow or edits that cross the threshold.
  if (approvalManaged || crossedApprovalThreshold) {
    const nextApprovalStatus =
      o.Type === 'PAYMENT' && nextAmount >= CFG.PAYMENT_APPROVAL_THRESHOLD
        ? 'PENDING'
        : 'NOT_REQUIRED';
    if (priorApprovalStatus !== nextApprovalStatus) {
      changes.push({
        field: 'approvalStatus',
        before: priorApprovalStatus,
        after: nextApprovalStatus,
      });
    }
    if (String(o.ApprovedBy || '')) {
      changes.push({ field: 'approvedBy', before: String(o.ApprovedBy), after: '' });
    }
    if (String(o.ApprovedAt || '')) {
      changes.push({ field: 'approvedAt', before: tsStr_(o.ApprovedAt), after: '' });
    }
    if (String(o.ApprovalReason || '')) {
      changes.push({ field: 'approvalReason', before: String(o.ApprovalReason), after: '' });
    }
    patch.ApprovalStatus = nextApprovalStatus;
    patch.ApprovedBy = '';
    patch.ApprovedAt = '';
    patch.ApprovalReason = '';
  }

  patch.UpdatedBy = user.email;
  patch.UpdatedAt = nowIso_();
  updateRow_('Vouchers', o._row, patch);

  auditEvent_(
    user,
    'UPDATE',
    '#' + o.VoucherNo,
    'VOUCHER_UPDATED',
    'voucher',
    o.VoucherID,
    reason,
    changes,
    'Voucher fields updated',
  );

  return vOut_(Object.assign({}, o, patch));
}
function cancelVoucher_(user, req) {
  need_(user, 'cancel');
  const o = findVoucher_(req.id),
    reason = clean_(req.reason, 200);
  if (cashDateClosed_(isoDate_(o.Date))) throw cashCloseDateError_();
  if (o.Status !== 'ACTIVE') throw err_('Already cancelled.');
  if (reason.length < 3) throw err_('Please give a reason for cancelling.');
  const patch = {
    Status: 'CANCELLED',
    CancelReason: reason,
    UpdatedBy: user.email,
    UpdatedAt: nowIso_(),
  };
  updateRow_('Vouchers', o._row, patch);
  auditEvent_(
    user,
    'CANCEL',
    '#' + o.VoucherNo,
    'VOUCHER_CANCELLED',
    'voucher',
    o.VoucherID,
    reason,
    [
      { field: 'status', before: String(o.Status || 'ACTIVE'), after: 'CANCELLED' },
      { field: 'cancelReason', before: String(o.CancelReason || ''), after: reason },
    ],
    'Voucher cancelled',
  );
  return vOut_(Object.assign({}, o, patch));
}
function approveVoucher_(user, req) {
  need_(user, 'approvePayments');
  const id = typeof req.id === 'string' ? req.id.trim() : '';
  if (!id) throw err_('Voucher ID is required.', 'VALIDATION');
  const voucher = findVoucher_(id);
  if (voucher.Status !== 'ACTIVE') {
    throw err_('Only active payment vouchers can be approved.', 'APPROVAL_STATE');
  }
  if (!isEligibleApprovalPayment_(voucher)) {
    throw err_(
      'Only a valid high-value PAYMENT voucher can be approved or rejected.',
      'APPROVAL_STATE',
    );
  }
  if (approvalStatus_(voucher) !== 'PENDING') {
    throw err_(
      'This payment is not awaiting approval. Refresh the Register and review its current state.',
      'APPROVAL_STATE',
    );
  }
  if (String(voucher.CreatedBy || '').toLowerCase() === String(user.email || '').toLowerCase()) {
    throw err_('You cannot approve a payment voucher you created.', 'FORBIDDEN');
  }

  const timestamp = nowIso_();
  const patch = {
    ApprovalStatus: 'APPROVED',
    ApprovedBy: user.email,
    ApprovedAt: timestamp,
    ApprovalReason: '',
    UpdatedBy: user.email,
    UpdatedAt: timestamp,
  };
  updateRow_('Vouchers', voucher._row, patch);
  auditEvent_(
    user,
    'PAYMENT_APPROVE',
    '#' + voucher.VoucherNo,
    'PAYMENT_VOUCHER_APPROVED',
    'voucher',
    voucher.VoucherID,
    '',
    [
      { field: 'approvalStatus', before: 'PENDING', after: 'APPROVED' },
      { field: 'approvedBy', before: '', after: user.email },
      { field: 'approvedAt', before: '', after: timestamp },
    ],
    'High-value payment approved',
  );
  return vOut_(Object.assign({}, voucher, patch));
}

function rejectVoucher_(user, req) {
  need_(user, 'approvePayments');
  const id = typeof req.id === 'string' ? req.id.trim() : '';
  if (!id) throw err_('Voucher ID is required.', 'VALIDATION');
  const voucher = findVoucher_(id);
  if (voucher.Status !== 'ACTIVE') {
    throw err_('Only active payment vouchers can be rejected.', 'APPROVAL_STATE');
  }
  if (!isEligibleApprovalPayment_(voucher)) {
    throw err_(
      'Only a valid high-value PAYMENT voucher can be approved or rejected.',
      'APPROVAL_STATE',
    );
  }
  if (approvalStatus_(voucher) !== 'PENDING') {
    throw err_(
      'This payment is not awaiting approval. Refresh the Register and review its current state.',
      'APPROVAL_STATE',
    );
  }
  const reason = clean_(req.reason, 200);
  if (reason.length < 3) {
    throw err_('Please give a rejection reason of 3 to 200 characters.', 'VALIDATION');
  }

  const timestamp = nowIso_();
  const patch = {
    ApprovalStatus: 'REJECTED',
    ApprovedBy: '',
    ApprovedAt: '',
    ApprovalReason: reason,
    UpdatedBy: user.email,
    UpdatedAt: timestamp,
  };
  updateRow_('Vouchers', voucher._row, patch);
  auditEvent_(
    user,
    'PAYMENT_REJECT',
    '#' + voucher.VoucherNo,
    'PAYMENT_VOUCHER_REJECTED',
    'voucher',
    voucher.VoucherID,
    reason,
    [
      { field: 'approvalStatus', before: 'PENDING', after: 'REJECTED' },
      { field: 'approvalReason', before: '', after: reason },
    ],
    'High-value payment rejected',
  );
  return vOut_(Object.assign({}, voucher, patch));
}

function canSee_(user, o) {
  return can_(user, 'viewAll') || String(o.CreatedBy).toLowerCase() === user.email;
}
function addReceipt_(user, req) {
  const o = findVoucher_(req.id);
  if (!(
    can_(user, 'receiptAny') ||
    (can_(user, 'viewOwn') && String(o.CreatedBy).toLowerCase() === user.email)
  ))
    need_(user, 'receiptAny');
  if (o.Status !== 'ACTIVE') throw err_('Cannot add receipts to a cancelled voucher.');
  if (cashDateClosed_(isoDate_(o.Date))) throw cashCloseDateError_();
  const have = o.Receipts ? String(o.Receipts).split(',').filter(Boolean) : [];
  if (have.length >= CFG.MAX_RECEIPTS)
    throw err_('Maximum ' + CFG.MAX_RECEIPTS + ' receipts per voucher.');
  const fileId = saveReceipt_(req.receipt, o.VoucherNo, have.length);
  have.push(fileId);
  try {
    updateRow_('Vouchers', o._row, {
      Receipts: have.join(','),
      UpdatedBy: user.email,
      UpdatedAt: nowIso_(),
    });
  } catch (e) {
    trashFiles_([fileId]);
    throw e;
  }
  auditEvent_(
    user,
    'RECEIPT_ADD',
    '#' + o.VoucherNo,
    'VOUCHER_RECEIPT_ATTACHED',
    'voucher',
    o.VoucherID,
    '',
    [{ field: 'receiptCount', before: have.length - 1, after: have.length }],
    'Receipt image attached',
  );
  return vOut_(Object.assign({}, o, { Receipts: have.join(',') }));
}
function getReceipt_(user, req) {
  const o = findVoucher_(req.id);
  if (!canSee_(user, o)) need_(user, 'viewAll');
  const ids = String(o.Receipts || '').split(',');
  if (ids.indexOf(req.fileId) < 0) throw err_('Receipt not found.');
  const blob = DriveApp.getFileById(req.fileId).getBlob();
  return {
    dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()),
  };
}

/* ============ vendors ============ */
function saveVendor_(user, req) {
  need_(user, 'vendors');
  const name = clean_(req.name, 120),
    company = clean_(req.company, 120),
    mobile = clean_(req.mobile, 15);
  if (!name) throw err_('Vendor name is required.');
  if (mobile && !/^[0-9+\-\s]{7,15}$/.test(mobile)) throw err_('Enter a valid mobile number.');
  const list = readAll_('Vendors'),
    dup = list.filter(function (v) {
      return String(v.Name).toLowerCase() === name.toLowerCase() && v.VendorID !== req.id;
    })[0];
  if (dup) throw err_('This vendor already exists.');
  if (req.id) {
    const vendor = list.filter(function (item) {
      return item.VendorID === req.id;
    })[0];
    if (!vendor) throw err_('Vendor not found.');
    const changes = [
      { field: 'name', before: String(vendor.Name || ''), after: name },
      { field: 'company', before: String(vendor.Company || ''), after: company },
      { field: 'mobile', before: String(vendor.Mobile || ''), after: mobile },
    ].filter(function (change) {
      return change.before !== change.after;
    });
    updateRow_('Vendors', vendor._row, { Name: name, Company: company, Mobile: mobile });
    auditEvent_(
      user,
      'VENDOR_UPDATE',
      vendor.VendorID,
      'VENDOR_UPDATED',
      'vendor',
      vendor.VendorID,
      '',
      changes,
      'Vendor details updated',
    );
  } else {
    const vendor = {
      VendorID: Utilities.getUuid(),
      Name: name,
      Company: company,
      Mobile: mobile,
      Active: true,
      CreatedBy: user.email,
      CreatedAt: nowIso_(),
    };
    appendRows_('Vendors', [vendor]);
    auditEvent_(
      user,
      'VENDOR_CREATE',
      vendor.VendorID,
      'VENDOR_CREATED',
      'vendor',
      vendor.VendorID,
      '',
      [
        { field: 'name', before: null, after: name },
        { field: 'company', before: null, after: company },
        { field: 'mobile', before: null, after: mobile },
        { field: 'active', before: null, after: true },
      ],
      'Vendor created',
    );
  }
  return { ok: true };
}
function toggleVendor_(user, req) {
  need_(user, 'vendors');
  const v = readAll_('Vendors').filter(function (x) {
    return x.VendorID === req.id;
  })[0];
  if (!v) throw err_('Vendor not found.');
  const now = !(v.Active === true || v.Active === 'TRUE');
  updateRow_('Vendors', v._row, { Active: now });
  auditEvent_(
    user,
    now ? 'VENDOR_ON' : 'VENDOR_OFF',
    v.VendorID,
    now ? 'VENDOR_ACTIVATED' : 'VENDOR_DEACTIVATED',
    'vendor',
    v.VendorID,
    '',
    [{ field: 'active', before: !now, after: now }],
    now ? 'Vendor activated' : 'Vendor deactivated',
  );
  return { ok: true };
}

/* ============ users (owner) ============ */
function listUsers_(user) {
  need_(user, 'users');
  return readAll_('Users').map(pubUser_);
}
function activeOwners_() {
  return readAll_('Users').filter(function (u) {
    return u.Role === 'owner' && (u.Active === true || u.Active === 'TRUE');
  });
}
function saveUser_(user, req) {
  need_(user, 'users');
  const name = clean_(req.name, 80),
    email = String(req.email || '')
      .trim()
      .toLowerCase(),
    role = req.role;
  if (!name) throw err_('Name is required.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw err_('Enter a valid email.');
  if (!Object.prototype.hasOwnProperty.call(PERMS, role)) throw err_('Invalid role.');
  const all = readAll_('Users'),
    dup = all.filter(function (u) {
      return String(u.Email).toLowerCase() === email && u.UserID !== req.id;
    })[0];
  if (dup) throw err_('That email is already a user.');
  if (!req.id) {
    if (!pinOk_(String(req.pin || '')))
      throw err_('Temporary PIN must be 6 digits and not too simple.');
    const created = addUser_(name, email, role, String(req.pin), true);
    auditEvent_(
      user,
      'USER_CREATE',
      email,
      'USER_CREATED',
      'user',
      created.UserID,
      '',
      [
        { field: 'name', before: null, after: name },
        { field: 'email', before: null, after: email },
        { field: 'role', before: null, after: role },
        { field: 'active', before: null, after: true },
      ],
      'User account created; PIN change required',
    );
    return { ok: true };
  }
  const t = all.filter(function (u) {
    return u.UserID === req.id;
  })[0];
  if (!t) throw err_('User not found.');
  const active = req.active === undefined ? t.Active === true || t.Active === 'TRUE' : !!req.active;
  const owners = activeOwners_();
  if (t.Role === 'owner' && (role !== 'owner' || !active) && owners.length <= 1)
    throw err_('There must be at least one active owner.');
  const changes = [
    { field: 'name', before: String(t.Name || ''), after: name },
    { field: 'email', before: String(t.Email || ''), after: email },
    { field: 'role', before: String(t.Role || ''), after: role },
    {
      field: 'active',
      before: t.Active === true || t.Active === 'TRUE',
      after: active,
    },
  ].filter(function (change) {
    return change.before !== change.after;
  });
  updateRow_('Users', t._row, { Name: name, Email: email, Role: role, Active: active });
  auditEvent_(
    user,
    'USER_UPDATE',
    email,
    'USER_UPDATED',
    'user',
    t.UserID,
    '',
    changes,
    'User account updated',
  );
  return { ok: true };
}
function resetPin_(user, req) {
  need_(user, 'users');
  const t = readAll_('Users').filter(function (u) {
    return u.UserID === req.id;
  })[0];
  if (!t) throw err_('User not found.');
  if (!pinOk_(String(req.pin || '')))
    throw err_('Temporary PIN must be 6 digits and not too simple.');
  const salt = Utilities.getUuid();
  const previouslyRequiredChange = t.MustChangePin === true || t.MustChangePin === 'TRUE';
  updateRow_('Users', t._row, {
    Salt: salt,
    PinHash: hashPin_(salt, String(req.pin)),
    MustChangePin: true,
  });
  const cache = CacheService.getScriptCache();
  cache.remove('f:' + String(t.Email).toLowerCase());
  cache.remove('pf:' + String(t.UserID));
  auditEvent_(
    user,
    'PIN_RESET',
    t.Email,
    'USER_PIN_RESET',
    'user',
    t.UserID,
    '',
    [{ field: 'mustChangePin', before: previouslyRequiredChange, after: true }],
    'Temporary PIN reset; credential material intentionally excluded',
  );
  return { ok: true };
}
function changePin_(user, req) {
  // route_ authenticates this session after acquiring the shared ScriptLock.
  const u = user._u,
    oldPin = String(req.oldPin || ''),
    newPin = String(req.newPin || ''),
    cache = CacheService.getScriptCache(),
    fk = 'pf:' + u.UserID;
  const fails = Number(cache.get(fk) || 0);
  if (fails >= CFG.MAX_FAILS)
    throw err_('Too many PIN-change attempts. Try again in 15 minutes.', 'LOCKED');
  if (!same_(hashPin_(u.Salt, oldPin), u.PinHash)) {
    cache.put(fk, String(fails + 1), CFG.LOCK_SECONDS);
    audit_(user, 'PIN_CHANGE_FAILED', '', '');
    throw err_('Current PIN is wrong.');
  }
  cache.remove(fk);
  if (!pinOk_(newPin))
    throw err_('New PIN must be 6 digits and not too simple (e.g. 123456, 111111).');
  if (newPin === oldPin) throw err_('New PIN must be different.');
  const salt = Utilities.getUuid();
  updateRow_('Users', u._row, {
    Salt: salt,
    PinHash: hashPin_(salt, newPin),
    MustChangePin: false,
  });
  cache.remove('s:' + req.token);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('s:' + token, JSON.stringify({ email: user.email, salt: salt }), CFG.SESSION_TTL);
  audit_(user, 'PIN_CHANGE', '', '');
  return { token: token };
}
/* ============ settings / audit (owner) ============ */
function saveSettings_(user, req) {
  need_(user, 'settings');
  const name = clean_(req.propertyName, 120),
    addr = clean_(req.propertyAddress, 300);
  if (!name) throw err_('Property name is required.');
  const cats = [];
  (req.categories || []).forEach(function (c) {
    c = clean_(c, 40);
    if (c && cats.indexOf(c) < 0) cats.push(c);
  });
  if (cats.length < 1 || cats.length > 60) throw err_('Provide 1–60 categories.');
  if (cats.indexOf('Other') < 0) cats.push('Other');
  const all = readAll_('Vouchers'),
    mx = function (isR) {
      return all
        .filter(function (v) {
          return (v.Type === 'RECEIPT') === isR;
        })
        .reduce(function (m, v) {
          return Math.max(m, Number(v.VoucherNo) || 0);
        }, 0);
    };
  const next = positiveInteger_(req.nextVoucherNo, 'next voucher number'),
    nextR = positiveInteger_(req.nextReceiptNo || '1', 'next receipt number'),
    open = finiteNumber_(req.openingBalance || 0, 'opening balance');
  if (!(next > mx(false)))
    throw err_('Next voucher number must be greater than ' + mx(false) + '.', 'VALIDATION');
  if (!(nextR > mx(true)))
    throw err_('Next receipt number must be greater than ' + mx(true) + '.', 'VALIDATION');
  if (Math.abs(open) > 1e9) throw err_('Invalid opening balance.', 'VALIDATION');
  const rc = [];
  (req.receiptCategories || []).forEach(function (c) {
    c = clean_(c, 40);
    if (c && rc.indexOf(c) < 0) rc.push(c);
  });
  if (rc.indexOf('Other') < 0) rc.push('Other');
  const priorSettings = settings_();
  const nextSettings = {
    propertyName: name,
    propertyAddress: addr,
    categories: JSON.stringify(cats),
    nextVoucherNo: String(next),
    nextReceiptNo: String(nextR),
    openingBalance: String(open),
    receiptCategories: JSON.stringify(rc),
  };
  const settingChanges = Object.keys(nextSettings)
    .map(function (key) {
      return {
        field: key,
        before: Object.prototype.hasOwnProperty.call(priorSettings, key)
          ? priorSettings[key]
          : null,
        after: nextSettings[key],
      };
    })
    .filter(function (change) {
      return change.before !== change.after;
    });
  setSetting_('propertyName', name);
  setSetting_('propertyAddress', addr);
  setSetting_('categories', JSON.stringify(cats));
  setSetting_('nextVoucherNo', String(next));
  setSetting_('nextReceiptNo', String(nextR));
  setSetting_('openingBalance', String(open));
  setSetting_('receiptCategories', JSON.stringify(rc));
  auditEvent_(
    user,
    'SETTINGS',
    'property',
    'PROPERTY_SETTINGS_UPDATED',
    'settings',
    'property',
    '',
    settingChanges,
    'Property settings updated',
  );
  return { ok: true };
}
function auditLog_(user, req) {
  need_(user, 'audit');
  const sheet = sheet_('AuditLog');
  const lastRow = sheet.getLastRow();
  const totalCount = Math.max(0, lastRow - 1);
  if (lastRow < 2) return { rows: [], nextBeforeRow: null, totalCount: 0 };

  let beforeRow = lastRow + 1;
  if (req && req.beforeRow !== undefined && req.beforeRow !== null && req.beforeRow !== '') {
    const rawCursor = String(req.beforeRow);
    if (!/^\d+$/.test(rawCursor)) {
      throw err_('Invalid audit page cursor.', 'VALIDATION');
    }
    beforeRow = Number(rawCursor);
    if (!Number.isSafeInteger(beforeRow) || beforeRow < 2 || beforeRow > lastRow + 1) {
      throw err_('Invalid audit page cursor.', 'VALIDATION');
    }
  }

  const endRow = Math.min(lastRow, beforeRow - 1);
  if (endRow < 2) {
    return { rows: [], nextBeforeRow: null, totalCount: totalCount };
  }
  const startRow = Math.max(2, endRow - 199);
  const rowCount = endRow - startRow + 1;
  const values = sheet.getRange(startRow, 1, rowCount, 5).getValues();
  const rows = values.reverse().map(function (row) {
    return {
      time: tsStr_(row[0]),
      user: String(row[1]),
      action: String(row[2]),
      target: String(row[3]),
      details: String(row[4]),
    };
  });
  return {
    rows: rows,
    nextBeforeRow: startRow > 2 ? startRow : null,
    totalCount: totalCount,
  };
}
