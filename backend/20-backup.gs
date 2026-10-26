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
// Public entry point so the operator can run a backup from the Apps Script editor.
// Functions whose names end in "_" are private and never appear in the editor's Run menu.
function runBackupNow() {
  return backupData_();
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

  const vendorLookup = vendorIdLookup_();
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
        vendorId: String(voucher.VendorID || '') || vendorIdForName_(voucher.Vendor, vendorLookup),
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
        item.type !== 'PAYMENT' || ['NOT_REQUIRED', 'APPROVED'].indexOf(item.approvalStatus) >= 0
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

  const isAmbiguousVendorRow = function (item) {
    const key = String(item.vendor || '')
      .trim()
      .toLowerCase();
    return (
      !item.vendorId &&
      key !== '' &&
      Object.prototype.hasOwnProperty.call(vendorLookup.ambiguous, key)
    );
  };
  const unresolvedVendorRows = items.filter(function (item) {
    return !item.vendorId;
  });
  const ambiguousVendorCount = unresolvedVendorRows.filter(isAmbiguousVendorRow).length;
  const unmatchedVendorCount = unresolvedVendorRows.length - ambiguousVendorCount;

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
        item.status === 'ACTIVE' && item.type === 'PAYMENT' && item.approvalStatus === 'PENDING'
      );
    }).length,
    unmatchedVendorCount: unmatchedVendorCount,
    ambiguousVendorCount: ambiguousVendorCount,
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

function inspectReceiptManifest_(manifestRows, manifestReadable, receiptFiles) {
  const manifestHeader = ['originalFileId', 'backupFileId', 'name', 'createdAt'];
  const header = manifestRows.length ? manifestRows[0] : [];
  const headerValid =
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
    return String(row[0] || '').trim();
  });
  const backupIds = records.map(function (row) {
    return String(row[1] || '').trim();
  });
  const receiptById = Object.create(null);
  receiptFiles.forEach(function (file) {
    receiptById[String(file.getId())] = file;
  });
  const unique = function (values) {
    return values.every(function (value, index) {
      return Boolean(value) && values.indexOf(value) === index;
    });
  };
  const recordsValid = records.every(function (row) {
    if (!Array.isArray(row) || row.length !== manifestHeader.length) return false;
    const originalId = String(row[0] || '').trim();
    const backupId = String(row[1] || '').trim();
    const name = String(row[2] || '').trim();
    const createdAt = String(row[3] || '').trim();
    const createdAtMs = Date.parse(createdAt);
    return (
      Boolean(originalId) &&
      Boolean(backupId) &&
      originalId !== backupId &&
      Boolean(name) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt) &&
      isFinite(createdAtMs) &&
      new Date(createdAtMs).toISOString() === createdAt
    );
  });
  const copiesPresent = backupIds.every(function (id) {
    return Object.prototype.hasOwnProperty.call(receiptById, id);
  });
  const copyNamesMatch = records.every(function (row) {
    const copy = receiptById[String(row[1] || '').trim()];
    return Boolean(copy) && copy.getName() === String(row[2] || '');
  });

  return {
    headerValid: headerValid,
    recordCount: records.length,
    recordsValid: recordsValid,
    uniqueIds:
      unique(originals) &&
      unique(backupIds) &&
      originals.every(function (id) {
        return backupIds.indexOf(id) === -1;
      }),
    copiesPresent: copiesPresent,
    copyNamesMatch: copyNamesMatch,
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

      const manifestInspection = inspectReceiptManifest_(
        manifestRows,
        manifestReadable,
        receiptFiles,
      );

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
          headerValid: manifestInspection.headerValid,
          recordCount: manifestInspection.recordCount,
          recordsValid: manifestInspection.recordsValid,
          uniqueIds: manifestInspection.uniqueIds,
          copiesPresent: manifestInspection.copiesPresent,
          copyNamesMatch: manifestInspection.copyNamesMatch,
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
        'MANIFEST_RECORDS',
        inspection.manifest.recordsValid,
        inspection.manifest.recordsValid
          ? 'Each manifest row has four valid fields, distinct source/copy IDs, a name and a valid UTC timestamp.'
          : 'One or more manifest rows have missing or malformed fields.',
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
      add(
        'RECEIPT_NAMES',
        inspection.manifest.copyNamesMatch,
        inspection.manifest.copyNamesMatch
          ? 'Copied receipt names match the manifest.'
          : 'One or more copied receipt names do not match the manifest.',
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
