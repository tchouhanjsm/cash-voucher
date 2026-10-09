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
  'Prevents an incomplete handoff from passing the pull request quality gate.',
  '## Acceptance criteria',
  'All required sections are present, useful, and free of unresolved placeholders.',
  '## Verification evidence',
  'The test invokes the actual gate with isolated synthetic event payloads.',
  '## Security and failure review',
  'Only a temporary test event is written; no repository or production state is changed.',
  '## Release boundary',
  'This quality-gate test does not merge, release or deploy source code.',
  '## Residual risks / not verified',
  'This verifies the handoff contract and not GitHub server configuration.',
].join('\n\n');

function runGate(commitCount, prBody = body) {
  fs.writeFileSync(
    eventPath,
    JSON.stringify({ pull_request: { commits: commitCount, body: prBody } }),
  );

  return spawnSync(process.execPath, [path.join(root, 'scripts/check-pr-quality.js')], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_EVENT_PATH: eventPath, CI: 'true' },
  });
}

try {
  const manyCommits = runGate(29);
  assert.equal(
    manyCommits.status,
    0,
    `The gate must not reject a coherent PR solely for commit count. Output: ${manyCommits.stdout} ${manyCommits.stderr}`,
  );
  assert.match(manyCommits.stdout, /all 6 required handoff sections/);

  const missingEvidence = runGate(29, body.replace('## Security and failure review', '## Security review'));
  assert.equal(missingEvidence.status, 1, 'The gate must reject a missing required handoff section.');
  assert.match(missingEvidence.stderr, /missing the required "## Security and failure review"/);

  console.log('PR quality gate OK — no hard commit ceiling; required handoff sections are enforced.');
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
