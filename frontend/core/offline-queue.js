const DB_NAME = 'cash-voucher';
const DB_VERSION = 1;
const STORE = 'outbox';
const LEGACY_KEY = 'cv.outbox';

let dbPromise;
let readyPromise;

function openDb_() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'clientId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open offline storage.'));
  });
}

function tx_(mode, work) {
  return readyPromise.then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        let result;

        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () =>
          reject(transaction.error || new Error('Offline storage transaction failed.'));
        transaction.onabort = () =>
          reject(transaction.error || new Error('Offline storage transaction aborted.'));

        try {
          work(transaction.objectStore(STORE), (value) => {
            result = value;
          });
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      }),
  );
}

function newClientId_() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + '-' + Math.random().toString(16).slice(2);
}

function normalizeEntry_(entry, index) {
  const clientId = String(entry?.clientId || '').trim() || newClientId_();
  const normalizedEntry = { ...entry, clientId };

  return {
    clientId,
    entry: normalizedEntry,
    status: 'pending',
    attempts: 0,
    leaseOwner: '',
    leaseUntil: 0,
    createdAt: Date.now() + index,
  };
}

async function requestPersistentStorage_() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {}
}

async function migrateLegacy_(db) {
  let raw;

  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return;
  }

  if (!raw) return;

  let entries;

  try {
    entries = JSON.parse(raw);
  } catch {
    throw new Error(
      'Existing offline payments could not be migrated. Do not clear browser storage.',
    );
  }

  if (!Array.isArray(entries)) {
    throw new Error(
      'Existing offline payments have an invalid format. Do not clear browser storage.',
    );
  }

  if (!entries.length) {
    localStorage.removeItem(LEGACY_KEY);
    return;
  }

  const normalizedEntries = entries.map((entry, index) => normalizeEntry_(entry, index).entry);

  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(normalizedEntries));
  } catch {
    throw new Error(
      'Existing offline payments could not be prepared safely for migration. Do not clear browser storage.',
    );
  }

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);

    transaction.oncomplete = resolve;
    transaction.onerror = () =>
      reject(transaction.error || new Error('Could not migrate offline payments.'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('Could not migrate offline payments.'));

    try {
      const seen = new Set();

      normalizedEntries.forEach((entry, index) => {
        const record = normalizeEntry_(entry, index);

        if (seen.has(record.clientId)) {
          throw new Error('Existing offline payments contain duplicate client IDs.');
        }

        seen.add(record.clientId);
        store.put(record);
      });
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });

  localStorage.removeItem(LEGACY_KEY);
}

dbPromise = openDb_();
readyPromise = dbPromise.then(async (db) => {
  await migrateLegacy_(db);
  await requestPersistentStorage_();
  return db;
});

export async function ready() {
  return readyPromise;
}

function validateClientId_(value) {
  const clientId = String(value || '').trim();

  if (
    !clientId ||
    clientId.length > 60 ||
    [...clientId].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new Error('Offline payment contains an invalid payment ID.');
  }

  return clientId;
}

function sameEntry_(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function addRecordsSafely_(incoming) {
  return readyPromise.then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readwrite');
        const store = transaction.objectStore(STORE);
        let result;
        let failure;

        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () =>
          reject(failure || transaction.error || new Error('Offline storage transaction failed.'));
        transaction.onabort = () =>
          reject(failure || transaction.error || new Error('Offline storage transaction aborted.'));

        const request = store.getAll();

        request.onerror = () => {
          failure = request.error || new Error('Could not inspect pending payments.');
        };

        request.onsuccess = () => {
          const existing = new Map(request.result.map((record) => [record.clientId, record]));
          const toAdd = [];
          let skipped = 0;

          for (const record of incoming) {
            const previous = existing.get(record.clientId);

            if (previous) {
              if (!sameEntry_(previous.entry, record.entry)) {
                failure = new Error(
                  'A payment ID already exists with different details. Nothing was imported.',
                );
                transaction.abort();
                return;
              }

              skipped++;
              continue;
            }

            existing.set(record.clientId, record);
            toAdd.push(record);
          }

          try {
            toAdd.forEach((record) => store.add(record));
            result = { added: toAdd.length, skipped };
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
      }),
  );
}

function assertUniqueIds_(records) {
  const seen = new Set();

  records.forEach((record) => {
    if (seen.has(record.clientId)) {
      throw new Error('Offline payments contain duplicate payment IDs.');
    }
    seen.add(record.clientId);
  });
}

export async function enqueue(entries) {
  if (!Array.isArray(entries) || !entries.length) return { added: 0, skipped: 0 };

  const records = entries.map((entry, index) => {
    const record = normalizeEntry_(entry, index);
    record.clientId = validateClientId_(record.clientId);
    record.entry.clientId = record.clientId;
    return record;
  });

  assertUniqueIds_(records);
  return addRecordsSafely_(records);
}

export async function restore(exportRecords) {
  if (!Array.isArray(exportRecords) || !exportRecords.length) {
    throw new Error('Recovery file contains no pending payments.');
  }

  const records = exportRecords.map((item, index) => {
    const clientId = validateClientId_(item?.clientId);
    const entry = item?.entry;

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Recovery file contains a payment with invalid details.');
    }

    if (validateClientId_(entry.clientId) !== clientId) {
      throw new Error('Recovery file payment IDs do not match their transaction details.');
    }

    return {
      clientId,
      entry: { ...entry, clientId },
      status: 'pending',
      attempts: 0,
      leaseOwner: '',
      leaseUntil: 0,
      createdAt: Date.now() + index,
    };
  });

  assertUniqueIds_(records);
  return addRecordsSafely_(records);
}

export async function list() {
  return tx_('readonly', (store, setResult) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const records = request.result.sort((a, b) => a.createdAt - b.createdAt);
      setResult(records);
    };
  });
}

export async function count() {
  return tx_('readonly', (store, setResult) => {
    const request = store.count();
    request.onsuccess = () => setResult(request.result);
  });
}

export async function claim(limit, owner, leaseMs = 120000) {
  const now = Date.now();

  return tx_('readwrite', (store, setResult) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const available = request.result
        .filter(
          (record) =>
            record.status === 'pending' ||
            (record.status === 'sending' && Number(record.leaseUntil) <= now),
        )
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, limit);

      available.forEach((record) => {
        record.status = 'sending';
        record.leaseOwner = owner;
        record.leaseUntil = now + leaseMs;
        record.attempts = Number(record.attempts || 0) + 1;
        store.put(record);
      });

      setResult(available);
    };
  });
}

export async function ack(clientIds, owner) {
  if (!clientIds.length) return;

  await tx_('readwrite', (store) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const ids = new Set(clientIds);

      request.result.forEach((record) => {
        if (
          ids.has(record.clientId) &&
          record.status === 'sending' &&
          record.leaseOwner === owner
        ) {
          store.delete(record.clientId);
        }
      });
    };
  });
}

export async function release(clientIds, owner) {
  if (!clientIds.length) return;

  await tx_('readwrite', (store) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const ids = new Set(clientIds);

      request.result.forEach((record) => {
        if (
          ids.has(record.clientId) &&
          record.status === 'sending' &&
          record.leaseOwner === owner
        ) {
          record.status = 'pending';
          record.leaseOwner = '';
          record.leaseUntil = 0;
          store.put(record);
        }
      });
    };
  });
}

export async function clear() {
  await tx_('readwrite', (store) => store.clear());
}

export const offlineQueue = {
  ready,
  enqueue,
  restore,
  list,
  count,
  claim,
  ack,
  release,
  clear,
};
