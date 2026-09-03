/*******************************************************
 * FILE: 05_Users.gs
 *
 * OWNER-ONLY USER MANAGEMENT
 *******************************************************/


function getUsers(token) {

  const owner =
    requirePermission_(
      'users',
      token
    );

  const sheet =
    getSheet_(
      APP_CONFIG.SHEETS.USERS
    );

  const data =
    sheet
      .getDataRange()
      .getValues();

  const users = [];

  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (!data[i][1]) {
      continue;
    }

    users.push({

      userId:
        String(data[i][0] || ''),

      email:
        String(data[i][1] || ''),

      name:
        String(data[i][2] || ''),

      role:
        String(data[i][3] || '')
          .toLowerCase(),

      active:
        data[i][4] === true ||
        String(data[i][4])
          .toLowerCase() === 'true',

      createdAt:
        formatDateTime_(
          data[i][8]
        ),

      updatedAt:
        formatDateTime_(
          data[i][9]
        )

    });

  }

  writeAuditLog_(
    owner,
    'VIEW_USERS',
    '',
    'Viewed user management'
  );

  return users;

}


function addUser(
  token,
  userData
) {

  const owner =
    requirePermission_(
      'users',
      token
    );


  if (!userData) {

    throw new Error(
      'User data is required.'
    );

  }


  const email =
    String(
      userData.email || ''
    )
      .trim()
      .toLowerCase();


  const name =
    String(
      userData.name || ''
    )
      .trim();


  const role =
    String(
      userData.role || ''
    )
      .trim()
      .toLowerCase();


  const pin =
    String(
      userData.pin || ''
    )
      .trim();


  if (!email) {

    throw new Error(
      'Email is required.'
    );

  }


  if (!name) {

    throw new Error(
      'Name is required.'
    );

  }


  if (
    ![
      APP_CONFIG.ROLES.OWNER,
      APP_CONFIG.ROLES.MANAGER,
      APP_CONFIG.ROLES.STAFF
    ].includes(role)
  ) {

    throw new Error(
      'Invalid role.'
    );

  }


  validatePin_(pin);


  if (
    findUserByEmail_(
      email
    )
  ) {

    throw new Error(
      'A user with this email already exists.'
    );

  }


  const sheet =
    getSheet_(
      APP_CONFIG.SHEETS.USERS
    );


  const now =
    new Date();


  const userId =
    Utilities.getUuid();


  const pinHash =
    hashPin_(
      pin
    );


  sheet.appendRow([

    userId,
    email,
    name,
    role,
    true,

    pinHash,

    0,
    '',

    now,
    now

  ]);


  SpreadsheetApp.flush();


  writeAuditLog_(
    owner,
    'ADD_USER',
    '',
    'Added user ' +
    email +
    ' as ' +
    role
  );


  return {

    success: true,

    user: {

      userId:
        userId,

      email:
        email,

      name:
        name,

      role:
        role,

      active:
        true

    }

  };

}

function updateUser(
  token,
  userId,
  userData
) {

  const owner =
    requirePermission_(
      'users',
      token
    );


  if (!userData) {

    throw new Error(
      'User data is required.'
    );

  }


  const sheet =
    getSheet_(
      APP_CONFIG.SHEETS.USERS
    );


  const data =
    sheet
      .getDataRange()
      .getValues();


  let rowNumber =
    -1;


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (
      String(data[i][0]) ===
      String(userId)
    ) {

      rowNumber =
        i + 1;

      break;

    }

  }


  if (
    rowNumber === -1
  ) {

    throw new Error(
      'User not found.'
    );

  }


  const email =
    String(
      userData.email || ''
    )
      .trim()
      .toLowerCase();


  const name =
    String(
      userData.name || ''
    )
      .trim();


  const role =
    String(
      userData.role || ''
    )
      .trim()
      .toLowerCase();


  const active =
    Boolean(
      userData.active
    );


  if (!email) {

    throw new Error(
      'Email is required.'
    );

  }


  if (!name) {

    throw new Error(
      'Name is required.'
    );

  }


  if (
    ![
      APP_CONFIG.ROLES.OWNER,
      APP_CONFIG.ROLES.MANAGER,
      APP_CONFIG.ROLES.STAFF
    ].includes(role)
  ) {

    throw new Error(
      'Invalid role.'
    );

  }


  /*
   * Preserve PIN information and
   * failed-login counters.
   */

  const oldPinHash =
    data[rowNumber - 1][5];


  const oldFailedAttempts =
    data[rowNumber - 1][6];


  const oldLockout =
    data[rowNumber - 1][7];


  const oldCreatedAt =
    data[rowNumber - 1][8];


  sheet
    .getRange(
      rowNumber,
      2,
      1,
      9
    )
    .setValues([

      [

        email,
        name,
        role,
        active,

        oldPinHash,
        oldFailedAttempts,
        oldLockout,

        oldCreatedAt,
        new Date()

      ]

    ]);


  SpreadsheetApp.flush();


  writeAuditLog_(
    owner,
    'UPDATE_USER',
    '',
    'Updated user ' +
    email
  );


  return {

    success: true,

    message:
      'User updated successfully.'

  };

}

function changeMyPin(
  token,
  currentPin,
  newPin
) {

  const user =
    requireUser_(token);

  validatePin_(currentPin);
  validatePin_(newPin);

  const sheet =
    getSheet_(
      APP_CONFIG.SHEETS.USERS
    );

  const data =
    sheet.getDataRange().getValues();

  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (
      String(data[i][0]) ===
      String(user.userId)
    ) {

      if (
        hashPin_(currentPin) !==
        String(data[i][5])
      ) {

        throw new Error(
          'Current PIN is incorrect.'
        );

      }

      if (
        currentPin === newPin
      ) {

        throw new Error(
          'New PIN must be different from current PIN.'
        );

      }

      sheet
        .getRange(i + 1, 6)
        .setValue(
          hashPin_(newPin)
        );

      sheet
        .getRange(i + 1, 10)
        .setValue(
          new Date()
        );

      SpreadsheetApp.flush();

      writeAuditLog_(
        user,
        'CHANGE_PIN',
        user.userId,
        'PIN changed.'
      );

      return {
        success: true
      };

    }

  }

  throw new Error(
    'User not found.'
  );

}