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

function normalizeEntry_(entry, index, ownerKey = '') {
  const clientId = String(entry?.clientId || '').trim() || newClientId_();
  const normalizedEntry = { ...entry, clientId };

  return {
    clientId,
    entry: normalizedEntry,
    ownerKey: String(ownerKey || ''),
    status: 'pending',
    attempts: 0,
    failure: '',
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

function stableHash_(value, seed) {
  let hash = seed >>> 0;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash.toString(16).padStart(8, '0');
}

function legacyClientId_(entry, index) {
  const source = JSON.stringify({ index, entry });
  const parts = [2166136261, 2246822519, 3266489917, 668265263].map((seed) =>
    stableHash_(source, seed),
  );

  return 'legacy-' + parts.join('') + '-' + index;
}

async function migrateLegacy_(db) {
  let raw;

  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    throw new Error(
      'Could not access legacy offline payment storage. Do not clear browser storage.',
    );
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
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      throw new Error(
        'The empty legacy offline queue could not be cleared. Do not clear browser storage.',
      );
    }
    return;
  }

  const normalizedEntries = entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(
        'Existing offline payments contain invalid data. Do not clear browser storage.',
      );
    }

    const existingId = String(entry.clientId || '').trim();
    const clientId = existingId ? validateClientId_(existingId) : legacyClientId_(entry, index);

    return { ...entry, clientId };
  });
  const seen = new Set();

  normalizedEntries.forEach((entry) => {
    if (seen.has(entry.clientId)) {
      throw new Error(
        'Existing offline payments contain duplicate client IDs. Do not clear browser storage.',
      );
    }
    seen.add(entry.clientId);
  });

  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(normalizedEntries));
  } catch {
    throw new Error(
      'Existing offline payments could not be prepared safely for migration. Do not clear browser storage.',
    );
  }

  const records = normalizedEntries.map((entry, index) => normalizeEntry_(entry, index));

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    let failure;

    transaction.oncomplete = resolve;
    transaction.onerror = () =>
      reject(failure || transaction.error || new Error('Could not migrate offline payments.'));
    transaction.onabort = () =>
      reject(failure || transaction.error || new Error('Could not migrate offline payments.'));

    const request = store.getAll();

    request.onerror = () => {
      failure = request.error || new Error('Could not inspect offline payments for migration.');
    };

    request.onsuccess = () => {
      const existing = new Map(request.result.map((record) => [record.clientId, record]));

      for (const record of records) {
        const previous = existing.get(record.clientId);

        if (previous) {
          if (!sameEntry_(previous.entry, record.entry)) {
            failure = new Error(
              'A legacy payment ID exists with different details. Do not clear browser storage.',
            );
            transaction.abort();
            return;
          }
          continue;
        }

        existing.set(record.clientId, record);
        try {
          store.add(record);
        } catch (error) {
          failure = error;
          transaction.abort();
          return;
        }
      }
    };
  });

  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    throw new Error(
      'Payments were copied into browser storage, but the legacy copy could not be removed. Do not clear browser storage.',
    );
  }
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

function stableJson_(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableJson_).join(',') + ']';

  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + stableJson_(value[key]))
      .join(',') +
    '}'
  );
}

function sameEntry_(left, right) {
  return stableJson_(left) === stableJson_(right);
}

function addRecordsSafely_(incoming, allowLegacyBinding = false) {
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

              const previousOwner = String(previous.ownerKey || '');
              const incomingOwner = String(record.ownerKey || '');

              if (previousOwner !== incomingOwner) {
                if (allowLegacyBinding && !previousOwner && incomingOwner) {
                  previous.ownerKey = incomingOwner;
                  previous.status = 'pending';
                  previous.failure = '';
                  previous.leaseOwner = '';
                  previous.leaseUntil = 0;
                  store.put(previous);
                  skipped++;
                  continue;
                }

                failure = new Error(
                  'A payment ID already belongs to a different account. Nothing was imported.',
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

export async function enqueue(entries, ownerKey) {
  if (!Array.isArray(entries) || !entries.length) return { added: 0, skipped: 0 };
  if (!String(ownerKey || '').trim()) {
    throw new Error('Sign in to bind offline payments to your account before saving.');
  }

  const records = entries.map((entry, index) => {
    const record = normalizeEntry_(entry, index, ownerKey);
    record.clientId = validateClientId_(record.clientId);
    record.entry.clientId = record.clientId;
    return record;
  });

  assertUniqueIds_(records);
  return addRecordsSafely_(records);
}

export async function restore(exportRecords, ownerKey) {
  if (!Array.isArray(exportRecords) || !exportRecords.length) {
    throw new Error('Recovery file contains no pending payments.');
  }
  if (!String(ownerKey || '').trim()) {
    throw new Error('Sign in before restoring pending payments.');
  }

  const hasUnboundRecords = exportRecords.some((item) => !String(item?.ownerKey || '').trim());
  const records = exportRecords.map((item, index) => {
    const clientId = validateClientId_(item?.clientId);
    const entry = item?.entry;
    const sourceOwner = String(item?.ownerKey || '').trim();

    if (sourceOwner && sourceOwner !== ownerKey) {
      throw new Error(
        'Recovery file is bound to another endpoint or user; restore it while signed in ' +
          'to the matching account.',
      );
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Recovery file contains a payment with invalid details.');
    }

    if (validateClientId_(entry.clientId) !== clientId) {
      throw new Error('Recovery file payment IDs do not match their transaction details.');
    }

    return {
      clientId,
      entry: { ...entry, clientId },
      ownerKey,
      status: 'pending',
      attempts: 0,
      failure: '',
      leaseOwner: '',
      leaseUntil: 0,
      createdAt: Date.now() + index,
    };
  });

  assertUniqueIds_(records);
  return addRecordsSafely_(records, hasUnboundRecords);
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

export async function claim(limit, owner, ownerKey, leaseMs = 120000) {
  const now = Date.now();
  if (!String(ownerKey || '').trim()) return [];

  return tx_('readwrite', (store, setResult) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const available = request.result
        .filter(
          (record) =>
            String(record.ownerKey || '') === ownerKey &&
            (record.status === 'pending' ||
              (record.status === 'sending' && Number(record.leaseUntil) <= now)),
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

export async function markFailed(clientId, owner, reason) {
  await tx_('readwrite', (store) => {
    const request = store.getAll();

    request.onsuccess = () => {
      request.result.forEach((record) => {
        if (
          record.clientId === clientId &&
          record.status === 'sending' &&
          record.leaseOwner === owner
        ) {
          record.status = 'failed';
          record.failure = String(reason || 'The server rejected this payment.').slice(0, 240);
          record.leaseOwner = '';
          record.leaseUntil = 0;
          store.put(record);
        }
      });
    };
  });
}

export async function discardFailed(clientId, ownerKey) {
  if (!String(ownerKey || '').trim()) {
    throw new Error('Sign in before removing a rejected entry.');
  }
  if (typeof clientId !== 'string' || !clientId.trim()) {
    throw new Error('Select a valid rejected entry to remove.');
  }

  return tx_('readwrite', (store, setResult) => {
    const request = store.get(clientId);

    request.onsuccess = () => {
      const record = request.result;
      if (
        !record ||
        record.status !== 'failed' ||
        String(record.ownerKey || '') !== ownerKey
      ) {
        setResult(false);
        return;
      }

      store.delete(record.clientId);
      setResult(true);
    };
  });
}

export async function clear(ownerKey) {
  if (!String(ownerKey || '').trim()) {
    throw new Error('Sign in before clearing pending payments.');
  }

  await tx_('readwrite', (store) => {
    const request = store.getAll();

    request.onsuccess = () => {
      request.result.forEach((record) => {
        if (String(record.ownerKey || '') === ownerKey) store.delete(record.clientId);
      });
    };
  });
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
  markFailed,
  clear,
};
