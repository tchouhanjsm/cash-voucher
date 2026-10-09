'use strict';

const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

const g = create();

function makeServices(options = {}) {
  const state = {
    props: {
      SS_ID: 'sheet-1',
      RECEIPT_FOLDER_ID: 'receipts-1',
      BACKUP_FOLDER_ID: 'backup-root',
      BACKUP_LAST_SUCCESS: '2026-10-08T10:00:00.000Z',
    },
    snapshots: [],
    logs: [],
    lockWaits: 0,
    lockReleases: 0,
  };
  const properties = {
    getProperty(key) {
      return state.props[key] ?? null;
    },
    setProperty(key, value) {
      if (options.failMetadataWrite && key === 'BACKUP_LAST_ERROR') {
        throw new Error('metadata store unavailable');
      }
      state.props[key] = String(value);
    },
    deleteProperty(key) {
      delete state.props[key];
    },
  };
  const snapshotFactory = (name) => {
    const snapshot = {
      name,
      trashed: false,
      files: [],
      getId: () => 'snapshot-1',
      getName: () => name,
      setTrashed(value) {
        if (options.failCleanup) throw new Error('Drive permission denied');
        this.trashed = value;
      },
      createFolder(folderName) {
        return { name: folderName, getId: () => 'receipts-backup-1' };
      },
      createFile(fileName, contents, mimeType) {
        if (fileName === 'receipt-manifest.csv' && options.failManifest) {
          throw new Error('manifest creation failed');
        }
        const file = { name: fileName, contents, mimeType, getId: () => 'manifest-1' };
        this.files.push(file);
        return file;
      },
    };
    state.snapshots.push(snapshot);
    return snapshot;
  };
  const root = {
    createFolder: (name) => snapshotFactory(name),
  };
  const sourceReceipts = {
    getFiles() {
      let used = false;
      return {
        hasNext: () => !used,
        next() {
          used = true;
          return {
            isTrashed: () => false,
            getId: () => 'receipt-1',
            getName: () => 'receipt.jpg',
            getDateCreated: () => new Date('2026-10-08T10:00:00.000Z'),
            makeCopy() {
              if (options.failReceiptCopy) throw new Error('receipt copy failed');
              return { getId: () => 'receipt-copy-1' };
            },
          };
        },
      };
    },
  };
  const sourceSheet = {
    makeCopy() {
      if (options.failSheetCopy) throw new Error('Sheet copy failed');
      return { getId: () => 'sheet-copy-1' };
    },
  };
  const services = {
    getLock() {
      return {
        waitLock() {
          state.lockWaits++;
          if (options.failLockAcquire) throw new Error('lock acquisition timed out');
        },
        releaseLock() {
          state.lockReleases++;
        },
      };
    },
    getProperties() {
      if (options.failPropertiesAccess) throw new Error('properties service unavailable');
      return properties;
    },
    now: () => new Date('2026-10-09T10:00:00.000Z'),
    formatDate: () => '2026-10-09_100000',
    getTimeZone: () => 'Asia/Kolkata',
    getFolderById(id) {
      if (id === 'backup-root') return root;
      if (id === 'receipts-1') return sourceReceipts;
      throw new Error('Unexpected folder ID: ' + id);
    },
    getFileById(id) {
      if (id === 'sheet-1') return sourceSheet;
      throw new Error('Unexpected file ID: ' + id);
    },
    pruneBackups() {
      if (options.failRetention) throw new Error('retention pruning failed');
    },
    logger: (message) => state.logs.push(String(message)),
    mimeCsv: 'text/csv',
  };
  return { services, state };
}

function expectBackupFailure(options, expectedMessage) {
  const { services, state } = makeServices(options);
  assert.throws(() => g.backupDataWithServices(services), new RegExp(expectedMessage));
  return state;
}

let state = expectBackupFailure({ failReceiptCopy: true }, 'receipt copy failed');
assert.equal(
  state.snapshots[0].trashed,
  true,
  'receipt-copy failure trashes the incomplete snapshot',
);
assert.equal(state.props.BACKUP_LAST_ERROR, 'receipt copy failed');
assert.equal(state.lockWaits, 1);
assert.equal(state.lockReleases, 1, 'lock is released after an acquired lock');

state = expectBackupFailure({ failSheetCopy: true }, 'Sheet copy failed');
assert.equal(state.snapshots[0].trashed, true, 'Sheet-copy failure trashes the incomplete snapshot');
assert.equal(state.props.BACKUP_LAST_ERROR, 'Sheet copy failed');

state = expectBackupFailure({ failManifest: true }, 'manifest creation failed');
assert.equal(state.snapshots[0].trashed, true, 'manifest failure trashes the incomplete snapshot');

state = expectBackupFailure({ failCleanup: true, failManifest: true }, 'manifest creation failed');
assert.equal(
  state.snapshots[0].trashed,
  false,
  'failed cleanup does not mask the triggering failure',
);
assert.match(state.props.BACKUP_LAST_ERROR, /manifest creation failed/);
assert.match(state.props.BACKUP_LAST_ERROR, /Drive permission denied/);

state = expectBackupFailure({ failRetention: true }, 'retention pruning failed');
assert.equal(
  state.snapshots[0].trashed,
  false,
  'complete snapshot is preserved when retention pruning fails',
);
assert.equal(state.props.BACKUP_LAST_ERROR, 'retention pruning failed');

state = expectBackupFailure(
  { failManifest: true, failMetadataWrite: true },
  'manifest creation failed',
);
assert.match(
  state.logs.join('\n'),
  /Could not record backup failure metadata: metadata store unavailable/,
);
assert.equal(state.lockReleases, 1, 'metadata write failure still releases the acquired lock');

state = expectBackupFailure({ failLockAcquire: true }, 'lock acquisition timed out');
assert.equal(state.lockWaits, 1);
assert.equal(state.lockReleases, 0, 'a lock that was not acquired is never released');
assert.equal(state.snapshots.length, 0, 'backup does not start after lock acquisition failure');

state = expectBackupFailure({ failPropertiesAccess: true }, 'properties service unavailable');
assert.equal(
  state.lockReleases,
  1,
  'lock is released if properties access fails after acquisition',
);
assert.match(
  state.logs.join('\n'),
  /Could not record backup failure metadata: properties service unavailable/,
);

const success = makeServices();
const result = g.backupDataWithServices(success.services);
assert.deepEqual(JSON.parse(JSON.stringify(result)), { folderId: 'snapshot-1', receiptCount: 1 });
assert.equal(success.state.snapshots[0].trashed, false);
assert.equal(success.state.snapshots[0].files[0].name, 'receipt-manifest.csv');
assert.equal(success.state.lockReleases, 1);
assert.ok(success.state.props.BACKUP_LAST_SUCCESS);

const boundedProperties = {
  value: '',
  setProperty(key, value) {
    this.value = String(value);
  },
};
g.recordBackupFailure(boundedProperties, null, false, new Error('x'.repeat(500)));
assert.equal(boundedProperties.value.length, 300, 'failure metadata is capped at 300 characters');

const boundedCleanupProperties = {
  value: '',
  setProperty(key, value) {
    this.value = String(value);
  },
};
g.recordBackupFailure(
  boundedCleanupProperties,
  {
    setTrashed() {
      throw new Error('cleanup failure '.repeat(20));
    },
  },
  false,
  new Error('original failure '.repeat(40)),
);
assert.equal(
  boundedCleanupProperties.value.length,
  300,
  'combined failure and cleanup metadata stays within the 300-character cap',
);
assert.match(boundedCleanupProperties.value, /incomplete snapshot cleanup failed/);

console.log(
  'Backup orchestration OK — copy/manifest failures, cleanup failure, retention failure, metadata failure, lock acquisition and success.',
);
