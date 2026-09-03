/*******************************************************
 * FILE: 06_Utils.gs
 *******************************************************/


/**
 * Return current spreadsheet.
 */
function getSpreadsheet_() {

  const configuredId =
    String(
      APP_CONFIG.SPREADSHEET_ID || ''
    ).trim();


  /*
   * Development mode:
   * If no ID is configured, use the
   * spreadsheet the script is bound to.
   */

  if (!configuredId) {

    const active =
      SpreadsheetApp.getActiveSpreadsheet();


    if (!active) {

      throw new Error(
        'No spreadsheet is configured for this application.'
      );

    }


    return active;

  }


  /*
   * Production mode:
   * Explicitly open the configured spreadsheet.
   */

  try {

    return SpreadsheetApp.openById(
      configuredId
    );

  } catch (error) {

    throw new Error(
      'Unable to open the configured Google Sheet. ' +
      'Please verify SPREADSHEET_ID.'
    );

  }

}


/**
 * Get sheet safely.
 */
function getSheet_(name) {

  const sheet =
    getSpreadsheet_().getSheetByName(name);

  if (!sheet) {
    throw new Error(
      'Required sheet not found: ' + name
    );
  }

  return sheet;
}


/**
 * Format date as DD/MM/YYYY.
 */
function formatIndianDate_(date) {

  if (!date) {
    return '';
  }

  return Utilities.formatDate(
    new Date(date),
    APP_CONFIG.TIMEZONE,
    'dd/MM/yyyy'
  );

}


/**
 * Format date + time.
 */
function formatDateTime_(date) {

  if (!date) {
    return '';
  }

  return Utilities.formatDate(
    new Date(date),
    APP_CONFIG.TIMEZONE,
    'dd/MM/yyyy HH:mm:ss'
  );

}


/**
 * Convert number to Indian currency words.
 *
 * Example:
 * 1250.50
 * One Thousand Two Hundred Fifty Rupees and Fifty Paise Only
 */
function numberToIndianWords_(amount) {

  amount = Number(amount);

  if (!isFinite(amount)) {
    return '';
  }

  const rupees =
    Math.floor(amount);

  const paise =
    Math.round((amount - rupees) * 100);

  let result =
    indianNumberToWords_(rupees) +
    ' Rupees';

  if (paise > 0) {

    result +=
      ' and ' +
      indianNumberToWords_(paise) +
      ' Paise';

  }

  result += ' Only';

  return result;
}


function indianNumberToWords_(num) {

  num = Number(num);

  if (num === 0) {
    return 'Zero';
  }

  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen'
  ];

  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety'
  ];

  function twoDigits(n) {

    if (n < 20) {
      return ones[n];
    }

    return (
      tens[Math.floor(n / 10)] +
      (n % 10 ? ' ' + ones[n % 10] : '')
    );

  }

  function threeDigits(n) {

    let output = '';

    if (n >= 100) {

      output +=
        ones[Math.floor(n / 100)] +
        ' Hundred';

      n %= 100;

      if (n > 0) {
        output += ' ';
      }

    }

    if (n > 0) {
      output += twoDigits(n);
    }

    return output;
  }

  let output = '';

  const crore =
    Math.floor(num / 10000000);

  num %= 10000000;

  const lakh =
    Math.floor(num / 100000);

  num %= 100000;

  const thousand =
    Math.floor(num / 1000);

  num %= 1000;

  if (crore) {
    output +=
      threeDigits(crore) +
      ' Crore ';
  }

  if (lakh) {
    output +=
      threeDigits(lakh) +
      ' Lakh ';
  }

  if (thousand) {
    output +=
      threeDigits(thousand) +
      ' Thousand ';
  }

  if (num) {
    output += threeDigits(num);
  }

  return output.trim();
}


/**
 * Generate voucher number.
 *
 * Example:
 * CV-000001
 */
function generateVoucherNumber_() {

  const value =
    Number(
      getSetting_(
        'NEXT_VOUCHER_NUMBER'
      )
    );


  const nextNumber =
    isFinite(value)
      ? value
      : APP_CONFIG
          .VOUCHER_NUMBER_START;


  setSetting_(
    'NEXT_VOUCHER_NUMBER',
    String(
      nextNumber + 1
    )
  );


  return String(
    nextNumber
  );

}


/**
 * Read setting.
 */
function getSetting_(key) {

  const sheet =
    getSheet_(APP_CONFIG.SHEETS.SETTINGS);

  const data =
    sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {

    if (String(data[i][0]) === key) {
      return data[i][1];
    }

  }

  return null;
}


/**
 * Save setting.
 */
function setSetting_(key, value) {

  const sheet =
    getSheet_(APP_CONFIG.SHEETS.SETTINGS);

  const data =
    sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {

    if (String(data[i][0]) === key) {

      sheet
        .getRange(i + 1, 2)
        .setValue(value);

      return;

    }

  }

  sheet.appendRow([
    key,
    value
  ]);
}


/**
 * Write audit log.
 */
function writeAuditLog_(
  user,
  action,
  voucherId,
  details
) {

  const sheet =
    getSheet_(APP_CONFIG.SHEETS.AUDIT);

  sheet.appendRow([
    Utilities.getUuid(),
    new Date(),
    user.email,
    user.role,
    action,
    voucherId || '',
    details || ''
  ]);

}
function resetVoucherSequenceTo201() {

  const user =
    requirePermission_(
      'settings',
      arguments[0]
    );

}

function testSpreadsheetConnection() {

  const ss =
    getSpreadsheet_();

  const vouchers =
    ss.getSheetByName(
      APP_CONFIG.SHEETS.VOUCHERS
    );


  if (!vouchers) {

    throw new Error(
      'Vouchers sheet was not found.'
    );

  }


  const result = {

    success: true,

    spreadsheetName:
      ss.getName(),

    spreadsheetId:
      ss.getId(),

    voucherSheet:
      vouchers.getName(),

    voucherRows:
      vouchers.getLastRow(),

    voucherColumns:
      vouchers.getLastColumn()

  };


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}

function setVoucherSequenceTo201() {

  setSetting_(
    'NEXT_VOUCHER_NUMBER',
    '201'
  );


  return {

    success: true,

    nextVoucherNumber: '201'

  };

}
function parseOptionalDate_(value) {

  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (isNaN(date.getTime())) {

    throw new Error(
      'Invalid bill date.'
    );

  }

  return date;

}

function inspectVoucherRows() {

  const sheet =
    getSheet_(
      APP_CONFIG.SHEETS.VOUCHERS
    );


  const lastRow =
    sheet.getLastRow();

  const lastColumn =
    sheet.getLastColumn();


  if (
    lastRow <= 1
  ) {

    return {

      success: true,

      message:
        'No voucher records exist yet.',

      rows: []

    };

  }


  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        lastColumn
      )
      .getDisplayValues();


  const rows =
    values.map(
      function(row) {

        return {

          voucherId:
            row[0],

          voucherNo:
            row[1],

          voucherDate:
            row[2],

          paidTo:
            row[3],

          payeeType:
            row[4],

          purpose:
            row[5],

          expenseCategory:
            row[6],

          billNumber:
            row[7],

          billDate:
            row[8],

          amount:
            row[9],

          amountInWords:
            row[10],

          paymentMode:
            row[11],

          remarks:
            row[12],

          status:
            row[13],

          createdBy:
            row[14],

          createdAt:
            row[15],

          updatedBy:
            row[16],

          updatedAt:
            row[17]

        };

      }
    );


  console.log(
    JSON.stringify(
      rows,
      null,
      2
    )
  );


  return {

    success: true,

    count:
      rows.length,

    rows:
      rows

  };

}
