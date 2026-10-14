'use strict';

// Guards the split Apps Script backend. Apps Script loads every .gs file into one
// global scope in file order, and a duplicate top-level name silently overwrites
// the earlier one, so these rules are checked in CI instead of discovered in production.

const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '../backend');
const files = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith('.gs'))
  .sort();
const errors = [];
const owners = new Map();

if (files[0] !== '00-config.gs') errors.push('00-config.gs must be the first backend file.');
if (files[files.length - 1] !== '99-routes.gs') {
  errors.push('99-routes.gs must be the last backend file: it reads every handler at load time.');
}

for (const name of files) {
  if (!/^\d{2}-[a-z0-9-]+\.gs$/.test(name)) {
    errors.push(`${name}: use a two-digit load-order prefix and kebab-case, e.g. 55-reports.gs.`);
  }

  const source = fs.readFileSync(path.join(dir, name), 'utf8');

  for (const match of source.matchAll(
    /^(?:async function|function|const|let|var) +([A-Za-z0-9_$]+)/gm,
  )) {
    const symbol = match[1];

    if (owners.has(symbol)) {
      errors.push(`${symbol} is defined in both ${owners.get(symbol)} and ${name}.`);
    } else {
      owners.set(symbol, name);
    }
  }
}

for (const table of ['ACTIONS', 'WRITES']) {
  if (owners.get(table) !== '99-routes.gs') {
    errors.push(`${table} must be defined in 99-routes.gs.`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Backend layout OK: ${files.length} files, ${owners.size} unique top-level names.`);
