'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { create } = require('./mock-gas');

const g = create();
const BASE_TIME = Date.parse('2026-10-11T10:00:00.000Z');

function makeSeededServices(receiptCount, options = {}) {
  let clockMs = BASE_TIME;
  let snapshotNumber = 0;
  let backupNumber = 0;
  const state = {
    props: {
      SS_ID: 'sheet-1',
      RECEIPT_FOLDER_ID: 'receipts-source',
      BACKUP_FOLDER_ID: 'backup-root',
      OWNER_EMAIL: 'owner@example.test',
    },
    snapshots: [],
    alerts: [],
    logs: [],
    lockWaits: 0,
    lockReleases: 0,
    failManifest: Boolean(options.failManifest),
    failAlert: Boolean(options.failAlert),
    failLockAcquire: Boolean(options.failLockAcquire),
  };

  const properties = {
    getProperty(key) {
      return state.props[key] ?? null;
    },
    setProperty(key, value) {
      state.props[key] = String(value);
    },
    deleteProperty(key) {
      delete state.props[key];
    },
  };

  function makeSnapshot(name) {
    snapshotNumber += 1;
    const snapshot = {
      id: 'snapshot-' + snapshotNumber,
      name,
      files: [],
      trashed: false,
      receiptFolder: null,
      getId() {
        return this.id;
      },
      getName() {
        return this.name;
      },
      setTrashed(value) {
        this.trashed = value;
      },
      createFolder(folderName) {
        const folder = {
          id: 'snapshot-receipts-' + snapshotNumber,
          name: folderName,
          files: [],
          getId() {
            return this.id;
          },
        };
        this.receiptFolder = folder;
        return folder;
      },
      createFile(fileName, contents, mimeType) {
        if (fileName === 'receipt-manifest.csv' && state.failManifest) {
          throw new Error('manifest creation failed');
        }
        clockMs += 3;
        const file = {
          id: 'snapshot-file-' + snapshotNumber + '-' + this.files.length,
          name: fileName,
          contents,
          mimeType,
          getId() {
            return this.id;
          },
        };
        this.files.push(file);
        return file;
      },
    };
    state.snapshots.push(snapshot);
    return snapshot;
  }

  const root = {
    createFolder(name) {
      return makeSnapshot(name);
    },
  };

  const receipts = Array.from({ length: receiptCount }, (_, index) => {
    const size = 512 + index * 37;
    return {
      getId: () => 'source-receipt-' + index,
      getName: () => 'receipt-' + index + '.jpg',
      isTrashed: () => false,
      getSize() {
        if (options.unmeasurableSizeIndex === index) {
          throw new Error('file size metadata unavailable');
        }
        return size;
      },
      getDateCreated: () => new Date(BASE_TIME + index * 1000),
      makeCopy(name, destination) {
        clockMs += 5;
        const copy = {
          id: 'receipt-copy-' + index,
          name,
          getId() {
            return this.id;
          },
        };
        destination.files.push(copy);
        return copy;
      },
    };
  });

  const sourceReceipts = {
    getFiles() {
      let index = 0;
      return {
        hasNext: () => index < receipts.length,
        next: () => receipts[index++],
      };
    },
  };

  const sourceSheet = {
    makeCopy(name, destination) {
      clockMs += 25;
      const copy = {
        id: 'sheet-copy-' + snapshotNumber,
        name,
        getId() {
          return this.id;
        },
      };
      destination.files.push(copy);
      return copy;
    },
  };

  const services = {
    getLock() {
      return {
        waitLock() {
          state.lockWaits += 1;
          if (state.failLockAcquire) throw new Error('Simulated lock contention timeout');
        },
        releaseLock() {
          state.lockReleases += 1;
        },
      };
    },
    getProperties: () => properties,
    now: () => new Date(clockMs),
    nowMilliseconds: () => clockMs,
    formatDate: () => '2026-10-11_020000_' + String(++backupNumber).padStart(4, '0'),
    getTimeZone: () => 'Asia/Kolkata',
    getFolderById(id) {
      if (id === 'backup-root') return root;
      if (id === 'receipts-source') return sourceReceipts;
      throw new Error('Unexpected folder ID: ' + id);
    },
    getFileById(id) {
      if (id === 'sheet-1') return sourceSheet;
      throw new Error('Unexpected file ID: ' + id);
    },
    pruneBackups() {
      clockMs += 7;
    },
    logger: (message) => state.logs.push(String(message)),
    sendFailureAlert(alert) {
      if (state.failAlert) throw new Error('Mail service unavailable');
      state.alerts.push(alert);
    },
    mimeCsv: 'text/csv',
  };

  return { services, state };
}

const benchmark = [];

for (const receiptCount of [0, 10, 100, 500]) {
  const { services, state } = makeSeededServices(receiptCount);
  const expectedBytes = Array.from({ length: receiptCount }, (_, index) => 512 + index * 37).reduce(
    (total, bytes) => total + bytes,
    0,
  );
  const started = performance.now();
  const result = g.backupDataWithServices(services);
  const harnessElapsedMs = Number((performance.now() - started).toFixed(3));
  const metrics = JSON.parse(state.props.BACKUP_LAST_SUCCESS_METRICS);
  const manifest = state.snapshots[0].files.find((file) => file.name === 'receipt-manifest.csv');

  assert.equal(result.receiptCount, receiptCount, 'copied receipt count matches seeded workload');
  assert.equal(result.receiptBytes, expectedBytes, 'measured receipt payload size matches seeds');
  assert.equal(
    result.durationMs,
    35 + receiptCount * 5,
    'elapsed-time instrumentation matches injected work',
  );
  assert.equal(state.snapshots[0].receiptFolder.files.length, receiptCount);
  assert.equal(
    manifest.contents.split('\n').length,
    receiptCount + 1,
    'manifest maps every copied receipt',
  );
  assert.equal(metrics.completedAt, state.props.BACKUP_LAST_SUCCESS);
  assert.equal(metrics.receiptCount, receiptCount);
  assert.equal(metrics.receiptBytes, expectedBytes);
  assert.equal(metrics.receiptBytesKnown, true);
  assert.equal(state.lockWaits, 1);
  assert.equal(state.lockReleases, 1);

  benchmark.push({
    seededReceipts: receiptCount,
    receiptBytes: expectedBytes,
    recordedDurationMs: result.durationMs,
    harnessElapsedMs,
  });
}

console.log(
  'Seeded backup workload (mock-only timing; not an Apps Script performance target): ' +
    JSON.stringify(benchmark),
);

const partialMetrics = makeSeededServices(4, { unmeasurableSizeIndex: 2 });
const partialResult = g.backupDataWithServices(partialMetrics.services);
assert.equal(partialResult.receiptCount, 4, 'missing size metadata must not fail a backup');
assert.equal(
  partialResult.receiptBytes,
  null,
  'partial byte totals are never presented as complete',
);
assert.equal(
  JSON.parse(partialMetrics.state.props.BACKUP_LAST_SUCCESS_METRICS).receiptBytesKnown,
  false,
  'unknown receipt size is explicit in stored telemetry',
);

const incident = makeSeededServices(3, { failManifest: true });
assert.throws(() => g.backupDataWithServices(incident.services), /manifest creation failed/);
assert.equal(incident.state.alerts.length, 1, 'first failure sends an owner alert');
assert.equal(incident.state.props.BACKUP_ALERT_ACTIVE, '1');
assert.equal(
  incident.state.props.BACKUP_LAST_ERROR,
  'manifest creation failed',
  'notification does not replace the original backup failure',
);
assert.throws(() => g.backupDataWithServices(incident.services), /manifest creation failed/);
assert.equal(incident.state.alerts.length, 1, 'consecutive failures alert only once per incident');

incident.state.failManifest = false;
g.backupDataWithServices(incident.services);
assert.equal(
  incident.state.props.BACKUP_ALERT_ACTIVE,
  undefined,
  'successful backup closes the alert incident',
);
incident.state.failManifest = true;
assert.throws(() => g.backupDataWithServices(incident.services), /manifest creation failed/);
assert.equal(incident.state.alerts.length, 2, 'a later failure after recovery sends a new alert');

const deliveryFailure = makeSeededServices(1, { failManifest: true, failAlert: true });
assert.throws(() => g.backupDataWithServices(deliveryFailure.services), /manifest creation failed/);
assert.equal(deliveryFailure.state.alerts.length, 0);
assert.equal(deliveryFailure.state.props.BACKUP_ALERT_ACTIVE, undefined);
assert.match(
  deliveryFailure.state.props.BACKUP_LAST_ALERT_ERROR,
  /Mail service unavailable/,
  'alert delivery errors are recorded separately from backup failure',
);
deliveryFailure.state.failAlert = false;
assert.throws(() => g.backupDataWithServices(deliveryFailure.services), /manifest creation failed/);
assert.equal(
  deliveryFailure.state.alerts.length,
  1,
  'failed notification can be retried on a later attempt',
);

const lockTimeout = makeSeededServices(2, { failLockAcquire: true });
assert.throws(
  () => g.backupDataWithServices(lockTimeout.services),
  /Simulated lock contention timeout/,
);
assert.equal(lockTimeout.state.alerts.length, 1, 'lock-timeout failure alerts before normal status lock');
assert.equal(lockTimeout.state.lockWaits, 1);
assert.equal(lockTimeout.state.lockReleases, 0, 'a failed lock acquisition is not released');
assert.equal(lockTimeout.state.snapshots.length, 0, 'no snapshot work starts without the lock');
assert.equal(
  lockTimeout.state.props.BACKUP_LAST_ATTEMPT,
  undefined,
  'a competing failed attempt does not overwrite another run backup attempt metadata',
);
assert.equal(
  lockTimeout.state.props.BACKUP_ALERT_ACTIVE,
  '1',
  'independent alert state suppresses repeated notifications for the same failure streak',
);

console.log(
  'Backup observability OK — seeded counts/bytes/runtime, non-blocking metrics, lock-timeout alerts, failure-streak alerts and delivery-error recovery.',
);
