// Minimal in-memory mock of the Apps Script services used by backend/*.gs
const fs = require('fs'),
  vm = require('vm'),
  crypto = require('crypto'),
  path = require('path');

// Apps Script loads every .gs file into one global scope, in file-name order.
function backendSource() {
  const dir = path.join(__dirname, '../backend');
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.gs'))
    .sort()
    .map((name) => fs.readFileSync(path.join(dir, name), 'utf8'))
    .join('\n');
}
function create(options = {}) {
  const withOnboardingEnvironment = options.onboardingEnvironment !== false;
  const sheets = {},
    propsStore = {},
    cacheStore = {},
    files = {},
    faults = {
      failNextAuditWrite: false,
      failNextAuditMarkerWrite: false,
      failNextAuditFallbackWrite: false,
      failNextAuditCacheWrite: false,
      failNextMail: false,
      failNextSettingWrite: false,
      failNextVoucherWriteAfterCommit: false,
    },
    mailLog = [],
    auditDiagnostics = [],
    lockStats = { attempts: 0, waits: 0, releases: 0, failNextWait: false, afterAcquire: null },
    scriptTriggers = [];
  const mockConsole = Object.create(console);
  mockConsole.error = (...args) => {
    auditDiagnostics.push(args.map((value) => (value && value.stack) || String(value)).join(' '));
    console.error(...args);
  };
  const mkSheet = (name) => {
    const rows = [];
    const rng = (r, c, nr, nc) => ({
      getValues: () =>
        Array.from({ length: nr }, (_, i) =>
          Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? ''),
        ),
      setValues: (v) => {
        if (
          name === 'Settings' &&
          faults.failNextAuditFallbackWrite &&
          v.some((row) => Array.isArray(row) && row[0] === 'auditWriteFailureMarker')
        ) {
          faults.failNextAuditFallbackWrite = false;
          throw new Error('Simulated audit fallback Settings write failure');
        }
        if (name === 'Settings' && faults.failNextSettingWrite) {
          faults.failNextSettingWrite = false;
          throw new Error('Simulated settings counter write failure');
        }
        if (name === 'AuditLog' && faults.failNextAuditWrite) {
          faults.failNextAuditWrite = false;
          throw new Error('Simulated audit log write failure');
        }
        v.forEach((row, i) =>
          row.forEach((val, j) => {
            (rows[r - 1 + i] ||= [])[c - 1 + j] = val;
          }),
        );
        if (name === 'Vouchers' && faults.failNextVoucherWriteAfterCommit) {
          faults.failNextVoucherWriteAfterCommit = false;
          throw new Error('Simulated voucher write acknowledgement failure after commit');
        }
      },
      setNumberFormat() {
        return this;
      },
    });
    return {
      name,
      rows,
      getLastRow: () => rows.length,
      getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
      getRange: (a, b, c, d) =>
        typeof a === 'string'
          ? {
              setNumberFormat() {
                return this;
              },
            }
          : rng(a, b, c, d),
    };
  };
  const ss = {
    getId: () => 'SS1',
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = mkSheet(n)),
  };
  const ctx = {
    console: mockConsole,
    JSON,
    Date,
    Math,
    Object,
    Array,
    String,
    Number,
    isFinite,
    isNaN,
    RegExp,
    Error,
    parseInt,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    ScriptApp: {
      getScriptId: () => 'MOCK_SCRIPT_ID',
      getProjectTriggers: () => scriptTriggers.slice(),
      deleteTrigger: (trigger) => {
        const index = scriptTriggers.indexOf(trigger);
        if (index >= 0) scriptTriggers.splice(index, 1);
      },
      newTrigger: (handler) => ({
        getHandlerFunction: () => handler,
        timeBased() {
          return this;
        },
        atHour() {
          return this;
        },
        everyDays() {
          return this;
        },
        create() {
          const trigger = { getHandlerFunction: () => handler };
          scriptTriggers.push(trigger);
          return trigger;
        },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => propsStore[k] ?? null,
        setProperty(k, v) {
          if (faults.failNextAuditMarkerWrite && String(k).startsWith('AUDIT_WRITE_')) {
            faults.failNextAuditMarkerWrite = false;
            throw new Error('Simulated audit marker persistence failure');
          }
          propsStore[k] = String(v);
        },
        deleteProperty: (k) => delete propsStore[k],
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cacheStore[k] ?? null,
        put: (k, v) => {
          if (faults.failNextAuditCacheWrite && k === 'CV_AUDIT_WRITE_FAILURE_TRANSIENT') {
            faults.failNextAuditCacheWrite = false;
            throw new Error('Simulated audit cache marker write failure');
          }
          cacheStore[k] = v;
        },
        remove: (k) => delete cacheStore[k],
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() {
          lockStats.attempts++;
          if (lockStats.failNextWait) {
            lockStats.failNextWait = false;
            throw new Error('Simulated lock contention timeout');
          }
          lockStats.waits++;
          const afterAcquire = lockStats.afterAcquire;
          lockStats.afterAcquire = null;
          if (typeof afterAcquire === 'function') afterAcquire();
        },
        releaseLock() {
          lockStats.releases++;
        },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (t) => ({
        t,
        setMimeType() {
          return this;
        },
        getContent() {
          return t;
        },
      }),
    },
    DriveApp: {
      createFolder: () => ({ getId: () => 'FOLDER' }),
      getFolderById: (folderId) => ({
        getId: () => folderId,
        getName: () => 'Mock folder',
        createFile: (b) => {
          const id = 'F' + Object.keys(files).length;
          files[id] = b;
          return { getId: () => id };
        },
      }),
      getFileById: (id) => ({
        getBlob: () => ({
          getContentType: () => files[id].mime,
          getBytes: () => files[id].bytes,
        }),
        setTrashed: (value) => {
          if (value) delete files[id];
        },
      }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (m, k) =>
        [...crypto.createHmac('sha256', k).update(m).digest()].map((b) => (b > 127 ? b - 256 : b)),
      base64Decode: (s) => [...Buffer.from(s, 'base64')],
      base64Encode: (b) =>
        Buffer.from(b.map((value) => (value < 0 ? value + 256 : value))).toString('base64'),
      base64EncodeWebSafe: (b) =>
        Buffer.from(b.map((value) => (value < 0 ? value + 256 : value))).toString('base64url'),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      formatDate: (d, tz, fmt) => {
        const p = Object.fromEntries(
          new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
          })
            .formatToParts(d)
            .map((x) => [x.type, x.value]),
        );
        return fmt.startsWith("yyyy-MM-dd'T")
          ? `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
          : `${p.year}-${p.month}-${p.day}`;
      },
    },
    MailApp: {
      sendEmail: (message) => {
        if (faults.failNextMail) {
          faults.failNextMail = false;
          throw new Error('Simulated mail quota failure');
        }
        mailLog.push(message);
      },
    },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => 'owner-google@test.com' }),
      getScriptTimeZone: () => 'Asia/Kolkata',
    },
    Logger: { log() {} },
  };
  vm.createContext(ctx);
  vm.runInContext(
    backendSource() +
      '\n;this.__api={setup,doPost,PERMS,ACTIONS,WRITES,migrateVoucherApprovalFields,migrateVoucherVendorIdField,migratePinAuthToPasswordSchema,migrateVoucherPaymentMethodField,migrateVoucherVendorTypeField,migrateVendorDefaultsSchema,pruneBackups_,backupManifestCsv_,trashIncompleteBackup_,recordBackupFailure_,backupDataWithServices_,backupIntegrityReportWithServices_,inspectReceiptManifest_};',
    ctx,
  );
  return {
    props: propsStore,
    files,
    cache: cacheStore,
    lockStats,
    sheets,
    failNextAuditWrite: () => {
      faults.failNextAuditWrite = true;
    },
    failNextSettingWrite: () => {
      faults.failNextSettingWrite = true;
    },
    failNextVoucherWriteAfterCommit: () => {
      faults.failNextVoucherWriteAfterCommit = true;
    },
    failNextAuditMarkerWrite: () => {
      faults.failNextAuditMarkerWrite = true;
    },
    failNextAuditFallbackWrite: () => {
      faults.failNextAuditFallbackWrite = true;
    },
    failNextAuditCacheWrite: () => {
      faults.failNextAuditCacheWrite = true;
    },
    auditDiagnostics,
    mailLog,
    failNextMail: () => {
      faults.failNextMail = true;
    },
    registeredActions: () => Object.keys(ctx.__api.ACTIONS),
    writeActions: () => Object.keys(ctx.__api.WRITES),
    permissionMap: () => JSON.parse(JSON.stringify(ctx.__api.PERMS)),
    setup: () => {
      const result = ctx.__api.setup();
      if (withOnboardingEnvironment) {
        const defaults = {
          CV_ENVIRONMENT: 'staging',
          CV_DEPLOYMENT_ID: 'MOCK_DEPLOYMENT',
          CV_STAGING_SCRIPT_ID: 'MOCK_SCRIPT_ID',
          CV_STAGING_SPREADSHEET_ID: 'SS1',
          CV_STAGING_DEPLOYMENT_ID: 'MOCK_DEPLOYMENT',
          CV_STAGING_RECEIPT_FOLDER_ID: propsStore.RECEIPT_FOLDER_ID,
          CV_STAGING_BACKUP_FOLDER_ID: propsStore.BACKUP_FOLDER_ID,
        };
        Object.entries(defaults).forEach(([key, value]) => {
          if (!Object.prototype.hasOwnProperty.call(propsStore, key)) {
            propsStore[key] = value;
          }
        });
        if (!Object.prototype.hasOwnProperty.call(propsStore, 'ONBOARDING_STATE_V1_STAGING')) {
          propsStore.ONBOARDING_STATE_V1_STAGING = JSON.stringify({
            schemaVersion: 1,
            stage: 'stagingUat',
            confirmations: {},
            initializedAt: '',
            updatedAt: '',
          });
        }
      }
      return result;
    },
    triggerCount: () => scriptTriggers.length,
    migrateVoucherApprovalFields: () => ctx.__api.migrateVoucherApprovalFields(),
    migrateVoucherVendorIdField: () => ctx.__api.migrateVoucherVendorIdField(),
    migrateVoucherPaymentMethodField: () => ctx.__api.migrateVoucherPaymentMethodField(),
    migrateVoucherVendorTypeField: () => ctx.__api.migrateVoucherVendorTypeField(),
    migrateVendorDefaultsSchema: () => ctx.__api.migrateVendorDefaultsSchema(),
    call: (action, payload = {}) => {
      const defaults = withOnboardingEnvironment
        ? { environment: 'staging', deploymentId: 'MOCK_DEPLOYMENT' }
        : {};
      return JSON.parse(
        ctx.__api
          .doPost({
            postData: { contents: JSON.stringify({ action, ...defaults, ...payload }) },
          })
          .getContent(),
      );
    },
    raw: (contents) => JSON.parse(ctx.__api.doPost({ postData: { contents } }).getContent()),
    pruneBackups: (root) => ctx.__api.pruneBackups_(root),
    backupManifestCsv: (rows) => ctx.__api.backupManifestCsv_(rows),
    trashIncompleteBackup: (snapshot) => ctx.__api.trashIncompleteBackup_(snapshot),
    recordBackupFailure: (properties, snapshot, snapshotComplete, error) =>
      ctx.__api.recordBackupFailure_(properties, snapshot, snapshotComplete, error),
    backupDataWithServices: (services) => ctx.__api.backupDataWithServices_(services),
    backupIntegrityReportWithServices: (services) =>
      ctx.__api.backupIntegrityReportWithServices_(services),
    inspectReceiptManifest: (rows, readable, receiptFiles) =>
      ctx.__api.inspectReceiptManifest_(rows, readable, receiptFiles),
  };
}
module.exports = { create };
