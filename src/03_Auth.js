/*******************************************************
 * FILE: 03_Auth.gs
 *
 * Authentication + RBAC
 *
 * Authentication:
 *   Email + 6 digit PIN
 *
 * Authorization:
 *   Owner / Manager / Staff
 *
 * Server-side protection:
 *   Session token required.
 *******************************************************/

/**
 * Portal information before login.
 */
function getPortalInfo() {
  return {
    propertyName: APP_CONFIG.PROPERTY_NAME,

    propertyAddress: APP_CONFIG.PROPERTY_ADDRESS,

    pinLength: APP_CONFIG.AUTH.PIN_LENGTH,
  };
}

/**
 * Login.
 */
function loginUser(email, pin) {
  email = String(email || '')
    .trim()
    .toLowerCase();

  pin = String(pin || '').trim();

  if (!email) {
    throw new Error('Email address is required.');
  }

  validatePin_(pin);

  const user = findUserByEmail_(email);

  if (!user) {
    /*
     * Do not reveal whether an email
     * exists in the system.
     */

    throw new Error('Invalid email or PIN.');
  }

  /*
   * Check lockout.
   */

  if (user.lockoutUntil) {
    const lockoutTime = new Date(user.lockoutUntil);

    if (!isNaN(lockoutTime.getTime()) && lockoutTime.getTime() > Date.now()) {
      const minutes = Math.ceil((lockoutTime.getTime() - Date.now()) / 60000);

      throw new Error(
        'Too many failed attempts. ' +
          'Please try again in ' +
          minutes +
          ' minute(s).'
      );
    }
  }

  const enteredHash = hashPin_(pin);

  /*
   * Check PIN.
   */

  if (enteredHash !== user.pinHash) {
    recordFailedLogin_(user);

    throw new Error('Invalid email or PIN.');
  }

  /*
   * Successful authentication.
   */

  resetFailedLoginAttempts_(user);

  /*
   * Generate temporary session token.
   */

  const token = Utilities.getUuid() + '-' + Utilities.getUuid();

  const sessionData = {
    userId: user.userId,

    email: user.email,

    name: user.name,

    role: user.role,

    loginAt: new Date().toISOString(),
  };

  CacheService.getScriptCache().put(
    'AUTH_SESSION_' + token,

    JSON.stringify(sessionData),

    APP_CONFIG.AUTH.SESSION_TTL_SECONDS
  );

  writeLoginAudit_(user);

  return {
    success: true,

    token: token,

    user: {
      userId: user.userId,

      email: user.email,

      name: user.name,

      role: user.role,

      permissions: getPermissions_(user.role),
    },
  };
}

/**
 * Logout.
 */
function logoutUser(token) {
  if (!token) {
    return {
      success: true,
    };
  }

  CacheService.getScriptCache().remove('AUTH_SESSION_' + token);

  return {
    success: true,
  };
}

/**
 * Validate session token.
 */
function getSessionUser_(token) {
  if (!token) {
    throw new Error('Authentication required.');
  }

  const cache = CacheService.getScriptCache();

  const value = cache.get('AUTH_SESSION_' + token);

  if (!value) {
    throw new Error('Your session has expired. Please login again.');
  }

  let session;

  try {
    session = JSON.parse(value);
  } catch (error) {
    throw new Error('Invalid session.');
  }

  const user = findUserByEmail_(session.email);

  if (!user) {
    throw new Error('User account no longer exists.');
  }

  if (!user.active) {
    throw new Error('Your account is inactive.');
  }

  return user;
}

/**
 * Require a valid user.
 */
function requireUser_(token) {
  return getSessionUser_(token);
}

/**
 * Require permission.
 */
function requirePermission_(permission, token) {
  const user = requireUser_(token);

  const permissions = getPermissions_(user.role);

  if (!permissions[permission]) {
    writeAuditLog_(
      user,
      'UNAUTHORIZED_ACTION',
      '',
      'Attempted permission: ' + permission
    );

    throw new Error('You do not have permission to perform this action.');
  }

  return user;
}

/**
 * Find user.
 */
function findUserByEmail_(email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
    APP_CONFIG.SHEETS.USERS
  );

  if (!sheet) {
    throw new Error('Users sheet does not exist.');
  }

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][1] || '')
      .trim()
      .toLowerCase();

    if (rowEmail === email) {
      return {
        userId: data[i][0],

        email: rowEmail,

        name: data[i][2],

        role: String(data[i][3] || '')
          .trim()
          .toLowerCase(),

        active:
          data[i][4] === true || String(data[i][4]).toLowerCase() === 'true',

        pinHash: String(data[i][5] || ''),

        failedAttempts: Number(data[i][6] || 0),

        lockoutUntil: data[i][7] || '',
      };
    }
  }

  return null;
}

/**
 * RBAC permissions.
 */
function getPermissions_(role) {
  role = String(role || '').toLowerCase();

  switch (role) {
    case APP_CONFIG.ROLES.OWNER:
      return {
        create: true,
        edit: true,
        delete: true,
        users: true,
        settings: true,
        view: true,
        print: true,
        reports: true,
        lockPeriods: true,
      };

    case APP_CONFIG.ROLES.MANAGER:
      return {
        create: true,
        edit: true,
        delete: true,
        users: false,
        settings: false,
        view: true,
        print: true,
        reports: true,
        lockPeriods: false,
      };

    case APP_CONFIG.ROLES.STAFF:
      return {
        create: true,
        edit: true,
        delete: true,
        users: false,
        settings: false,
        view: true,
        print: true,
        reports: true,
        lockPeriods: false,
      };

    default:
      return {
        create: false,
        edit: false,
        delete: false,
        users: false,
        settings: false,
        view: false,
        print: false,
      };
  }
}

/**
 * PIN validation.
 */
function validatePin_(pin) {
  if (!/^\d{6}$/.test(String(pin || ''))) {
    throw new Error('PIN must contain exactly 6 digits.');
  }
}

/**
 * SHA-256 PIN hash.
 */
function hashPin_(pin) {
  validatePin_(pin);

  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    pin,
    Utilities.Charset.UTF_8
  );

  return bytes
    .map(function (byte) {
      const value = byte < 0 ? byte + 256 : byte;

      return value.toString(16).padStart(2, '0');
    })
    .join('');
}

/**
 * Failed login attempt.
 */
function recordFailedLogin_(user) {
  const sheet = getSheet_(APP_CONFIG.SHEETS.USERS);

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(user.userId)) {
      let attempts = Number(data[i][6] || 0);

      attempts++;

      let lockoutUntil = '';

      if (attempts >= APP_CONFIG.AUTH.MAX_FAILED_ATTEMPTS) {
        lockoutUntil = new Date(
          Date.now() + APP_CONFIG.AUTH.LOCKOUT_MINUTES * 60000
        );

        /*
         * Start counter again after
         * generating the lock.
         */

        attempts = 0;
      }

      sheet.getRange(i + 1, 7).setValue(attempts);

      sheet.getRange(i + 1, 8).setValue(lockoutUntil);

      return;
    }
  }
}

/**
 * Reset failed attempts.
 */
function resetFailedLoginAttempts_(user) {
  const sheet = getSheet_(APP_CONFIG.SHEETS.USERS);

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(user.userId)) {
      sheet.getRange(i + 1, 7, 1, 2).setValues([[0, '']]);

      return;
    }
  }
}

/**
 * Login audit.
 */
function writeLoginAudit_(user) {
  writeAuditLog_(user, 'LOGIN', '', 'Successful portal login');
}
function validateSession(token) {
  const user = getSessionUser_(token);

  return {
    valid: true,

    user: {
      userId: user.userId,

      email: user.email,

      name: user.name,

      role: user.role,

      permissions: getPermissions_(user.role),
    },
  };
}
function testLoginDirect() {
  const result = loginUser('garhjaisal8@gmail.com', '253836');

  console.log(JSON.stringify(result, null, 2));

  return result;
}

function getUsers(token) {
  requirePermission_('users', token);

  const sheet = getSheet_(APP_CONFIG.SHEETS.USERS);

  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  const data = sheet.getDataRange().getValues();

  const users = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    if (!row[0]) {
      continue;
    }

    users.push({
      userId: String(row[0] || ''),

      email: String(row[1] || ''),

      name: String(row[2] || ''),

      role: String(row[3] || ''),

      status: String(row[5] || 'ACTIVE'),

      createdAt: row[6] || '',
    });
  }

  return users;
}

function createUser(token, userData) {
  const currentUser = requirePermission_('users', token);

  if (!userData) {
    throw new Error('User data is required.');
  }

  const name = String(userData.name || '').trim();

  const email = String(userData.email || '')
    .trim()
    .toLowerCase();

  const role = String(userData.role || '')
    .trim()
    .toLowerCase();

  const pin = String(userData.pin || '').trim();

  if (!name) {
    throw new Error('Name is required.');
  }

  if (!email) {
    throw new Error('Email is required.');
  }

  if (['owner', 'manager', 'staff'].indexOf(role) === -1) {
    throw new Error('Invalid role.');
  }

  validatePin_(pin);

  const existingUser = findUserByEmail_(email);

  if (existingUser) {
    throw new Error('A user with this email already exists.');
  }

  const sheet = getSheet_(APP_CONFIG.SHEETS.USERS);

  const userId = Utilities.getUuid();

  const pinHash = hashPin_(pin);

  const now = new Date();

  sheet.appendRow([userId, email, name, role, pinHash, 'ACTIVE', now, '']);

  return {
    success: true,

    user: {
      userId: userId,

      email: email,

      name: name,

      role: role,

      status: 'ACTIVE',
    },
  };
}

function changeMyPin(token, currentPin, newPin) {
  const user = requireUser_(token);

  validatePin_(currentPin);
  validatePin_(newPin);

  const sheet = getSheet_(APP_CONFIG.SHEETS.USERS);

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(user.userId)) {
      const currentHash = hashPin_(currentPin);

      if (String(data[i][5]) !== String(currentHash)) {
        throw new Error('Current PIN is incorrect.');
      }

      sheet.getRange(i + 1, 6).setValue(hashPin_(newPin));

      sheet.getRange(i + 1, 10).setValue(new Date());

      SpreadsheetApp.flush();

      writeAuditLog_(user, 'CHANGE_PIN', user.userId, 'User changed PIN.');

      return {
        success: true,
      };
    }
  }

  throw new Error('User not found.');
}
