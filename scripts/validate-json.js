const fs = require('fs');
const path = require('path');

const files = ['package.json', 'backend/appsscript.json', 'manifest.webmanifest'];

for (const file of files) {
  const absolute = path.resolve(file);

  JSON.parse(fs.readFileSync(absolute, 'utf8'));

  console.log(`JSON OK: ${file}`);
}
