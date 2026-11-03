'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildWebSite, validateApiUrl, validateSecurityHeaders, validateCacheHeaders } = require('../scripts/build-web');

const rootDir = path.resolve(__dirname, '..');
const customerApiUrl = 'https://script.google.com/macros/s/TEST_CUSTOMER_DEPLOYMENT_ID/exec';

assert.equal(validateApiUrl(customerApiUrl), customerApiUrl);
for (const invalidUrl of [
  '',
  'not-a-url',
  'http://script.google.com/macros/s/TEST_ID/exec',
  'https://example.com/macros/s/TEST_ID/exec',
  'https://script.google.com/macros/s/TEST_ID/exec?debug=true',
  'https://script.google.com/macros/s/TEST_ID/exec#fragment',
  'https://user:pass@script.google.com/macros/s/TEST_ID/exec',
  'https://script.google.com/macros/s/TEST_ID/dev',
]) {
  assert.throws(
    () => validateApiUrl(invalidUrl),
    undefined,
    'invalid customer API URL must be rejected: ' + invalidUrl,
  );
}

assert.throws(
  () =>
    buildWebSite({
      rootDir,
      outDir: rootDir,
      apiUrl: customerApiUrl,
      environment: 'production',
    }),
  /Output must be outside the repository/,
  'build must never remove the repository root',
);
assert.throws(
  () =>
    buildWebSite({
      rootDir,
      outDir: path.dirname(rootDir),
      apiUrl: customerApiUrl,
      environment: 'production',
    }),
  /Output must be outside the repository/,
  'build must never remove the parent directory containing the repository',
);
assert.throws(
  () =>
    buildWebSite({
      rootDir,
      outDir: path.join(rootDir, 'scripts'),
      apiUrl: customerApiUrl,
      environment: 'production',
    }),
  /Output must be outside the repository or use the dedicated repository dist/,
  'build must never remove a tracked repository subdirectory',
);

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cash-voucher-web-build-'));
try {
  const outDir = path.join(temporaryDirectory, 'dist');
  const result = buildWebSite({
    rootDir,
    outDir,
    apiUrl: customerApiUrl,
    environment: 'production',
  });

  assert.equal(result.outDir, outDir);
  assert.equal(result.apiUrl, customerApiUrl);
  assert.equal(result.environment, 'production');
  assert.equal(result.deploymentId, 'TEST_CUSTOMER_DEPLOYMENT_ID');
  const assetManifestPath = path.join(outDir, 'asset-manifest.json');
  assert.ok(fs.existsSync(assetManifestPath), 'customer build emits a public asset manifest');
  const assetManifest = JSON.parse(fs.readFileSync(assetManifestPath, 'utf8'));
  assert.equal(assetManifest.schemaVersion, 1);
  assert.equal(assetManifest.scope, 'public-static-client-assets');
  assert.ok(assetManifest.summary.files > 0);
  assert.ok(assetManifest.summary.bytes > 0);
  assert.ok(assetManifest.summary.gzipBytes > 0);
  assert.equal(result.assetManifest.files, assetManifest.summary.files);
  assert.ok(assetManifest.assets.some((asset) => asset.path === 'frontend-workspace.css'));
  assert.ok(assetManifest.assets.some((asset) => asset.path === 'frontend/features/dashboard.js'));
  assert.ok(
    assetManifest.assets.every(
      (asset) =>
        Number.isSafeInteger(asset.bytes) &&
        asset.bytes > 0 &&
        Number.isSafeInteger(asset.gzipBytes) &&
        asset.gzipBytes > 0 &&
        /^[a-f0-9]{64}$/.test(asset.sha256),
    ),
    'every public asset has raw/gzip byte counts and a SHA-256 digest',
  );
  assert.ok(
    assetManifest.assets.every(
      (asset) => !['config.js', '_headers', '.htaccess'].includes(asset.path),
    ),
    'generated endpoint configuration and host policy files are excluded',
  );
  assert.ok(!JSON.stringify(assetManifest).includes('TEST_CUSTOMER_DEPLOYMENT_ID'));
  assert.equal(result.files, assetManifest.summary.files + 5);
  for (const file of [
    'index.html',
    'style.css',
    'frontend-ui-kit.css',
    'frontend-workspace.css',
    'manifest.webmanifest',
    'sw.js',
    'config.js',
    'asset-manifest.json',
    '_headers',
    '.htaccess',
    '.nojekyll',
    'frontend/main.js',
    'frontend/core/offline-queue.js',
    'icons/icon-192.png',
  ]) {
    assert.ok(fs.existsSync(path.join(outDir, file)), 'customer build includes ' + file);
  }

  for (const forbidden of ['backend', 'docs', 'scripts', 'test', 'package.json', 'README.md']) {
    assert.equal(
      fs.existsSync(path.join(outDir, forbidden)),
      false,
      'customer static artifact excludes ' + forbidden,
    );
  }

  const headers = fs.readFileSync(path.join(outDir, '_headers'), 'utf8');
  assert.ok(headers.includes('X-Content-Type-Options: nosniff'));
  assert.ok(headers.includes('X-Frame-Options: DENY'));
  assert.ok(headers.includes("frame-ancestors 'none'"));
  assert.ok(headers.includes('https://script.google.com'));
  assert.equal(validateCacheHeaders(headers, 'pages'), true);
  assert.ok(headers.includes('/sw.js\n  Cache-Control: no-cache, no-store, must-revalidate'));

  const apacheHeaders = fs.readFileSync(path.join(outDir, '.htaccess'), 'utf8');
  assert.ok(apacheHeaders.includes('Header always set X-Content-Type-Options "nosniff"'));
  assert.ok(apacheHeaders.includes('Header always set X-Frame-Options "DENY"'));
  assert.ok(apacheHeaders.includes('Header always set Content-Security-Policy'));
  assert.ok(apacheHeaders.includes("frame-ancestors 'none'"));
  assert.equal(validateCacheHeaders(apacheHeaders, 'apache'), true);
  assert.ok(apacheHeaders.includes('Header always set Cache-Control "no-cache, no-store, must-revalidate"'));

  assert.equal(validateSecurityHeaders(headers, 'pages'), true);
  assert.equal(validateSecurityHeaders(apacheHeaders, 'apache'), true);
  assert.throws(
    () => validateCacheHeaders(headers.replace('/sw.js\n  Cache-Control: no-cache, no-store, must-revalidate', ''), 'pages'),
    /cache policy/,
    'Pages cache policy rejects missing service-worker revalidation',
  );
  assert.throws(
    () => validateSecurityHeaders(headers.replace("script-src 'self'", 'script-src *'), 'pages'),
    /script-src/,
    'Pages security validation rejects wildcard script sources',
  );
  assert.throws(
    () =>
      validateSecurityHeaders(
        apacheHeaders.replace("frame-ancestors 'none'", 'frame-ancestors *'),
        'apache',
      ),
    /frame-ancestors/,
    'Apache security validation rejects a permissive framing policy',
  );
  assert.throws(
    () =>
      validateSecurityHeaders(
        headers.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"),
        'pages',
      ),
    /script-src/,
    'Pages security validation rejects unsafe script execution',
  );

  const generatedConfig = fs.readFileSync(path.join(outDir, 'config.js'), 'utf8');
  assert.ok(
    generatedConfig.includes('ENVIRONMENT: "production"'),
    'generated config binds the environment',
  );
  assert.ok(
    generatedConfig.includes('DEPLOYMENT_ID: "TEST_CUSTOMER_DEPLOYMENT_ID"'),
    'generated config binds deployment identity',
  );
  assert.ok(
    generatedConfig.includes(customerApiUrl),
    'generated config uses this customer endpoint',
  );
  assert.ok(
    generatedConfig.includes('API_URL: localApiOverride || ' + JSON.stringify(customerApiUrl)),
    'generated API_URL includes the optional local override and the serialized endpoint',
  );
  assert.ok(
    !generatedConfig.includes('https://script.google.com/macros/s/LEGACY_ENDPOINT/exec'),
    'generated config does not reuse an unrelated legacy endpoint',
  );
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(
  'Customer web build OK — validates API target, isolates published assets, and generates per-client config.',
);
