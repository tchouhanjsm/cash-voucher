/**
 * Cash Payment Vouchers — API (Google Apps Script, bound to a Google Sheet).
 * Deploy: Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
 * No secrets live in this file. Owner login is created by setup() from Script Properties.
 */
const CFG = {
  TZ: 'Asia/Kolkata',
  SESSION_TTL: 21600, // 6 h
  MAX_FAILS: 5,
  LOCK_SECONDS: 900, // 15 min
  MAX_BULK: 500,
  MAX_NORMAL: 25,
  MAX_RECEIPTS: 3,
  MAX_B64: 2200000, // ~1.6 MB image
  MAX_REQUEST: 8000000,
  BACKUP_RETENTION_DAYS: 90,
  BACKUP_HOUR: 2, // 8 MB JSON request envelope
  MAX_AMOUNT: 10000000,
  DEFAULT_RCATS: [
    'Room Revenue',
    'Restaurant',
    'Guest Advance',
    'Bank Withdrawal',
    'Refund Received',
    'Owner Deposit',
    'Other',
  ],
  TEXT_COLS: {
    Users: ['A:D', 'F:G', 'I:J'],
    Vouchers: ['A:A', 'C:D', 'F:P'],
    Vendors: ['A:D', 'F:G'],
    Settings: ['A:B'],
    AuditLog: ['A:E'],
  },
  DEFAULT_CATEGORIES: [
    'Housekeeping',
    'Maintenance',
    'Electrical',
    'Plumbing',
    'Kitchen',
    'Food & Beverage',
    'Laundry',
    'Guest Supplies',
    'Transport',
    'Fuel',
    'Staff Welfare',
    'Staff Advance',
    'Petty Cash',
    'Local Purchase',
    'Vendor Payment',
    'Repairs',
    'Gardening',
    'Security',
    'Office Expense',
    'Stationery',
    'Internet / Telecom',
    'Licenses',
    'Bank Charges',
    'Guest Refund',
    'Other',
  ],
  H: {
    Users: [
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
    ],
    Vouchers: [
      'VoucherID',
      'VoucherNo',
      'Date',
      'Vendor',
      'Amount',
      'Category',
      'Notes',
      'Status',
      'CreatedBy',
      'CreatedAt',
      'UpdatedBy',
      'UpdatedAt',
      'Receipts',
      'CancelReason',
      'ClientID',
      'Type',
    ],
    Vendors: ['VendorID', 'Name', 'Company', 'Mobile', 'Active', 'CreatedBy', 'CreatedAt'],
    Settings: ['Key', 'Value'],
    AuditLog: ['Time', 'User', 'Action', 'Target', 'Details'],
  },
};
const PERMS = {
  staff: { create: 1, viewOwn: 1 },
  manager: { create: 1, viewAll: 1, edit: 1, cancel: 1, bulk: 1, vendors: 1, receiptAny: 1 },
  owner: {
    create: 1,
    viewAll: 1,
    edit: 1,
    cancel: 1,
    bulk: 1,
    vendors: 1,
    receiptAny: 1,
    users: 1,
    settings: 1,
    audit: 1,
  },
};

/* ============ one-time setup (run from the editor) ============ */
/** Script Properties needed once: OWNER_EMAIL, OWNER_PIN (6 digits), optional OWNER_NAME. */
// eslint-disable-next-line no-unused-vars
function setup() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SS_ID')) {
    const a = SpreadsheetApp.getActiveSpreadsheet();
    if (!a)
      throw new Error(
        'This script is not bound to a Sheet. Open it from the Sheet (Extensions > Apps Script) or add Script property SS_ID = your Sheet ID.',
      );
    p.setProperty('SS_ID', a.getId());
  }
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
    const email = String(p.getProperty('OWNER_EMAIL') || '')
      .trim()
      .toLowerCase();
    const pin = String(p.getProperty('OWNER_PIN') || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Set Script Property OWNER_EMAIL first.');
    if (!pinOk_(pin))
      throw new Error('Set Script Property OWNER_PIN to a 6-digit PIN (not 123456 / 111111 etc.).');
    addUser_(p.getProperty('OWNER_NAME') || 'Owner', email, 'owner', pin, true);
    p.deleteProperty('OWNER_PIN');
    audit_({ email: 'system' }, 'SETUP', '', 'Owner created: ' + email);
  }
  Logger.log('Setup complete. Now deploy as a Web app.');
}

/* ============ backup / recovery ============ */
function ensureBackupInfrastructure_() {
  const p = props_();
  if (!p.getProperty('BACKUP_FOLDER_ID'))
    p.setProperty('BACKUP_FOLDER_ID', DriveApp.createFolder('Cash Voucher Backups').getId());
  if (typeof ScriptApp !== 'undefined') installBackupTrigger_();
}
function installBackupTrigger_() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'backupData_') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('backupData_').timeBased().atHour(CFG.BACKUP_HOUR).everyDays(1).create();
}
function csvCell_(value) {
  return '"' + String(value === undefined || value === null ? '' : value).replace(/"/g, '""') + '"';
}
function backupManifestCsv_(manifest) {
  return manifest
    .map(function (row) {
      return row.map(csvCell_).join(',');
    })
    .join('\n');
}
function backupData_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const p = props_();
  let snapshot;
  try {
    p.setProperty('BACKUP_LAST_ATTEMPT', new Date().toISOString());
    p.deleteProperty('BACKUP_LAST_ERROR');
    const ssId = p.getProperty('SS_ID'),
      sourceReceiptFolderId = p.getProperty('RECEIPT_FOLDER_ID'),
      backupRootId = p.getProperty('BACKUP_FOLDER_ID');
    if (!ssId || !sourceReceiptFolderId || !backupRootId)
      throw new Error('Backup infrastructure is not configured. Run setup() first.');
    const stamp = Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'yyyy-MM-dd_HHmmss',
      ),
      root = DriveApp.getFolderById(backupRootId),
      sourceSheet = DriveApp.getFileById(ssId);
    snapshot = root.createFolder('backup-' + stamp);
    sourceSheet.makeCopy('Cash Voucher Sheet - ' + stamp, snapshot);
    const receiptBackup = snapshot.createFolder('receipts'),
      sourceReceipts = DriveApp.getFolderById(sourceReceiptFolderId),
      files = sourceReceipts.getFiles(),
      manifest = [['originalFileId', 'backupFileId', 'name', 'createdAt']],
      copied = [];
    while (files.hasNext()) {
      const file = files.next();
      if (file.isTrashed()) continue;
      const copy = file.makeCopy(file.getName(), receiptBackup);
      copied.push(copy.getId());
      manifest.push([
        file.getId(),
        copy.getId(),
        file.getName(),
        file.getDateCreated().toISOString(),
      ]);
    }
    snapshot.createFile('receipt-manifest.csv', backupManifestCsv_(manifest), MimeType.CSV);
    pruneBackups_(root);
    p.setProperty('BACKUP_LAST_SUCCESS', new Date().toISOString());
    p.deleteProperty('BACKUP_LAST_ERROR');
    Logger.log('Backup complete: ' + snapshot.getName() + ', receipts=' + copied.length);
    return { folderId: snapshot.getId(), receiptCount: copied.length };
  } catch (e) {
    p.setProperty('BACKUP_LAST_ERROR', String(e && e.message ? e.message : e));
    throw e;
  } finally {
    lock.releaseLock();
  }
}
function backupStatus_(user) {
  need_(user, 'settings');
  const p = props_();
  const lastError = String(p.getProperty('BACKUP_LAST_ERROR') || '');
  const configured = Boolean(
    p.getProperty('SS_ID') &&
      p.getProperty('RECEIPT_FOLDER_ID') &&
      p.getProperty('BACKUP_FOLDER_ID'),
  );
  const lastAttempt = p.getProperty('BACKUP_LAST_ATTEMPT') || '';
  const lastSuccess = p.getProperty('BACKUP_LAST_SUCCESS') || '';
  let state;

  if (!configured) {
    state = 'not_configured';
  } else if (lastError) {
    state = 'failed';
  } else if (!lastSuccess) {
    state = lastAttempt ? 'incomplete' : 'never_run';
  } else {
    const successTime = Date.parse(lastSuccess);
    const attemptTime = lastAttempt ? Date.parse(lastAttempt) : null;
    const invalidAttempt = lastAttempt && !isFinite(attemptTime);
    const newerAttempt = lastAttempt && attemptTime > successTime;
    state = !isFinite(successTime) || invalidAttempt || newerAttempt ? 'incomplete' : 'success';
  }

  return {
    configured: configured,
    state: state,
    retentionDays: CFG.BACKUP_RETENTION_DAYS,
    lastAttempt: lastAttempt,
    lastSuccess: lastSuccess,
    lastError: lastError.slice(0, 300),
  };
}
function pruneBackups_(root) {
  const cutoff = Date.now() - CFG.BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    folders = [],
    it = root.getFolders();
  while (it.hasNext()) {
    const folder = it.next();
    if (/^backup-\d{4}-\d{2}-\d{2}_\d{6}$/.test(folder.getName())) folders.push(folder);
  }
  folders.forEach(function (folder) {
    if (folder.getDateCreated().getTime() < cutoff) folder.setTrashed(true);
  });
}

/* ============ web app entry ============ */
// eslint-disable-next-line no-unused-vars
function doGet() {
  return ContentService.createTextOutput('Cash Vouchers API is running.');
}
// eslint-disable-next-line no-unused-vars
function doPost(e) {
  let out;
  try {
    const raw = String((e && e.postData && e.postData.contents) || '');
    if (!raw) throw err_('Request body is required.', 'VALIDATION');
    if (raw.length > CFG.MAX_REQUEST) throw err_('Request is too large.', 'PAYLOAD');

    let req;
    try {
      req = JSON.parse(raw);
    } catch {
      throw err_('Invalid request format.', 'VALIDATION');
    }

    validateRequest_(req);
    out = { ok: true, data: route_(req) };
  } catch (err) {
    out = {
      ok: false,
      error: err.userMessage || 'Something went wrong. Please try again.',
      code: err.code || 'SERVER',
    };
    if (!err.userMessage) console.error((err && err.stack) || err);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

const ACTIONS = {
  bootstrap: bootstrap_,
  createVouchers: createVouchers_,
  updateVoucher: updateVoucher_,
  cancelVoucher: cancelVoucher_,
  addReceipt: addReceipt_,
  getReceipt: getReceipt_,
  saveVendor: saveVendor_,
  toggleVendor: toggleVendor_,
  listUsers: listUsers_,
  saveUser: saveUser_,
  resetPin: resetPin_,
  changePin: changePin_,
  saveSettings: saveSettings_,
  auditLog: auditLog_,
  backupStatus: backupStatus_,
  logout: logout_,
};
const WRITES = {
  createVouchers: 1,
  updateVoucher: 1,
  cancelVoucher: 1,
  addReceipt: 1,
  saveVendor: 1,
  toggleVendor: 1,
  saveUser: 1,
  resetPin: 1,
  changePin: 1,
  saveSettings: 1,
};

function validateRequest_(req) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) {
    throw err_('Invalid request.', 'VALIDATION');
  }

  const action = typeof req.action === 'string' ? req.action.trim() : '';
  if (!action) throw err_('Action is required.', 'VALIDATION');
  if (action.length > 50) throw err_('Invalid action.', 'VALIDATION');
  if (action !== 'login' && action !== 'logout' && typeof req.token !== 'string') {
    throw err_('Session token is required.', 'SESSION');
  }
}

function route_(req) {
  validateRequest_(req);
  if (req.action === 'login') return login_(req);
  const fn = ACTIONS[req.action];
  if (!fn) throw err_('Unknown action.', 'NOT_FOUND');

  if (!WRITES[req.action]) {
    const user = auth_(req.token);
    if (user.mustChange && req.action !== 'changePin' && req.action !== 'logout')
      throw err_('Please change your PIN first.', 'PIN_CHANGE');
    return fn(user, req);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const user = auth_(req.token);
    if (user.mustChange && req.action !== 'changePin' && req.action !== 'logout')
      throw err_('Please change your PIN first.', 'PIN_CHANGE');
    return fn(user, req);
  } finally {
    lock.releaseLock();
  }
}

/* ============ helpers ============ */
function err_(msg, code) {
  const e = new Error(msg);
  e.userMessage = msg;
  e.code = code || 'SERVER';
  return e;
}

function finiteNumber_(value, label) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) throw err_('Invalid ' + label + '.', 'VALIDATION');
  const number = Number(text);
  if (!isFinite(number)) throw err_('Invalid ' + label + '.', 'VALIDATION');
  return number;
}

function positiveInteger_(value, label) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!/^\d+$/.test(text)) throw err_('Invalid ' + label + '.', 'VALIDATION');
  const number = Number(text);
  if (!isFinite(number) || !Number.isInteger(number) || number < 1) {
    throw err_('Invalid ' + label + '.', 'VALIDATION');
  }
  return number;
}

function trashFiles_(ids) {
  (ids || []).forEach(function (id) {
    try {
      if (id) DriveApp.getFileById(id).setTrashed(true);
    } catch (e) {
      console.error('Receipt cleanup failed for ' + id + ':', e);
    }
  });
}
function props_() {
  return PropertiesService.getScriptProperties();
}
function sheet_(n) {
  const id = props_().getProperty('SS_ID');
  if (!id) throw err_('Server is not set up yet. Run setup() in the script editor.');
  const s = SpreadsheetApp.openById(id).getSheetByName(n);
  if (!s) throw err_('Sheet "' + n + '" is missing. Run setup() again.');
  validateSheetSchema_(s, n);
  return s;
}
function validateSheetSchema_(s, name) {
  const expected = CFG.H[name];
  if (!expected) throw err_('Unknown sheet schema.', 'SERVER');
  const actual = s.getRange(1, 1, 1, expected.length).getValues()[0];
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i])
      throw err_('Sheet "' + name + '" has an invalid header. Run setup() to repair it.', 'SCHEMA');
  }
}
function ensureSheet_(name) {
  const ss = SpreadsheetApp.openById(props_().getProperty('SS_ID'));
  let s = ss.getSheetByName(name) || ss.insertSheet(name);
  const h = CFG.H[name];
  s.getRange(1, 1, 1, h.length).setValues([h]); // also adds new columns to sheets from older versions
  // Plain-text columns stop Sheets turning '10-11', phone numbers or ISO timestamps into dates/numbers.
  (CFG.TEXT_COLS[name] || []).forEach(function (a) {
    s.getRange(a).setNumberFormat('@');
  });
  return s;
}
function readAll_(name) {
  const v = sheet_(name).getDataRange().getValues(),
    h = v[0] || [];
  const out = [];
  for (let i = 1; i < v.length; i++) {
    if (v[i][0] === '' || v[i][0] === null) continue;
    const o = { _row: i + 1 };
    h.forEach(function (k, j) {
      o[k] = v[i][j];
    });
    out.push(o);
  }
  return out;
}
function toRow_(name, o) {
  return CFG.H[name].map(function (k) {
    return o[k] === undefined ? '' : o[k];
  });
}
function appendRows_(name, objs) {
  if (!objs.length) return;
  const s = sheet_(name),
    rows = objs.map(function (o) {
      return toRow_(name, o);
    });
  s.getRange(s.getLastRow() + 1, 1, rows.length, CFG.H[name].length).setValues(rows);
}
function updateRow_(name, row, patch) {
  const s = sheet_(name),
    h = CFG.H[name],
    r = s.getRange(row, 1, 1, h.length),
    cur = r.getValues()[0];
  h.forEach(function (k, j) {
    if (patch[k] !== undefined) cur[j] = patch[k];
  });
  r.setValues([cur]);
}
function settings_() {
  const o = {};
  readAll_('Settings').forEach(function (r) {
    o[r.Key] = r.Value;
  });
  return o;
}
function setSetting_(k, v) {
  const row = readAll_('Settings').filter(function (r) {
    return r.Key === k;
  })[0];
  if (row) updateRow_('Settings', row._row, { Value: v });
  else appendRows_('Settings', [{ Key: k, Value: v }]);
}
function receiptCategories_() {
  try {
    return JSON.parse(settings_().receiptCategories) || CFG.DEFAULT_RCATS;
  } catch {
    return CFG.DEFAULT_RCATS;
  }
}
function categories_() {
  try {
    return JSON.parse(settings_().categories) || CFG.DEFAULT_CATEGORIES;
  } catch {
    return CFG.DEFAULT_CATEGORIES;
  }
}
function nowIso_() {
  return Utilities.formatDate(new Date(), CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss");
}
function todayIso_(plusDays) {
  return Utilities.formatDate(
    new Date(Date.now() + (plusDays || 0) * 86400000),
    CFG.TZ,
    'yyyy-MM-dd',
  );
}
function tsStr_(v) {
  return v instanceof Date
    ? Utilities.formatDate(v, CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss")
    : String(v || '');
}
function isoDate_(v) {
  return v instanceof Date ? Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd') : String(v || '');
}
function clean_(v, max) {
  let s = String(v === undefined || v === null ? '' : v)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]+/g, ' ')
    .trim()
    .slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // block spreadsheet formula injection
  return s;
}
function clientId_(v) {
  const text = String(v === undefined || v === null ? '' : v).trim();
  if (!text) return '';
  if (text.length > 60) throw err_('Invalid client ID.', 'VALIDATION');

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 31 || code === 127) throw err_('Invalid client ID.', 'VALIDATION');
  }

  return text;
}
function pinOk_(p) {
  return /^\d{6}$/.test(p) && !/^(\d)\1{5}$/.test(p) && p !== '123456' && p !== '654321';
}
function hashPin_(salt, pin) {
  const sig = Utilities.computeHmacSha256Signature(
    salt + ':' + pin,
    props_().getProperty('PEPPER'),
  );
  return sig
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');
}
function same_(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function addUser_(name, email, role, pin, must) {
  const salt = Utilities.getUuid();
  const u = {
    UserID: Utilities.getUuid(),
    Name: clean_(name, 80),
    Email: email,
    Role: role,
    Active: true,
    Salt: salt,
    PinHash: hashPin_(salt, pin),
    MustChangePin: !!must,
    CreatedAt: nowIso_(),
    LastLogin: '',
  };
  appendRows_('Users', [u]);
  return u;
}
function pubUser_(u) {
  return {
    id: u.UserID,
    name: u.Name,
    email: u.Email,
    role: u.Role,
    active: u.Active === true || u.Active === 'TRUE',
    mustChangePin: u.MustChangePin === true || u.MustChangePin === 'TRUE',
  };
}
function audit_(user, action, target, details) {
  try {
    appendRows_('AuditLog', [
      {
        Time: nowIso_(),
        User: user.email,
        Action: action,
        Target: target || '',
        Details: clean_(details, 300),
      },
    ]);
  } catch (e) {
    console.error(e);
  }
}
function can_(user, perm) {
  return !!(PERMS[user.role] && PERMS[user.role][perm]);
}
function need_(user, perm) {
  if (!can_(user, perm)) {
    audit_(user, 'DENIED', perm, '');
    throw err_('You do not have permission to do that.', 'FORBIDDEN');
  }
}

/* ============ auth ============ */
function findUserByEmail_(email) {
  return readAll_('Users').filter(function (u) {
    return String(u.Email).toLowerCase() === email;
  })[0];
}
function login_(req) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const email = String(req.email || '')
        .trim()
        .toLowerCase(),
      pin = String(req.pin || '').trim();
    const cache = CacheService.getScriptCache(),
      fk = 'f:' + email;
    const fails = Number(cache.get(fk) || 0);
    if (fails >= CFG.MAX_FAILS) throw err_('Too many attempts. Try again in 15 minutes.', 'LOCKED');
    const u = findUserByEmail_(email);
    const active = u && (u.Active === true || u.Active === 'TRUE');
    if (!u || !active || !same_(hashPin_(u.Salt, pin), u.PinHash)) {
      cache.put(fk, String(fails + 1), CFG.LOCK_SECONDS);
      if (u) audit_({ email: email }, 'LOGIN_FAILED', '', '');
      throw err_('Invalid email or PIN.');
    }
    cache.remove(fk);
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('s:' + token, JSON.stringify({ email: email, salt: u.Salt }), CFG.SESSION_TTL);
    updateRow_('Users', u._row, { LastLogin: nowIso_() });
    audit_({ email: email }, 'LOGIN', '', '');
    return { token: token, user: pubUser_(u) };
  } finally {
    lock.releaseLock();
  }
}
function auth_(token) {
  const raw = token && CacheService.getScriptCache().get('s:' + token);
  if (!raw) throw err_('Session expired. Please sign in again.', 'SESSION');
  const s = JSON.parse(raw),
    u = findUserByEmail_(s.email);
  if (!u || !(u.Active === true || u.Active === 'TRUE') || u.Salt !== s.salt)
    throw err_('Session expired. Please sign in again.', 'SESSION');
  const p = pubUser_(u);
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    mustChange: p.mustChangePin,
    _row: u._row,
    _u: u,
  };
}
function logout_(user, req) {
  CacheService.getScriptCache().remove('s:' + req.token);
  return { ok: true };
}

/* ============ bootstrap ============ */
function vOut_(o) {
  return {
    id: o.VoucherID,
    no: Number(o.VoucherNo),
    date: isoDate_(o.Date),
    vendor: String(o.Vendor),
    amount: Number(o.Amount),
    category: String(o.Category || ''),
    notes: String(o.Notes || ''),
    type: o.Type === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT',
    status: String(o.Status || 'ACTIVE'),
    createdBy: String(o.CreatedBy || ''),
    createdAt: tsStr_(o.CreatedAt),
    updatedBy: String(o.UpdatedBy || ''),
    updatedAt: tsStr_(o.UpdatedAt),
    receipts: o.Receipts ? String(o.Receipts).split(',').filter(Boolean) : [],
    cancelReason: String(o.CancelReason || ''),
  };
}
function bootstrap_(user) {
  const all = can_(user, 'viewAll');
  const vouchers = readAll_('Vouchers')
    .filter(function (o) {
      return all || String(o.CreatedBy).toLowerCase() === user.email;
    })
    .map(vOut_);
  const st = settings_();
  const vendors = readAll_('Vendors').map(function (v) {
    return {
      id: v.VendorID,
      name: String(v.Name),
      company: String(v.Company || ''),
      mobile: String(v.Mobile || ''),
      active: v.Active === true || v.Active === 'TRUE',
    };
  });
  const names = {};
  if (all)
    readAll_('Users').forEach(function (u) {
      names[String(u.Email).toLowerCase()] = u.Name;
    });
  else names[user.email] = user.name;
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      perms: PERMS[user.role],
    },
    settings: {
      propertyName: st.propertyName || '',
      propertyAddress: st.propertyAddress || '',
      categories: categories_(),
      receiptCategories: receiptCategories_(),
      nextVoucherNo: Number(st.nextVoucherNo || 201),
      nextReceiptNo: Number(st.nextReceiptNo || 1),
      openingBalance: all ? Number(st.openingBalance || 0) : 0,
    },
    vouchers: vouchers,
    vendors: vendors,
    names: names,
  };
}

/* ============ vouchers ============ */
function validDate_(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return (
    !isNaN(t.getTime()) &&
    t.toISOString().slice(0, 10) === d &&
    d <= todayIso_(1) &&
    d >= '2000-01-01'
  );
}
function saveReceipt_(r, no, i) {
  if (!r || !/^image\/(jpeg|png|webp)$/.test(r.mime))
    throw err_('Receipt must be a JPG, PNG or WebP image.');
  if (!r.data || r.data.length > CFG.MAX_B64) throw err_('Receipt image is too large.');
  const ext = r.mime.split('/')[1].replace('jpeg', 'jpg');
  const blob = Utilities.newBlob(
    Utilities.base64Decode(r.data),
    r.mime,
    'V' + no + '-' + (Date.now() % 100000) + '-' + i + '.' + ext,
  );
  return DriveApp.getFolderById(props_().getProperty('RECEIPT_FOLDER_ID')).createFile(blob).getId();
}
function nextNumber_(configured, existing, isReceipt, fallback) {
  const current = positiveInteger_(
    configured || String(fallback),
    isReceipt ? 'next receipt number' : 'next voucher number',
  );
  const max = existing
    .filter(function (v) {
      return (v.Type === 'RECEIPT') === isReceipt;
    })
    .reduce(function (m, v) {
      return Math.max(m, positiveInteger_(v.VoucherNo, 'voucher number'));
    }, 0);
  return Math.max(current, max + 1);
}

function createVouchers_(user, req) {
  need_(user, 'create');
  const entries = req.entries;
  if (!Array.isArray(entries) || !entries.length) throw err_('Add at least one payment.');
  if (req.bulk) {
    need_(user, 'bulk');
    if (entries.length > CFG.MAX_BULK) throw err_('Maximum ' + CFG.MAX_BULK + ' rows per import.');
  } else if (entries.length > CFG.MAX_NORMAL)
    throw err_('Maximum ' + CFG.MAX_NORMAL + ' payments at once. Use Bulk Upload.');
  const catsP = categories_(),
    catsR = receiptCategories_(),
    existing = readAll_('Vouchers'),
    byClient = {};
  existing.forEach(function (o) {
    if (o.ClientID) byClient[o.ClientID] = o;
  });
  const clean = [];
  entries.forEach(function (en, i) {
    const row = 'Row ' + (i + 1) + ': ';
    const date = String(en.date || '');
    if (!validDate_(date)) throw err_(row + 'invalid date.');
    const vendor = clean_(en.vendor, 200);
    if (!vendor) throw err_(row + 'vendor is required.');
    const amount = Math.round(finiteNumber_(en.amount, row + 'amount') * 100) / 100;
    if (amount <= 0 || amount > CFG.MAX_AMOUNT) throw err_(row + 'invalid amount.');
    const rec = Array.isArray(en.receipts) ? en.receipts : [];
    if (rec.length > CFG.MAX_RECEIPTS) throw err_(row + 'too many receipts.');
    const type = en.type === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT',
      cats = type === 'RECEIPT' ? catsR : catsP;
    clean.push({
      type: type,
      date: date,
      vendor: vendor,
      amount: amount,
      category: cats.indexOf(en.category) >= 0 ? en.category : 'Other',
      notes: clean_(en.notes, 500),
      clientId: clientId_(en.clientId),
      receipts: rec,
    });
  });
  const st = settings_();
  let next = nextNumber_(st.nextVoucherNo, existing, false, 201),
    nextR = nextNumber_(st.nextReceiptNo, existing, true, 1),
    created = [],
    skipped = 0,
    newObjs = [];
  const createdFileIds = [];
  try {
    clean.forEach(function (c) {
      if (c.clientId && byClient[c.clientId]) {
        const duplicate = byClient[c.clientId];
        if (!canSee_(user, duplicate)) throw err_('This client ID is already in use.', 'CONFLICT');
        skipped++;
        created.push(vOut_(duplicate));
        return;
      }
      const no = c.type === 'RECEIPT' ? nextR++ : next++,
        ids = [];
      c.receipts.forEach(function (r, i) {
        const id = saveReceipt_(r, no, i);
        ids.push(id);
        createdFileIds.push(id);
      });
      const o = {
        VoucherID: Utilities.getUuid(),
        VoucherNo: no,
        Date: c.date,
        Vendor: c.vendor,
        Amount: c.amount,
        Category: c.category,
        Notes: c.notes,
        Status: 'ACTIVE',
        CreatedBy: user.email,
        CreatedAt: nowIso_(),
        UpdatedBy: '',
        UpdatedAt: '',
        Receipts: ids.join(','),
        CancelReason: '',
        ClientID: c.clientId,
        Type: c.type,
      };
      if (c.clientId) byClient[c.clientId] = o;
      newObjs.push(o);
      created.push(vOut_(o));
    });
    appendRows_('Vouchers', newObjs);
    setSetting_('nextVoucherNo', String(next));
    setSetting_('nextReceiptNo', String(nextR));
  } catch (e) {
    trashFiles_(createdFileIds);
    throw e;
  }
  audit_(
    user,
    req.bulk ? 'BULK_CREATE' : 'CREATE',
    newObjs.length ? '#' + newObjs[0].VoucherNo : '',
    newObjs.length + ' voucher(s)' + (skipped ? ', ' + skipped + ' duplicate skipped' : ''),
  );
  return { created: created, skipped: skipped };
}
function findVoucher_(id) {
  const o = readAll_('Vouchers').filter(function (v) {
    return v.VoucherID === id;
  })[0];
  if (!o) throw err_('Voucher not found.');
  return o;
}
function updateVoucher_(user, req) {
  need_(user, 'edit');
  const o = findVoucher_(req.id);
  if (o.Status !== 'ACTIVE') throw err_('Cancelled vouchers cannot be edited.');
  const f = req.fields || {},
    patch = {};
  if (f.date !== undefined) {
    if (!validDate_(String(f.date))) throw err_('Invalid date.');
    patch.Date = String(f.date);
  }
  if (f.vendor !== undefined) {
    const v = clean_(f.vendor, 200);
    if (!v) throw err_('Vendor is required.');
    patch.Vendor = v;
  }
  if (f.amount !== undefined) {
    const a = Math.round(Number(f.amount) * 100) / 100;
    if (!isFinite(a) || a <= 0 || a > CFG.MAX_AMOUNT) throw err_('Invalid amount.');
    patch.Amount = a;
  }
  if (f.category !== undefined)
    patch.Category =
      (o.Type === 'RECEIPT' ? receiptCategories_() : categories_()).indexOf(f.category) >= 0
        ? f.category
        : 'Other';
  if (f.notes !== undefined) patch.Notes = clean_(f.notes, 500);
  patch.UpdatedBy = user.email;
  patch.UpdatedAt = nowIso_();
  updateRow_('Vouchers', o._row, patch);
  audit_(user, 'UPDATE', '#' + o.VoucherNo, Object.keys(patch).join(','));
  return vOut_(Object.assign({}, o, patch));
}
function cancelVoucher_(user, req) {
  need_(user, 'cancel');
  const o = findVoucher_(req.id),
    reason = clean_(req.reason, 200);
  if (o.Status !== 'ACTIVE') throw err_('Already cancelled.');
  if (reason.length < 3) throw err_('Please give a reason for cancelling.');
  const patch = {
    Status: 'CANCELLED',
    CancelReason: reason,
    UpdatedBy: user.email,
    UpdatedAt: nowIso_(),
  };
  updateRow_('Vouchers', o._row, patch);
  audit_(user, 'CANCEL', '#' + o.VoucherNo, reason);
  return vOut_(Object.assign({}, o, patch));
}
function canSee_(user, o) {
  return can_(user, 'viewAll') || String(o.CreatedBy).toLowerCase() === user.email;
}
function addReceipt_(user, req) {
  const o = findVoucher_(req.id);
  if (!(
    can_(user, 'receiptAny') ||
    (can_(user, 'viewOwn') && String(o.CreatedBy).toLowerCase() === user.email)
  ))
    need_(user, 'receiptAny');
  if (o.Status !== 'ACTIVE') throw err_('Cannot add receipts to a cancelled voucher.');
  const have = o.Receipts ? String(o.Receipts).split(',').filter(Boolean) : [];
  if (have.length >= CFG.MAX_RECEIPTS)
    throw err_('Maximum ' + CFG.MAX_RECEIPTS + ' receipts per voucher.');
  const fileId = saveReceipt_(req.receipt, o.VoucherNo, have.length);
  have.push(fileId);
  try {
    updateRow_('Vouchers', o._row, {
      Receipts: have.join(','),
      UpdatedBy: user.email,
      UpdatedAt: nowIso_(),
    });
  } catch (e) {
    trashFiles_([fileId]);
    throw e;
  }
  audit_(user, 'RECEIPT_ADD', '#' + o.VoucherNo, '');
  return vOut_(Object.assign({}, o, { Receipts: have.join(',') }));
}
function getReceipt_(user, req) {
  const o = findVoucher_(req.id);
  if (!canSee_(user, o)) need_(user, 'viewAll');
  const ids = String(o.Receipts || '').split(',');
  if (ids.indexOf(req.fileId) < 0) throw err_('Receipt not found.');
  const blob = DriveApp.getFileById(req.fileId).getBlob();
  return {
    dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()),
  };
}

/* ============ vendors ============ */
function saveVendor_(user, req) {
  need_(user, 'vendors');
  const name = clean_(req.name, 120),
    company = clean_(req.company, 120),
    mobile = clean_(req.mobile, 15);
  if (!name) throw err_('Vendor name is required.');
  if (mobile && !/^[0-9+\-\s]{7,15}$/.test(mobile)) throw err_('Enter a valid mobile number.');
  const list = readAll_('Vendors'),
    dup = list.filter(function (v) {
      return String(v.Name).toLowerCase() === name.toLowerCase() && v.VendorID !== req.id;
    })[0];
  if (dup) throw err_('This vendor already exists.');
  if (req.id) {
    const v = list.filter(function (x) {
      return x.VendorID === req.id;
    })[0];
    if (!v) throw err_('Vendor not found.');
    updateRow_('Vendors', v._row, { Name: name, Company: company, Mobile: mobile });
  } else
    appendRows_('Vendors', [
      {
        VendorID: Utilities.getUuid(),
        Name: name,
        Company: company,
        Mobile: mobile,
        Active: true,
        CreatedBy: user.email,
        CreatedAt: nowIso_(),
      },
    ]);
  audit_(user, req.id ? 'VENDOR_UPDATE' : 'VENDOR_CREATE', '', name);
  return { ok: true };
}
function toggleVendor_(user, req) {
  need_(user, 'vendors');
  const v = readAll_('Vendors').filter(function (x) {
    return x.VendorID === req.id;
  })[0];
  if (!v) throw err_('Vendor not found.');
  const now = !(v.Active === true || v.Active === 'TRUE');
  updateRow_('Vendors', v._row, { Active: now });
  audit_(user, now ? 'VENDOR_ON' : 'VENDOR_OFF', '', v.Name);
  return { ok: true };
}

/* ============ users (owner) ============ */
function listUsers_(user) {
  need_(user, 'users');
  return readAll_('Users').map(pubUser_);
}
function activeOwners_() {
  return readAll_('Users').filter(function (u) {
    return u.Role === 'owner' && (u.Active === true || u.Active === 'TRUE');
  });
}
function saveUser_(user, req) {
  need_(user, 'users');
  const name = clean_(req.name, 80),
    email = String(req.email || '')
      .trim()
      .toLowerCase(),
    role = req.role;
  if (!name) throw err_('Name is required.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw err_('Enter a valid email.');
  if (!PERMS[role]) throw err_('Invalid role.');
  const all = readAll_('Users'),
    dup = all.filter(function (u) {
      return String(u.Email).toLowerCase() === email && u.UserID !== req.id;
    })[0];
  if (dup) throw err_('That email is already a user.');
  if (!req.id) {
    if (!pinOk_(String(req.pin || '')))
      throw err_('Temporary PIN must be 6 digits and not too simple.');
    addUser_(name, email, role, String(req.pin), true);
    audit_(user, 'USER_CREATE', email, role);
    return { ok: true };
  }
  const t = all.filter(function (u) {
    return u.UserID === req.id;
  })[0];
  if (!t) throw err_('User not found.');
  const active = req.active === undefined ? t.Active === true || t.Active === 'TRUE' : !!req.active;
  const owners = activeOwners_();
  if (t.Role === 'owner' && (role !== 'owner' || !active) && owners.length <= 1)
    throw err_('There must be at least one active owner.');
  updateRow_('Users', t._row, { Name: name, Email: email, Role: role, Active: active });
  audit_(user, 'USER_UPDATE', email, role + (active ? '' : ' (disabled)'));
  return { ok: true };
}
function resetPin_(user, req) {
  need_(user, 'users');
  const t = readAll_('Users').filter(function (u) {
    return u.UserID === req.id;
  })[0];
  if (!t) throw err_('User not found.');
  if (!pinOk_(String(req.pin || '')))
    throw err_('Temporary PIN must be 6 digits and not too simple.');
  const salt = Utilities.getUuid();
  updateRow_('Users', t._row, {
    Salt: salt,
    PinHash: hashPin_(salt, String(req.pin)),
    MustChangePin: true,
  });
  const cache = CacheService.getScriptCache();
  cache.remove('f:' + String(t.Email).toLowerCase());
  cache.remove('pf:' + String(t.UserID));
  audit_(user, 'PIN_RESET', t.Email, '');
  return { ok: true };
}
function changePin_(user, req) {
  const u = user._u,
    oldPin = String(req.oldPin || ''),
    newPin = String(req.newPin || ''),
    cache = CacheService.getScriptCache(),
    fk = 'pf:' + u.UserID;
  const fails = Number(cache.get(fk) || 0);
  if (fails >= CFG.MAX_FAILS)
    throw err_('Too many PIN-change attempts. Try again in 15 minutes.', 'LOCKED');
  if (!same_(hashPin_(u.Salt, oldPin), u.PinHash)) {
    cache.put(fk, String(fails + 1), CFG.LOCK_SECONDS);
    audit_(user, 'PIN_CHANGE_FAILED', '', '');
    throw err_('Current PIN is wrong.');
  }
  cache.remove(fk);
  if (!pinOk_(newPin))
    throw err_('New PIN must be 6 digits and not too simple (e.g. 123456, 111111).');
  if (newPin === oldPin) throw err_('New PIN must be different.');
  const salt = Utilities.getUuid();
  updateRow_('Users', u._row, {
    Salt: salt,
    PinHash: hashPin_(salt, newPin),
    MustChangePin: false,
  });
  cache.remove('s:' + req.token);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('s:' + token, JSON.stringify({ email: user.email, salt: salt }), CFG.SESSION_TTL);
  audit_(user, 'PIN_CHANGE', '', '');
  return { token: token };
}
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
  setSetting_('propertyName', name);
  setSetting_('propertyAddress', addr);
  setSetting_('categories', JSON.stringify(cats));
  setSetting_('nextVoucherNo', String(next));
  setSetting_('nextReceiptNo', String(nextR));
  setSetting_('openingBalance', String(open));
  setSetting_('receiptCategories', JSON.stringify(rc));
  audit_(user, 'SETTINGS', '', '');
  return { ok: true };
}
function auditLog_(user) {
  need_(user, 'audit');
  const s = sheet_('AuditLog'),
    last = s.getLastRow();
  if (last < 2) return [];
  const n = Math.min(200, last - 1),
    v = s.getRange(last - n + 1, 1, n, 5).getValues();
  return v.reverse().map(function (r) {
    return {
      time: tsStr_(r[0]),
      user: String(r[1]),
      action: String(r[2]),
      target: String(r[3]),
      details: String(r[4]),
    };
  });
}
