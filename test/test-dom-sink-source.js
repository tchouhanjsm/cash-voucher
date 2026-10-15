'use strict';

const assert = require('node:assert/strict');
const { scanSource } = require('../scripts/check-dom-sink-source');

const tick = String.fromCharCode(96);
const interpolation = '$' + '{esc(value)}';
const originalSource = [
  'function render(value) {',
  '  node.innerHTML = ' + tick,
  '    <section>semicolon in markup;',
  '    <p>' + interpolation + '</p>',
  '  </section>',
  '  ' + tick + ';',
  "  node.innerHTML = '<div>literal; semicolon</div>' + esc(value);",
  '}',
].join('\n');

const original = scanSource(originalSource);
assert.deepEqual(original.errors, [], 'template content semicolons do not end the assignment early');
assert.equal(original.sites.length, 2, 'both sink assignments are inventoried');

const changedInterpolation = scanSource(originalSource.replace(interpolation, '$' + '{value}'));
assert.notEqual(
  changedInterpolation.sites[0].hash,
  original.sites[0].hash,
  'removing the escape transformation changes the reviewed sink fingerprint',
);
assert.equal(
  changedInterpolation.sites[1].hash,
  original.sites[1].hash,
  'an unrelated sink retains its fingerprint',
);

const changedMarkup = scanSource(originalSource.replace('<section>', '<main>'));
assert.notEqual(
  changedMarkup.sites[0].hash,
  original.sites[0].hash,
  'changes to the full HTML assignment source require re-review',
);

console.log('DOM sink source fingerprint unit checks passed — 4 assertions.');
