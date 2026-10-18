/* ============ one-time setup (run from the editor) ============ */
/** Script Properties needed once: OWNER_EMAIL, OWNER_PASSWORD (8–128 characters), optional OWNER_NAME. */
// eslint-disable-next-line no-unused-vars
function setup() {
  const p = PropertiesService.getScriptProperties();
  const configuredSsId = String(p.getProperty('SS_ID') || '').trim();
  let ssId = configuredSsId;
  let ss;

  // Resolve the target before writing properties or initializing resources.
  if (ssId) {
    ss = SpreadsheetApp.openById(ssId);
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss)
      throw new Error(
        'This script is not bound to a Sheet. Open it from the Sheet (Extensions > Apps Script) or add Script property SS_ID = your Sheet ID.',
      );
    ssId = ss.getId();
  }

  // Inspect an existing Users sheet before ensureSheet_ can rewrite its header.
  // Never treat malformed or partially populated user data as a new installation.
  const usersSheet = ss.getSheetByName('Users');
  let hasExistingUsers = false;
  if (usersSheet && usersSheet.getLastRow() > 0) {
    const userValues = usersSheet.getDataRange().getValues();
    const actualHeaders = userValues[0] || [];
    const expectedHeaders = CFG.H.Users;
    const headersMatch =
      expectedHeaders.every(function (header, index) {
        return actualHeaders[index] === header;
      }) &&
      actualHeaders.slice(expectedHeaders.length).every(function (value) {
        return value === '' || value === null;
      });

    if (!headersMatch) {
      throw new Error(
        'The existing Users sheet has an unexpected header. No setup changes were made. Verify its schema and use a reviewed migration; do not use setup() to repair a populated sheet.',
      );
    }

    userValues.slice(1).forEach(function (row, index) {
      const hasRowData = row.some(function (value) {
        return value !== '' && value !== null && value !== undefined;
      });
      if (!hasRowData) return;

      if (
        row.slice(expectedHeaders.length).some(function (value) {
          return value !== '' && value !== null && value !== undefined;
        })
      ) {
        throw new Error(
          'The existing Users sheet has data outside its defined schema in row ' +
            (index + 2) +
            '. No setup changes were made; inspect the row before continuing.',
        );
      }

      if (row[0] === '' || row[0] === null || row[0] === undefined) {
        throw new Error(
          'The existing Users sheet contains data without a UserID in row ' +
            (index + 2) +
            '. No setup changes were made; inspect and repair the sheet deliberately.',
        );
      }

      const requiredUserColumns = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      if (
        requiredUserColumns.some(function (column) {
          return row[column] === '' || row[column] === null || row[column] === undefined;
        })
      ) {
        throw new Error(
          'The existing Users sheet contains an incomplete user row ' +
            (index + 2) +
            '. No setup changes were made; inspect the account record before continuing.',
        );
      }

      hasExistingUsers = true;
    });
  }

  // Validate the first owner before any Script Property, Sheet, Drive, or trigger writes.
  const ownerEmail = String(p.getProperty('OWNER_EMAIL') || '')
    .trim()
    .toLowerCase();
  const ownerPassword = String(p.getProperty('OWNER_PASSWORD') || '');

  if (!hasExistingUsers) {
    if (!/^\S+@\S+\.\S+$/.test(ownerEmail)) {
      throw new Error('Set Script Property OWNER_EMAIL first.');
    }
    if (!passwordOk_(ownerPassword)) {
      throw new Error('Set Script Property OWNER_PASSWORD to a password of 8–128 characters.');
    }
  }

  // Do not persist an inferred target until preflight has passed.
  if (!configuredSsId) p.setProperty('SS_ID', ssId);
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
    addUser_(p.getProperty('OWNER_NAME') || 'Owner', ownerEmail, 'owner', ownerPassword, true);
    p.deleteProperty('OWNER_PASSWORD');
    audit_({ email: 'system' }, 'SETUP', '', 'Owner created: ' + ownerEmail);
  }
  Logger.log('Setup complete. Now deploy as a Web app.');
}
