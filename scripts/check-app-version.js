'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'frontend/core/app-info.js'), 'utf8');
const match = source.match(/^export const APP_VERSION = ['"]([^'"]+)['"];?$/m);

if (!match || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(match[1])) {
  console.error('App version check failed: APP_VERSION must be a declared semantic version.');
  process.exit(1);
}

if (pkg.version !== match[1]) {
  console.error(
    `App version mismatch: package.json declares ${pkg.version}, ` +
      `but frontend/core/app-info.js declares ${match[1]}.`,
  );
  process.exit(1);
}

console.log(`App version parity verified: ${match[1]}.`);
