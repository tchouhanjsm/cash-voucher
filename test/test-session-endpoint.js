'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sessionSource = fs.readFileSync(path.join(root, 'frontend/core/session.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'frontend/main.js'), 'utf8');
const legacyEntrySource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const authSource = fs.readFileSync(path.join(root, 'frontend/features/auth.js'), 'utf8');

async function run() {
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(sessionSource).toString('base64');
  const {
    clearPersistedApiSessionToken,
    persistApiSessionToken,
    resolveApiSession,
    SESSION_ENDPOINT_STORAGE_KEY,
  } = await import(moduleUrl);

  const configuredEndpoint = 'https://script.google.com/macros/s/staging-deployment/exec';
  const previousEndpoint = 'https://script.google.com/macros/s/previous-deployment/exec';
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

  const matchingConfiguredSession = resolveApiSession({
    configuredEndpoint,
    storedEndpoint: previousEndpoint,
    token: 'staging-token',
    tokenEndpoint: configuredEndpoint,
  });
  assert.equal(matchingConfiguredSession.endpoint, configuredEndpoint);
  assert.equal(matchingConfiguredSession.token, 'staging-token');
  assert.equal(matchingConfiguredSession.autoResume, true);
  assert.equal(matchingConfiguredSession.clearPersistedToken, false);

  const endpointChanged = resolveApiSession({
    configuredEndpoint,
    storedEndpoint: previousEndpoint,
    token: 'previous-token',
    tokenEndpoint: previousEndpoint,
  });
  assert.equal(endpointChanged.endpoint, configuredEndpoint);
  assert.equal(endpointChanged.token, '');
  assert.equal(endpointChanged.autoResume, false);
  assert.equal(endpointChanged.clearPersistedToken, true);

  const legacyUnboundToken = resolveApiSession({
    configuredEndpoint: '',
    storedEndpoint: previousEndpoint,
    token: 'legacy-token',
    tokenEndpoint: '',
  });
  assert.equal(legacyUnboundToken.endpoint, previousEndpoint);
  assert.equal(legacyUnboundToken.token, '');
  assert.equal(legacyUnboundToken.autoResume, false);
  assert.equal(legacyUnboundToken.clearPersistedToken, true);

  const endpointWithoutSession = resolveApiSession({
    configuredEndpoint: '',
    storedEndpoint: previousEndpoint,
    token: '',
    tokenEndpoint: '',
  });
  assert.equal(endpointWithoutSession.endpoint, previousEndpoint);
  assert.equal(endpointWithoutSession.autoResume, false);
  assert.equal(endpointWithoutSession.clearPersistedToken, false);

  const matchingSavedEndpoint = resolveApiSession({
    configuredEndpoint: '',
    storedEndpoint: previousEndpoint,
    token: 'saved-token',
    tokenEndpoint: previousEndpoint,
  });
  assert.equal(matchingSavedEndpoint.autoResume, true);
  assert.equal(matchingSavedEndpoint.token, 'saved-token');

  const endpointQueryMismatch = resolveApiSession({
    configuredEndpoint: configuredEndpoint + '?mode=staging',
    storedEndpoint: configuredEndpoint,
    token: 'token-without-query',
    tokenEndpoint: configuredEndpoint,
  });
  assert.equal(endpointQueryMismatch.autoResume, false);
  assert.equal(endpointQueryMismatch.clearPersistedToken, true);

  const invalidBoundEndpoint = resolveApiSession({
    configuredEndpoint: 'javascript:alert(1)',
    storedEndpoint: previousEndpoint,
    token: 'saved-token',
    tokenEndpoint: 'javascript:alert(1)',
  });
  assert.equal(invalidBoundEndpoint.autoResume, false);
  assert.equal(invalidBoundEndpoint.token, '');

  assert.equal(
    persistApiSessionToken({ token: 'fresh-token', endpoint: configuredEndpoint, storage }),
    true,
  );
  assert.equal(values.get(SESSION_ENDPOINT_STORAGE_KEY), configuredEndpoint);
  assert.equal(values.get('cv.token'), 'fresh-token');
  assert.equal(
    resolveApiSession({
      configuredEndpoint,
      storedEndpoint: previousEndpoint,
      token: values.get('cv.token'),
      tokenEndpoint: values.get(SESSION_ENDPOINT_STORAGE_KEY),
    }).autoResume,
    true,
  );

  const failedValues = new Map([['cv.token', 'older-token'], [SESSION_ENDPOINT_STORAGE_KEY, previousEndpoint]]);
  const failingStorage = {
    set(key, value) {
      if (key === 'cv.token') return false;
      failedValues.set(key, value);
      return true;
    },
    del(key) {
      failedValues.delete(key);
    },
  };
  assert.equal(
    persistApiSessionToken({ token: 'new-token', endpoint: configuredEndpoint, storage: failingStorage }),
    false,
    'a token is not left persisted unless its endpoint binding is also stored',
  );
  assert.equal(failedValues.has('cv.token'), false);
  assert.equal(failedValues.has(SESSION_ENDPOINT_STORAGE_KEY), false);

  clearPersistedApiSessionToken(storage);
  assert.equal(values.has('cv.token'), false);
  assert.equal(values.has(SESSION_ENDPOINT_STORAGE_KEY), false);

  assert.match(mainSource, /resolveApiSession\(/);
  assert.match(legacyEntrySource, /resolveApiSession\(/);
  assert.match(authSource, /persistApiSessionToken\(/);
  assert.match(authSource, /clearPersistedApiSessionToken\(/);
  assert.doesNotMatch(authSource, /ls\.set\('cv\.token',\s*data\.token\)/);
  assert.doesNotMatch(authSource, /ls\.del\('cv\.token'\)/);

  console.log(
    'Session endpoint binding OK — endpoint changes and legacy unbound tokens fail closed; matching sessions restore safely.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
