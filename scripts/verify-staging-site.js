'use strict';

const crypto = require('node:crypto');

const REQUIRED_UI_ASSETS = [
  'index.html',
  'sw.js',
  'frontend-workspace.css',
  'frontend/main.js',
  'frontend/features/dashboard.js',
  'frontend/core/pwa.js',
];

function normalizeSiteRoot(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('CV_STAGING_SITE_URL must be a valid HTTPS site URL.');
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(
      'Staging site URL must use HTTPS and must not contain credentials, query, or fragment.',
    );
  }

  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function assertSafeAssetPath(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    !/^[A-Za-z0-9._/-]+$/.test(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('Asset manifest contains an unsafe relative path.');
  }
}

function assertNoCache(response, label, strict = false) {
  const tokens = String(response.headers.get('cache-control') || '')
    .toLowerCase()
    .split(',')
    .map((part) => part.trim().split('=')[0]);
  if (!tokens.includes('no-cache')) {
    throw new Error(label + ' is missing Cache-Control: no-cache.');
  }
  if (strict && !tokens.includes('no-store')) {
    throw new Error(label + ' is missing Cache-Control: no-store.');
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(label + ' is not valid JSON.');
  }
}

function verifySecurityHeaders(headers) {
  if (String(headers.get('x-content-type-options') || '').toLowerCase() !== 'nosniff') {
    throw new Error('Staging host is missing X-Content-Type-Options: nosniff.');
  }
  if (String(headers.get('x-frame-options') || '').toUpperCase() !== 'DENY') {
    throw new Error('Staging host is missing X-Frame-Options: DENY.');
  }

  const csp = String(headers.get('content-security-policy') || '');
  const directives = new Map();
  for (const entry of csp.split(';').map((part) => part.trim()).filter(Boolean)) {
    const [name, ...sources] = entry.split(/\s+/);
    const key = name.toLowerCase();
    if (directives.has(key)) {
      throw new Error('Staging host has duplicate Content-Security-Policy directives.');
    }
    directives.set(key, sources.join(' ').toLowerCase());
  }

  const expected = {
    'default-src': "'self'",
    'base-uri': "'self'",
    'object-src': "'none'",
    'script-src': "'self'",
    'script-src-attr': "'none'",
    'frame-src': "'none'",
    'frame-ancestors': "'none'",
  };
  for (const [name, value] of Object.entries(expected)) {
    if (directives.get(name) !== value) {
      throw new Error(
        'Staging host is missing the required restrictive Content-Security-Policy response directive: ' +
          name,
      );
    }
  }
  if (/\bunsafe-eval\b/i.test(csp) || /\bunsafe-inline\b/i.test(directives.get('script-src') || '')) {
    throw new Error('Staging host Content-Security-Policy permits unsafe script execution.');
  }
}

async function verifyStagingSite({
  siteUrl,
  expectedCommit,
  expectedDeploymentId,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  const root = normalizeSiteRoot(siteUrl);
  const commit = String(expectedCommit || '')
    .trim()
    .toLowerCase();
  const deploymentId = String(expectedDeploymentId || '').trim();

  if (!/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('CV_EXPECTED_RELEASE_COMMIT must be a full 40-character Git commit SHA.');
  }
  if (!/^[A-Za-z0-9_-]{8,}$/.test(deploymentId)) {
    throw new Error('CV_EXPECTED_STAGING_DEPLOYMENT_ID must be a valid deployment identifier.');
  }
  if (typeof fetchImpl !== 'function')
    throw new Error('A Fetch-compatible HTTP client is required.');

  const observedHeaders = new Map();

  async function read(pathname, { strictCache = false } = {}) {
    const url = new URL(pathname, root);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) {
      throw new Error('Requested staging asset escaped the configured site path.');
    }

    let response;
    try {
      response = await fetchImpl(url.href, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Cache-Control': 'no-cache' },
      });
    } catch {
      throw new Error('Unable to fetch a required staging asset: ' + pathname);
    }

    if (!response || response.status !== 200) {
      throw new Error('Staging asset did not return HTTP 200: ' + pathname);
    }
    if (response.url) {
      let finalUrl;
      try {
        finalUrl = new URL(response.url);
      } catch {
        throw new Error('Staging asset returned an invalid final URL: ' + pathname);
      }
      if (finalUrl.origin !== root.origin || !finalUrl.pathname.startsWith(root.pathname)) {
        throw new Error(
          'Staging asset redirected outside the configured staging site: ' + pathname,
        );
      }
    }

    assertNoCache(response, pathname, strictCache);
    observedHeaders.set(pathname, response.headers);
    return Buffer.from(await response.arrayBuffer());
  }

  const [releaseBytes, manifestBytes, configBytes, indexBytes, workerBytes] = await Promise.all([
    read('release-manifest.json', { strictCache: true }),
    read('asset-manifest.json', { strictCache: true }),
    read('config.js', { strictCache: true }),
    read('index.html', { strictCache: true }),
    read('sw.js', { strictCache: true }),
  ]);

  const release = parseJson(releaseBytes, 'Release manifest');
  if (release.environment !== 'staging')
    throw new Error('Published release is not marked as staging.');
  if (String(release.commit || '').toLowerCase() !== commit) {
    throw new Error('Published frontend commit does not match the requested client-main commit.');
  }
  if (String(release.deploymentId || '') !== deploymentId) {
    throw new Error('Published release manifest targets a different Apps Script deployment.');
  }

  const manifest = parseJson(manifestBytes, 'Asset manifest');
  if (
    manifest.schemaVersion !== 1 ||
    manifest.scope !== 'public-static-client-assets' ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length < REQUIRED_UI_ASSETS.length ||
    manifest.assets.length > 250
  ) {
    throw new Error('Published asset manifest has an unsupported or incomplete structure.');
  }

  const assetsByPath = new Map();
  for (const asset of manifest.assets) {
    assertSafeAssetPath(asset?.path);
    if (assetsByPath.has(asset.path)) throw new Error('Asset manifest contains duplicate paths.');
    if (
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes <= 0 ||
      !/^[a-f0-9]{64}$/.test(String(asset.sha256 || ''))
    ) {
      throw new Error('Asset manifest contains invalid integrity metadata.');
    }
    assetsByPath.set(asset.path, asset);
  }

  for (const required of REQUIRED_UI_ASSETS) {
    if (!assetsByPath.has(required)) {
      throw new Error('Published release is missing a required dashboard asset: ' + required);
    }
  }

  const config = configBytes.toString('utf8');
  const environmentMatch = config.match(/ENVIRONMENT:\s*(["'])([^"']+)\1/);
  const deploymentMatch = config.match(/DEPLOYMENT_ID:\s*(["'])([^"']+)\1/);
  const apiMatch = config.match(/API_URL:\s*localApiOverride\s*\|\|\s*("(?:\\.|[^"])*")/);

  if (environmentMatch?.[2] !== 'staging') {
    throw new Error('Published frontend config is not marked as staging.');
  }
  if (deploymentMatch?.[2] !== deploymentId) {
    throw new Error('Published frontend config targets a different Apps Script deployment.');
  }
  if (!apiMatch)
    throw new Error('Published frontend config does not contain a generated Apps Script endpoint.');
  let apiUrl;
  try {
    apiUrl = new URL(JSON.parse(apiMatch[1]));
  } catch {
    throw new Error('Published frontend config contains an invalid Apps Script endpoint.');
  }
  const apiParts = apiUrl.pathname.split('/').filter(Boolean);
  if (
    apiUrl.protocol !== 'https:' ||
    apiUrl.hostname !== 'script.google.com' ||
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.search ||
    apiUrl.hash ||
    apiParts.length !== 4 ||
    apiParts[0] !== 'macros' ||
    apiParts[1] !== 's' ||
    apiParts[2] !== deploymentId ||
    apiParts[3] !== 'exec'
  ) {
    throw new Error('Published frontend API endpoint and deployment identity do not match.');
  }

  const index = indexBytes.toString('utf8');
  if (!index.includes('frontend-workspace.css')) {
    throw new Error('Published index does not load the approved finance workspace stylesheet.');
  }
  if (!index.includes('frontend/main.js')) {
    throw new Error('Published index does not load the active frontend composition root.');
  }

  const worker = workerBytes.toString('utf8');
  const cacheMatch = worker.match(/^const C = '(cv2-v\d+)';$/m);
  if (!cacheMatch || !worker.includes('frontend-workspace.css')) {
    throw new Error('Published service worker does not precache the current workspace stylesheet.');
  }

  const rootBytes = await read('./', { strictCache: true });
  const indexHash = crypto.createHash('sha256').update(indexBytes).digest('hex');
  const rootHash = crypto.createHash('sha256').update(rootBytes).digest('hex');
  if (rootHash !== indexHash) {
    throw new Error('The staging site root does not serve the verified index.html.');
  }
  verifySecurityHeaders(observedHeaders.get('./'));

  const assets = [...manifest.assets];
  const failures = [];
  for (let offset = 0; offset < assets.length; offset += 6) {
    await Promise.all(
      assets.slice(offset, offset + 6).map(async (asset) => {
        try {
          const body = await read(asset.path);
          const actualHash = crypto.createHash('sha256').update(body).digest('hex');
          if (body.length !== asset.bytes || actualHash !== asset.sha256) {
            failures.push(asset.path);
          }
        } catch {
          failures.push(asset.path);
        }
      }),
    );
  }
  if (failures.length) {
    throw new Error(
      'Published static asset integrity mismatch: ' + failures.slice(0, 12).join(', '),
    );
  }

  return {
    origin: root.origin,
    path: root.pathname,
    commit,
    environment: 'staging',
    assetCount: assets.length,
    serviceWorkerCache: cacheMatch[1],
    workspaceStylesheet: true,
    dashboardModule: true,
    apiDeploymentMatched: true,
  };
}

if (require.main === module) {
  verifyStagingSite({
    siteUrl: process.env.CV_STAGING_SITE_URL,
    expectedCommit: process.env.CV_EXPECTED_RELEASE_COMMIT,
    expectedDeploymentId: process.env.CV_EXPECTED_STAGING_DEPLOYMENT_ID,
  })
    .then((result) => {
      console.log('Staging frontend verification passed.');
      console.log('Origin: ' + result.origin + result.path);
      console.log('Commit: ' + result.commit);
      console.log('Environment: ' + result.environment);
      console.log('Verified static assets: ' + result.assetCount);
      console.log('Service-worker cache: ' + result.serviceWorkerCache);
      console.log('Workspace stylesheet and dashboard module: present and integrity-verified.');
      console.log('Apps Script deployment: matched (identifier omitted).');
    })
    .catch((error) => {
      console.error('Staging frontend verification failed: ' + error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  verifyStagingSite,
  normalizeSiteRoot,
  assertSafeAssetPath,
  verifySecurityHeaders,
};
