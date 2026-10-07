import { S } from './state.js';

export async function api(action, payload = {}) {
  if (!S.url) {
    throw Object.assign(new Error('Server URL is not set.'), {
      code: 'NOURL',
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 70000);

  let response;

  try {
    response = await fetch(S.url, {
      method: 'POST',
      body: JSON.stringify({
        action,
        token: S.token,
        ...payload,
      }),
      signal: controller.signal,
    });
  } catch {
    throw Object.assign(
      new Error('No connection to the server. Check your internet and try again.'),
      { code: 'NET' },
    );
  } finally {
    clearTimeout(timeout);
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw Object.assign(
      new Error('Unexpected server response. Check the Server URL / deployment.'),
      { code: 'BAD' },
    );
  }

  if (!data.ok) {
    throw Object.assign(new Error(data.error || 'Request failed.'), {
      code: data.code,
    });
  }

  return data.data;
}
