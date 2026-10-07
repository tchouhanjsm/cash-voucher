export function createApi({ getUrl, getToken }) {
  return async function api(action, payload = {}) {
    const url = getUrl();

    if (!url) {
      throw Object.assign(new Error('Server URL is not set.'), {
        code: 'NOURL',
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 70000);

    let response;

    try {
      response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
          action,
          token: getToken(),
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
  };
}
