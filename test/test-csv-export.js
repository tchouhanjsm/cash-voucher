const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../frontend/core/utils.js'), 'utf8');
assert.ok(source.includes("replace(/^([=+\\-@\\t\\r\\n])/, \"'$1\")"), 'CSV serializer neutralizes formula/control prefixes');
assert.ok(source.includes(".replace(/\"/g, '\"\"')"), 'CSV serializer escapes double quotes');
assert.ok(source.includes('export const csvCell'), 'shared CSV serializer remains in use');
console.log('CSV export safety source contract OK.');
