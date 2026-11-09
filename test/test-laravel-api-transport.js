'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'frontend/core/laravel-api.js'), 'utf8');
const paymentsSource = fs.readFileSync(path.join(root, 'frontend/features/payments.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'frontend/main.js'), 'utf8');
const configSource = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const buildSource = fs.readFileSync(path.join(root, 'scripts/build-web.js'), 'utf8');

function imageResponse(bytes, mime = 'image/png', status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        const key = name.toLowerCase();
        return key === 'content-type'
          ? mime
          : key === 'content-length'
            ? String(bytes.length)
            : null;
      },
    },
    async arrayBuffer() {
      return Uint8Array.from(bytes).buffer;
    },
  };
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    },
  };
}

const duplicateRequestStart = paymentsSource.indexOf(
  'async function requestDuplicateConfirmations',
);
const duplicateRequestEnd = paymentsSource.indexOf(
  'if (!Array.isArray(response?.results)',
  duplicateRequestStart,
);
const duplicateRequestMapper = paymentsSource.slice(duplicateRequestStart, duplicateRequestEnd);
assert.ok(
  duplicateRequestStart >= 0 && duplicateRequestEnd > duplicateRequestStart,
  'New Entry must map duplicate-review rows before transport',
);
for (const field of ['category', 'notes', 'cashImpact', 'paymentMethod']) {
  assert.ok(
    duplicateRequestMapper.includes(field + ': entry.' + field),
    'duplicate review must send ' + field + ' so Laravel can validate and bind the review token',
  );
}

const createRecoveryContract = paymentsSource.slice(
  paymentsSource.indexOf("const failureCode = String(e?.code || '');"),
  paymentsSource.indexOf(
    'await flushOutbox();',
    paymentsSource.indexOf("const failureCode = String(e?.code || '');"),
  ),
);
assert.ok(
  createRecoveryContract.includes('RECEIPT_SYNC_PENDING') &&
    createRecoveryContract.includes('BATCH_PARTIAL_FAILURE'),
  'New Entry must preserve partial voucher/receipt outcomes in the local outbox',
);

async function run() {
  const { createLaravelApi } = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
  const csrf = 'a'.repeat(64);
  const requests = [];
  const createdVoucherOperations = new Map();
  const attachedReceiptOperations = new Map();
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
        data: {
          from: '2026-11-01',
          to: '2026-11-07',
          periodDays: 7,
          trendMonthly: false,
          paid: '125.50',
          previousPaid: '100.00',
          received: '30.25',
          todayPaid: '10.00',
          bookBalance: '-15.75',
          paymentCount: 3,
          validPaymentCount: 3,
          receiptCount: 1,
          todayPaymentCount: 1,
          approvalExceptionCount: 0,
          invalidAmountCount: 0,
          malformedRecordCount: 0,
          malformedFieldCount: 0,
          largest: { vendor: 'Test supplier', amount: '75.50' },
          trend: [{ date: '2026-11-01', amount: '125.50' }],
          topVendors: [{ k: 'Test supplier', n: 1, s: '75.50' }],
          byCategory: [{ k: 'Office', n: 1, s: '125.50' }],
          byTeamMember: [],
          byPaymentMethod: [{ k: 'UPI', n: 1, s: '125.50' }],
        },
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
              receipts: ['11111111-1111-4111-8111-111111111111'],
            },
          ],
          offset: 0,
          limit: 10,
          totalCount: 1,
          hasMore: false,
        },
      });
    }
    if (String(url).endsWith('/cash-closes/preview')) {
      return jsonResponse({
        ok: true,
        data: {
          date: '2026-11-08',
          closed: false,
          blockedByLaterClose: false,
          requiresManualOpening: true,
          openingCash: null,
          openingReady: false,
          cashInTotal: '25.50',
          cashOutTotal: '125.50',
          noCashCount: 1,
          activeVoucherCount: 3,
          expectedCash: null,
          readyToClose: false,
          pendingApprovals: [],
          unclassified: [],
          invalidVouchers: [],
        },
      });
    }
    if (String(url).endsWith('/users')) {
      return jsonResponse({
        ok: true,
        data: {
          items: [
            {
              id: 'user-1',
              name: 'Test owner',
              email: 'owner@example.test',
              role: 'owner',
              active: true,
            },
          ],
          count: 1,
        },
      });
    }
    if (String(url).includes('/audit-events?')) {
      return jsonResponse({
        ok: true,
        data: {
          items: [
            {
              id: 'audit-1',
              actorUserId: 'user-1',
              actorEmail: 'owner@example.test',
              eventType: 'USER_UPDATED',
              targetType: 'user',
              targetId: 'user-1',
              before: { active: false },
              after: { active: true },
              reason: 'Audit test reason',
              occurredAtUtc: '2026-11-08 10:00:00.000000',
            },
          ],
          count: 1,
          limit: 50,
          hasMore: true,
          nextCursor: 'opaque-cursor',
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
    if (String(url).includes('/entry-suggestions?')) {
      return jsonResponse({
        ok: true,
        data: {
          vendor: 'Test supplier',
          scope: 'OWN',
          suggestions: {
            category: { value: 'Maintenance', source: 'HISTORY', evidenceCount: 3 },
            paymentMethod: { value: 'UPI', source: 'HISTORY', evidenceCount: 2 },
          },
        },
      });
    }
    if (String(url).endsWith('/vouchers/duplicate-check')) {
      const body = JSON.parse(options.body || '{}');
      const matched = body.vendor === 'Matched supplier';
      return jsonResponse({
        ok: true,
        data: {
          matches: matched
            ? [{ voucherNo: '208', date: '2026-11-08', vendor: body.vendor, amountPaise: 45000 }]
            : [],
          duplicateCount: matched ? 1 : 0,
          hiddenCount: 0,
          confirmationToken: matched ? 'opaque-review-token' : '',
        },
      });
    }
    if (String(url).endsWith('/sessions/current')) {
      return jsonResponse({ ok: true, data: { user: { id: 'user-1' }, csrfToken: csrf } });
    }
    if (String(url).endsWith('/receipts/11111111-1111-4111-8111-111111111111')) {
      return imageResponse([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    }
    if (String(url).includes('/vouchers/22222222-2222-4222-8222-222222222222/receipts')) {
      return jsonResponse(
        {
          ok: true,
          data: {
            receipt: {
              id: '33333333-3333-4333-8333-333333333333',
              voucherId: '22222222-2222-4222-8222-222222222222',
              contentType: 'image/png',
              byteSize: 12,
              sha256: 'b'.repeat(64),
            },
            receiptCount: 1,
            replayed: false,
          },
        },
        201,
      );
    }
    if (String(url).endsWith('/vouchers') && options.method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      const idempotencyKey = options.headers['Idempotency-Key'];
      const previous = createdVoucherOperations.get(idempotencyKey);
      if (previous) {
        if (JSON.stringify(previous.body) !== JSON.stringify(body)) {
          return jsonResponse(
            { ok: false, error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Key reused.' } },
            409,
          );
        }
        return jsonResponse({ ok: true, data: { voucher: previous.voucher, replayed: true } });
      }
      const suffix = String(createdVoucherOperations.size + 1).padStart(12, '0');
      const voucher = {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-' + suffix,
        voucherNo: 301 + createdVoucherOperations.size,
        date: body.date,
        vendor: body.vendor,
        vendorId: body.vendorId,
        vendorType: body.vendorId ? 'REGISTERED' : 'ONE_TIME',
        amount: body.amount,
        amountPaise: Math.round(Number(body.amount) * 100),
        category: body.category,
        notes: body.notes,
        type: body.type,
        status: 'ACTIVE',
        cashImpact: body.cashImpact,
        paymentMethod: body.paymentMethod,
        approvalStatus: Number(body.amount) >= 10000 ? 'PENDING' : 'NOT_REQUIRED',
        clientId: body.clientId,
        createdBy: 'staff@example.test',
      };
      createdVoucherOperations.set(idempotencyKey, { body, voucher });
      return jsonResponse({ ok: true, data: { voucher, replayed: false } }, 201);
    }
    if (String(url).includes('/vouchers/aaaaaaaa-aaaa-4aaa-8aaa-')) {
      const pathParts = new URL(String(url)).pathname.split('/');
      const voucherId =
        pathParts[pathParts.length - 1] === 'receipts' ? pathParts[pathParts.length - 2] : '';
      if (voucherId && options.method === 'POST') {
        const idempotencyKey = options.headers['Idempotency-Key'];
        const previous = attachedReceiptOperations.get(idempotencyKey);
        if (previous) {
          return jsonResponse({ ok: true, data: previous });
        }
        const receipt = {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
          voucherId,
          contentType: 'image/png',
          byteSize: 12,
          sha256: 'c'.repeat(64),
        };
        const value = {
          receipt,
          receiptCount: 1,
          replayed: false,
        };
        attachedReceiptOperations.set(idempotencyKey, value);
        return jsonResponse({ ok: true, data: value }, 201);
      }
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
  assert.equal(summary.paid, 125.5);
  assert.equal(summary.bookBalance, -15.75);
  assert.equal(summary.largest.amount, 75.5);
  assert.equal(summary.trend[0].amount, 125.5);
  assert.equal(summary.topVendors[0].s, 75.5);
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
  assert.equal(page.items[0].amount, 12.5);
  assert.deepEqual(page.items[0].receipts, ['11111111-1111-4111-8111-111111111111']);
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

  const dailyOperations = await api('dailyOperationsSummary');
  assert.equal(dailyOperations.status, 'OPENING_CASH_REQUIRED');
  assert.equal(dailyOperations.openingCashRequired, true);
  assert.equal(dailyOperations.cashOutTotal, 125.5);
  assert.equal(dailyOperations.expectedCash, null);
  assert.ok(requests[7].url.endsWith('/cash-closes/preview'));

  const users = await api('listUsers');
  assert.equal(users.length, 1);
  assert.equal(users[0].name, 'Test owner');
  assert.equal(users[0].active, true);
  assert.ok(requests[8].url.endsWith('/users'));

  const audit = await api('auditLog');
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].action, 'USER_UPDATED');
  assert.equal(audit.rows[0].target, 'user user-1');
  assert.equal(audit.totalCount, null, 'the cursor API must not invent a total count');
  assert.equal(audit.nextBeforeRow, 'opaque-cursor');
  assert.match(audit.rows[0].details, /Audit test reason/);
  assert.ok(requests[9].url.includes('/audit-events?'));
  assert.ok(requests[9].url.includes('/audit-events?'));

  await api('auditLog', { beforeRow: 'opaque-cursor' });
  assert.match(requests[10].url, /cursor=opaque-cursor/);

  const receiptUpload = await api('addReceipt', {
    id: '22222222-2222-4222-8222-222222222222',
    receipt: { mime: 'image/png', data: 'aGVsbG8=' },
    idempotencyKey: 'receipt-test-key-001',
    existingReceiptIds: [],
  });
  assert.deepEqual(receiptUpload.receipts, ['33333333-3333-4333-8333-333333333333']);
  const receiptWrite = requests.find((request) =>
    request.url.includes('/vouchers/22222222-2222-4222-8222-222222222222/receipts'),
  );
  assert.equal(receiptWrite.method, 'POST');
  assert.equal(receiptWrite.headers['X-CSRF-Token'], csrf);
  assert.equal(receiptWrite.headers['Idempotency-Key'], 'receipt-test-key-001');
  assert.deepEqual(JSON.parse(receiptWrite.body), {
    receipt: { mime: 'image/png', data: 'aGVsbG8=' },
  });

  const receiptRead = await api('getReceipt', {
    id: '22222222-2222-4222-8222-222222222222',
    fileId: '11111111-1111-4111-8111-111111111111',
  });
  assert.match(receiptRead.dataUrl, /^data:image\/png;base64,/);
  const binaryRead = requests.find((request) =>
    request.url.endsWith('/receipts/11111111-1111-4111-8111-111111111111'),
  );
  assert.equal(binaryRead.method, 'GET');
  assert.equal(binaryRead.credentials, 'same-origin');

  const entrySuggestions = await api('entrySuggestions', {
    vendor: 'Test supplier',
    type: 'PAYMENT',
  });
  assert.equal(entrySuggestions.scope, 'OWN');
  assert.equal(entrySuggestions.suggestions.category.value, 'Maintenance');
  assert.equal(entrySuggestions.suggestions.paymentMethod.value, 'UPI');
  const suggestionsRequest = requests.find((request) =>
    request.url.includes('/entry-suggestions?'),
  );
  assert.equal(new URL(suggestionsRequest.url).searchParams.get('vendor'), 'Test supplier');
  assert.equal(new URL(suggestionsRequest.url).searchParams.get('type'), 'PAYMENT');
  assert.equal(suggestionsRequest.method, 'GET');

  const duplicateReview = await api('checkPaymentDuplicates', {
    entries: [
      {
        clientId: 'duplicate-client-1',
        date: '2026-11-09',
        type: 'PAYMENT',
        vendor: 'Matched supplier',
        vendorId: null,
        amount: '450.00',
        category: 'Other',
        notes: 'First entry',
        cashImpact: 'CASH_OUT',
        paymentMethod: 'UPI',
      },
      {
        clientId: 'duplicate-client-2',
        date: '2026-11-09',
        type: 'PAYMENT',
        vendor: 'New supplier',
        vendorId: null,
        amount: '125.50',
        category: 'Office',
        notes: '',
        cashImpact: 'CASH_OUT',
        paymentMethod: 'CASH',
      },
    ],
  });
  assert.equal(duplicateReview.results.length, 2);
  assert.equal(duplicateReview.results[0].index, 0);
  assert.equal(duplicateReview.results[0].duplicateCount, 1);
  assert.equal(duplicateReview.results[0].confirmationToken, 'opaque-review-token');
  assert.equal(duplicateReview.results[0].matches[0].voucherNo, '208');
  assert.equal(duplicateReview.results[1].duplicateCount, 0);
  assert.equal(duplicateReview.results[1].confirmationToken, '');
  const duplicateRequests = requests.filter((request) =>
    request.url.endsWith('/vouchers/duplicate-check'),
  );
  assert.equal(
    duplicateRequests.length,
    2,
    'each batch entry is checked against the Laravel history',
  );
  assert.equal(duplicateRequests[0].method, 'POST');
  assert.equal(duplicateRequests[0].credentials, 'same-origin');
  assert.equal(duplicateRequests[0].headers['X-CSRF-Token'], csrf);
  assert.equal(
    duplicateRequests[0].headers['Idempotency-Key'],
    undefined,
    'a read-only duplicate check is not a financial write',
  );
  assert.deepEqual(JSON.parse(duplicateRequests[0].body), {
    date: '2026-11-09',
    vendor: 'Matched supplier',
    vendorId: null,
    amount: '450.00',
    category: 'Other',
    notes: 'First entry',
    type: 'PAYMENT',
    cashImpact: 'CASH_OUT',
    paymentMethod: 'UPI',
    clientId: 'duplicate-client-1',
  });
  const beforeInvalidDuplicate = requests.length;
  await assert.rejects(
    () =>
      api('checkPaymentDuplicates', {
        entries: [{ clientId: 'invalid', date: 'not-a-date', vendor: '', amount: 0 }],
      }),
    (error) => error.code === 'PAYLOAD_INVALID',
  );
  await assert.rejects(
    () => api('checkPaymentDuplicates', { entries: [] }),
    (error) => error.code === 'PAYLOAD_INVALID',
  );
  assert.equal(
    requests.length,
    beforeInvalidDuplicate,
    'invalid duplicate-check input must not reach the server',
  );

  const createEntries = [
    {
      clientId: 'create-client-001',
      date: '2026-11-09',
      type: 'PAYMENT',
      vendor: 'Create supplier',
      vendorId: null,
      amount: 125.5,
      category: 'Maintenance',
      notes: 'Create transport payment',
      cashImpact: 'CASH_OUT',
      paymentMethod: 'UPI',
      duplicateConfirmationToken: '',
      receipts: [],
    },
    {
      clientId: 'create-client-002',
      date: '2026-11-09',
      type: 'RECEIPT',
      vendor: 'Cash customer',
      vendorId: null,
      amount: 55,
      category: 'Other',
      notes: 'Cash received',
      cashImpact: 'CASH_IN',
      paymentMethod: 'CASH',
      receipts: [{ mime: 'image/png', data: 'aGVsbG8=' }],
    },
  ];
  const createResult = await api('createVouchers', { entries: createEntries });
  assert.equal(createResult.created.length, 2);
  assert.equal(createResult.skipped, 0);
  assert.equal(createResult.created[0].no, 301);
  assert.equal(createResult.created[0].amount, 125.5);
  assert.deepEqual(createResult.created[0].receipts, []);
  assert.equal(createResult.created[1].no, 302);
  assert.equal(createResult.created[1].amount, 55);
  assert.deepEqual(createResult.created[1].receipts, ['bbbbbbbb-bbbb-4bbb-8bbb-000000000001']);
  const createWrites = requests.filter(
    (request) => request.url.endsWith('/vouchers') && request.method === 'POST',
  );
  assert.equal(createWrites.length, 2);
  assert.match(createWrites[0].headers['Idempotency-Key'], /^voucher-[a-f0-9]{64}$/);
  assert.match(createWrites[1].headers['Idempotency-Key'], /^voucher-[a-f0-9]{64}$/);
  assert.notEqual(
    createWrites[0].headers['Idempotency-Key'],
    createWrites[1].headers['Idempotency-Key'],
  );
  assert.equal(createWrites[0].headers['X-CSRF-Token'], csrf);
  assert.deepEqual(JSON.parse(createWrites[0].body), {
    date: '2026-11-09',
    vendor: 'Create supplier',
    vendorId: null,
    amount: '125.50',
    category: 'Maintenance',
    notes: 'Create transport payment',
    type: 'PAYMENT',
    cashImpact: 'CASH_OUT',
    paymentMethod: 'UPI',
    clientId: 'create-client-001',
    duplicateConfirmationToken: '',
  });
  assert.equal(
    Object.prototype.hasOwnProperty.call(JSON.parse(createWrites[1].body), 'receipts'),
    false,
    'receipt images must use the dedicated private attachment endpoint',
  );
  const attachmentWrite = requests.find((request) =>
    request.url.endsWith('/vouchers/aaaaaaaa-aaaa-4aaa-8aaa-000000000002/receipts'),
  );
  assert.ok(attachmentWrite);
  assert.match(attachmentWrite.headers['Idempotency-Key'], /^receipt-[a-f0-9]{64}$/);
  assert.equal(attachmentWrite.headers['X-CSRF-Token'], csrf);
  assert.deepEqual(JSON.parse(attachmentWrite.body), {
    receipt: { mime: 'image/png', data: 'aGVsbG8=' },
  });

  const replayedCreate = await api('createVouchers', { entries: createEntries });
  assert.equal(replayedCreate.created.length, 2);
  assert.equal(replayedCreate.skipped, 2);
  assert.equal(replayedCreate.created[0].id, createResult.created[0].id);
  assert.deepEqual(replayedCreate.created[1].receipts, createResult.created[1].receipts);
  const repeatedCreateWrites = requests.filter(
    (request) => request.url.endsWith('/vouchers') && request.method === 'POST',
  );
  assert.equal(
    repeatedCreateWrites[0].headers['Idempotency-Key'],
    repeatedCreateWrites[2].headers['Idempotency-Key'],
    'voucher retry keys must be stable across calls',
  );
  const repeatedAttachment = requests.filter((request) =>
    request.url.endsWith('/vouchers/aaaaaaaa-aaaa-4aaa-8aaa-000000000002/receipts'),
  );
  assert.equal(repeatedAttachment.length, 2);
  assert.equal(
    repeatedAttachment[0].headers['Idempotency-Key'],
    repeatedAttachment[1].headers['Idempotency-Key'],
    'receipt retry keys must be stable for the same image and entry',
  );

  const partialRequests = [];
  const partialOperations = new Map();
  let failSecondCreate = true;
  const recoveryApi = createLaravelApi({
    getUrl: () => 'https://cash-voucher.example/api/v1',
    getOrigin: () => 'https://cash-voucher.example',
    fetchImpl: async (url, options) => {
      partialRequests.push({ url: String(url), ...options });
      if (String(url).endsWith('/sessions/current')) {
        return jsonResponse({ ok: true, data: { user: { id: 'user-1' }, csrfToken: csrf } });
      }
      if (String(url).endsWith('/vouchers') && options.method === 'POST') {
        if (failSecondCreate && partialOperations.size === 1) {
          failSecondCreate = false;
          throw new Error('simulated connection loss after the first commit');
        }
        const body = JSON.parse(options.body);
        const key = options.headers['Idempotency-Key'];
        if (partialOperations.has(key)) {
          return jsonResponse({
            ok: true,
            data: { voucher: partialOperations.get(key), replayed: true },
          });
        }
        const voucher = {
          id: 'cccccccc-cccc-4ccc-8ccc-' + String(partialOperations.size + 1).padStart(12, '0'),
          voucherNo: 401 + partialOperations.size,
          date: body.date,
          vendor: body.vendor,
          amount: body.amount,
          type: body.type,
          approvalStatus: 'NOT_REQUIRED',
        };
        partialOperations.set(key, voucher);
        return jsonResponse({ ok: true, data: { voucher, replayed: false } }, 201);
      }
      return jsonResponse(
        { ok: false, error: { code: 'SESSION_EXPIRED', message: 'Session expired.' } },
        401,
      );
    },
  });
  const recoverEntries = createEntries.map((entry, index) => ({
    ...entry,
    clientId: 'recovery-client-00' + (index + 1),
    receipts: [],
  }));
  await assert.rejects(
    () => recoveryApi('createVouchers', { entries: recoverEntries }),
    (error) => error.code === 'NET',
  );
  const firstAttemptKey = partialRequests.find(
    (request) => request.url.endsWith('/vouchers') && request.method === 'POST',
  ).headers['Idempotency-Key'];
  const recovered = await recoveryApi('createVouchers', { entries: recoverEntries });
  assert.equal(recovered.created.length, 2);
  assert.equal(recovered.skipped, 1);
  const firstEntryWrites = partialRequests.filter((request) => {
    if (!request.url.endsWith('/vouchers') || request.method !== 'POST') return false;
    return JSON.parse(request.body).clientId === recoverEntries[0].clientId;
  });
  assert.equal(firstEntryWrites.length, 2);
  assert.equal(firstEntryWrites[0].headers['Idempotency-Key'], firstAttemptKey);
  assert.equal(firstEntryWrites[1].headers['Idempotency-Key'], firstAttemptKey);

  const beforeInvalidCreate = requests.length;
  await assert.rejects(
    () => api('createVouchers', { entries: [] }),
    (error) => error.code === 'PAYLOAD_INVALID',
  );
  await assert.rejects(
    () => api('createVouchers', { bulk: true, entries: createEntries }),
    (error) => error.code === 'API_ACTION_UNSUPPORTED',
  );
  assert.equal(
    requests.length,
    beforeInvalidCreate,
    'invalid or bulk create payloads must not reach the Laravel server',
  );

  const beforeUnsupported = requests.length;
  await assert.rejects(
    () => api('registerPage', { vendor: 'Test supplier', offset: 0, limit: 10 }),
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

  const unsafePrecisionApi = createLaravelApi({
    getUrl: () => 'https://cash-voucher.example/api/v1',
    getOrigin: () => 'https://cash-voucher.example',
    fetchImpl: async () =>
      jsonResponse({
        ok: true,
        data: { paid: '45035996273704.96' },
      }),
  });
  await assert.rejects(
    () => unsafePrecisionApi('dashboardSummary'),
    (error) => error.code === 'AMOUNT_PRECISION_UNSAFE',
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
    'Laravel cookie transport OK — same-origin session, duplicate review, vendor and receipt upload/download, receipt IDs, CSRF/idempotency contracts, and fail-closed unsupported writes.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
