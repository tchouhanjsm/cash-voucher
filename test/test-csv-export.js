const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../frontend/core/utils.js'), 'utf8');

async function run() {
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const { csvCell } = await import(moduleUrl);

  for (const value of ['=SUM(1,1)', '+cmd', '-cmd', '@cmd', '\t=cmd', '\r=cmd', '\n=cmd']) {
    assert.match(
      csvCell(value),
      /^"'/,
      `formula/control prefix neutralized: ${JSON.stringify(value)}`,
    );
  }

  assert.equal(csvCell('normal, "quoted"'), '"normal, ""quoted"""');
  assert.equal(csvCell('plain'), '"plain"');
  console.log('CSV export safety OK — formula/control prefixes and quoting covered.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
