'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {
  createLocalServer,
  localHost,
  localTarget,
  publicAssetPath,
} = require('../scripts/dev-laravel-shadow');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function get(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('error', reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

async function run() {
  assert.equal(localHost('127.0.0.1'), '127.0.0.1');
  assert.throws(() => localHost('0.0.0.0'), /loopback only/);
  assert.equal(localTarget('http://127.0.0.1:8000').port, '8000');
  assert.throws(() => localTarget('https://127.0.0.1:8000'), /loopback only/);
  assert.throws(() => localTarget('http://example.com:8000'), /loopback only/);

  assert.ok(publicAssetPath('/index.html'));
  assert.ok(publicAssetPath('/frontend/main.js'));
  assert.ok(publicAssetPath('/frontend/core/laravel-api.js'));
  assert.ok(publicAssetPath('/icons/icon-192.png'));
  for (const denied of [
    '/.env',
    '/laravel/.env',
    '/database/migrations/0001_identity_and_catalog.sql',
    '/backend/99-routes.gs',
    '/docs/HANDOFF.md',
    '/package.json',
    '/%2e%2e/package.json',
    '/frontend/../../package.json',
  ]) {
    assert.equal(publicAssetPath(denied), null, 'must not expose '+denied);
  }

  const forwarded = [];
  const csrf = 'b'.repeat(64);
  const upstream = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      forwarded.push({
        method: request.method,
        url: request.url,
        cookie: request.headers.cookie,
        csrf: request.headers['x-csrf-token'],
        body: Buffer.concat(chunks).toString('utf8'),
      });
      response.setHeader('Set-Cookie', [
        'cv_session=opaque-session; Path=/api/v1; HttpOnly; Secure; SameSite=Strict',
        'cv_csrf='+csrf+'; Path=/api/v1; Secure; SameSite=Strict',
      ]);
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify({ ok: true, data: { session: 'restored' } }));
    });
  });

  const upstreamPort = await listen(upstream);
  const app = createLocalServer({
    host: '127.0.0.1',
    proxyTarget: 'http://127.0.0.1:'+upstreamPort,
  });
  const appPort = await listen(app);

  try {
    const shell = await get(appPort, '/');
    assert.equal(shell.status, 200);
    assert.match(shell.headers['content-type'], /text\/html/);
    assert.match(shell.headers['cache-control'], /no-store/);

    const denied = await get(appPort, '/laravel/.env');
    assert.equal(denied.status, 404);

    const cookie = 'cv_session=opaque-session; cv_csrf='+csrf;
    const api = await get(appPort, '/api/v1/sessions/current', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'X-CSRF-Token': csrf,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'local-proxy-test' }),
    });
    assert.equal(api.status, 200);
    assert.deepEqual(JSON.parse(api.body), { ok: true, data: { session: 'restored' } });
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].method, 'POST');
    assert.equal(forwarded[0].url, '/api/v1/sessions/current');
    assert.equal(forwarded[0].cookie, cookie);
    assert.equal(forwarded[0].csrf, csrf);
    assert.equal(forwarded[0].body, JSON.stringify({ reason: 'local-proxy-test' }));
    assert.equal(api.headers['set-cookie'].length, 2);
    assert.match(api.headers['set-cookie'][0], /HttpOnly/);
    assert.match(api.headers['set-cookie'][1], /cv_csrf=/);
  } finally {
    await close(app);
    await close(upstream);
  }

  console.log(
    'Local Laravel shadow dev proxy OK — loopback-only, allow-listed static assets, same-origin /api/v1 forwarding, and session/CSRF cookies preserved.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
