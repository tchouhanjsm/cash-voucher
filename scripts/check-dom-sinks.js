'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, 'frontend');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'dom-sink-baseline.json');
const BASELINE = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

const FORBIDDEN = [
  { name: 'outerHTML assignment', regex: /\bouterHTML\s*=/g },
  { name: 'insertAdjacentHTML', regex: /\.insertAdjacentHTML\s*\(/g },
  { name: 'document.write', regex: /\bdocument\s*\.\s*write\s*\(/g },
  { name: 'createContextualFragment', regex: /\.createContextualFragment\s*\(/g },
  { name: 'eval', regex: /\beval\s*\(/g },
  { name: 'Function constructor', regex: /\bnew\s+Function\s*\(/g },
];

function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
    })
    .sort();
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function countMatches(source, regex) {
  regex.lastIndex = 0;
  return [...source.matchAll(regex)].length;
}

function scan() {
  const observed = {};
  const blocked = [];

  for (const file of walk(FRONTEND)) {
    const source = fs.readFileSync(file, 'utf8');
    const name = relative(file);
    const count = countMatches(source, /\binnerHTML\s*=/g);

    if (count) observed[name] = count;

    for (const sink of FORBIDDEN) {
      const count = countMatches(source, sink.regex);
      if (count) blocked.push({ file: name, sink: sink.name, count });
    }
  }

  return { observed, blocked };
}

function main() {
  const { observed, blocked } = scan();
  const expectedKeys = Object.keys(BASELINE).sort();
  const observedKeys = Object.keys(observed).sort();
  const mismatches = [];

  for (const file of [...new Set([...expectedKeys, ...observedKeys])].sort()) {
    if (BASELINE[file] !== observed[file]) {
      mismatches.push(
        file +
          ': reviewed baseline=' +
          String(BASELINE[file] ?? 0) +
          ', observed=' +
          String(observed[file] ?? 0),
      );
    }
  }

  if (mismatches.length || blocked.length) {
    console.error('DOM sink inventory gate FAILED.');
    for (const mismatch of mismatches) console.error('- ' + mismatch);
    for (const item of blocked) {
      console.error(
        '- ' + item.file + ': disallowed ' + item.sink + ' found ' + item.count + ' time(s)',
      );
    }
    console.error(
      'Review the changed sink at source and add a targeted regression before intentionally updating scripts/dom-sink-baseline.json and docs/ACTIVE-DOM-SINK-INVENTORY.md. Do not update the baseline just to silence this check.',
    );
    process.exitCode = 1;
    return;
  }

  const total = Object.values(observed).reduce((sum, count) => sum + count, 0);
  console.log(
    'DOM sink inventory passed: ' +
      total +
      ' innerHTML assignment sites across ' +
      observedKeys.length +
      ' frontend modules; no disallowed dynamic DOM APIs detected.',
  );
}

if (require.main === module) main();

module.exports = { scan };
