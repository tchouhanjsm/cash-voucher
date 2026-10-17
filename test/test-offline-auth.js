const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../frontend/core/offline-auth.js'), 'utf8');

async function run() {
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const {
    clearOfflineCredential,
    OFFLINE_AUTH_KEY,
    OFFLINE_AUTH_TTL_MS,
    saveOfflineCredential,
    verifyOfflineCredential,
  } = await import(moduleUrl);

  const values = new Map();
  const storage = {
    get(key) {
      return values.has(key) ? values.get(key) : null;
    },
    set(key, value) {
      values.set(key, value);
      return true;
    },
    del(key) {
      values.delete(key);
    },
  };
  const email = 'Staff@Test.com';
  const endpoint = 'http://127.0.0.1:8765/api?test=1';
  const password = 'Staff#Final2026';
  const now = 1_800_000_000_000;

  assert.equal(
    await saveOfflineCredential({ email, endpoint, password, storage, now }),
    true,
    'online-verified six-digit password creates a local verifier',
  );
  const raw = storage.get(OFFLINE_AUTH_KEY);
  const record = JSON.parse(raw);
  assert.equal(record.email, 'staff@test.com');
  assert.equal(record.endpoint, 'http://127.0.0.1:8765/api');
  assert.equal(record.expiresAt - record.createdAt, OFFLINE_AUTH_TTL_MS);
  assert.equal(raw.includes(password), false, 'raw password is not persisted');

  assert.equal(
    await verifyOfflineCredential({ email: ' staff@test.com ', endpoint, password, storage, now }),
    true,
    'normalized account and endpoint verify the password',
  );
  assert.equal(
    await verifyOfflineCredential({ email, endpoint, password: 'Wrong#Password2026', storage, now }),
    false,
    'incorrect password fails',
  );
  assert.equal(
    await verifyOfflineCredential({ email: 'other@test.com', endpoint, password, storage, now }),
    false,
    'verifier cannot be reused for another account',
  );
  assert.equal(
    await verifyOfflineCredential({
      email,
      endpoint: 'http://127.0.0.1:8765/other',
      password,
      storage,
      now,
    }),
    false,
    'verifier cannot be reused for another endpoint',
  );
  assert.equal(
    await verifyOfflineCredential({
      email,
      endpoint,
      password,
      storage,
      now: now + OFFLINE_AUTH_TTL_MS,
    }),
    false,
    'verifier expires after seven days',
  );

  const tampered = { ...record, expiresAt: record.expiresAt + 1000 };
  storage.set(OFFLINE_AUTH_KEY, JSON.stringify(tampered));
  assert.equal(
    await verifyOfflineCredential({ email, endpoint, password, storage, now }),
    false,
    'edited validity metadata invalidates the verifier',
  );

  storage.set(OFFLINE_AUTH_KEY, '{');
  assert.equal(
    await verifyOfflineCredential({ email, endpoint, password, storage, now }),
    false,
    'malformed local verifier fails closed',
  );

  assert.equal(
    await saveOfflineCredential({ email, endpoint, password: '12345', storage, now }),
    false,
    'invalid password shape does not create a verifier',
  );
  assert.equal(
    await saveOfflineCredential({ email, endpoint, password, storage: { set: () => false }, now }),
    false,
    'blocked local storage disables offline unlock without breaking online sign-in',
  );

  clearOfflineCredential(storage);
  assert.equal(storage.get(OFFLINE_AUTH_KEY), null, 'explicit sign-out can remove offline unlock');
  assert.equal(
    await verifyOfflineCredential({ email, endpoint, password, storage, now }),
    false,
    'removed verifier no longer unlocks the workspace',
  );

  console.log(
    'Offline auth OK — PBKDF2 verifier, account/endpoint binding, expiry, tamper resistance and safe storage failure covered.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
