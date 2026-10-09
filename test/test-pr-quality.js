'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cash-voucher-pr-quality-'));
const eventPath = path.join(tempDirectory, 'event.json');
const body = [
  '## Outcome',
  'Raises the pull request batch guard and protects its boundary with deterministic tests.',
  '## Acceptance criteria',
  'Twenty commits are accepted while twenty-one commits are rejected by the pull request gate.',
  '## Verification evidence',
  'The test invokes the actual gate with isolated synthetic event payloads.',
  '## Security and failure review',
  'Only a temporary test event is written; no repository or production state is changed.',
  '## Release boundary',
  'This boundary test does not merge, release or deploy any source code.',
  '## Residual risks / not verified',
  'This verifies the commit-count guard contract and not GitHub server configuration.',
].join('\n\n');

function runGate(commitCount) {
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { commits: commitCount, body } }));

  return spawnSync(process.execPath, [path.join(root, 'scripts/check-pr-quality.js')], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_EVENT_PATH: eventPath, CI: 'true' },
  });
}

try {
  const boundary = runGate(20);
  assert.equal(
    boundary.status,
    0,
    `The gate should accept 20 commits. Output: ${boundary.stdout} ${boundary.stderr}`,
  );
  assert.match(boundary.stdout, /20 commits/);

  const overLimit = runGate(21);
  assert.equal(overLimit.status, 1, 'The gate must reject 21 commits.');
  assert.match(overLimit.stderr, /limit is 20/);

  console.log('PR quality guard OK — 20 commits accepted; 21 commits rejected.');
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
