'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {
  buildStagingConfig,
  createStagingServer,
  resolveStaticPath,
  stagingServiceWorker,
} = require('../scripts/staging-web-server');

const root = path.resolve(__dirname, '..');
const fixture = {
  CV_STAGING_SCRIPT_ID: 'staging-script-fixture',
  CV_PRODUCTION_SCRIPT_ID: 'production-script-fixture',
  CV_STAGING_DEPLOYMENT_ID: 'staging-deployment-fixture',
  CV_STAGING_API_URL: 'https://script.google.com/macros/s/staging-deployment-fixture/exec',
  CV_STAGING_SPREADSHEET_ID: 'staging-sheet-fixture',
  CV_PRODUCTION_SPREADSHEET_ID: 'production-sheet-fixture',
  CV_STAGING_RECEIPT_FOLDER_ID: 'staging-receipts-fixture',
  CV_PRODUCTION_RECEIPT_FOLDER_ID: 'production-receipts-fixture',
  CV_STAGING_BACKUP_FOLDER_ID: 'staging-backups-fixture',
  CV_PRODUCTION_BACKUP_FOLDER_ID: 'production-backups-fixture',
  CV_STAGING_UAT_OWNER_EMAIL: 'uat-owner@example.test',
  CV_STAGING_UAT_OWNER_PASSWORD: 'WebServerOwnerPass8',
  CV_STAGING_UAT_MANAGER_EMAIL: 'uat-manager@example.test',
  CV_STAGING_UAT_MANAGER_PASSWORD: 'WebServerManagerPass8',
};

async function run() {
  const config = buildStagingConfig(fixture.CV_STAGING_API_URL);
  assert.ok(config.includes(fixture.CV_STAGING_API_URL));
  assert.ok(!config.includes('production-script-fixture'));
  assert.equal(resolveStaticPath('/index.html', root).path, path.join(root, 'index.html'));
  assert.equal(resolveStaticPath('/config.js', root).generated, 'config');
  assert.equal(resolveStaticPath('/sw.js', root).generated, 'service-worker');
  assert.equal(resolveStaticPath('/backend/99-routes.gs', root), null);
  assert.equal(resolveStaticPath('/docs/HANDOFF.md', root), null);
  assert.equal(resolveStaticPath('/node_modules/@google/clasp/package.json', root), null);
  assert.equal(resolveStaticPath('/.clasp.json', root), null);
  assert.equal(resolveStaticPath('/.clasprc.json', root), null);
  assert.equal(resolveStaticPath('/%2e%2e/package.json', root), null);
  assert.equal(resolveStaticPath('/frontend/../../package.json', root), null);
  const sw = stagingServiceWorker();
  assert.ok(!sw.includes('caches'));
  assert.ok(!sw.includes('respondWith'));
  assert.ok(!sw.includes('config.js'));

  const server = createStagingServer(fixture, root);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const base = 'http://127.0.0.1:' + address.port;
  try {
    const health = await fetch(base + '/__staging_health');
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await health.json(), { ok: true });

    const configResponse = await fetch(base + '/config.js');
    const body = await configResponse.text();
    assert.equal(configResponse.status, 200);
    assert.equal(configResponse.headers.get('cache-control'), 'no-store');
    assert.equal(configResponse.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(body.includes(fixture.CV_STAGING_API_URL));
    assert.ok(!body.includes('/production-script-fixture/'));

    const serviceWorker = await fetch(base + '/sw.js');
    assert.equal(serviceWorker.status, 200);
    assert.ok(!(await serviceWorker.text()).includes('caches'));

    for (const blocked of [
      '/backend/99-routes.gs',
      '/docs/HANDOFF.md',
      '/node_modules/@google/clasp/package.json',
      '/.clasp.json',
      '/.clasprc.json',
    ]) {
      const response = await fetch(base + blocked);
      assert.equal(
        response.status,
        404,
        blocked + ' must remain outside the staging static allowlist',
      );
    }

    const index = await fetch(base + '/');
    assert.equal(index.status, 200);
    assert.ok((await index.text()).includes('frontend/main.js'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(
    'Staging web server OK — dynamic stage config, no-cache service worker, resource allowlist, headers and traversal guards.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
