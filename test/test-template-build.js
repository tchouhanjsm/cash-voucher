'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildTemplate } = require('../scripts/build-template');

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-template-'));
try {
  const result = buildTemplate({ outDir, commit: 'abc1234' });
  const backend = path.join(__dirname, '../backend');
  const sources = fs
    .readdirSync(backend)
    .filter((name) => name.endsWith('.gs'))
    .sort();

  assert.deepEqual(result.files, sources, 'every backend file is joined, in name order');
  const code = fs.readFileSync(path.join(outDir, 'Code.gs'), 'utf8');
  assert.ok(code.startsWith('// Cash Voucher master template bundle. Source commit: abc1234'));

  let lastIndex = -1;
  for (const name of sources) {
    const marker = '// ===== backend/' + name + ' =====';
    const index = code.indexOf(marker);
    assert.ok(index > lastIndex, name + ' appears once, after the previous file');
    lastIndex = index;
    const body = fs.readFileSync(path.join(backend, name), 'utf8');
    assert.ok(code.includes(body), name + ' content is preserved exactly');
  }

  assert.equal(
    fs.readFileSync(path.join(outDir, 'appsscript.json'), 'utf8'),
    fs.readFileSync(path.join(backend, 'appsscript.json'), 'utf8'),
    'manifest is copied unchanged',
  );
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'appsscript.json'), 'utf8'));
  assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING');
  assert.ok(fs.readFileSync(path.join(outDir, 'BUILD.txt'), 'utf8').includes('abc1234'));
  assert.ok(!code.includes('OWNER_PASSWORD = '), 'no credentials are embedded in the bundle');
  console.log('Template bundle tests passed — ' + sources.length + ' files.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
