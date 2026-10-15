'use strict';

const assert = require('node:assert/strict');
const { findSecretKinds } = require('../scripts/scan-secrets');

const syntheticSecrets = [
  'AIza' + 'A'.repeat(35),
  'AKIA' + 'A'.repeat(16),
  'ghp_' + 'A'.repeat(36),
  'GOCSPX-' + 'A'.repeat(24),
  'xoxb-' + 'A'.repeat(20),
  'sk_live_' + 'a'.repeat(24),
];

const newline = String.fromCharCode(10);
const syntheticPrivateKeyBlock = [
  ['-----BEGIN ', 'PRIVATE KEY', '-----'].join(''),
  'A'.repeat(64),
  ['-----END ', 'PRIVATE KEY', '-----'].join(''),
].join(newline);
assert.deepEqual(
  findSecretKinds(syntheticPrivateKeyBlock),
  ['Private key block'],
  'scanner detects a complete synthetic PEM block assembled at runtime',
);

for (const secret of syntheticSecrets) {
  assert.ok(
    findSecretKinds('fixture: ' + secret).length > 0,
    'scanner should detect a synthetic example for each supported token/key family',
  );
}

assert.deepEqual(
  findSecretKinds(
    'Owner PIN is entered by a user; GHSA-vfj7-8cjw-p6xm is a public advisory; ' +
      'example URL https://example.test/api has no credential value.',
  ),
  [],
  'ordinary app settings, public advisory identifiers, and sample URLs are not credentials',
);

console.log('Secret scan patterns OK — seven high-confidence credential families and safe examples.');
