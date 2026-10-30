export const SESSION_ENDPOINT_STORAGE_KEY = 'cv.tokenEndpoint';

const TOKEN_STORAGE_KEY = 'cv.token';

function normalizeApiEndpoint(value) {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
      return '';
    }
    return url.href;
  } catch {
    return '';
  }
}

/**
 * Resolve the active API endpoint and only restore a persisted token when it
 * was issued for that same endpoint. Unbound legacy tokens fail closed.
 */
export function resolveApiSession({
  configuredEndpoint,
  storedEndpoint,
  token,
  tokenEndpoint,
} = {}) {
  const configured = typeof configuredEndpoint === 'string' ? configuredEndpoint.trim() : '';
  const stored = typeof storedEndpoint === 'string' ? storedEndpoint.trim() : '';
  const endpoint = configured || stored;
  const normalizedEndpoint = normalizeApiEndpoint(endpoint);
  const normalizedTokenEndpoint = normalizeApiEndpoint(tokenEndpoint);
  const hasToken = typeof token === 'string' && token.length > 0;
  const autoResume =
    hasToken && Boolean(normalizedEndpoint) && normalizedEndpoint === normalizedTokenEndpoint;

  return {
    endpoint,
    token: autoResume ? token : '',
    autoResume,
    clearPersistedToken: Boolean(hasToken || tokenEndpoint) && !autoResume,
  };
}

/**
 * Replace the saved session atomically from the point of view of boot logic:
 * remove the old token first, then write its endpoint binding, then the token.
 */
export function persistApiSessionToken({ token, endpoint, storage } = {}) {
  const normalizedEndpoint = normalizeApiEndpoint(endpoint);
  if (
    typeof token !== 'string' ||
    !token ||
    !normalizedEndpoint ||
    !storage ||
    typeof storage.set !== 'function' ||
    typeof storage.del !== 'function'
  ) {
    return false;
  }

  clearPersistedApiSessionToken(storage);

  try {
    if (storage.set(SESSION_ENDPOINT_STORAGE_KEY, normalizedEndpoint) !== true) {
      clearPersistedApiSessionToken(storage);
      return false;
    }
    if (storage.set(TOKEN_STORAGE_KEY, token) !== true) {
      clearPersistedApiSessionToken(storage);
      return false;
    }
    return true;
  } catch {
    clearPersistedApiSessionToken(storage);
    return false;
  }
}

export function clearPersistedApiSessionToken(storage) {
  if (!storage || typeof storage.del !== 'function') return;
  try {
    storage.del(TOKEN_STORAGE_KEY);
  } catch {}
  try {
    storage.del(SESSION_ENDPOINT_STORAGE_KEY);
  } catch {}
}
