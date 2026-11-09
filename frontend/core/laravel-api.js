const SESSION_MARKER = 'laravel-cookie-session';
const CSRF_PATTERN = /^[a-f0-9]{64}$/;

function failure(message, code) {
  return Object.assign(new Error(message), { code });
}

function normalizeCode(code, status) {
  if (code === 'SESSION_REQUIRED' || code === 'SESSION_EXPIRED') return 'SESSION';
  if (code === 'PASSWORD_CHANGE_REQUIRED') return 'PASSWORD_CHANGE';
  if (code === 'CSRF_INVALID') return 'CSRF';
  if (status === 401) return 'SESSION';
  return code || 'API_ERROR';
}

const MAX_DISPLAYABLE_PAISE = 4_503_599_627_370_495n;

function rupeesToNumber(value, label = 'amount') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw failure('The Laravel API returned an invalid ' + label + '.', 'API_RESPONSE_INVALID');
    }
    const paise = Math.round(value * 100);
    if (
      Math.abs(value * 100 - paise) > 0.000001 ||
      !Number.isSafeInteger(paise) ||
      Math.abs(paise) > Number(MAX_DISPLAYABLE_PAISE)
    ) {
      throw failure(
        'The Laravel API returned a ' + label + ' that cannot be displayed safely in INR.',
        'AMOUNT_PRECISION_UNSAFE',
      );
    }
    return paise / 100;
  }

  if (typeof value !== 'string' || !/^-?(?:0|[1-9][0-9]*)\.[0-9]{2}$/.test(value)) {
    throw failure('The Laravel API returned an invalid ' + label + '.', 'API_RESPONSE_INVALID');
  }

  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [rupees, paise] = unsigned.split('.');
  const totalPaise = BigInt(rupees) * 100n + BigInt(paise);
  if (totalPaise > MAX_DISPLAYABLE_PAISE) {
    throw failure(
      'The Laravel API returned a ' + label + ' that cannot be displayed safely in INR.',
      'AMOUNT_PRECISION_UNSAFE',
    );
  }
  return Number(negative ? -totalPaise : totalPaise) / 100;
}

function mapDashboardSummary(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return summary;
  const mapped = { ...summary };
  for (const field of ['paid', 'previousPaid', 'received', 'todayPaid', 'bookBalance']) {
    if (Object.prototype.hasOwnProperty.call(mapped, field)) {
      mapped[field] = rupeesToNumber(mapped[field], field);
    }
  }
  if (mapped.largest && typeof mapped.largest === 'object' && !Array.isArray(mapped.largest)) {
    mapped.largest = {
      ...mapped.largest,
      amount: rupeesToNumber(mapped.largest.amount, 'largest payment'),
    };
  }
  if (Array.isArray(mapped.trend)) {
    mapped.trend = mapped.trend.map((row) =>
      row && typeof row === 'object' && !Array.isArray(row)
        ? { ...row, amount: rupeesToNumber(row.amount, 'trend amount') }
        : row,
    );
  }
  for (const field of ['topVendors', 'byCategory', 'byTeamMember', 'byPaymentMethod']) {
    if (Array.isArray(mapped[field])) {
      mapped[field] = mapped[field].map((row) =>
        row && typeof row === 'object' && !Array.isArray(row)
          ? { ...row, s: rupeesToNumber(row.s, field + ' amount') }
          : row,
      );
    }
  }
  return mapped;
}

function mapDailyOperations(preview) {
  if (
    !preview ||
    typeof preview !== 'object' ||
    Array.isArray(preview) ||
    typeof preview.closed !== 'boolean' ||
    typeof preview.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(preview.date)
  ) {
    throw failure(
      'The Laravel cash-close preview returned an invalid response.',
      'API_RESPONSE_INVALID',
    );
  }

  const closed = preview.closed;
  const close = closed ? preview.close : null;
  if (closed && (!close || typeof close !== 'object' || Array.isArray(close))) {
    throw failure('The saved cash-close record is incomplete.', 'API_RESPONSE_INVALID');
  }

  const pendingApprovals = closed ? [] : preview.pendingApprovals;
  const unclassified = closed ? [] : preview.unclassified;
  const invalidVouchers = closed ? [] : preview.invalidVouchers;
  if (
    !Array.isArray(pendingApprovals) ||
    !Array.isArray(unclassified) ||
    !Array.isArray(invalidVouchers)
  ) {
    throw failure(
      'The Laravel cash-close preview is missing required exception details.',
      'API_RESPONSE_INVALID',
    );
  }

  const source = closed ? close : preview;
  const cashInTotal = rupeesToNumber(source.cashInTotal, 'cash received total');
  const cashOutTotal = rupeesToNumber(source.cashOutTotal, 'cash paid total');
  const expectedCash =
    source.expectedCash === null || source.expectedCash === undefined
      ? null
      : rupeesToNumber(source.expectedCash, 'expected drawer cash');
  const includedVouchers = closed ? close.includedVouchers : null;
  if (closed && !Array.isArray(includedVouchers)) {
    throw failure('The saved cash-close voucher snapshot is incomplete.', 'API_RESPONSE_INVALID');
  }

  const pendingApprovalCount = pendingApprovals.length;
  const unclassifiedCount = unclassified.length;
  const invalidVoucherCount = invalidVouchers.length;
  const openingCashRequired =
    !closed && preview.requiresManualOpening === true && preview.openingReady !== true;
  const status = closed
    ? 'CLOSED'
    : preview.blockedByLaterClose === true
      ? 'BLOCKED_BY_LATER_CLOSE'
      : pendingApprovalCount || unclassifiedCount || invalidVoucherCount
        ? 'BLOCKED'
        : openingCashRequired
          ? 'OPENING_CASH_REQUIRED'
          : preview.readyToClose === true
            ? 'READY_TO_CLOSE'
            : 'REVIEW_REQUIRED';

  return {
    date: preview.date,
    status,
    pendingApprovalCount,
    unclassifiedCount,
    invalidVoucherCount,
    openingCashRequired,
    blockedByLaterClose: !closed && preview.blockedByLaterClose === true,
    laterCloseDate: typeof preview.laterCloseDate === 'string' ? preview.laterCloseDate : '',
    readyToClose: !closed && preview.readyToClose === true,
    cashInTotal,
    cashOutTotal,
    noCashCount: closed
      ? includedVouchers.filter((voucher) => voucher?.cashImpact === 'NO_CASH').length
      : preview.noCashCount,
    activeVoucherCount: closed ? close.includedVoucherCount : preview.activeVoucherCount,
    expectedCash,
    countedCash: closed ? rupeesToNumber(close.countedCash, 'counted drawer cash') : null,
    variance: closed ? rupeesToNumber(close.variance, 'cash-close variance') : null,
  };
}

function mapAuditPage(page) {
  if (
    !page ||
    typeof page !== 'object' ||
    Array.isArray(page) ||
    !Array.isArray(page.items) ||
    typeof page.hasMore !== 'boolean' ||
    (page.nextCursor !== null && typeof page.nextCursor !== 'string') ||
    (page.hasMore && !page.nextCursor)
  ) {
    throw failure('The Laravel audit API returned an invalid page.', 'API_RESPONSE_INVALID');
  }

  const rows = page.items.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      ['id', 'actorEmail', 'eventType', 'targetType', 'targetId', 'occurredAtUtc', 'reason'].some(
        (field) => typeof item[field] !== 'string',
      ) ||
      (item.before !== null && typeof item.before !== 'object') ||
      (item.after !== null && typeof item.after !== 'object')
    ) {
      throw failure('The Laravel audit API returned an invalid event.', 'API_RESPONSE_INVALID');
    }
    return {
      id: item.id,
      time: item.occurredAtUtc,
      user: item.actorEmail,
      action: item.eventType,
      target: [item.targetType, item.targetId].filter(Boolean).join(' '),
      details: JSON.stringify({
        schemaVersion: 1,
        eventId: item.id,
        reason: item.reason,
        before: item.before,
        after: item.after,
      }),
    };
  });

  return {
    rows,
    totalCount: null,
    nextBeforeRow: page.nextCursor,
    auditHealth: null,
  };
}

function assertSameOriginBase(raw, origin) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw failure('Laravel API URL is not configured.', 'NOURL');
  }
  if (typeof origin !== 'string' || !origin.trim()) {
    throw failure('The current browser origin is unavailable.', 'ORIGIN_INVALID');
  }

  let base;
  let current;
  try {
    current = new URL(origin);
    base = new URL(raw, current);
  } catch {
    throw failure('Laravel API URL is invalid.', 'URL_INVALID');
  }

  const localHttp =
    current.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(current.hostname);
  if (
    base.origin !== current.origin ||
    (!['https:'].includes(current.protocol) && !localHttp) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw failure(
      'The Laravel cookie transport requires an HTTPS same-origin API URL. Cross-origin cookie access is not supported.',
      'ORIGIN_MISMATCH',
    );
  }

  const pathname = base.pathname.replace(/\/+$/, '');
  if (!pathname || pathname === '/') {
    throw failure('Laravel API URL must include its versioned API path.', 'URL_INVALID');
  }

  return { origin: current.origin, pathname };
}

/**
 * Cookie-session transport for the isolated Laravel shadow API.
 *
 * The cv_session cookie remains HttpOnly. The CSRF value is held in memory only
 * and refreshed from the authenticated current-session endpoint after a reload.
 * This adapter deliberately supports a limited read/auth surface; every unmapped
 * legacy action fails closed rather than falling back to Apps Script.
 */
export function createLaravelApi({ getUrl, getOrigin, fetchImpl } = {}) {
  const send = fetchImpl || globalThis.fetch;
  let csrfToken = '';
  let csrfRefresh = null;

  function base() {
    if (typeof getUrl !== 'function' || typeof getOrigin !== 'function') {
      throw failure('Laravel transport configuration is incomplete.', 'CONFIG_INVALID');
    }
    return assertSameOriginBase(getUrl(), getOrigin());
  }

  function makeUrl(route, query = {}) {
    const config = base();
    const url = new URL(config.pathname + route, config.origin);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  }

  async function request(route, options = {}) {
    if (typeof send !== 'function') {
      throw failure('Fetch is unavailable in this browser.', 'NOFETCH');
    }

    const method = options.method || 'GET';
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };
    let body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const url = makeUrl(route, options.query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 70000);
    let response;
    try {
      response = await send(url, {
        method,
        mode: 'same-origin',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers,
        body,
        signal: controller.signal,
      });
    } catch {
      throw failure(
        'No connection to the Laravel server. Check the same-origin API URL and try again.',
        'NET',
      );
    } finally {
      clearTimeout(timeout);
    }

    let envelope;
    try {
      envelope = await response.json();
    } catch {
      throw failure('Unexpected Laravel API response. Expected a JSON API envelope.', 'BAD');
    }

    const apiError = envelope?.error;
    if (
      !response.ok ||
      envelope?.ok !== true ||
      !envelope?.data ||
      typeof envelope.data !== 'object'
    ) {
      const code = normalizeCode(apiError?.code, response.status);
      throw failure(
        typeof apiError?.message === 'string' && apiError.message
          ? apiError.message
          : 'The Laravel API request failed.',
        code,
      );
    }

    return envelope.data;
  }

  async function requestImage(route) {
    if (typeof send !== 'function')
      throw failure('Fetch is unavailable in this browser.', 'NOFETCH');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 70000);
    let response;
    try {
      response = await send(makeUrl(route), {
        method: 'GET',
        mode: 'same-origin',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: { Accept: 'image/jpeg, image/png, image/webp' },
        signal: controller.signal,
      });
    } catch {
      throw failure(
        'No connection to the Laravel server. Check the same-origin API URL and try again.',
        'NET',
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      let message = 'The receipt could not be loaded. Retry the download.';
      let code = response.status === 401 ? 'SESSION' : 'RECEIPT_READ_FAILED';
      try {
        const envelope = await response.json();
        if (typeof envelope?.error?.message === 'string') message = envelope.error.message;
        if (typeof envelope?.error?.code === 'string')
          code = normalizeCode(envelope.error.code, response.status);
      } catch {}
      throw failure(message, code);
    }
    const mime = response.headers?.get?.('Content-Type')?.split(';')[0]?.trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
      throw failure(
        'The server returned an unsupported receipt image type.',
        'RECEIPT_MIME_INVALID',
      );
    }
    const declaredLength = response.headers?.get?.('Content-Length');
    if (declaredLength && (!/^\\d+$/.test(declaredLength) || Number(declaredLength) > 1600000)) {
      throw failure('The receipt image is larger than the allowed limit.', 'RECEIPT_SIZE_INVALID');
    }
    let bytes;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      throw failure(
        'The receipt image could not be read. Retry the download.',
        'RECEIPT_READ_FAILED',
      );
    }
    if (
      !bytes.length ||
      bytes.length > 1600000 ||
      (declaredLength && bytes.length !== Number(declaredLength))
    ) {
      throw failure(
        'The receipt image is incomplete or larger than the allowed limit.',
        'RECEIPT_SIZE_INVALID',
      );
    }
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(
        ...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)),
      );
    }
    return 'data:' + mime + ';base64,' + btoa(binary);
  }

  async function refreshCsrf() {
    if (csrfToken) return csrfToken;
    if (csrfRefresh) return csrfRefresh;

    csrfRefresh = (async () => {
      const current = await request('/sessions/current');
      const value = current?.csrfToken;
      if (typeof value !== 'string' || !CSRF_PATTERN.test(value)) {
        throw failure(
          'The active session did not provide a valid CSRF token. Sign in again.',
          'CSRF',
        );
      }
      csrfToken = value;
      return csrfToken;
    })();

    try {
      return await csrfRefresh;
    } finally {
      csrfRefresh = null;
    }
  }

  function createIdempotencyKey() {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
      throw failure(
        'Secure request identifiers are unavailable in this browser.',
        'CRYPTO_UNAVAILABLE',
      );
    }
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return 'vendor-' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function mutate(route, body = {}, options = {}) {
    const csrf = await refreshCsrf();
    return request(route, {
      method: options.method || 'POST',
      body,
      headers: {
        'X-CSRF-Token': csrf,
        ...(options.idempotency
          ? { 'Idempotency-Key': options.idempotencyKey || createIdempotencyKey() }
          : {}),
      },
    });
  }

  async function api(action, payload = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw failure('API payload must be an object.', 'PAYLOAD_INVALID');
    }

    switch (action) {
      case 'login': {
        const data = await request('/sessions', {
          method: 'POST',
          body: { email: payload.email, password: payload.password },
        });
        if (typeof data.csrfToken !== 'string' || !CSRF_PATTERN.test(data.csrfToken)) {
          throw failure('The login response did not provide a valid CSRF token.', 'CSRF');
        }
        csrfToken = data.csrfToken;
        return { token: SESSION_MARKER, user: data.user };
      }

      case 'bootstrap':
        return request('/bootstrap');

      case 'logout': {
        const result = await mutate('/sessions/current/logout');
        csrfToken = '';
        return result;
      }

      case 'changePassword': {
        const result = await mutate('/sessions/current/password', {
          oldPassword: payload.oldPassword,
          newPassword: payload.newPassword,
        });
        csrfToken = '';
        return result;
      }

      case 'dashboardSummary': {
        const summary = await request('/dashboard/summary', {
          query: { from: payload.from, to: payload.to },
        });
        return mapDashboardSummary(summary);
      }

      case 'dailyOperationsSummary': {
        const preview = await request('/cash-closes/preview');
        return mapDailyOperations(preview);
      }

      case 'listUsers': {
        const page = await request('/users');
        if (!page || !Array.isArray(page.items)) {
          throw failure(
            'The Laravel users API returned an invalid response.',
            'API_RESPONSE_INVALID',
          );
        }
        return page.items.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
        }));
      }

      case 'auditLog': {
        const page = await request('/audit-events', {
          query: {
            limit: payload.limit ?? 50,
            cursor: payload.beforeRow,
          },
        });
        return mapAuditPage(page);
      }

      case 'registerPage': {
        const unsupported = [
          ['q', payload.q],
          ['vendor', payload.vendor],
          ['cat', payload.cat],
          ['user', payload.user],
          ['approval', payload.approval && payload.approval !== 'ALL' ? payload.approval : ''],
          [
            'paymentMethod',
            payload.paymentMethod && payload.paymentMethod !== 'ALL' ? payload.paymentMethod : '',
          ],
          [
            'cashImpact',
            payload.cashImpact && payload.cashImpact !== 'ALL' ? payload.cashImpact : '',
          ],
          [
            'amountValidity',
            payload.amountValidity && payload.amountValidity !== 'ALL'
              ? payload.amountValidity
              : '',
          ],
        ].filter(([, value]) => value !== undefined && value !== null && value !== '');
        if (unsupported.length) {
          throw failure(
            'The selected register filters are not yet supported by the Laravel shadow API. Clear the unsupported filters to continue.',
            'API_ACTION_UNSUPPORTED',
          );
        }

        const page = await request('/vouchers', {
          query: {
            from: payload.from,
            to: payload.to,
            type: payload.t,
            status: payload.st || 'ACTIVE',
            offset: payload.offset ?? 0,
            limit: payload.limit ?? 100,
          },
        });
        const items = Array.isArray(page.items)
          ? page.items.map((item) => ({
              ...item,
              no: Number(item.voucherNo),
              amount:
                item.amount === null || item.amount === undefined
                  ? null
                  : rupeesToNumber(item.amount, 'voucher amount'),
              createdAt: '',
              updatedBy: '',
              updatedAt: '',
              receipts: Array.isArray(item.receipts) ? item.receipts : [],
              cancelReason: '',
              approvedBy: '',
              approvedAt: '',
              approvalReason: '',
            }))
          : [];
        return {
          ...page,
          items,
          totals: {},
          facets: { vendors: [], users: [] },
        };
      }

      case 'saveVendor': {
        const vendorId = typeof payload.id === 'string' ? payload.id.trim() : '';
        const body = {};
        for (const field of [
          'name',
          'company',
          'mobile',
          'defaultCategory',
          'defaultPaymentMethod',
        ]) {
          if (Object.prototype.hasOwnProperty.call(payload, field)) {
            body[field] = payload[field];
          }
        }
        const route = vendorId ? '/vendors/' + encodeURIComponent(vendorId) : '/vendors';
        const result = await mutate(route, body, {
          method: vendorId ? 'PATCH' : 'POST',
          idempotency: true,
        });
        return result.vendor;
      }

      case 'toggleVendor': {
        const vendorId = typeof payload.id === 'string' ? payload.id.trim() : '';
        if (!vendorId || typeof payload.active !== 'boolean') {
          throw failure('A vendor ID and desired active state are required.', 'PAYLOAD_INVALID');
        }
        const result = await mutate(
          '/vendors/' + encodeURIComponent(vendorId) + '/active',
          { active: payload.active },
          { idempotency: true },
        );
        return result.vendor;
      }

      case 'addReceipt': {
        const voucherId = typeof payload.id === 'string' ? payload.id.trim() : '';
        const receipt = payload.receipt;
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(voucherId) ||
          !receipt || typeof receipt !== 'object' ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(receipt.mime) ||
          typeof receipt.data !== 'string' || !receipt.data.length || receipt.data.length > 2200000
        ) {
          throw failure('Choose a valid JPG, PNG or WebP receipt image.', 'PAYLOAD_INVALID');
        }

        const idempotencyKey = typeof payload.idempotencyKey === 'string' &&
          /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(payload.idempotencyKey)
          ? payload.idempotencyKey : createIdempotencyKey();
        const result = await mutate(
          '/vouchers/' + encodeURIComponent(voucherId) + '/receipts',
          { receipt: { mime: receipt.mime, data: receipt.data } },
          { idempotencyKey },
        );
        if (
          !result?.receipt || typeof result.receipt.id !== 'string' ||
          result.receipt.voucherId !== voucherId || result.receipt.contentType !== receipt.mime ||
          !Number.isSafeInteger(result.receipt.byteSize) || result.receipt.byteSize < 1 ||
          result.receipt.byteSize > 1600000 || typeof result.receipt.sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(result.receipt.sha256) ||
          !Number.isSafeInteger(result.receiptCount) || result.receiptCount < 1 || result.receiptCount > 3
        ) {
          throw failure(
            'The receipt upload response was incomplete. Refresh the Register before retrying.',
            'API_RESPONSE_INVALID',
          );
        }
        const existing = Array.isArray(payload.existingReceiptIds)
          ? payload.existingReceiptIds.filter((id) => typeof id === 'string' && id.trim())
          : [];
        return {
          receipts: [...existing, result.receipt.id].filter((id, index, list) => list.indexOf(id) === index).slice(0, 3),
          receiptCount: result.receiptCount,
          receiptUpload: { id: result.receipt.id, sha256: result.receipt.sha256, byteSize: result.receipt.byteSize, replayed: result.replayed === true },
        };
      }

      case 'getReceipt': {
        const receiptId = typeof payload.fileId === 'string' ? payload.fileId.trim() : '';
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiptId)) {
          throw failure(
            'The receipt reference is invalid. Refresh the Register and retry.',
            'PAYLOAD_INVALID',
          );
        }
        return {
          dataUrl: await requestImage('/receipts/' + encodeURIComponent(receiptId)),
        };
      }

      default:
        throw failure(
          'This operation is not yet available in the Laravel shadow API. No fallback write was attempted.',
          'API_ACTION_UNSUPPORTED',
        );
    }
  }

  return Object.assign(api, {
    clearCsrfToken() {
      csrfToken = '';
      csrfRefresh = null;
    },
    getSessionMarker() {
      return SESSION_MARKER;
    },
  });
}
