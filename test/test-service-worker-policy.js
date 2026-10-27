'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');

function response(url) {
  return {
    ok: true,
    status: 200,
    url,
    clone() {
      return response(url);
    },
  };
}

function requestUrl(request) {
  return typeof request === 'string' ? request : request.url;
}

function createHarness({ failAddAll = false } = {}) {
  const scope = 'https://example.test/app/';
  const stores = new Map();
  const handlers = new Map();
  const deleted = [];
  const failedFetches = new Set();
  const counts = { skipWaiting: 0, claim: 0, addAll: [] };

  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async addAll(paths) {
          counts.addAll.push({ name, paths: [...paths] });
          if (failAddAll) throw new Error('precache failed');
          for (const asset of paths) {
            const url = new URL(asset, scope).href;
            entries.set(url, response(url));
          }
        },
        async put(request, value) {
          entries.set(requestUrl(request), value);
        },
        async match(request) {
          return entries.get(requestUrl(request));
        },
      };
    },
    async match(request) {
      const key = requestUrl(request);
      for (const entries of stores.values()) {
        if (entries.has(key)) return entries.get(key);
      }
      return undefined;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      deleted.push(name);
      return stores.delete(name);
    },
  };

  const self = {
    location: { origin: 'https://example.test' },
    registration: { scope },
    clients: {
      async claim() {
        counts.claim += 1;
      },
    },
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
    skipWaiting() {
      counts.skipWaiting += 1;
    },
  };

  async function fetchStub(request) {
    const url = requestUrl(request);
    if (failedFetches.has(url)) throw new Error('network unavailable');
    return response(url);
  }

  vm.runInNewContext(source, {
    self,
    caches,
    fetch: fetchStub,
    URL,
    Promise,
  });

  async function lifecycle(name, extras = {}) {
    const pending = [];
    handlers.get(name)({
      ...extras,
      waitUntil(promise) {
        pending.push(Promise.resolve(promise));
      },
    });
    await Promise.all(pending);
  }

  async function dispatchFetch(request) {
    let responsePromise = null;
    handlers.get('fetch')({
      request,
      respondWith(promise) {
        responsePromise = Promise.resolve(promise);
      },
    });
    return responsePromise ? responsePromise : null;
  }

  return {
    stores,
    handlers,
    caches,
    deleted,
    failedFetches,
    counts,
    lifecycle,
    dispatchFetch,
  };
}

(async () => {
  const harness = createHarness();
  await harness.lifecycle('install');

  const currentCache = harness.stores.get('cv2-v32');
  assert.ok(currentCache, 'installation creates the current app-shell cache');
  assert.ok(currentCache.has('https://example.test/app/index.html'));
  assert.ok(currentCache.has('https://example.test/app/frontend/core/pwa.js'));
  assert.equal(
    harness.counts.skipWaiting,
    0,
    'installation does not activate over an existing app automatically',
  );

  harness.stores.set('cv2-v30', new Map([['old', response('old')]]));
  harness.stores.set('unrelated-host-cache', new Map([['keep', response('keep')]]));
  await harness.lifecycle('activate');
  assert.ok(!harness.stores.has('cv2-v30'), 'activation removes stale Cash Voucher caches');
  assert.ok(
    harness.stores.has('unrelated-host-cache'),
    'activation leaves caches owned by other host code intact',
  );
  assert.equal(harness.counts.claim, 1);

  harness.handlers.get('message')({ data: { type: 'OTHER' } });
  assert.equal(
    harness.counts.skipWaiting,
    0,
    'unrecognized worker messages do not activate an update',
  );
  harness.handlers.get('message')({ data: { type: 'SKIP_WAITING' } });
  assert.equal(harness.counts.skipWaiting, 1, 'explicit UI approval activates the waiting update');

  const cssUrl = 'https://example.test/app/style.css';
  const cssResponse = await harness.dispatchFetch({
    url: cssUrl,
    method: 'GET',
    mode: 'cors',
  });
  assert.equal(cssResponse.url, cssUrl);
  assert.ok(
    harness.stores.get('cv2-v32').has(cssUrl),
    'approved shell assets are cached after a successful network response',
  );

  const privateUrl = 'https://example.test/app/private/customer-report.json';
  const privateRequest = { url: privateUrl, method: 'GET', mode: 'cors' };
  assert.equal(
    await harness.dispatchFetch(privateRequest),
    null,
    'unlisted same-origin GETs pass through untouched',
  );
  assert.ok(
    !harness.stores.get('cv2-v32').has(privateUrl),
    'unlisted private responses are not placed in the app cache',
  );

  const crossOriginRequest = {
    url: 'https://script.google.com/macros/s/TEST/exec',
    method: 'GET',
    mode: 'cors',
  };
  assert.equal(
    await harness.dispatchFetch(crossOriginRequest),
    null,
    'cross-origin API requests pass through untouched',
  );

  const postRequest = { url: cssUrl, method: 'POST', mode: 'cors' };
  assert.equal(
    await harness.dispatchFetch(postRequest),
    null,
    'POST requests are never intercepted',
  );

  harness.failedFetches.add(cssUrl);
  const cachedCss = await harness.dispatchFetch({ url: cssUrl, method: 'GET', mode: 'cors' });
  assert.equal(cachedCss.url, cssUrl, 'an approved cached shell asset remains available offline');

  const rootUrl = 'https://example.test/app/register';
  harness.failedFetches.add(rootUrl);
  const offlineNavigation = await harness.dispatchFetch({
    url: rootUrl,
    method: 'GET',
    mode: 'navigate',
  });
  assert.equal(
    offlineNavigation.url,
    'https://example.test/app/index.html',
    'offline navigation falls back to the cached app shell',
  );
  assert.ok(
    !harness.stores.get('cv2-v32').has(rootUrl),
    'arbitrary navigation responses are not persisted as app-shell pages',
  );

  const failedInstall = createHarness({ failAddAll: true });
  failedInstall.stores.set('cv2-v30', new Map([['old', response('old')]]));
  await assert.rejects(failedInstall.lifecycle('install'), /precache failed/);
  assert.ok(
    failedInstall.stores.has('cv2-v30'),
    'failed installation preserves the prior active cache',
  );
  assert.ok(
    failedInstall.deleted.includes('cv2-v32'),
    'failed installation removes its partial cache',
  );
  assert.equal(failedInstall.counts.skipWaiting, 0);

  console.log('Service-worker policy tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
