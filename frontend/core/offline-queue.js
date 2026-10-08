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

function request_(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Offline storage request failed.'));
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
          result = work(transaction.objectStore(STORE));
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
    throw new Error('Existing offline payments could not be migrated. Do not clear browser storage.');
  }

  if (!Array.isArray(entries)) {
    throw new Error('Existing offline payments have an invalid format. Do not clear browser storage.');
  }

  if (!entries.length) {
    localStorage.removeItem(LEGACY_KEY);
    return;
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

      entries.forEach((entry, index) => {
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
readyPromise = dbPromise.then(migrateLegacy_);

export async function ready() {
  return readyPromise;
}

export async function enqueue(entries) {
  if (!Array.isArray(entries) || !entries.length) return;

  const records = entries.map(normalizeEntry_);
  const seen = new Set();

  records.forEach((record) => {
    if (seen.has(record.clientId)) {
      throw new Error('Duplicate offline payment client ID.');
    }
    seen.add(record.clientId);
  });

  await tx_('readwrite', (store) => {
    records.forEach((record) => store.put(record));
  });
}

export async function list() {
  return tx_('readonly', (store) =>
    request_(store.getAll()).then((records) =>
      records.sort((a, b) => a.createdAt - b.createdAt),
    ),
  );
}

export async function count() {
  return tx_('readonly', (store) => request_(store.count()));
}

export async function claim(limit, owner, leaseMs = 120000) {
  const now = Date.now();

  return tx_('readwrite', (store) =>
    request_(store.getAll()).then((records) => {
      const available = records
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

      return available;
    }),
  );
}

export async function ack(clientIds, owner) {
  if (!clientIds.length) return;

  await tx_('readwrite', (store) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const ids = new Set(clientIds);

      request.result.forEach((record) => {
        if (ids.has(record.clientId) && record.status === 'sending' && record.leaseOwner === owner) {
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
        if (ids.has(record.clientId) && record.status === 'sending' && record.leaseOwner === owner) {
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
  list,
  count,
  claim,
  ack,
  release,
  clear,
};
