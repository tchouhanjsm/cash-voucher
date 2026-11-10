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

function mapUserMutation(result, expectedId = '') {
  const user = result?.user;
  if (
    !user ||
    typeof user !== 'object' ||
    Array.isArray(user) ||
    typeof user.id !== 'string' ||
    !VOUCHER_ID_PATTERN.test(user.id) ||
    (expectedId && user.id !== expectedId) ||
    typeof user.name !== 'string' ||
    !user.name.trim() ||
    typeof user.email !== 'string' ||
    !user.email.trim() ||
    !['staff', 'manager', 'owner', 'accountant'].includes(user.role) ||
    typeof user.active !== 'boolean' ||
    typeof user.mustChangePassword !== 'boolean'
  ) {
    throw failure('The Laravel user API returned an invalid user record.', 'API_RESPONSE_INVALID');
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    createdAtUtc: typeof user.createdAtUtc === 'string' ? user.createdAtUtc : '',
    updatedAtUtc: typeof user.updatedAtUtc === 'string' ? user.updatedAtUtc : '',
    lastLoginAtUtc:
      typeof user.lastLoginAtUtc === 'string' || user.lastLoginAtUtc === null
        ? user.lastLoginAtUtc
        : null,
    replayed: result.replayed === true,
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

const VOUCHER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeVoucherId(payload) {
  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  if (!VOUCHER_ID_PATTERN.test(id)) {
    throw failure(
      'The voucher reference is invalid. Refresh the Register and retry.',
      'PAYLOAD_INVALID',
    );
  }
  return id;
}

function normalizeMutationReason(value, label) {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < 3 || reason.length > 200) {
    throw failure('Enter a ' + label + ' of 3 to 200 characters.', 'PAYLOAD_INVALID');
  }
  return reason;
}

function normalizeUpdateFields(value) {
  const allowed = new Set([
    'date',
    'vendor',
    'amount',
    'category',
    'notes',
    'paymentMethod',
    'cashImpact',
  ]);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length < 1 ||
    Object.keys(value).some((field) => !allowed.has(field))
  ) {
    throw failure('Choose at least one supported voucher field to update.', 'PAYLOAD_INVALID');
  }

  const fields = {};
  for (const [field, raw] of Object.entries(value)) {
    switch (field) {
      case 'date':
        if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          throw failure('The voucher date is invalid.', 'PAYLOAD_INVALID');
        }
        fields.date = raw;
        break;
      case 'vendor': {
        const vendor = typeof raw === 'string' ? raw.trim() : '';
        if (!vendor || vendor.length > 200) {
          throw failure('Enter a payee name of up to 200 characters.', 'PAYLOAD_INVALID');
        }
        fields.vendor = vendor;
        break;
      }
      case 'amount': {
        const amountText =
          typeof raw === 'number' || typeof raw === 'string' ? String(raw).trim() : '';
        const amountNumber = Number(amountText);
        const amountPaise = Math.round(amountNumber * 100);
        if (
          !/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/.test(amountText) ||
          !Number.isFinite(amountNumber) ||
          amountNumber <= 0 ||
          amountNumber > 10000000 ||
          Math.abs(amountNumber * 100 - amountPaise) > 0.000001 ||
          !Number.isSafeInteger(amountPaise)
        ) {
          throw failure(
            'Enter a valid positive amount with up to two decimal places.',
            'PAYLOAD_INVALID',
          );
        }
        fields.amount = (amountPaise / 100).toFixed(2);
        break;
      }
      case 'category':
        if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 80) {
          throw failure('Choose a valid category.', 'PAYLOAD_INVALID');
        }
        fields.category = raw.trim();
        break;
      case 'notes':
        if (typeof raw !== 'string' || raw.length > 500) {
          throw failure('The note must be 500 characters or fewer.', 'PAYLOAD_INVALID');
        }
        fields.notes = raw;
        break;
      case 'paymentMethod':
        if (!['CASH', 'UPI', 'BANK_TRANSFER'].includes(raw)) {
          throw failure('Choose a supported payment method.', 'PAYLOAD_INVALID');
        }
        fields.paymentMethod = raw;
        break;
      case 'cashImpact':
        if (!['CASH_IN', 'CASH_OUT', 'NO_CASH'].includes(raw)) {
          throw failure('Choose the physical cash movement.', 'PAYLOAD_INVALID');
        }
        fields.cashImpact = raw;
        break;
      default:
        throw failure('The voucher contains an unsupported field.', 'PAYLOAD_INVALID');
    }
  }
  return fields;
}

function createMutationIdempotencyKey(namespace) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw failure(
      'Secure voucher retry identifiers are unavailable in this browser.',
      'CRYPTO_UNAVAILABLE',
    );
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  return namespace + '-' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function resolveMutationIdempotencyKey(payload, action) {
  if (payload.idempotencyKey === undefined) {
    return createMutationIdempotencyKey('voucher-' + action);
  }
  if (
    typeof payload.idempotencyKey !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(payload.idempotencyKey)
  ) {
    throw failure('The voucher operation retry key is invalid.', 'PAYLOAD_INVALID');
  }
  return payload.idempotencyKey;
}

function mapVoucherMutation(result, expectedId) {
  const voucher = result?.voucher;
  const voucherNo = Number(voucher?.voucherNo);
  if (
    !voucher ||
    typeof voucher !== 'object' ||
    Array.isArray(voucher) ||
    voucher.id !== expectedId ||
    !Number.isSafeInteger(voucherNo) ||
    voucherNo < 1 ||
    typeof voucher.date !== 'string' ||
    typeof voucher.vendor !== 'string' ||
    !['PAYMENT', 'RECEIPT'].includes(voucher.type) ||
    !['ACTIVE', 'CANCELLED'].includes(voucher.status) ||
    !['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'REVIEW_REQUIRED'].includes(
      voucher.approvalStatus,
    )
  ) {
    throw failure(
      'The server may have applied this voucher change, but its confirmation was incomplete. Refresh the Register before retrying.',
      'API_RESPONSE_INVALID',
    );
  }

  return {
    ...voucher,
    no: voucherNo,
    voucherNo,
    amount: rupeesToNumber(voucher.amount, 'updated voucher amount'),
  };
}

function mapRegisterPage(page) {
  if (
    !page ||
    typeof page !== 'object' ||
    Array.isArray(page) ||
    !Array.isArray(page.items) ||
    !Number.isSafeInteger(page.offset) ||
    page.offset < 0 ||
    !Number.isSafeInteger(page.limit) ||
    page.limit < 1 ||
    page.limit > 200 ||
    !Number.isSafeInteger(page.totalCount) ||
    page.totalCount < 0 ||
    typeof page.hasMore !== 'boolean' ||
    !page.totals ||
    typeof page.totals !== 'object' ||
    Array.isArray(page.totals) ||
    !page.facets ||
    typeof page.facets !== 'object' ||
    Array.isArray(page.facets) ||
    !Array.isArray(page.facets.vendors) ||
    !Array.isArray(page.facets.users)
  ) {
    throw failure(
      'The Laravel Register response is incomplete or invalid.',
      'API_RESPONSE_INVALID',
    );
  }

  const counters = [
    'approvalExceptionCount',
    'invalidAmountCount',
    'malformedRecordCount',
    'malformedFieldCount',
  ];
  const totals = {
    paid: rupeesToNumber(page.totals.paid, 'Register paid total'),
    received: rupeesToNumber(page.totals.received, 'Register received total'),
  };
  for (const field of counters) {
    if (!Number.isSafeInteger(page.totals[field]) || page.totals[field] < 0) {
      throw failure(
        'The Laravel Register totals are incomplete or invalid.',
        'API_RESPONSE_INVALID',
      );
    }
    totals[field] = page.totals[field];
  }

  const items = page.items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw failure(
        'The Laravel Register contains an invalid voucher row.',
        'API_RESPONSE_INVALID',
      );
    }
    const voucherNo = Number(item.voucherNo);
    if (
      !Number.isSafeInteger(voucherNo) ||
      voucherNo < 1 ||
      typeof item.id !== 'string' ||
      !item.id
    ) {
      throw failure(
        'The Laravel Register contains an invalid voucher reference.',
        'API_RESPONSE_INVALID',
      );
    }

    return {
      ...item,
      no: voucherNo,
      voucherNo,
      amount:
        item.amount === null || item.amount === undefined
          ? null
          : rupeesToNumber(item.amount, 'voucher amount'),
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      updatedBy: typeof item.updatedBy === 'string' ? item.updatedBy : '',
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
      receipts: Array.isArray(item.receipts) ? item.receipts : [],
      cancelReason: typeof item.cancelReason === 'string' ? item.cancelReason : '',
      approvedBy: typeof item.approvedBy === 'string' ? item.approvedBy : '',
      approvedAt: typeof item.approvedAt === 'string' ? item.approvedAt : '',
      approvalReason: typeof item.approvalReason === 'string' ? item.approvalReason : '',
    };
  });

  const facets = {};
  for (const field of ['vendors', 'users']) {
    if (
      page.facets[field].some((value) => typeof value !== 'string') ||
      new Set(page.facets[field]).size !== page.facets[field].length
    ) {
      throw failure('The Laravel Register filter options are invalid.', 'API_RESPONSE_INVALID');
    }
    facets[field] = page.facets[field];
  }

  return {
    ...page,
    items,
    totals,
    facets,
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
    if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 1600000)) {
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

  function createIdempotencyKey(namespace = 'vendor') {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
      throw failure(
        'Secure request identifiers are unavailable in this browser.',
        'CRYPTO_UNAVAILABLE',
      );
    }
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return (
      namespace + '-' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    );
  }

  async function stableIdempotencyKey(namespace, identity) {
    const cryptoApi = globalThis.crypto;
    if (
      !cryptoApi?.subtle ||
      typeof cryptoApi.subtle.digest !== 'function' ||
      typeof TextEncoder !== 'function'
    ) {
      throw failure(
        'Secure retry identifiers are unavailable in this browser. Update the browser before saving.',
        'CRYPTO_UNAVAILABLE',
      );
    }

    let digest;
    try {
      digest = await cryptoApi.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(namespace + ':' + identity),
      );
    } catch {
      throw failure('A secure retry identifier could not be prepared.', 'CRYPTO_UNAVAILABLE');
    }

    const hex = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    return namespace + '-' + hex;
  }

  function normalizeCreateEntry(entry, index) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw failure('Entry ' + (index + 1) + ' contains invalid details.', 'PAYLOAD_INVALID');
    }

    const clientId = typeof entry.clientId === 'string' ? entry.clientId.trim() : '';
    const date = typeof entry.date === 'string' ? entry.date : '';
    const vendor = typeof entry.vendor === 'string' ? entry.vendor.trim() : '';
    const type = entry.type || 'PAYMENT';
    const cashImpact = entry.cashImpact || '';
    const paymentMethod = entry.paymentMethod ?? '';
    const category =
      entry.category === undefined || entry.category === '' ? 'Other' : entry.category;
    const notes = entry.notes === undefined || entry.notes === null ? '' : entry.notes;
    const vendorId =
      entry.vendorId === undefined || entry.vendorId === null || entry.vendorId === ''
        ? null
        : entry.vendorId;
    const amountNumber =
      typeof entry.amount === 'number' || typeof entry.amount === 'string'
        ? Number(entry.amount)
        : NaN;
    const amountPaise = Math.round(amountNumber * 100);
    const receipts = entry.receipts === undefined || entry.receipts === null ? [] : entry.receipts;

    if (
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(clientId) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !vendor ||
      vendor.length > 200 ||
      !Number.isFinite(amountNumber) ||
      amountNumber <= 0 ||
      Math.abs(amountNumber * 100 - amountPaise) > 0.000001 ||
      !Number.isSafeInteger(amountPaise) ||
      amountPaise > 1000000000 ||
      !['PAYMENT', 'RECEIPT'].includes(type) ||
      !['CASH_IN', 'CASH_OUT', 'NO_CASH'].includes(cashImpact) ||
      !['', 'CASH', 'UPI', 'BANK_TRANSFER'].includes(paymentMethod) ||
      typeof category !== 'string' ||
      category.trim().length > 80 ||
      typeof notes !== 'string' ||
      notes.length > 500 ||
      (vendorId !== null &&
        (typeof vendorId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            vendorId,
          ))) ||
      !Array.isArray(receipts) ||
      receipts.length > 3 ||
      receipts.some(
        (receipt) =>
          !receipt ||
          typeof receipt !== 'object' ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(receipt.mime) ||
          typeof receipt.data !== 'string' ||
          !receipt.data.length ||
          receipt.data.length > 2200000,
      ) ||
      (entry.duplicateConfirmationToken !== undefined &&
        (typeof entry.duplicateConfirmationToken !== 'string' ||
          entry.duplicateConfirmationToken.length > 2048))
    ) {
      throw failure(
        'Entry ' +
          (index + 1) +
          ' is incomplete or invalid. Check its date, payee, amount and receipt images.',
        'PAYLOAD_INVALID',
      );
    }

    return {
      clientId,
      date,
      type,
      vendor,
      vendorId,
      amount: (amountPaise / 100).toFixed(2),
      category: category.trim() || 'Other',
      notes,
      cashImpact,
      paymentMethod,
      duplicateConfirmationToken: entry.duplicateConfirmationToken || '',
      receipts,
    };
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

      case 'saveUser': {
        const suppliedId = payload.id !== undefined && payload.id !== null;
        const userId = suppliedId && typeof payload.id === 'string' ? payload.id.trim() : '';
        if (suppliedId && !VOUCHER_ID_PATTERN.test(userId)) {
          throw failure('The user reference is invalid. Refresh the Users list and retry.', 'PAYLOAD_INVALID');
        }

        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
        const role = payload.role;
        if (
          !name ||
          name.length > 80 ||
          !email ||
          email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          !['staff', 'manager', 'owner', 'accountant'].includes(role)
        ) {
          throw failure('Enter a valid user name, email address and role.', 'PAYLOAD_INVALID');
        }

        const body = { name, email, role };
        const route = userId ? '/users/' + encodeURIComponent(userId) : '/users';
        const method = userId ? 'PATCH' : 'POST';
        if (userId) {
          if (typeof payload.active !== 'boolean') {
            throw failure('Choose whether this user account is active.', 'PAYLOAD_INVALID');
          }
          body.active = payload.active;
        } else {
          const temporaryPassword =
            typeof payload.temporaryPassword === 'string'
              ? payload.temporaryPassword
              : payload.password;
          if (
            typeof temporaryPassword !== 'string' ||
            temporaryPassword.length < 8 ||
            temporaryPassword.length > 128
          ) {
            throw failure('Temporary password must be between 8 and 128 characters.', 'PAYLOAD_INVALID');
          }
          body.temporaryPassword = temporaryPassword;
        }

        const idempotencyKey =
          payload.idempotencyKey === undefined
            ? await stableIdempotencyKey('user-save', JSON.stringify({ userId, ...body }))
            : payload.idempotencyKey;
        if (
          typeof idempotencyKey !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(idempotencyKey)
        ) {
          throw failure('The user operation retry key is invalid.', 'PAYLOAD_INVALID');
        }

        const result = await mutate(route, body, {
          method,
          idempotency: true,
          idempotencyKey,
        });
        return mapUserMutation(result, userId);
      }

      case 'resetPassword': {
        const userId = typeof payload.id === 'string' ? payload.id.trim() : '';
        const temporaryPassword =
          typeof payload.temporaryPassword === 'string'
            ? payload.temporaryPassword
            : payload.password;
        if (!VOUCHER_ID_PATTERN.test(userId)) {
          throw failure('The user reference is invalid. Refresh the Users list and retry.', 'PAYLOAD_INVALID');
        }
        if (
          typeof temporaryPassword !== 'string' ||
          temporaryPassword.length < 8 ||
          temporaryPassword.length > 128
        ) {
          throw failure('Temporary password must be between 8 and 128 characters.', 'PAYLOAD_INVALID');
        }

        const idempotencyKey =
          payload.idempotencyKey === undefined
            ? await stableIdempotencyKey('user-reset', userId + ':' + temporaryPassword)
            : payload.idempotencyKey;
        if (
          typeof idempotencyKey !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(idempotencyKey)
        ) {
          throw failure('The password reset retry key is invalid.', 'PAYLOAD_INVALID');
        }

        const result = await mutate(
          '/users/' + encodeURIComponent(userId) + '/password-reset',
          { temporaryPassword },
          { idempotency: true, idempotencyKey },
        );
        return mapUserMutation(result, userId);
      }

      case 'saveSettings': {
        const propertyName = typeof payload.propertyName === 'string' ? payload.propertyName.trim() : '';
        const propertyAddress =
          typeof payload.propertyAddress === 'string' ? payload.propertyAddress.trim() : '';
        const normalizeCategories = (value, label) => {
          if (!Array.isArray(value) || value.length > 60) {
            throw failure(label + ' must contain 1 to 60 values.', 'PAYLOAD_INVALID');
          }
          const normalized = [];
          for (const item of value) {
            if (typeof item !== 'string') {
              throw failure(label + ' must contain text values.', 'PAYLOAD_INVALID');
            }
            const name = item.trim();
            if (!name) continue;
            if (name.length > 40) {
              throw failure(label + ' entries must be 40 characters or fewer.', 'PAYLOAD_INVALID');
            }
            if (!normalized.includes(name)) normalized.push(name);
          }
          if (!normalized.length) {
            throw failure(label + ' must contain at least one value.', 'PAYLOAD_INVALID');
          }
          return normalized;
        };
        const normalizeSequence = (value, label) => {
          if (value === null || value === undefined || value === '') return null;
          const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
          if (!/^[1-9][0-9]{0,8}$/.test(text)) {
            throw failure('Enter a valid ' + label + '.', 'PAYLOAD_INVALID');
          }
          return text;
        };
        const openingBalance =
          typeof payload.openingBalance === 'string' ? payload.openingBalance.trim() : '';
        if (
          !propertyName ||
          propertyName.length > 120 ||
          propertyAddress.length > 300 ||
          typeof payload.propertyAddress !== 'string' ||
          !/^-?(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/.test(openingBalance)
        ) {
          throw failure('Enter valid property settings and an opening balance in INR.', 'PAYLOAD_INVALID');
        }

        const body = {
          propertyName,
          propertyAddress,
          categories: normalizeCategories(payload.categories, 'Categories'),
          receiptCategories: normalizeCategories(payload.receiptCategories, 'Cash-received categories'),
          nextVoucherNo: normalizeSequence(payload.nextVoucherNo, 'next payment voucher number'),
          nextReceiptNo: normalizeSequence(payload.nextReceiptNo, 'next cash-received number'),
          openingBalance,
        };
        const idempotencyKey =
          payload.idempotencyKey === undefined
            ? await stableIdempotencyKey('settings-save', JSON.stringify(body))
            : payload.idempotencyKey;
        if (
          typeof idempotencyKey !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(idempotencyKey)
        ) {
          throw failure('The settings operation retry key is invalid.', 'PAYLOAD_INVALID');
        }

        const result = await mutate('/settings', body, {
          method: 'PUT',
          idempotency: true,
          idempotencyKey,
        });
        if (
          !result?.settings ||
          typeof result.settings !== 'object' ||
          Array.isArray(result.settings) ||
          typeof result.settings.propertyName !== 'string' ||
          !Array.isArray(result.settings.categories) ||
          !Array.isArray(result.settings.receiptCategories)
        ) {
          throw failure('The Laravel settings API returned an invalid response.', 'API_RESPONSE_INVALID');
        }
        return result.settings;
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

      case 'createVouchers': {
        if (payload.bulk) {
          throw failure(
            'Bulk import is not yet supported by the Laravel shadow API. No entries were submitted.',
            'API_ACTION_UNSUPPORTED',
          );
        }
        if (
          !Array.isArray(payload.entries) ||
          payload.entries.length < 1 ||
          payload.entries.length > 25
        ) {
          throw failure('Save between 1 and 25 entries at a time.', 'PAYLOAD_INVALID');
        }

        const entries = payload.entries.map(normalizeCreateEntry);
        const clientIds = new Set();
        for (const entry of entries) {
          if (clientIds.has(entry.clientId)) {
            throw failure('Each entry must have a different transaction ID.', 'PAYLOAD_INVALID');
          }
          clientIds.add(entry.clientId);
        }

        // Prepare every retry identity before the first write. The same client ID and
        // receipt bytes therefore produce the same keys after a timeout or app restart.
        const prepared = [];
        for (const entry of entries) {
          const voucherKey = await stableIdempotencyKey('voucher', 'create:' + entry.clientId);
          const receiptKeys = [];
          for (let index = 0; index < entry.receipts.length; index += 1) {
            const receipt = entry.receipts[index];
            receiptKeys.push(
              await stableIdempotencyKey(
                'receipt',
                'attach:' + entry.clientId + ':' + index + ':' + receipt.mime + ':' + receipt.data,
              ),
            );
          }
          prepared.push({ entry, voucherKey, receiptKeys });
        }

        const created = [];
        let skipped = 0;
        try {
          // Keep the legacy New Entry batch order. Each voucher is its own idempotent,
          // audited transaction so approval totals and voucher numbering see prior rows.
          for (const operation of prepared) {
            const { entry, voucherKey, receiptKeys } = operation;
            const result = await mutate(
              '/vouchers',
              {
                date: entry.date,
                vendor: entry.vendor,
                vendorId: entry.vendorId,
                amount: entry.amount,
                category: entry.category,
                notes: entry.notes,
                type: entry.type,
                cashImpact: entry.cashImpact,
                paymentMethod: entry.paymentMethod,
                clientId: entry.clientId,
                duplicateConfirmationToken: entry.duplicateConfirmationToken,
              },
              { idempotency: true, idempotencyKey: voucherKey },
            );

            const voucher = result?.voucher;
            const voucherNo = Number(voucher?.voucherNo);
            const voucherId = typeof voucher?.id === 'string' ? voucher.id : '';
            if (
              !voucher ||
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                voucherId,
              ) ||
              !Number.isSafeInteger(voucherNo) ||
              voucherNo < 1 ||
              voucher.date !== entry.date ||
              voucher.type !== entry.type ||
              typeof voucher.vendor !== 'string' ||
              !['PENDING', 'NOT_REQUIRED'].includes(voucher.approvalStatus)
            ) {
              throw failure(
                'The server may have saved this entry, but its confirmation was incomplete. Retry using the same entry; do not enter it again.',
                'BAD',
              );
            }

            const mapped = {
              ...voucher,
              no: voucherNo,
              voucherNo,
              amount: rupeesToNumber(voucher.amount, 'created voucher amount'),
              receipts: [],
            };
            if (result.replayed === true) skipped += 1;

            for (let index = 0; index < entry.receipts.length; index += 1) {
              try {
                const attachment = await api('addReceipt', {
                  id: voucherId,
                  receipt: entry.receipts[index],
                  idempotencyKey: receiptKeys[index],
                  existingReceiptIds: mapped.receipts,
                });
                mapped.receipts = attachment.receipts;
              } catch (error) {
                const pending = failure(
                  'Voucher #' +
                    voucherNo +
                    ' was saved, but receipt ' +
                    (index + 1) +
                    ' of ' +
                    entry.receipts.length +
                    ' could not be confirmed. The entry and receipt will be kept for safe retry. Do not enter this transaction again.',
                  'RECEIPT_SYNC_PENDING',
                );
                pending.voucherId = voucherId;
                pending.voucherNo = voucherNo;
                pending.cause = error;
                throw pending;
              }
            }

            created.push(mapped);
          }
        } catch (error) {
          if (['DUPLICATE_CONFIRMATION_REQUIRED', 'RECEIPT_SYNC_PENDING'].includes(error?.code)) {
            throw error;
          }
          if (['NET', 'BAD'].includes(error?.code)) {
            if (created.length) {
              error.message =
                'The connection was interrupted after ' +
                created.length +
                ' of ' +
                entries.length +
                ' entries were confirmed. Keep the entries and retry; the same transaction IDs will safely replay already-saved vouchers.';
            }
            throw error;
          }
          if (created.length) {
            const partial = failure(
              'The batch stopped after ' +
                created.length +
                ' of ' +
                entries.length +
                ' entries were saved. ' +
                created.map((voucher) => '#' + voucher.voucherNo).join(', ') +
                ' are already recorded. The remaining entries have not been confirmed. Keep this batch and retry; the saved rows will replay safely.',
              'BATCH_PARTIAL_FAILURE',
            );
            partial.partialCreated = created.map((voucher) => ({
              id: voucher.id,
              voucherNo: voucher.voucherNo,
            }));
            partial.cause = error;
            throw partial;
          }
          throw error;
        }

        return { created, skipped };
      }

      case 'registerPage': {
        const page = await request('/vouchers', {
          query: {
            q: payload.q,
            vendor: payload.vendor,
            cat: payload.cat,
            user: payload.user,
            from: payload.from,
            to: payload.to,
            type: payload.t,
            status: payload.st || 'ACTIVE',
            approval: payload.approval,
            paymentMethod: payload.paymentMethod,
            cashImpact: payload.cashImpact,
            amountValidity: payload.amountValidity,
            offset: payload.offset ?? 0,
            limit: payload.limit ?? 100,
          },
        });
        return mapRegisterPage(page);
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

      case 'updateVoucher': {
        const id = normalizeVoucherId(payload);
        const reason = normalizeMutationReason(payload.reason, 'correction reason');
        const fields = normalizeUpdateFields(payload.fields);
        const idempotencyKey = resolveMutationIdempotencyKey(payload, 'edit');
        const result = await mutate(
          '/vouchers/' + encodeURIComponent(id),
          { fields, reason },
          { method: 'PATCH', idempotency: true, idempotencyKey },
        );
        return mapVoucherMutation(result, id);
      }

      case 'cancelVoucher': {
        const id = normalizeVoucherId(payload);
        const reason = normalizeMutationReason(payload.reason, 'cancellation reason');
        const idempotencyKey = resolveMutationIdempotencyKey(payload, 'cancel');
        const result = await mutate(
          '/vouchers/' + encodeURIComponent(id) + '/cancel',
          { reason },
          { idempotency: true, idempotencyKey },
        );
        return mapVoucherMutation(result, id);
      }

      case 'approveVoucher': {
        const id = normalizeVoucherId(payload);
        const idempotencyKey = resolveMutationIdempotencyKey(payload, 'approve');
        const result = await mutate(
          '/vouchers/' + encodeURIComponent(id) + '/approval',
          {},
          { idempotency: true, idempotencyKey },
        );
        return mapVoucherMutation(result, id);
      }

      case 'rejectVoucher': {
        const id = normalizeVoucherId(payload);
        const reason = normalizeMutationReason(payload.reason, 'rejection reason');
        const idempotencyKey = resolveMutationIdempotencyKey(payload, 'reject');
        const result = await mutate(
          '/vouchers/' + encodeURIComponent(id) + '/rejection',
          { reason },
          { idempotency: true, idempotencyKey },
        );
        return mapVoucherMutation(result, id);
      }

      case 'addReceipt': {
        const voucherId = typeof payload.id === 'string' ? payload.id.trim() : '';
        const receipt = payload.receipt;
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            voucherId,
          ) ||
          !receipt ||
          typeof receipt !== 'object' ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(receipt.mime) ||
          typeof receipt.data !== 'string' ||
          !receipt.data.length ||
          receipt.data.length > 2200000
        ) {
          throw failure('Choose a valid JPG, PNG or WebP receipt image.', 'PAYLOAD_INVALID');
        }

        const idempotencyKey =
          typeof payload.idempotencyKey === 'string' &&
          /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(payload.idempotencyKey)
            ? payload.idempotencyKey
            : createIdempotencyKey();
        const result = await mutate(
          '/vouchers/' + encodeURIComponent(voucherId) + '/receipts',
          { receipt: { mime: receipt.mime, data: receipt.data } },
          { idempotency: true, idempotencyKey },
        );
        if (
          !result?.receipt ||
          typeof result.receipt.id !== 'string' ||
          result.receipt.voucherId !== voucherId ||
          result.receipt.contentType !== receipt.mime ||
          !Number.isSafeInteger(result.receipt.byteSize) ||
          result.receipt.byteSize < 1 ||
          result.receipt.byteSize > 1600000 ||
          typeof result.receipt.sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(result.receipt.sha256) ||
          !Number.isSafeInteger(result.receiptCount) ||
          result.receiptCount < 1 ||
          result.receiptCount > 3
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
          receipts: [...existing, result.receipt.id]
            .filter((id, index, list) => list.indexOf(id) === index)
            .slice(0, 3),
          receiptCount: result.receiptCount,
          receiptUpload: {
            id: result.receipt.id,
            sha256: result.receipt.sha256,
            byteSize: result.receipt.byteSize,
            replayed: result.replayed === true,
          },
        };
      }

      case 'getReceipt': {
        const receiptId = typeof payload.fileId === 'string' ? payload.fileId.trim() : '';
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            receiptId,
          )
        ) {
          throw failure(
            'The receipt reference is invalid. Refresh the Register and retry.',
            'PAYLOAD_INVALID',
          );
        }
        return {
          dataUrl: await requestImage('/receipts/' + encodeURIComponent(receiptId)),
        };
      }

      case 'checkPaymentDuplicates': {
        const entries = payload.entries;
        if (!Array.isArray(entries) || entries.length < 1 || entries.length > 100) {
          throw failure(
            'Check between 1 and 100 entries for possible duplicates.',
            'PAYLOAD_INVALID',
          );
        }

        const results = [];
        for (let index = 0; index < entries.length; index += 1) {
          const entry = entries[index];
          const date = typeof entry?.date === 'string' ? entry.date : '';
          const vendor = typeof entry?.vendor === 'string' ? entry.vendor.trim() : '';
          const amount = typeof entry?.amount === 'string' ? entry.amount.trim() : '';
          const type = entry?.type || 'PAYMENT';
          const cashImpact = entry?.cashImpact || '';
          const paymentMethod = entry?.paymentMethod || '';
          const category = entry?.category || 'Other';
          const notes = typeof entry?.notes === 'string' ? entry.notes : '';
          const clientId = typeof entry?.clientId === 'string' ? entry.clientId : '';
          const vendorId = entry?.vendorId ?? null;

          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !vendor ||
            vendor.length > 200 ||
            !/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/.test(amount) ||
            !['PAYMENT', 'RECEIPT'].includes(type) ||
            !['CASH_IN', 'CASH_OUT', 'NO_CASH'].includes(cashImpact) ||
            !['', 'CASH', 'UPI', 'BANK_TRANSFER'].includes(paymentMethod) ||
            typeof category !== 'string' ||
            category.length > 80 ||
            notes.length > 500 ||
            !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(clientId) ||
            (vendorId !== null &&
              vendorId !== '' &&
              (typeof vendorId !== 'string' ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                  vendorId,
                )))
          ) {
            throw failure(
              'An entry is incomplete or invalid. Check its date, payee and amount.',
              'PAYLOAD_INVALID',
            );
          }

          const checked = await mutate('/vouchers/duplicate-check', {
            date,
            vendor,
            vendorId,
            amount,
            category,
            notes,
            type,
            cashImpact,
            paymentMethod,
            clientId,
          });
          if (
            !checked ||
            !Array.isArray(checked.matches) ||
            !Number.isSafeInteger(checked.duplicateCount) ||
            checked.duplicateCount < 0 ||
            !Number.isSafeInteger(checked.hiddenCount) ||
            checked.hiddenCount < 0 ||
            checked.hiddenCount > checked.duplicateCount ||
            typeof checked.confirmationToken !== 'string'
          ) {
            throw failure(
              'The duplicate-check API returned an invalid response.',
              'API_RESPONSE_INVALID',
            );
          }

          results.push({
            index,
            clientId,
            matches: checked.matches,
            duplicateCount: checked.duplicateCount,
            hiddenCount: checked.hiddenCount,
            confirmationToken: checked.confirmationToken,
          });
        }

        return { results };
      }

      case 'entrySuggestions': {
        const vendor = typeof payload.vendor === 'string' ? payload.vendor.trim() : '';
        const type = payload.type || 'PAYMENT';
        if (!vendor || vendor.length > 120 || !['PAYMENT', 'RECEIPT'].includes(type)) {
          throw failure('Enter a valid payee before requesting suggestions.', 'PAYLOAD_INVALID');
        }
        const result = await request('/entry-suggestions', {
          query: { vendor, type },
        });
        const isSuggestion = (value) =>
          value === null ||
          (value &&
            typeof value === 'object' &&
            typeof value.value === 'string' &&
            value.value.length > 0 &&
            ['VENDOR_DEFAULT', 'HISTORY'].includes(value.source) &&
            Number.isSafeInteger(value.evidenceCount) &&
            value.evidenceCount >= 0);
        if (
          !result ||
          typeof result.vendor !== 'string' ||
          !['OWN', 'PROPERTY'].includes(result.scope) ||
          !result.suggestions ||
          !isSuggestion(result.suggestions.category) ||
          !isSuggestion(result.suggestions.paymentMethod)
        ) {
          throw failure('Entry suggestions returned an invalid response.', 'API_RESPONSE_INVALID');
        }
        return result;
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
