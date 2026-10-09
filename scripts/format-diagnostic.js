'use strict';

const fs = require('node:fs');
const prettier = require('prettier');

(async () => {
  const file = 'backend/Code.gs';
  const source = fs.readFileSync(file, 'utf8');
  const formatted = await prettier.format(source, { filepath: file });
  if (source === formatted) {
    console.log('Formatter diagnostic: backend/Code.gs already matches Prettier.');
    return;
  }

  const before = source.split(/\r?\n/);
  const after = formatted.split(/\r?\n/);
  let first = 0;
  while (first < before.length && first < after.length && before[first] === after[first]) first++;

  console.log('Formatter diagnostic: first differing lines (source versus Prettier output).');
  console.log('--- source ---');
  console.log(before.slice(Math.max(0, first - 5), first + 15).map((line, i) => `${Math.max(1, first - 4) + i}: ${line}`).join('\n'));
  console.log('--- formatted ---');
  console.log(after.slice(Math.max(0, first - 5), first + 15).map((line, i) => `${Math.max(1, first - 4) + i}: ${line}`).join('\n'));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
