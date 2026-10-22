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
  if (!s && (n === 'CashCloses' || n === 'CashCloseCorrections')) {
    throw err_(
      'Daily Cash Close storage is missing. After a verified backup, run migrateDailyCashCloseSchema() once before using this feature.',
      'SCHEMA_MIGRATION',
    );
  }
  if (!s) throw err_('Sheet "' + n + '" is missing. Run setup() again.');
  validateSheetSchema_(s, n);
  return s;
}
function validateSheetSchema_(s, name) {
  const expected = CFG.H[name];
  if (!expected) throw err_('Unknown sheet schema.', 'SERVER');
  const actual = s.getRange(1, 1, 1, expected.length).getValues()[0];
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      if (name === 'Vouchers' && i === 16 && (actual[i] === '' || actual[i] === null)) {
        throw err_(
          'The Vouchers sheet is missing CashImpact. Run migrateCashImpactField() once in the Apps Script editor before using this version.',
          'SCHEMA_MIGRATION',
        );
      }
      if (name === 'Vouchers' && i >= 17 && i <= 20 && (actual[i] === '' || actual[i] === null)) {
        throw err_(
          'The Vouchers sheet is missing payment approval fields. After a verified backup, run migrateVoucherApprovalFields() once in the Apps Script editor before using this version.',
          'SCHEMA_MIGRATION',
        );
      }
      if (name === 'Vouchers' && i === 21 && (actual[i] === '' || actual[i] === null)) {
        throw err_(
          'The Vouchers sheet is missing stable vendor IDs. After a verified backup, run migrateVoucherVendorIdField() once in the Apps Script editor before using this version.',
          'SCHEMA_MIGRATION',
        );
      }
      if (name === 'Vouchers' && i === 22 && (actual[i] === '' || actual[i] === null)) {
        throw err_(
          'Vouchers is missing PaymentMethod. After a verified backup, run migrateVoucherPaymentMethodField() in the Apps Script editor.',
          'SCHEMA_MIGRATION',
        );
      }
      if (name === 'Vendors' && i >= 7 && i <= 8 && (actual[i] === '' || actual[i] === null)) {
        throw err_(
          'Vendors is missing default fields. After a verified backup, run migrateVendorDefaultsSchema() in the Apps Script editor.',
          'SCHEMA_MIGRATION',
        );
      }
      throw err_('Sheet "' + name + '" has an invalid header. Run setup() to repair it.', 'SCHEMA');
    }
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
  let configured;
  try {
    configured = JSON.parse(settings_().categories);
  } catch {
    configured = null;
  }
  const saved = Array.isArray(configured) ? configured : CFG.DEFAULT_CATEGORIES;
  return saved.indexOf('Staff Salary') >= 0 ? saved : saved.concat(['Staff Salary']);
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
/**
 * Validate display-name fields before persistence.
 *
 * Google Sheets is the backing store (not SQL), so this prevents malformed
 * values and reduces spreadsheet/rendering hazards; HTML output must still be
 * escaped at the renderer and formula-leading free text must still use clean_.
 * This intentionally validates syntax, not whether a real person/business exists.
 */
function nameText_(value, label, max, optional) {
  const field = String(label || 'Name');

  if (value === undefined || value === null) {
    if (optional) return '';
    throw err_(field + ' is required.', 'VALIDATION');
  }
  if (typeof value !== 'string') {
    throw err_(field + ' must be text.', 'VALIDATION');
  }

  let text = typeof value.normalize === 'function' ? value.normalize('NFKC') : value;

  // Reject invisible/control/bidirectional characters instead of silently storing them.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(text)) {
    throw err_('Enter a valid ' + field.toLowerCase() + '.', 'VALIDATION');
  }

  text = text.trim().replace(/\s+/g, ' ');
  if (!text) {
    if (optional) return '';
    throw err_(field + ' is required.', 'VALIDATION');
  }
  if (text.length > max) {
    throw err_(field + ' must be ' + max + ' characters or fewer.', 'VALIDATION');
  }

  // Support multilingual names and common business-name punctuation, but reject
  // HTML delimiters, formula operators, semicolons, and punctuation-only/numeric-only input.
  if (
    !/\p{L}/u.test(text) ||
    !/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'’&()/#:+_©®-]*$/u.test(text)
  ) {
    throw err_('Enter a valid ' + field.toLowerCase() + ' using letters, numbers and common punctuation.', 'VALIDATION');
  }

  return clean_(text, max);
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
function passwordOk_(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}
function hashPassword_(salt, password) {
  const sig = Utilities.computeHmacSha256Signature(
    salt + ':' + password,
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
function addUser_(name, email, role, password, must) {
  const salt = Utilities.getUuid();
  const u = {
    UserID: Utilities.getUuid(),
    Name: nameText_(name, 'Name', 80),
    Email: email,
    Role: role,
    Active: true,
    Salt: salt,
    PasswordHash: hashPassword_(salt, password),
    MustChangePassword: !!must,
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
    mustChangePassword: u.MustChangePassword === true || u.MustChangePassword === 'TRUE',
  };
}
function recordAuditWriteFailure_(kind, error) {
  try {
    const properties = props_();
    const rawCount = Number(properties.getProperty('AUDIT_WRITE_FAILURE_COUNT') || 0);
    const count = Number.isSafeInteger(rawCount) && rawCount >= 0 ? rawCount : 0;
    properties.setProperty('AUDIT_WRITE_STATUS', 'DEGRADED');
    properties.setProperty('AUDIT_WRITE_LAST_FAILURE_AT', nowIso_());
    properties.setProperty('AUDIT_WRITE_LAST_FAILURE_KIND', String(kind || 'UNKNOWN'));
    properties.setProperty('AUDIT_WRITE_FAILURE_COUNT', String(count + 1));
  } catch (markerError) {
    console.error('Could not persist audit-write failure marker:', markerError);
  }
  console.error('Audit persistence failed (' + String(kind || 'UNKNOWN') + '):', error);
}

function auditWriteHealth_() {
  const properties = props_();
  const rawCount = Number(properties.getProperty('AUDIT_WRITE_FAILURE_COUNT') || 0);
  const status =
    properties.getProperty('AUDIT_WRITE_STATUS') === 'DEGRADED' ? 'DEGRADED' : 'NO_KNOWN_FAILURE';
  return {
    status: status,
    failureCount: Number.isSafeInteger(rawCount) && rawCount >= 0 ? rawCount : 0,
    lastFailureAt: properties.getProperty('AUDIT_WRITE_LAST_FAILURE_AT') || '',
    lastFailureKind: properties.getProperty('AUDIT_WRITE_LAST_FAILURE_KIND') || '',
  };
}

function audit_(user, action, target, details, detailsMaxLength) {
  try {
    appendRows_('AuditLog', [
      {
        Time: nowIso_(),
        User: user.email,
        Action: action,
        Target: target || '',
        Details: clean_(details, detailsMaxLength || 300),
      },
    ]);
  } catch (e) {
    recordAuditWriteFailure_('SINGLE_EVENT', e);
  }
}
function auditEventDetails_(eventType, entityType, entityId, reason, changes, summary) {
  return JSON.stringify({
    version: 1,
    eventId: Utilities.getUuid(),
    eventType: String(eventType || ''),
    entityType: String(entityType || ''),
    entityId: String(entityId || ''),
    reason: String(reason || ''),
    summary: String(summary || ''),
    changes: Array.isArray(changes) ? changes : [],
  });
}
function auditEvent_(
  user,
  action,
  target,
  eventType,
  entityType,
  entityId,
  reason,
  changes,
  summary,
) {
  audit_(
    user,
    action,
    target,
    auditEventDetails_(eventType, entityType, entityId, reason, changes, summary),
    5000,
  );
}
function auditEventRows_(events) {
  if (!Array.isArray(events) || !events.length) return;
  const timestamp = nowIso_();
  try {
    appendRows_(
      'AuditLog',
      events.map(function (event) {
        return {
          Time: event.Time || event.time || timestamp,
          User: event.User || event.user || '',
          Action: event.Action || event.action || '',
          Target: event.Target || event.target || '',
          Details: clean_(event.Details || event.details || '', 5000),
        };
      }),
    );
  } catch (e) {
    // Audit persistence remains best-effort so a completed financial write is not misreported.
    // Record the gap durably so an owner can see it and reconcile the affected period.
    recordAuditWriteFailure_('EVENT_BATCH', e);
  }
}
function can_(user, perm) {
  if (!user || !Object.prototype.hasOwnProperty.call(PERMS, user.role)) return false;
  const permissions = PERMS[user.role];
  return Object.prototype.hasOwnProperty.call(permissions, perm) && !!permissions[perm];
}
function need_(user, perm) {
  if (!can_(user, perm)) {
    audit_(user, 'DENIED', perm, '');
    throw err_('You do not have permission to do that.', 'FORBIDDEN');
  }
}
