'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, 'frontend');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'dom-sink-source-baseline.json');
const BASELINE = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

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

function skipQuoted(source, start, quote) {
  for (let i = start + 1; i < source.length; i += 1) {
    if (source[i] === '\\') {
      i += 1;
      continue;
    }
    if (source[i] === quote) return i + 1;
  }
  return -1;
}

function findStatementTerminator(source, start) {
  const stack = [
    {
      kind: 'code',
      templateExpression: false,
      braceDepth: 0,
      parenDepth: 0,
      bracketDepth: 0,
    },
  ];

  for (let i = start; i < source.length; i += 1) {
    const frame = stack[stack.length - 1];
    const char = source[i];
    const next = source[i + 1];

    if (frame.kind === 'template') {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char.charCodeAt(0) === 96) {
        stack.pop();
        continue;
      }
      if (char === '$' && next === '{') {
        stack.push({
          kind: 'code',
          templateExpression: true,
          braceDepth: 0,
          parenDepth: 0,
          bracketDepth: 0,
        });
        i += 1;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      const afterQuote = skipQuoted(source, i, char);
      if (afterQuote < 0) return -1;
      i = afterQuote - 1;
      continue;
    }

    if (char === '/' && next === '/') {
      const newline = source.indexOf('\n', i + 2);
      if (newline < 0) return -1;
      i = newline;
      continue;
    }
    if (char === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      if (close < 0) return -1;
      i = close + 1;
      continue;
    }

    if (char.charCodeAt(0) === 96) {
      stack.push({ kind: 'template' });
      continue;
    }
    if (char === '(') frame.parenDepth += 1;
    else if (char === ')' && frame.parenDepth > 0) frame.parenDepth -= 1;
    else if (char === '[') frame.bracketDepth += 1;
    else if (char === ']' && frame.bracketDepth > 0) frame.bracketDepth -= 1;
    else if (char === '{') frame.braceDepth += 1;
    else if (char === '}') {
      if (frame.braceDepth > 0) frame.braceDepth -= 1;
      else if (frame.templateExpression) stack.pop();
    } else if (
      char === ';' &&
      stack.length === 1 &&
      frame.braceDepth === 0 &&
      frame.parenDepth === 0 &&
      frame.bracketDepth === 0
    ) {
      return i;
    }
  }
  return -1;
}

function fnv1a(source) {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function scanSource(source) {
  const normalized = source.replace(/\r\n?/g, '\n');
  const pattern = /\binnerHTML\s*=/g;
  const sites = [];
  const errors = [];
  let searchFrom = 0;

  while (searchFrom < normalized.length) {
    pattern.lastIndex = searchFrom;
    const match = pattern.exec(normalized);
    if (!match) break;

    const lineStart = normalized.lastIndexOf('\n', match.index) + 1;
    const rhsStart = pattern.lastIndex;
    const terminator = findStatementTerminator(normalized, rhsStart);
    const line = normalized.slice(0, match.index).split('\n').length;

    if (terminator < 0) {
      errors.push({ line, message: 'could not locate the assignment terminator' });
      searchFrom = rhsStart;
      continue;
    }

    sites.push({
      line,
      hash: fnv1a(normalized.slice(lineStart, terminator + 1)),
    });
    searchFrom = terminator + 1;
  }

  return { sites, errors };
}

function scanRepository() {
  const observed = {};
  const errors = [];

  for (const file of walk(FRONTEND)) {
    const name = path.relative(ROOT, file).split(path.sep).join('/');
    const result = scanSource(fs.readFileSync(file, 'utf8'));
    if (result.sites.length) observed[name] = result.sites.map((site) => site.hash);
    for (const error of result.errors) {
      errors.push({ file: name, ...error });
    }
  }
  return { observed, errors };
}

function main() {
  const { observed, errors } = scanRepository();
  const expectedFiles = Object.keys(BASELINE).sort();
  const observedFiles = Object.keys(observed).sort();
  const mismatches = [];

  for (const file of [...new Set([...expectedFiles, ...observedFiles])].sort()) {
    const expected = BASELINE[file] || [];
    const actual = observed[file] || [];
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      mismatches.push({ file, expected, actual });
    }
  }

  if (errors.length || mismatches.length) {
    console.error('DOM sink source fingerprint gate FAILED.');
    for (const error of errors) {
      console.error('- ' + error.file + ':' + error.line + ': ' + error.message);
    }
    for (const mismatch of mismatches) {
      console.error('- ' + mismatch.file + ': reviewed source fingerprints differ.');
      const count = Math.max(mismatch.expected.length, mismatch.actual.length);
      for (let index = 0; index < count; index += 1) {
        if (mismatch.expected[index] !== mismatch.actual[index]) {
          console.error(
            '  sink ' +
              (index + 1) +
              ': baseline=' +
              String(mismatch.expected[index] ?? '<missing>') +
              ', observed=' +
              String(mismatch.actual[index] ?? '<missing>'),
          );
        }
      }
    }
    console.error(
      'Review the complete source-to-sink path and add focused adversarial coverage before intentionally updating scripts/dom-sink-source-baseline.json. This is a drift gate, not an XSS proof.',
    );
    process.exitCode = 1;
    return;
  }

  const total = Object.values(observed).reduce((sum, hashes) => sum + hashes.length, 0);
  console.log(
    'DOM sink source fingerprint gate passed: ' +
      total +
      ' assignment sources across ' +
      observedFiles.length +
      ' frontend modules match the reviewed baseline.',
  );
}

if (require.main === module) main();

module.exports = { findStatementTerminator, fnv1a, scanSource, scanRepository };
