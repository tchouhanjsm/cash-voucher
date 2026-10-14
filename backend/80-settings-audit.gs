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
    auditHealth: auditWriteHealth_(),
  };
}
