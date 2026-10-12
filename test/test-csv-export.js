const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../frontend/core/utils.js'), 'utf8');

async function run() {
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const { csvCell, esc } = await import(moduleUrl);

  for (const value of [
    '=SUM(1,1)',
    '+cmd',
    '-cmd',
    '@cmd',
    '\t=cmd',
    '\r=cmd',
    '\n=cmd',
  ]) {
    assert.match(
      csvCell(value),
      /^"'/,
      `formula/control prefix neutralized: ${JSON.stringify(value)}`,
    );
  }

  assert.equal(csvCell('normal, "quoted"'), '"normal, ""quoted"""');
  assert.equal(csvCell('plain'), '"plain"');
  assert.equal(
    esc('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;',
  );
  assert.equal(esc(123), '123');
  assert.equal(esc(false), 'false');
  assert.equal(esc(12n), '12');
  assert.equal(esc(null), '');
  assert.equal(esc(Symbol('non-scalar')), '');
  assert.equal(esc(['untrusted object']), '');
  assert.equal(esc({ toString: null, valueOf: null }), '');
  assert.equal(esc({ toString: '<svg onload=alert(1)>', valueOf: null }), '');
  assert.equal(
    esc({
      [Symbol.toPrimitive]: () => {
        throw new Error('must not run');
      },
    }),
    '',
  );
  assert.equal(
    esc({
      get toString() {
        throw new Error('must not run');
      },
    }),
    '',
  );

  assert.equal(csvCell({ toString: null, valueOf: null }), '""');
  assert.equal(
    csvCell({
      [Symbol.toPrimitive]: () => {
        throw new Error('must not run');
      },
    }),
    '""',
  );
  assert.equal(csvCell(Symbol('non-scalar')), '""');
  console.log(
    'HTML/CSV safety OK — scalar coercion, hostile objects, formula prefixes and quoting covered.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
