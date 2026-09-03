/*******************************************************
 * FILE: 05_Vendors.gs
 *
 * VENDOR MANAGEMENT
 *******************************************************/

function createVendor(
  token,
  vendorData
) {

  const user =
    requirePermission_(
      'create',
      token
    );

  const vendorName =
    String(
      vendorData.vendorName || ''
    ).trim();

  const companyName =
    String(
      vendorData.companyName || ''
    ).trim();

  const mobile =
    String(
      vendorData.mobile || ''
    ).trim();


  if (!vendorName) {

    throw new Error(
      'Vendor name is required.'
    );

  }


  if (
    mobile &&
    !/^[0-9+\-\s]{7,15}$/.test(
      mobile
    )
  ) {

    throw new Error(
      'Please enter a valid mobile number.'
    );

  }


  const sheet =
    getSheet_(
      APP_CONFIG.SHEETS.VENDORS
    );

  const data =
    sheet
      .getDataRange()
      .getValues();


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (
      String(
        data[i][1] || ''
      )
      .trim()
      .toLowerCase() ===
      vendorName.toLowerCase()
    ) {

      throw new Error(
        'This vendor already exists.'
      );

    }

  }


  const vendorId =
    Utilities.getUuid();

  const now =
    new Date();


  sheet.appendRow([

    vendorId,

    vendorName,

    companyName,

    mobile,

    true,

    user.email,

    now,

    '',

    ''

  ]);


  SpreadsheetApp.flush();


  writeAuditLog_(
    user,
    'CREATE_VENDOR',
    vendorId,
    'Created vendor ' +
    vendorName
  );


  return {

    success: true,

    vendorId:
      vendorId,

    vendorName:
      vendorName

  };

}


function getVendors(token) {

  requirePermission_(
    'view',
    token
  );

  const sheet =
    getSheet_(
      APP_CONFIG.SHEETS.VENDORS
    );

  const lastRow =
    sheet.getLastRow();

  if (
    lastRow <= 1
  ) {
    return [];
  }

  const data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        9
      )
      .getValues();


  return data

    .filter(
      function(row) {

        return row[0];

      }
    )

    .map(
      function(row) {

        return {

          vendorId:
            String(row[0] || ''),

          vendorName:
            String(row[1] || ''),

          companyName:
            String(row[2] || ''),

          mobile:
            String(row[3] || ''),

          active:
            row[4] === true

        };

      }
    );

}


function updateVendor(
  token,
  vendorId,
  vendorData
) {

  const user =
    requirePermission_(
      'edit',
      token
    );

  const sheet =
    getSheet_(
      APP_CONFIG.SHEETS.VENDORS
    );

  const data =
    sheet
      .getDataRange()
      .getValues();


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (
      String(data[i][0]) ===
      String(vendorId)
    ) {

      const vendorName =
        String(
          vendorData.vendorName || ''
        ).trim();

      const companyName =
        String(
          vendorData.companyName || ''
        ).trim();

      const mobile =
        String(
          vendorData.mobile || ''
        ).trim();


      if (!vendorName) {

        throw new Error(
          'Vendor name is required.'
        );

      }


      sheet
        .getRange(
          i + 1,
          2,
          1,
          3
        )
        .setValues([[
          vendorName,
          companyName,
          mobile
        ]]);


      sheet
        .getRange(
          i + 1,
          8,
          1,
          2
        )
        .setValues([[
          user.email,
          new Date()
        ]]);


      SpreadsheetApp.flush();


      writeAuditLog_(
        user,
        'UPDATE_VENDOR',
        vendorId,
        'Updated vendor ' +
        vendorName
      );


      return {
        success: true
      };

    }

  }


  throw new Error(
    'Vendor not found.'
  );

}


function setVendorActive(
  token,
  vendorId,
  active
) {

  const user =
    requirePermission_(
      'edit',
      token
    );

  const sheet =
    getSheet_(
      APP_CONFIG.SHEETS.VENDORS
    );

  const data =
    sheet
      .getDataRange()
      .getValues();


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (
      String(data[i][0]) ===
      String(vendorId)
    ) {

      sheet
        .getRange(
          i + 1,
          5
        )
        .setValue(
          Boolean(active)
        );


      sheet
        .getRange(
          i + 1,
          8,
          1,
          2
        )
        .setValues([[
          user.email,
          new Date()
        ]]);


      SpreadsheetApp.flush();


      writeAuditLog_(
        user,
        active
          ? 'ACTIVATE_VENDOR'
          : 'DEACTIVATE_VENDOR',
        vendorId,
        (
          active
            ? 'Activated vendor'
            : 'Deactivated vendor'
        )
      );


      return {
        success: true
      };

    }

  }


  throw new Error(
    'Vendor not found.'
  );

}