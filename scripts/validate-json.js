const fs = require('fs');
const path = require('path');

const files = [
  'package.json',
  'backend/appsscript.json',
  'manifest.webmanifest',
  'api/v1/contract.json',
  'api/v1/legacy-action-map.json',
];

for (const file of files) {
  const absolute = path.resolve(file);

  JSON.parse(fs.readFileSync(absolute, 'utf8'));

  console.log(`JSON OK: ${file}`);
}
