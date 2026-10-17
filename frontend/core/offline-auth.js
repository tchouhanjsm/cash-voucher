export const OFFLINE_AUTH_KEY = 'cv.offlineAuth';
export const OFFLINE_AUTH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const FORMAT = 'cash-voucher.offline-auth';
const VERSION = 1;
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const VERIFIER_BYTES = 32;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeEndpoint(value) {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value.trim());
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function encodeBase64(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64(value, expectedLength) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;

  try {
    const binary = atob(value);
    if (binary.length !== expectedLength) return null;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function deriveVerifier(password, salt, email, endpoint, createdAt, expiresAt) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error('Secure offline verification is unavailable.');

  // Bind the verifier to this account, endpoint, and validity window.
  // Editing those metadata fields in local storage invalidates the verifier.
  const material = [
    'cash-voucher-offline-v1',
    password,
    email,
    endpoint,
    String(createdAt),
    String(expiresAt),
  ].join(String.fromCharCode(0));
  const key = await cryptoApi.subtle.importKey(
    'raw',
    new TextEncoder().encode(material),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await cryptoApi.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    VERIFIER_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function equalBytes(left, right) {
  if (
    !(left instanceof Uint8Array) ||
    !(right instanceof Uint8Array) ||
    left.length !== right.length
  ) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function saveOfflineCredential({ email, endpoint, password, storage, now = Date.now() }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  if (
    !normalizedEmail ||
    !normalizedEndpoint ||
    typeof password !== 'string' ||
    (password.length < 8 || password.length > 128) ||
    !storage ||
    typeof storage.set !== 'function' ||
    !Number.isFinite(now)
  ) {
    return false;
  }

  try {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== 'function') return false;

    const salt = cryptoApi.getRandomValues(new Uint8Array(SALT_BYTES));
    const expiresAt = now + OFFLINE_AUTH_TTL_MS;
    const verifier = await deriveVerifier(
      password,
      salt,
      normalizedEmail,
      normalizedEndpoint,
      now,
      expiresAt,
    );
    const record = {
      format: FORMAT,
      version: VERSION,
      email: normalizedEmail,
      endpoint: normalizedEndpoint,
      salt: encodeBase64(salt),
      verifier: encodeBase64(verifier),
      createdAt: now,
      expiresAt,
    };

    return storage.set(OFFLINE_AUTH_KEY, JSON.stringify(record)) === true;
  } catch {
    return false;
  }
}

export async function verifyOfflineCredential({ email, endpoint, password, storage, now = Date.now() }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  if (
    !normalizedEmail ||
    !normalizedEndpoint ||
    typeof password !== 'string' ||
    (password.length < 8 || password.length > 128) ||
    !storage ||
    typeof storage.get !== 'function' ||
    !Number.isFinite(now)
  ) {
    return false;
  }

  try {
    const raw = storage.get(OFFLINE_AUTH_KEY);
    if (typeof raw !== 'string' || !raw) return false;

    const record = JSON.parse(raw);
    if (
      !isRecord(record) ||
      record.format !== FORMAT ||
      record.version !== VERSION ||
      record.email !== normalizedEmail ||
      record.endpoint !== normalizedEndpoint ||
      !Number.isSafeInteger(record.createdAt) ||
      !Number.isSafeInteger(record.expiresAt) ||
      record.expiresAt - record.createdAt !== OFFLINE_AUTH_TTL_MS ||
      record.createdAt > now + 5 * 60 * 1000 ||
      now >= record.expiresAt
    ) {
      return false;
    }

    const salt = decodeBase64(record.salt, SALT_BYTES);
    const expected = decodeBase64(record.verifier, VERIFIER_BYTES);
    if (!salt || !expected) return false;

    const actual = await deriveVerifier(
      password,
      salt,
      normalizedEmail,
      normalizedEndpoint,
      record.createdAt,
      record.expiresAt,
    );
    return equalBytes(actual, expected);
  } catch {
    return false;
  }
}

export function clearOfflineCredential(storage) {
  if (storage && typeof storage.del === 'function') storage.del(OFFLINE_AUTH_KEY);
}
