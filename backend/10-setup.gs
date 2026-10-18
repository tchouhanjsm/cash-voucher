/* ============ one-time setup (run from the editor) ============ */
/** Script Properties needed once: OWNER_EMAIL, OWNER_PASSWORD (8–128 characters), optional OWNER_NAME. */
// eslint-disable-next-line no-unused-vars
function setup() {
  const p = PropertiesService.getScriptProperties();
  const preflight = setupPreflight_(p);

  if (preflight.complete) {
    Logger.log('Setup skipped: this instance is already initialized; no changes were made.');
    return;
  }

  if (!p.getProperty('SS_ID')) p.setProperty('SS_ID', preflight.ssId);
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
    addUser_(
      p.getProperty('OWNER_NAME') || 'Owner',
      preflight.ownerEmail,
      'owner',
      preflight.ownerPassword,
      true,
    );
    p.deleteProperty('OWNER_PASSWORD');
    audit_({ email: 'system' }, 'SETUP', '', 'Owner created: ' + preflight.ownerEmail);
  }
  Logger.log('Setup complete. Now deploy as a Web app.');
}

// Read-only gate. A genuinely new instance has no application tabs or initialization markers.
// A complete instance is a no-op; a partial/legacy instance must use a reviewed recovery path.
function setupPreflight_(p) {
  const configuredSsId = String(p.getProperty('SS_ID') || '').trim();
  let ssId = configuredSsId;
  let ss;

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

  const names = Object.keys(CFG.H);
  const existingNames = names.filter(function (name) {
    return Boolean(ss.getSheetByName(name));
  });
  const hasInitializationMarkers = ['PEPPER', 'RECEIPT_FOLDER_ID', 'BACKUP_FOLDER_ID'].some(
    function (key) {
      return Boolean(p.getProperty(key));
    },
  );

  if (!existingNames.length) {
    if (hasInitializationMarkers) {
      throw new Error(
        'Setup markers exist but no application tabs were found. This may be a partial initialization; no changes were made. Inspect Script Properties, Drive folders and triggers before recovery.',
      );
    }

    const ownerEmail = String(p.getProperty('OWNER_EMAIL') || '')
      .trim()
      .toLowerCase();
    const ownerPassword = String(p.getProperty('OWNER_PASSWORD') || '');

    if (!/^\S+@\S+\.\S+$/.test(ownerEmail)) {
      throw new Error('Set Script Property OWNER_EMAIL first.');
    }
    if (!passwordOk_(ownerPassword)) {
      throw new Error('Set Script Property OWNER_PASSWORD to a password of 8–128 characters.');
    }

    return {
      complete: false,
      ssId: ssId,
      ownerEmail: ownerEmail,
      ownerPassword: ownerPassword,
    };
  }

  // Inspect existing app tabs before ensureSheet_ could write headers or formatting.
  const valuesByName = {};
  existingNames.forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 1) {
      throw new Error(
        'Existing application tab "' +
          name +
          '" is empty or incomplete. No setup changes were made; inspect the tab before recovery.',
      );
    }

    const rows = sheet.getDataRange().getValues();
    const actualHeaders = rows[0] || [];
    const expectedHeaders = CFG.H[name];
    const headersMatch =
      expectedHeaders.every(function (header, index) {
        return actualHeaders[index] === header;
      }) &&
      actualHeaders.slice(expectedHeaders.length).every(function (value) {
        return value === '' || value === null;
      });

    if (!headersMatch) {
      throw new Error(
        'Existing application tab "' +
          name +
          '" has an unexpected header. No setup changes were made. Use a reviewed schema migration or recovery procedure; do not use setup() to repair populated data.',
      );
    }

    rows.slice(1).forEach(function (row, index) {
      if (
        row.slice(expectedHeaders.length).some(function (value) {
          return value !== '' && value !== null && value !== undefined;
        })
      ) {
        throw new Error(
          'Existing application tab "' +
            name +
            '" has data outside its defined schema in row ' +
            (index + 2) +
            '. No setup changes were made; inspect the row before continuing.',
        );
      }
    });
    valuesByName[name] = rows;
  });

  if (!valuesByName.Users) {
    throw new Error(
      'A partial application schema was found without a Users tab. No setup changes were made; inspect existing tabs, settings, folders and triggers before a reviewed recovery.',
    );
  }

  const userRows = valuesByName.Users.slice(1);
  let userCount = 0;
  let hasActiveOwner = false;
  const validRoles = ['owner', 'manager', 'staff', 'accountant'];

  userRows.forEach(function (row, index) {
    const hasRowData = row.some(function (value) {
      return value !== '' && value !== null && value !== undefined;
    });
    if (!hasRowData) return;

    if (row[0] === '' || row[0] === null || row[0] === undefined) {
      throw new Error(
        'The existing Users sheet contains data without a UserID in row ' +
          (index + 2) +
          '. No setup changes were made; inspect and repair the row deliberately.',
      );
    }

    const requiredUserColumns = [0, 1, 2, 3, 5, 6, 8];
    if (
      requiredUserColumns.some(function (column) {
        return row[column] === '' || row[column] === null || row[column] === undefined;
      }) ||
      !/^\S+@\S+\.\S+$/.test(String(row[2] || '').trim()) ||
      validRoles.indexOf(
        String(row[3] || '')
          .trim()
          .toLowerCase(),
      ) < 0 ||
      ![true, false, 'TRUE', 'FALSE'].includes(row[4]) ||
      ![true, false, 'TRUE', 'FALSE'].includes(row[7])
    ) {
      throw new Error(
        'The existing Users sheet contains an invalid or incomplete user row ' +
          (index + 2) +
          '. No setup changes were made; inspect the account record before continuing.',
      );
    }

    userCount++;
    const active = row[4] === true || String(row[4]).toUpperCase() === 'TRUE';
    if (String(row[3]).trim().toLowerCase() === 'owner' && active) hasActiveOwner = true;
  });

  if (!userCount) {
    throw new Error(
      'Application tabs exist but no valid Users records were found. This may be a partial initialization; no setup changes were made.',
    );
  }
  if (!hasActiveOwner) {
    throw new Error(
      'The existing application has no active Owner account. No setup changes were made; recover Owner access through the reviewed account-recovery procedure.',
    );
  }
  if (existingNames.length !== names.length) {
    throw new Error(
      'A partial application schema was found (' +
        existingNames.length +
        ' of ' +
        names.length +
        ' expected tabs). No setup changes were made; inspect existing tabs, settings, folders and triggers before a reviewed recovery.',
    );
  }


  if (!configuredSsId) {
    throw new Error(
      'An existing application schema was found without an explicit SS_ID. No setup changes were made; verify and set the correct instance target before recovery.',
    );
  }
  if (
    !p.getProperty('PEPPER') ||
    !p.getProperty('RECEIPT_FOLDER_ID') ||
    !p.getProperty('BACKUP_FOLDER_ID')
  ) {
    throw new Error(
      'Existing application tabs are present but initialization properties are incomplete. No setup changes were made; inspect Script Properties and Drive folders before recovery.',
    );
  }
  if (p.getProperty('OWNER_PASSWORD')) {
    throw new Error(
      'An existing Owner account and OWNER_PASSWORD property were both found. No setup changes were made; verify the Owner record and remove the temporary password property through the reviewed recovery procedure.',
    );
  }

  const settingKeys = new Set(
    valuesByName.Settings.slice(1).map(function (row) {
      return String(row[0] || '');
    }),
  );
  const requiredSettings = [
    'propertyName',
    'propertyAddress',
    'categories',
    'nextVoucherNo',
    'nextReceiptNo',
    'openingBalance',
    'receiptCategories',
  ];
  const missingSettings = requiredSettings.filter(function (key) {
    return !settingKeys.has(key);
  });
  if (missingSettings.length) {
    throw new Error(
      'Existing application settings are incomplete (' +
        missingSettings.join(', ') +
        '). No setup changes were made; inspect Settings before recovery.',
    );
  }

  return { complete: true, ssId: configuredSsId };
}
