'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyStagingSite } = require('../scripts/verify-staging-site');

const commit = 'a'.repeat(40);
const deploymentId = 'STAGING_DEPLOYMENT_123';
const files = {
  'index.html':
    '<!doctype html><html><head><link rel="stylesheet" href="frontend-workspace.css"></head><body><script type="module" src="frontend/main.js"></script></body></html>',
  'sw.js': "const C = 'cv2-v46';\nconst F = ['index.html', 'frontend-workspace.css'];",
  'frontend-workspace.css': ':root { --workspace-canvas: #f6f8fc; }',
  'frontend/main.js': "import './core/pwa.js';",
  'frontend/features/dashboard.js': 'export function createDashboard() {}',
  'frontend/core/pwa.js': 'export function registerPwa() {}',
};
const assets = Object.entries(files).map(([path, content]) => ({
  path,
  bytes: Buffer.byteLength(content),
  sha256: crypto.createHash('sha256').update(content).digest('hex'),
}));
const assetManifest = {
  schemaVersion: 1,
  scope: 'public-static-client-assets',
  assets,
};
const assetManifestBytes = JSON.stringify(assetManifest);
const assetManifestSha256 = crypto.createHash('sha256').update(assetManifestBytes).digest('hex');
const release = {
  environment: 'staging',
  commit,
  deploymentId,
  assetManifestSha256,
  artifactVersion: 2,
};
const config = [
  'window.CV_CONFIG = {',
  '  API_URL: localApiOverride || "https://script.google.com/macros/s/' + deploymentId + '/exec",',
  '  ENVIRONMENT: "staging",',
  '  DEPLOYMENT_ID: "' + deploymentId + '",',
  '};',
].join('\n');

const secureCsp = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; script-src-attr 'none'; frame-src 'none'; frame-ancestors 'none'";

function makeFetch({
  replacements = {},
  missingCache = '',
  missingSecurity = false,
  cspOverride = secureCsp,
} = {}) {
  const payloads = {
    ...files,
    'release-manifest.json': JSON.stringify(release),
    'asset-manifest.json': assetManifestBytes,
    'config.js': config,
    ...replacements,
  };

  return async (url) => {
    const pathname = new URL(url).pathname;
    const key = pathname.split('/').filter(Boolean).slice(1).join('/');
    const value = key === '' ? files['index.html'] : payloads[key];
    if (value === undefined) return new Response('Not found', { status: 404 });

    const headers = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': cspOverride,
    };
    if (missingCache && pathname.endsWith(missingCache))
      headers['Cache-Control'] = 'public, max-age=86400';
    if (missingSecurity) delete headers['Content-Security-Policy'];

    return new Response(value, { status: 200, headers });
  };
}


function manifestReplacements(extraPath) {
  const changedManifest = {
    ...assetManifest,
    assets: [...assets, { ...assets[0], path: extraPath }],
  };
  const bytes = JSON.stringify(changedManifest);
  const changedRelease = {
    ...release,
    assetManifestSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
  return {
    'asset-manifest.json': bytes,
    'release-manifest.json': JSON.stringify(changedRelease),
  };
}

async function expectFailure(options, pattern) {
  await assert.rejects(() => verifyStagingSite(options), pattern);
}

(async () => {
  const valid = await verifyStagingSite({
    siteUrl: 'https://staging.example.test/cash-voucher/',
    expectedCommit: commit,
    expectedDeploymentId: deploymentId,
    fetchImpl: makeFetch(),
  });
  assert.equal(valid.commit, commit);
  assert.equal(valid.environment, 'staging');
  assert.equal(valid.assetCount, assets.length);
  assert.equal(valid.serviceWorkerCache, 'cv2-v46');
  assert.equal(valid.apiDeploymentMatched, true);
  assert.equal(
    Object.hasOwn(valid, 'deploymentId'),
    false,
    'verification output omits deployment identifiers',
  );

  await expectFailure(
    {
      siteUrl: 'https://staging.example.test/cash-voucher/',
      expectedCommit: 'b'.repeat(40),
      expectedDeploymentId: deploymentId,
      fetchImpl: makeFetch(),
    },
    /does not match the requested client-main commit/,
  );

  await expectFailure(
    {
      siteUrl: 'https://staging.example.test/cash-voucher/',
      expectedCommit: commit,
      expectedDeploymentId: 'OTHER_DEPLOYMENT_999',
      fetchImpl: makeFetch(),
    },
    /different Apps Script deployment/,
  );

  await expectFailure(
    {
      siteUrl: 'http://staging.example.test/',
      expectedCommit: commit,
      expectedDeploymentId: deploymentId,
      fetchImpl: makeFetch(),
    },
    /HTTPS/,
  );

  await expectFailure(
    {
      siteUrl: 'https://staging.example.test/cash-voucher/',
      expectedCommit: commit,
      expectedDeploymentId: deploymentId,
      fetchImpl: makeFetch({
        replacements: { 'frontend-workspace.css': 'old dashboard stylesheet' },
      }),
    },
    /integrity mismatch/,
  );

  await expectFailure(
    {
      siteUrl: 'https://staging.example.test/cash-voucher/',
      expectedCommit: commit,
      expectedDeploymentId: deploymentId,
      fetchImpl: makeFetch({
        replacements: {
          'asset-manifest.json': JSON.stringify({ ...assetManifest, scope: 'modified-manifest' }),
        },
      }),
    },
    /Asset manifest digest does not match the release manifest/,
  );

  await expectFailure(
    {
      siteUrl: 'https://staging.example.test/cash-voucher/',
      expectedCommit: commit,
      expectedDeploymentId: deploymentId,
      fetchImpl: makeFetch({ missingCache: '/sw.js' }),
    },
    /sw\.js is missing Cache-Control/,
  );

  await expectFailure(
    {
      siteUrl: 'https://staging.example.test/cash-voucher/',
      expectedCommit: commit,
      expectedDeploymentId: deploymentId,
      fetchImpl: makeFetch({ missingSecurity: true }),
    },
    /restrictive Content-Security-Policy/,
  );

  await expectFailure(
    {
      siteUrl: 'https://staging.example.test/cash-voucher/',
      expectedCommit: commit,
      expectedDeploymentId: deploymentId,
      fetchImpl: makeFetch({
        cspOverride:
          "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' https://evil.example; script-src-attr 'none'; frame-src 'none'; frame-ancestors 'none'",
      }),
    },
    /restrictive Content-Security-Policy response directive: script-src/,
  );

  await expectFailure(
    {
      siteUrl: 'https://staging.example.test/cash-voucher/',
      expectedCommit: commit,
      expectedDeploymentId: deploymentId,
      fetchImpl: makeFetch({
        replacements: {
          'config.js': config.replace('/exec",', '/exec?api=https://evil.example",'),
        },
      }),
    },
    /API endpoint and deployment identity do not match/,
  );

  await expectFailure(
    {
      siteUrl: 'https://staging.example.test/cash-voucher/',
      expectedCommit: commit,
      expectedDeploymentId: deploymentId,
      fetchImpl: makeFetch({
        replacements: manifestReplacements('../outside.js'),
      }),
    },
    /unsafe relative path/,
  );

  await expectFailure(
    {
      siteUrl: 'https://staging.example.test/cash-voucher/',
      expectedCommit: commit,
      expectedDeploymentId: deploymentId,
      fetchImpl: makeFetch({
        replacements: manifestReplacements('%2e%2e/outside.js'),
      }),
    },
    /unsafe relative path/,
  );
  console.log('Staging frontend verifier tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
