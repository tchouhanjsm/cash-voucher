'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildWebSite, validateApiUrl } = require('../scripts/build-web');

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
  () => buildWebSite({ rootDir, outDir: rootDir, apiUrl: customerApiUrl }),
  /Output must be outside the repository/,
  'build must never remove the repository root',
);
assert.throws(
  () => buildWebSite({ rootDir, outDir: path.dirname(rootDir), apiUrl: customerApiUrl }),
  /Output must be outside the repository/,
  'build must never remove the parent directory containing the repository',
);
assert.throws(
  () => buildWebSite({ rootDir, outDir: path.join(rootDir, 'scripts'), apiUrl: customerApiUrl }),
  /Output must be outside the repository or use the dedicated repository dist/,
  'build must never remove a tracked repository subdirectory',
);

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cash-voucher-web-build-'));
try {
  const outDir = path.join(temporaryDirectory, 'dist');
  const result = buildWebSite({ rootDir, outDir, apiUrl: customerApiUrl });

  assert.equal(result.outDir, outDir);
  assert.equal(result.apiUrl, customerApiUrl);
  for (const file of [
    'index.html',
    'style.css',
    'frontend-ui-kit.css',
    'manifest.webmanifest',
    'sw.js',
    'config.js',
    '_headers',
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

  const generatedConfig = fs.readFileSync(path.join(outDir, 'config.js'), 'utf8');
  assert.ok(
    generatedConfig.includes(customerApiUrl),
    'generated config uses this customer endpoint',
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
