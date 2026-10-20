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
  const actualApprovalHeaders = sheet.getRange(1, 18, 1, approvalHeaders.length).getValues()[0];
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

/** Append PaymentMethod to Vouchers column W after a verified backup. Never infer historical methods. */
// eslint-disable-next-line no-unused-vars
function migrateVoucherPaymentMethodField() {
  const id = props_().getProperty('SS_ID');
  if (!id) throw new Error('Missing SS_ID Script Property; no changes were made.');
  const spreadsheet = SpreadsheetApp.openById(id);
  const sheet = spreadsheet.getSheetByName('Vouchers');
  if (!sheet) throw new Error('Vouchers sheet is missing; no changes were made.');
  const prior = CFG.H.Vouchers.slice(0, 22);
  const actual = sheet.getRange(1, 1, 1, prior.length).getValues()[0];
  if (
    !prior.every(function (header, index) {
      return actual[index] === header;
    })
  )
    throw new Error('Vouchers must have the reviewed A:V schema; no changes were made.');
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const trailing = sheet.getRange(1, 23, lastRow, 1).getValues();
  if (trailing[0][0] === 'PaymentMethod')
    return 'PaymentMethod already exists; no changes were made.';
  if (
    trailing.some(function (row) {
      return row[0] !== '' && row[0] !== null;
    })
  )
    throw new Error('Vouchers column W already contains data; no changes were made.');
  sheet.getRange(1, 23, 1, 1).setValues([['PaymentMethod']]);
  sheet.getRange('W:W').setNumberFormat('@');
  return 'Added PaymentMethod in W. Historical methods remain blank.';
}

/** Append vendor defaults to empty H:I without rewriting existing vendor rows. */
// eslint-disable-next-line no-unused-vars
function migrateVendorDefaultsSchema() {
  const id = props_().getProperty('SS_ID');
  if (!id) throw new Error('Missing SS_ID Script Property; no changes were made.');
  const spreadsheet = SpreadsheetApp.openById(id);
  const sheet = spreadsheet.getSheetByName('Vendors');
  if (!sheet) throw new Error('Vendors sheet is missing; no changes were made.');
  const prior = CFG.H.Vendors.slice(0, 7);
  const actual = sheet.getRange(1, 1, 1, prior.length).getValues()[0];
  if (
    !prior.every(function (header, index) {
      return actual[index] === header;
    })
  )
    throw new Error('Vendors must have the reviewed A:G schema; no changes were made.');
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const trailing = sheet.getRange(1, 8, lastRow, 2).getValues();
  const expected = ['DefaultCategory', 'DefaultPaymentMethod'];
  if (
    expected.every(function (header, index) {
      return trailing[0][index] === header;
    })
  )
    return 'Vendor defaults already exist; no changes were made.';
  if (
    trailing.some(function (row) {
      return row.some(function (value) {
        return value !== '' && value !== null;
      });
    })
  )
    throw new Error('Vendors columns H:I already contain data; no changes were made.');
  sheet.getRange(1, 8, 1, 2).setValues([expected]);
  sheet.getRange('H:I').setNumberFormat('@');
  return 'Added vendor defaults. Existing vendor defaults remain blank.';
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

/**
 * Explicitly opt-in migration for a populated legacy instance moving from PIN to passwords.
 * Complete and verify a backup before running. This preserves existing hash material and forces
 * users to change credentials; the application login compatibility path is enabled only by the
 * explicit migration marker and route guards restrict migrated accounts to changePassword/logout.
 * Never run this against production without a separately reviewed recovery plan.
 */
function migratePinAuthToPasswordSchema() {
  const spreadsheetId = props_().getProperty('SS_ID');
  if (!spreadsheetId) throw new Error('SS_ID is missing; confirm the intended bound spreadsheet.');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName('Users');
  if (!sheet) throw new Error('Users sheet is missing; no migration was performed.');

  const oldHeaders = [
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
  ];
  const newHeaders = CFG.H.Users;
  const width = oldHeaders.length;
  if (sheet.getLastColumn() < width)
    throw new Error('Users sheet is incomplete; no migration was performed.');
  const current = sheet.getRange(1, 1, 1, width).getValues()[0].map(String);
  if (
    current.every(function (header, index) {
      return header === newHeaders[index];
    })
  ) {
    return {
      ok: true,
      migrated: false,
      affectedUsers: 0,
      note: 'Password schema is already present.',
    };
  }
  if (
    !current.every(function (header, index) {
      return header === oldHeaders[index];
    })
  ) {
    throw new Error(
      'Users headers do not match the expected legacy schema; no migration was performed.',
    );
  }

  // Persist a migration marker before changing row data. If a later write fails, the
  // application stays in compatibility mode and continues to enforce forced password change.
  const properties = props_();
  properties.setProperty('AUTH_SCHEMA_PASSWORD_MIGRATION', 'PIN_TO_PASSWORD_V1');

  const lastRow = sheet.getLastRow();
  let affectedUsers = 0;
  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    rows.forEach(function (row) {
      if (row[0] !== '' && row[0] !== null) {
        row[7] = true;
        affectedUsers++;
      }
    });
    sheet.getRange(2, 1, rows.length, width).setValues(rows);
  }
  sheet.getRange(1, 1, 1, width).setValues([newHeaders]);
  audit_(
    { email: 'system' },
    'AUTH_SCHEMA_MIGRATION',
    '',
    'Password schema migrated; existing accounts require password change',
  );
  return { ok: true, migrated: true, affectedUsers: affectedUsers };
}
