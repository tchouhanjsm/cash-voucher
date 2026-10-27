const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../frontend/core/utils.js'), 'utf8');

async function run() {
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const {
    addDays,
    businessDate,
    csvCell,
    esc,
    isBusinessDate,
    iso,
    scalarText,
  } = await import(moduleUrl);

  for (const value of ['=SUM(1,1)', '+cmd', '-cmd', '@cmd', '\t=cmd', '\r=cmd', '\n=cmd']) {
    assert.match(
      csvCell(value),
      /^"'/,
      `formula/control prefix neutralized: ${JSON.stringify(value)}`,
    );
  }

  assert.equal(csvCell('normal, "quoted"'), '"normal, ""quoted"""');
  assert.equal(csvCell('plain'), '"plain"');
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc(123), '123');
  assert.equal(esc(false), 'false');
  assert.equal(esc(12n), '12');
  assert.equal(scalarText('plain'), 'plain');
  assert.equal(scalarText(123), '123');
  assert.equal(scalarText(false), 'false');
  assert.equal(scalarText(12n), '12');
  assert.equal(scalarText(null), '');
  assert.equal(scalarText(Symbol('non-scalar')), '');
  assert.equal(scalarText({ toString: null, valueOf: null }), '');
  assert.equal(
    scalarText({
      get toString() {
        throw new Error('must not run');
      },
    }),
    '',
  );
  assert.equal(
    scalarText({
      [Symbol.toPrimitive]: () => {
        throw new Error('must not run');
      },
    }),
    '',
  );
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
  assert.equal(businessDate(new Date('2026-10-26T18:29:59.000Z')), '2026-10-26');
  assert.equal(businessDate(new Date('2026-10-26T18:30:00.000Z')), '2026-10-27');
  assert.equal(isBusinessDate('2024-02-29'), true);
  assert.equal(isBusinessDate('2026-02-29'), false);
  assert.equal(isBusinessDate('2026-13-01'), false);
  assert.equal(isBusinessDate('2026-1-01'), false);
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(iso(new Date('2027-01-01T00:00:00.000Z')), '2027-01-01');
  assert.throws(() => addDays('2026-02-30', 1), /valid business date/);
  assert.throws(() => addDays('2026-01-01', 1.5), /whole number/);
  for (const timezone of ['America/Los_Angeles', 'Pacific/Kiritimati']) {
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        `import('data:text/javascript;base64,${Buffer.from(source).toString('base64')}').then(({addDays,businessDate})=>console.log([addDays('2027-01-01',-1),businessDate(new Date('2026-10-26T18:30:00.000Z'))].join('|')))`,
      ],
      { encoding: 'utf8', env: { ...process.env, TZ: timezone } },
    );
    assert.equal(
      output.trim(),
      '2026-12-31|2026-10-27',
      `timezone-independent math in ${timezone}`,
    );
  }
  console.log(
    'HTML/CSV and business-date safety OK — India midnight, timezone independence, leap/year rollover and invalid inputs covered.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
