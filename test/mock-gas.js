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
function create() {
  const sheets = {},
    propsStore = {},
    cacheStore = {},
    files = {},
    faults = { failNextAuditWrite: false, failNextAuditMarkerWrite: false },
    auditDiagnostics = [],
    lockStats = { attempts: 0, waits: 0, releases: 0, failNextWait: false };
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
        if (name === 'AuditLog' && faults.failNextAuditWrite) {
          faults.failNextAuditWrite = false;
          throw new Error('Simulated audit log write failure');
        }
        v.forEach((row, i) =>
          row.forEach((val, j) => {
            (rows[r - 1 + i] ||= [])[c - 1 + j] = val;
          }),
        );
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
        put: (k, v) => (cacheStore[k] = v),
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
      getFolderById: () => ({
        createFile: (b) => {
          const id = 'F' + Object.keys(files).length;
          files[id] = b;
          return { getId: () => id };
        },
        getFolders: () => ({
          hasNext: () => false,
          next: () => {
            throw new Error('No mock Drive folders remain.');
          },
        }),
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
      base64Encode: (b) => Buffer.from(b).toString('base64'),
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
    Logger: { log() {} },
  };
  vm.createContext(ctx);
  vm.runInContext(
    backendSource() +
      '\n;this.__api={setup,doPost,PERMS,ACTIONS,WRITES,migrateVoucherApprovalFields,migrateVoucherVendorIdField,pruneBackups_,backupManifestCsv_,trashIncompleteBackup_,recordBackupFailure_,backupDataWithServices_,backupIntegrityReportWithServices_};',
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
    failNextAuditMarkerWrite: () => {
      faults.failNextAuditMarkerWrite = true;
    },
    auditDiagnostics,
    registeredActions: () => Object.keys(ctx.__api.ACTIONS),
    writeActions: () => Object.keys(ctx.__api.WRITES),
    permissionMap: () => JSON.parse(JSON.stringify(ctx.__api.PERMS)),
    setup: () => ctx.__api.setup(),
    migrateVoucherApprovalFields: () => ctx.__api.migrateVoucherApprovalFields(),
    migrateVoucherVendorIdField: () => ctx.__api.migrateVoucherVendorIdField(),
    call: (action, payload = {}) =>
      JSON.parse(
        ctx.__api
          .doPost({ postData: { contents: JSON.stringify({ action, ...payload }) } })
          .getContent(),
      ),
    raw: (contents) => JSON.parse(ctx.__api.doPost({ postData: { contents } }).getContent()),
    pruneBackups: (root) => ctx.__api.pruneBackups_(root),
    backupManifestCsv: (rows) => ctx.__api.backupManifestCsv_(rows),
    trashIncompleteBackup: (snapshot) => ctx.__api.trashIncompleteBackup_(snapshot),
    recordBackupFailure: (properties, snapshot, snapshotComplete, error) =>
      ctx.__api.recordBackupFailure_(properties, snapshot, snapshotComplete, error),
    backupDataWithServices: (services) => ctx.__api.backupDataWithServices_(services),
    backupIntegrityReportWithServices: (services) =>
      ctx.__api.backupIntegrityReportWithServices_(services),
  };
}
module.exports = { create };
