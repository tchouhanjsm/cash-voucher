/* ============ settings / audit (owner) ============ */
function saveSettings_(user, req) {
  need_(user, 'settings');
  const name = nameText_(req.propertyName, 'Property name', 120),
    addr = clean_(req.propertyAddress, 300);
  if (!name) throw err_('Property name is required.');
  const cats = [];
  const categoryInput =
    req.categories === undefined || req.categories === null ? [] : req.categories;
  if (!Array.isArray(categoryInput)) {
    throw err_('Categories must be a list.', 'VALIDATION');
  }
  categoryInput.forEach(function (c) {
    c = nameText_(c, 'Category', 40, true);
    if (c && cats.indexOf(c) < 0) cats.push(c);
  });
  if (cats.length < 1 || cats.length > 60) throw err_('Provide 1–60 categories.');
  if (cats.indexOf('Staff Salary') < 0) cats.push('Staff Salary');
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
  const receiptCategoryInput =
    req.receiptCategories === undefined || req.receiptCategories === null
      ? []
      : req.receiptCategories;
  if (!Array.isArray(receiptCategoryInput)) {
    throw err_('Receipt categories must be a list.', 'VALIDATION');
  }
  receiptCategoryInput.forEach(function (c) {
    c = nameText_(c, 'Receipt category', 40, true);
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
  if (lastRow < 2)
    return { rows: [], nextBeforeRow: null, totalCount: 0, auditHealth: auditWriteHealth_() };

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
    return {
      rows: [],
      nextBeforeRow: null,
      totalCount: totalCount,
      auditHealth: auditWriteHealth_(),
    };
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
    auditHealth: auditWriteHealth_(),
  };
}

/**
 * Owner-only, read-only release target probe used by the staging/UAT guard.
 * It reports resource identifiers only to a user with the Settings permission;
 * it never returns voucher rows, receipt contents, credentials or property values.
 */
function deploymentReadiness_(user) {
  need_(user, 'settings');

  const p = props_();
  const spreadsheetId = String(p.getProperty('SS_ID') || '');
  const receiptFolderId = String(p.getProperty('RECEIPT_FOLDER_ID') || '');
  const backupFolderId = String(p.getProperty('BACKUP_FOLDER_ID') || '');
  const missingSheets = [];
  const invalidHeaders = [];
  let spreadsheetReadable = false;

  try {
    if (!spreadsheetId) throw new Error('Spreadsheet property is missing.');
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    if (!spreadsheet || spreadsheet.getId() !== spreadsheetId) {
      throw new Error('Configured spreadsheet did not match the expected target.');
    }
    spreadsheetReadable = true;

    Object.keys(CFG.H).forEach(function (name) {
      const expected = CFG.H[name];
      const sheet = spreadsheet.getSheetByName(name);
      if (!sheet) {
        missingSheets.push(name);
        return;
      }
      try {
        const actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
        if (
          !expected.every(function (header, index) {
            return actual[index] === header;
          })
        ) {
          invalidHeaders.push(name);
        }
      } catch (_) {
        invalidHeaders.push(name);
      }
    });
  } catch (_) {
    spreadsheetReadable = false;
  }

  const folderReadable = function (id) {
    if (!id) return false;
    try {
      const folder = DriveApp.getFolderById(id);
      return Boolean(folder && folder.getId() === id && folder.getName());
    } catch (_) {
      return false;
    }
  };

  let backupTriggerInstalled = false;
  try {
    backupTriggerInstalled =
      typeof ScriptApp !== 'undefined' &&
      typeof ScriptApp.getProjectTriggers === 'function' &&
      ScriptApp.getProjectTriggers().some(function (trigger) {
        return trigger.getHandlerFunction() === 'backupData_';
      });
  } catch (_) {
    backupTriggerInstalled = false;
  }

  return {
    scriptId:
      typeof ScriptApp !== 'undefined' && typeof ScriptApp.getScriptId === 'function'
        ? String(ScriptApp.getScriptId() || '')
        : '',
    spreadsheetId: spreadsheetId,
    receiptFolderId: receiptFolderId,
    backupFolderId: backupFolderId,
    checks: {
      spreadsheetReadable: spreadsheetReadable,
      missingSheets: missingSheets,
      invalidHeaders: invalidHeaders,
      receiptFolderReadable: folderReadable(receiptFolderId),
      backupFolderReadable: folderReadable(backupFolderId),
      backupTriggerInstalled: backupTriggerInstalled,
    },
  };
}
