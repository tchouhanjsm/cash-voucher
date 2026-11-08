'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'frontend/core/laravel-api.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'frontend/main.js'), 'utf8');
const configSource = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const buildSource = fs.readFileSync(path.join(root, 'scripts/build-web.js'), 'utf8');

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    },
  };
}

async function run() {
  const { createLaravelApi } = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
  const csrf = 'a'.repeat(64);
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), ...options });
    if (String(url).endsWith('/sessions') && options.method === 'POST') {
      return jsonResponse({
        ok: true,
        data: {
          user: {
            id: 'user-1',
            email: 'staff@example.test',
            role: 'staff',
            mustChangePassword: false,
          },
          csrfToken: csrf,
        },
      });
    }
    if (String(url).endsWith('/bootstrap')) {
      return jsonResponse({
        ok: true,
        data: {
          user: { id: 'user-1', role: 'staff' },
          settings: { timeZone: 'Asia/Kolkata', currency: 'INR' },
          vouchers: [],
          vendors: [],
          names: {},
          onboarding: null,
          onboardingError: '',
        },
      });
    }
    if (String(url).includes('/dashboard/summary?')) {
      return jsonResponse({
        ok: true,
        data: { from: '2026-11-01', to: '2026-11-07', paid: '0.00' },
      });
    }
    if (String(url).includes('/vouchers?')) {
      return jsonResponse({
        ok: true,
        data: {
          items: [
            {
              id: 'voucher-1',
              voucherNo: '204',
              date: '2026-11-07',
              vendor: 'Test supplier',
              amount: '12.50',
              type: 'PAYMENT',
              status: 'ACTIVE',
              createdBy: 'staff@example.test',
            },
          ],
          offset: 0,
          limit: 10,
          totalCount: 1,
          hasMore: false,
        },
      });
    }
    if (String(url).includes('/vendors/vendor-1/active')) {
      return jsonResponse({
        ok: true,
        data: {
          vendor: { id: 'vendor-1', name: 'Test supplier', active: false },
          replayed: false,
        },
      });
    }
    if (String(url).endsWith('/vendors') || String(url).endsWith('/vendors/vendor-1')) {
      return jsonResponse({
        ok: true,
        data: {
          vendor: { id: 'vendor-1', name: 'Test supplier', active: true },
          replayed: false,
        },
      });
    }
    if (String(url).endsWith('/sessions/current')) {
      return jsonResponse({ ok: true, data: { user: { id: 'user-1' }, csrfToken: csrf } });
    }
    if (String(url).endsWith('/sessions/current/logout')) {
      return jsonResponse({ ok: true, data: { signedOut: true } });
    }
    return jsonResponse(
      {
        ok: false,
        error: { code: 'SESSION_EXPIRED', message: 'Your session expired.' },
      },
      401,
    );
  };

  const api = createLaravelApi({
    getUrl: () => 'https://cash-voucher.example/api/v1',
    getOrigin: () => 'https://cash-voucher.example',
    fetchImpl,
  });

  const login = await api('login', { email: 'staff@example.test', password: 'not-persisted' });
  assert.equal(login.token, 'laravel-cookie-session');
  assert.equal(login.user.email, 'staff@example.test');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].credentials, 'same-origin');
  assert.equal(requests[0].mode, 'same-origin');
  assert.equal(requests[0].cache, 'no-store');
  assert.equal(requests[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[0].body), {
    email: 'staff@example.test',
    password: 'not-persisted',
  });
  assert.equal(JSON.stringify(requests[0]).includes(csrf), false);

  const bootstrap = await api('bootstrap');
  assert.equal(bootstrap.user.id, 'user-1');
  assert.equal(requests[1].method, 'GET');
  assert.equal(requests[1].headers.Accept, 'application/json');

  const summary = await api('dashboardSummary', { from: '2026-11-01', to: '2026-11-07' });
  assert.equal(summary.paid, '0.00');
  assert.match(requests[2].url, /from=2026-11-01/);
  assert.match(requests[2].url, /to=2026-11-07/);

  const page = await api('registerPage', {
    from: '2026-11-01',
    to: '2026-11-07',
    st: 'ACTIVE',
    t: 'PAYMENT',
    offset: 0,
    limit: 10,
  });
  assert.equal(page.items[0].no, 204);
  assert.deepEqual(page.facets, { vendors: [], users: [] });

  const createdVendor = await api('saveVendor', {
    name: 'Test supplier',
    company: 'Test company',
    mobile: '+91 98765 43210',
    defaultCategory: 'Maintenance',
    defaultPaymentMethod: 'UPI',
  });
  assert.equal(createdVendor.id, 'vendor-1');
  assert.equal(requests[4].method, 'POST');
  assert.match(requests[4].url, /\/vendors$/);
  assert.equal(requests[4].headers['X-CSRF-Token'], csrf);
  assert.match(requests[4].headers['Idempotency-Key'], /^vendor-[a-f0-9]{32}$/);
  assert.deepEqual(JSON.parse(requests[4].body), {
    name: 'Test supplier',
    company: 'Test company',
    mobile: '+91 98765 43210',
    defaultCategory: 'Maintenance',
    defaultPaymentMethod: 'UPI',
  });

  await api('saveVendor', { id: 'vendor-1', name: 'Test supplier renamed' });
  assert.equal(requests[5].method, 'PATCH');
  assert.match(requests[5].url, /\/vendors\/vendor-1$/);
  assert.equal(JSON.parse(requests[5].body).name, 'Test supplier renamed');
  assert.match(requests[5].headers['Idempotency-Key'], /^vendor-[a-f0-9]{32}$/);

  const toggledVendor = await api('toggleVendor', { id: 'vendor-1', active: false });
  assert.equal(toggledVendor.active, false);
  assert.equal(requests[6].method, 'POST');
  assert.match(requests[6].url, /\/vendors\/vendor-1\/active$/);
  assert.deepEqual(JSON.parse(requests[6].body), { active: false });
  assert.match(requests[6].headers['Idempotency-Key'], /^vendor-[a-f0-9]{32}$/);

  const beforeInvalidVendor = requests.length;
  await assert.rejects(
    () => api('toggleVendor', { id: 'vendor-1' }),
    (error) => error.code === 'PAYLOAD_INVALID',
  );
  assert.equal(requests.length, beforeInvalidVendor);

  const beforeUnsupported = requests.length;
  await assert.rejects(
    () => api('registerPage', { vendor: 'Test supplier', offset: 0, limit: 10 }),
    (error) => error.code === 'API_ACTION_UNSUPPORTED',
  );
  await assert.rejects(
    () => api('createVouchers', { entries: [{ clientId: 'client-1' }] }),
    (error) => error.code === 'API_ACTION_UNSUPPORTED',
  );
  assert.equal(requests.length, beforeUnsupported, 'unsupported actions must not reach any server');

  const reloadRequests = [];
  const reloadedApi = createLaravelApi({
    getUrl: () => 'https://cash-voucher.example/api/v1',
    getOrigin: () => 'https://cash-voucher.example',
    fetchImpl: async (url, options) => {
      reloadRequests.push({ url: String(url), ...options });
      if (String(url).endsWith('/sessions/current')) {
        return jsonResponse({ ok: true, data: { user: { id: 'user-1' }, csrfToken: csrf } });
      }
      return jsonResponse({ ok: true, data: { signedOut: true } });
    },
  });
  await reloadedApi('logout');
  assert.equal(reloadRequests.length, 2, 'a reload must restore CSRF state before a write');
  assert.equal(reloadRequests[0].method, 'GET');
  assert.equal(reloadRequests[1].method, 'POST');
  assert.equal(reloadRequests[1].headers['X-CSRF-Token'], csrf);
  assert.equal(reloadRequests[1].credentials, 'same-origin');

  const crossOriginApi = createLaravelApi({
    getUrl: () => 'https://attacker.example/api/v1',
    getOrigin: () => 'https://cash-voucher.example',
    fetchImpl: async () => {
      throw new Error('fetch must not be called for cross-origin bases');
    },
  });
  await assert.rejects(
    () => crossOriginApi('bootstrap'),
    (error) => error.code === 'ORIGIN_MISMATCH',
  );

  const insecureApi = createLaravelApi({
    getUrl: () => 'http://cash-voucher.example/api/v1',
    getOrigin: () => 'http://cash-voucher.example',
    fetchImpl: async () => {
      throw new Error('fetch must not be called for insecure non-local origins');
    },
  });
  await assert.rejects(
    () => insecureApi('bootstrap'),
    (error) => error.code === 'ORIGIN_MISMATCH',
  );

  const expiredApi = createLaravelApi({
    getUrl: () => 'https://cash-voucher.example/api/v1',
    getOrigin: () => 'https://cash-voucher.example',
    fetchImpl: async () =>
      jsonResponse(
        {
          ok: false,
          error: { code: 'SESSION_EXPIRED', message: 'Session expired.' },
        },
        401,
      ),
  });
  await assert.rejects(
    () => expiredApi('bootstrap'),
    (error) => error.code === 'SESSION',
  );

  assert.match(mainSource, /API_TRANSPORT/);
  assert.match(mainSource, /createLaravelApi/);
  assert.match(configSource, /transport.*laravel-shadow/);
  assert.match(buildSource, /API_TRANSPORT: "apps-script"/);
  assert.match(buildSource, /LARAVEL_API_URL: ""/);

  console.log(
    'Laravel cookie transport OK — same-origin only, HttpOnly session token not exposed, CSRF restored in memory, vendor create/update/state changes use CSRF and idempotency, and unsupported writes fail closed.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
