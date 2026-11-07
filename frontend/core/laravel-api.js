const SESSION_MARKER = 'laravel-cookie-session';
const CSRF_PATTERN = /^[a-f0-9]{64}$/D;

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

function appendQuery(path, values) {
  const query = new URLSearchParams();
  Object.entries(values || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString();
  return suffix ? path + '?' + suffix : path;
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 70000);
    let response;
    try {
      response = await send(makeUrl(route, options.query), {
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
    if (!response.ok || envelope?.ok !== true || !envelope?.data || typeof envelope.data !== 'object') {
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

  async function mutate(route, body = {}) {
    const csrf = await refreshCsrf();
    return request(route, {
      method: 'POST',
      body,
      headers: { 'X-CSRF-Token': csrf },
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

      case 'dashboardSummary':
        return request('/dashboard/summary', {
          query: { from: payload.from, to: payload.to },
        });

      case 'registerPage': {
        const unsupported = [
          ['q', payload.q],
          ['vendor', payload.vendor],
          ['cat', payload.cat],
          ['user', payload.user],
          ['approval', payload.approval && payload.approval !== 'ALL' ? payload.approval : ''],
          ['paymentMethod', payload.paymentMethod && payload.paymentMethod !== 'ALL' ? payload.paymentMethod : ''],
          ['cashImpact', payload.cashImpact && payload.cashImpact !== 'ALL' ? payload.cashImpact : ''],
          ['amountValidity', payload.amountValidity && payload.amountValidity !== 'ALL' ? payload.amountValidity : ''],
        ].filter(([, value]) => value !== undefined && value !== null && value !== '');
        if (unsupported.length) {
          throw failure(
            'The Laravel shadow register does not yet support all selected filters. Clear the unsupported filters or continue using the active Apps Script transport.',
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
              createdAt: '',
              updatedBy: '',
              updatedAt: '',
              receipts: [],
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

      default:
        throw failure(
          'This operation is not yet compatible with the Laravel shadow API. The active Apps Script transport has not been changed.',
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
