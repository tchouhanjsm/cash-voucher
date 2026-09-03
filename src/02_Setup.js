function migrateVoucherSheetToSimpleModel() {

  const ss =
    getSpreadsheet_();

  const sheet =
    ss.getSheetByName(
      APP_CONFIG.SHEETS.VOUCHERS
    );

  if (!sheet) {
    throw new Error(
      'Vouchers sheet not found.'
    );
  }


  const lastRow =
    sheet.getLastRow();

  const lastColumn =
    sheet.getLastColumn();


  console.log(
    'Before migration: rows=' +
    lastRow +
    ', columns=' +
    lastColumn
  );


  /*
   * Existing old-format rows.
   *
   * Old positions:
   * D = PaidTo
   * J = Amount
   * N = Status
   * O = CreatedBy
   * P = CreatedAt
   * Q = UpdatedBy
   * R = UpdatedAt
   */

  let newRows = [];


  if (
    lastRow > 1 &&
    lastColumn >= 10
  ) {

    const oldData =
      sheet
        .getRange(
          2,
          1,
          lastRow - 1,
          Math.max(
            lastColumn,
            18
          )
        )
        .getValues();


    newRows =
      oldData
        .filter(
          row =>
            String(
              row[0] || ''
            ).trim() !== ''
        )
        .map(
          row => [

            row[0],          // VoucherID
            row[1],          // VoucherNo
            row[2],          // VoucherDate
            row[3],          // PaidTo -> Vendor
            row[9],          // Amount
            row[13] || 'ACTIVE',
            row[14] || '',
            row[15] || '',
            row[16] || '',
            row[17] || ''

          ]
        );

  }


  /*
   * Clear existing sheet content.
   */

  sheet
    .getRange(
      1,
      1,
      sheet.getMaxRows(),
      sheet.getMaxColumns()
    )
    .clearContent();


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


  /*
   * Write new headers.
   */

  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([
      headers
    ]);


  /*
   * Restore existing vouchers.
   */

  if (
    newRows.length > 0
  ) {

    sheet
      .getRange(
        2,
        1,
        newRows.length,
        headers.length
      )
      .setValues(
        newRows
      );

  }


  /*
   * Formatting.
   */

  sheet.setFrozenRows(1);

  sheet
    .getRange('C:C')
    .setNumberFormat(
      'dd/MM/yyyy'
    );

  sheet
    .getRange('E:E')
    .setNumberFormat(
      '₹#,##0.00'
    );


  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setFontWeight(
      'bold'
    );


  /*
   * Determine next voucher number.
   */

  let highest =
    APP_CONFIG
      .VOUCHER_NUMBER_START - 1;


  newRows.forEach(
    function(row) {

      const number =
        Number(
          row[1]
        );

      if (
        isFinite(number) &&
        number > highest
      ) {

        highest =
          number;

      }

    }
  );


  const nextNumber =
    Math.max(
      highest + 1,
      APP_CONFIG
        .VOUCHER_NUMBER_START
    );


  setSetting_(
    'NEXT_VOUCHER_NUMBER',
    String(
      nextNumber
    )
  );


  SpreadsheetApp.flush();


  /*
   * Verify migration.
   */

  const result = {

    success: true,

    spreadsheet:
      ss.getName(),

    sheet:
      sheet.getName(),

    rows:
      sheet.getLastRow(),

    columns:
      sheet.getLastColumn(),

    migratedRows:
      newRows.length,

    nextVoucherNumber:
      nextNumber

  };


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  /*
   * Also save the result in Settings,
   * so we can verify without relying
   * on the Apps Script return window.
   */

  setSetting_(
    'LAST_MIGRATION_STATUS',
    JSON.stringify(result)
  );


  return result;

}


function createVendorsSheet_(ss) {

  let sheet =
    ss.getSheetByName('Vendors');

  if (!sheet) {
    sheet =
      ss.insertSheet('Vendors');
  }

  const headers = [
    'VendorID',
    'VendorName',
    'CompanyName',
    'Mobile',
    'Active',
    'CreatedBy',
    'CreatedAt',
    'UpdatedBy',
    'UpdatedAt'
  ];

  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([headers]);

  sheet.setFrozenRows(1);

  sheet
    .getRange(1, 1, 1, headers.length)
    .setFontWeight('bold');

}