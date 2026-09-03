/*******************************************************
 * HOTEL GARH JAISAL HAVELI
 * CASH PAYMENT VOUCHERS
 *******************************************************/

function createVoucher(token, formData) {

  const user = requirePermission_('create', token);

  validateVoucher_(formData);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {

    const sheet = getSheet_(APP_CONFIG.SHEETS.VOUCHERS);

    const voucherId = Utilities.getUuid();
    const voucherNo = generateVoucherNumber_();
    const now = new Date();

    const row = [
      voucherId,
      voucherNo,
      parseVoucherDate_(formData.voucherDate),
      cleanText_(formData.vendor),
      Number(formData.amount),
      'ACTIVE',
      user.email,
      now,
      '',
      ''
    ];

    sheet.appendRow(row);
    SpreadsheetApp.flush();

    const savedRow = sheet
      .getRange(sheet.getLastRow(), 1, 1, 10)
      .getValues()[0];

    if (String(savedRow[0]) !== String(voucherId)) {
      throw new Error('Voucher save verification failed.');
    }

    writeAuditLog_(
      user,
      'CREATE_VOUCHER',
      voucherId,
      'Created payment voucher #' +
      voucherNo +
      ' for ' +
      formData.vendor +
      ' - ₹' +
      formData.amount
    );

    return getVoucherById(token, voucherId);

  } finally {
    lock.releaseLock();
  }
}


function getVoucherById(token, voucherId) {

  requirePermission_('view', token);

  const sheet = getSheet_(APP_CONFIG.SHEETS.VOUCHERS);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    throw new Error('Voucher not found.');
  }

  const data = sheet
    .getRange(2, 1, lastRow - 1, 10)
    .getValues();

  for (let i = 0; i < data.length; i++) {

    if (String(data[i][0]) === String(voucherId)) {
      return voucherRowToObject_(data[i]);
    }

  }

  throw new Error('Voucher not found.');
}


function getVouchers(token, limit) {

  requireUser_(token);

  const sheet =
    getSheet_(
      APP_CONFIG.SHEETS.VOUCHERS
    );

  const lastRow =
    sheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  const data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        10
      )
      .getValues();

  const results =
    data
      .filter(
        function(row) {

          return (
            row[0] &&
            row[1]
          );

        }
      )
      .map(
        function(row) {

          return {
            voucherId:
              String(row[0] || ''),

            voucherNo:
              String(row[1] || ''),

            voucherDate:
              formatIndianDate_(row[2]),

            vendor:
              String(row[3] || ''),

            amount:
              Number(row[4]) || 0,

            amountInWords:
              numberToIndianWords_(
                Number(row[4]) || 0
              ),

            status:
              String(row[5] || 'ACTIVE'),

            createdBy:
              String(row[6] || ''),

            createdAt:
              formatDateTime_(row[7]),

            updatedBy:
              String(row[8] || ''),

            updatedAt:
              formatDateTime_(row[9])

          };

        }
      )
      .reverse()
      .slice(
        0,
        Math.min(
          Number(limit) || 100,
          500
        )
      );

  return results;

}

function updateVoucher(token, voucherId, formData) {

  const user = requirePermission_('edit', token);

  validateVoucher_(formData);

  const sheet = getSheet_(APP_CONFIG.SHEETS.VOUCHERS);
  const lastRow = sheet.getLastRow();

  const data = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, 10).getValues()
    : [];

  let rowNumber = -1;
  let voucherNo = '';

  for (let i = 0; i < data.length; i++) {

    if (String(data[i][0]) === String(voucherId)) {

      rowNumber = i + 2;
      voucherNo = String(data[i][1]);
      break;

    }
  }

  if (rowNumber === -1) {
    throw new Error('Voucher not found.');
  }

  sheet
    .getRange(rowNumber, 3, 1, 3)
    .setValues([[
      parseVoucherDate_(formData.voucherDate),
      cleanText_(formData.vendor),
      Number(formData.amount)
    ]]);

  sheet
    .getRange(rowNumber, 9, 1, 2)
    .setValues([[
      user.email,
      new Date()
    ]]);

  SpreadsheetApp.flush();

  writeAuditLog_(
    user,
    'UPDATE_VOUCHER',
    voucherId,
    'Updated payment voucher #' + voucherNo
  );

  return getVoucherById(token, voucherId);
}


function deleteVoucher(token, voucherId) {

  const user = requirePermission_('delete', token);

  const sheet = getSheet_(APP_CONFIG.SHEETS.VOUCHERS);
  const lastRow = sheet.getLastRow();

  const data = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, 10).getValues()
    : [];

  for (let i = 0; i < data.length; i++) {

    if (String(data[i][0]) === String(voucherId)) {

      const rowNumber = i + 2;
      const voucherNo = String(data[i][1]);

      sheet
        .getRange(rowNumber, 6)
        .setValue('CANCELLED');

      sheet
        .getRange(rowNumber, 9, 1, 2)
        .setValues([[
          user.email,
          new Date()
        ]]);

      SpreadsheetApp.flush();

      writeAuditLog_(
        user,
        'CANCEL_VOUCHER',
        voucherId,
        'Cancelled payment voucher #' + voucherNo
      );

      return {
        success: true,
        message: 'Payment voucher #' + voucherNo + ' cancelled.'
      };
    }
  }

  throw new Error('Voucher not found.');
}


function validateVoucher_(data) {

  if (!data) {
    throw new Error('Payment data is required.');
  }

  if (!data.voucherDate) {
    throw new Error('Date is required.');
  }

  if (!String(data.vendor || '').trim()) {
    throw new Error('Vendor is required.');
  }

  const amount = Number(data.amount);

  if (!isFinite(amount) || amount <= 0) {
    throw new Error('Please enter a valid amount.');
  }
}


function voucherRowToObject_(row) {

  return {

    voucherId: String(row[0] || ''),

    voucherNo: String(row[1] || ''),

    voucherDate: formatIndianDate_(row[2]),

    vendor: String(row[3] || ''),

    amount: Number(row[4] || 0),

    amountInWords: numberToIndianWords_(row[4] || 0),

    status: String(row[5] || ''),

    createdBy: String(row[6] || ''),

    createdAt: formatDateTime_(row[7]),

    updatedBy: String(row[8] || ''),

    updatedAt: formatDateTime_(row[9])

  };
}


function parseVoucherDate_(value) {

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    throw new Error('Invalid voucher date.');
  }

  return date;
}


function cleanText_(value) {

  return String(value || '')
    .trim()
    .substring(0, 500);

}

/* =====================================================
   VENDOR MEMORY
===================================================== */

function getVendors(token) {

  requirePermission_('view', token);

  const sheet =
    getSheet_(APP_CONFIG.SHEETS.VOUCHERS);

  const lastRow =
    sheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  const data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        10
      )
      .getValues();

  const vendors = {};

  data.forEach(
    function(row) {

      const vendor =
        String(
          row[3] || ''
        )
        .trim();

      if (vendor) {

        const key =
          vendor.toLowerCase();

        if (!vendors[key]) {

          vendors[key] = {
            name: vendor,
            count: 0
          };

        }

        vendors[key].count++;

      }

    }
  );

  return Object.keys(vendors)

    .map(
      function(key) {
        return vendors[key];
      }
    )

    .sort(
      function(a, b) {

        if (b.count !== a.count) {
          return b.count - a.count;
        }

        return a.name.localeCompare(b.name);

      }
    )

    .map(
      function(item) {
        return item.name;
      }
    );

}


/* =====================================================
   BULK SAME-DAY PAYMENT ENTRIES
===================================================== */

function createMultipleVouchers(
  token,
  voucherDate,
  entries
) {

  requirePermission_(
    'create',
    token
  );

  if (
    !Array.isArray(entries) ||
    entries.length === 0
  ) {
    throw new Error(
      'At least one payment entry is required.'
    );
  }

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try {

    const user =
      requireUser_(token);

    const sheet =
      getSheet_(
        APP_CONFIG.SHEETS.VOUCHERS
      );

    const rows = [];

    entries.forEach(
      function(entry) {

        validateVoucher_({
          voucherDate: voucherDate,
          vendor: entry.vendor,
          amount: entry.amount
        });

        const voucherId =
          Utilities.getUuid();

        const voucherNo =
          generateVoucherNumber_();

        const now =
          new Date();

        rows.push([
          voucherId,
          voucherNo,
          parseVoucherDate_(
            voucherDate
          ),
          cleanText_(
            entry.vendor
          ),
          Number(
            entry.amount
          ),
          'ACTIVE',
          user.email,
          now,
          '',
          ''
        ]);

      }
    );

    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        rows.length,
        10
      )
      .setValues(rows);

    SpreadsheetApp.flush();

    writeAuditLog_(
      user,
      'CREATE_MULTIPLE_VOUCHERS',
      '',
      'Created ' +
      rows.length +
      ' payment vouchers.'
    );

    return {
      success: true,
      count: rows.length,
      voucherNumbers:
        rows.map(
          function(row) {
            return row[1];
          }
        )
    };

  } finally {

    lock.releaseLock();

  }

}
function testGetVouchers() {

  const sheet =
    getSheet_(
      APP_CONFIG.SHEETS.VOUCHERS
    );

  const lastRow =
    sheet.getLastRow();

  const lastColumn =
    sheet.getLastColumn();

  const result = {
    rows: lastRow,
    columns: lastColumn,
    headers:
      sheet
        .getRange(
          1,
          1,
          1,
          lastColumn
        )
        .getValues()[0],
    latestRows:
      lastRow > 1
        ? sheet
            .getRange(
              Math.max(2, lastRow - 4),
              1,
              Math.min(5, lastRow - 1),
              lastColumn
            )
            .getValues()
        : []
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

}

function validateVoucher_(data) {

  if (!data) {
    throw new Error(
      'Payment data is required.'
    );
  }

  if (!data.voucherDate) {
    throw new Error(
      'Date is required.'
    );
  }

  if (
    !String(
      data.vendor || ''
    ).trim()
  ) {
    throw new Error(
      'Vendor is required.'
    );
  }

  const rawAmount =
    String(
      data.amount || ''
    )
    .replace(/,/g, '')
    .trim();

  if (!rawAmount) {
    throw new Error(
      'Amount is required.'
    );
  }

  const amount =
    Number(rawAmount);

  if (
    !isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      'Amount must be a valid number.'
    );
  }

}
function yourPreviousFunctionName() {

  // existing code

}


/* =====================================================
   SHEET NORMALIZATION
===================================================== */

function normalizeVoucherSheetColumns_() {

  const sheet =
    getSheet_(
      APP_CONFIG.SHEETS.VOUCHERS
    );

  const requiredColumns = 10;

  const currentColumns =
    sheet.getMaxColumns();

  if (
    currentColumns > requiredColumns
  ) {

    sheet.deleteColumns(
      requiredColumns + 1,
      currentColumns - requiredColumns
    );

  }

  const headers = [
    'VoucherID',
    'VoucherNo',
    'VoucherDate',
    'Vendor',
    'Amount',
    'Status',
    'CreatedBy',
    'CreatedAt',
    'UpdatedBy',
    'UpdatedAt'
  ];

  sheet
    .getRange(1, 1, 1, 10)
    .setValues([headers]);

  SpreadsheetApp.flush();

  Logger.log(
    JSON.stringify({
      success: true,
      columns: sheet.getLastColumn(),
      maxColumns: sheet.getMaxColumns()
    })
  );

}
function runNormalizeVoucherSheet() {

  return normalizeVoucherSheetColumns_();

}

function testVoucherHistoryDirect() {

  const sheet =
    getSheet_(
      APP_CONFIG.SHEETS.VOUCHERS
    );

  const lastRow =
    sheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  const data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        10
      )
      .getValues();

  return data
    .filter(
      function(row) {
        return row[0] && row[1];
      }
    )
    .reverse()
    .map(
      function(row) {

        return {
          voucherId: String(row[0]),
          voucherNo: String(row[1]),
          voucherDate: row[2],
          vendor: String(row[3]),
          amount: row[4],
          status: String(row[5])
        };

      }
    );

}



