'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const actionMap = JSON.parse(
  fs.readFileSync(path.join(root, 'api/v1/legacy-action-map.json'), 'utf8'),
);
const routeSource = fs.readFileSync(path.join(root, 'laravel/routes/api.php'), 'utf8');
const adapterSource = fs.readFileSync(path.join(root, 'frontend/core/laravel-api.js'), 'utf8');
const transportTests = fs.readFileSync(
  path.join(root, 'test/test-laravel-api-transport.js'),
  'utf8',
);
const legacyRouteSource = fs.readFileSync(path.join(root, 'backend/99-routes.gs'), 'utf8');

const STATES = new Set(['implemented', 'partial', 'planned']);
const routeDefinitions = new Set();
const routePattern = /Route::(get|post|patch|put|delete)\(\s*(['"])([^'"]+)\2/g;

for (const match of routeSource.matchAll(routePattern)) {
  routeDefinitions.add(match[1].toUpperCase() + ' ' + match[3]);
}

function expandPath(value) {
  const optional = value.match(/^(.*)\[([^\]]+)\]$/);
  return optional ? [optional[1], optional[1] + optional[2]] : [value];
}

function hasServerRoute(methods, routePath) {
  const acceptedMethods = Array.isArray(methods) ? methods : [methods];
  return acceptedMethods.some((method) =>
    expandPath(routePath).some((candidate) =>
      routeDefinitions.has(String(method).toUpperCase() + ' ' + candidate),
    ),
  );
}

function hasAdapterAction(action) {
  return adapterSource.includes("case '" + action + "':");
}

assert.equal(actionMap.schemaVersion, 2, 'action map v2 must declare split server/client coverage');
assert.ok(actionMap.actions && typeof actionMap.actions === 'object');

let implemented = 0;
let partial = 0;
let planned = 0;

for (const [name, entry] of Object.entries(actionMap.actions)) {
  assert.ok(STATES.has(entry.serverState), name + ' must declare serverState');
  assert.ok(STATES.has(entry.clientState), name + ' must declare clientState');
  assert.ok(STATES.has(entry.state), name + ' must declare aggregate state');

  const expectedState =
    entry.serverState === 'implemented' && entry.clientState === 'implemented'
      ? 'implemented'
      : entry.serverState !== 'planned' || entry.clientState !== 'planned'
        ? 'partial'
        : 'planned';
  assert.equal(
    entry.state,
    expectedState,
    name + ' aggregate state must match server/client states',
  );

  if (entry.serverState === 'implemented') {
    assert.ok(
      hasServerRoute(entry.method, entry.path),
      name + ' claims server implementation but no matching Laravel route exists: ' + entry.path,
    );
  }

  if (entry.clientState === 'implemented' || entry.clientState === 'partial') {
    assert.equal(typeof entry.adapterAction, 'string', name + ' must name its adapter action');
    assert.ok(
      hasAdapterAction(entry.adapterAction),
      name + ' claims client coverage but its adapter action is missing: ' + entry.adapterAction,
    );
  } else {
    assert.equal(
      entry.adapterAction,
      null,
      name + ' must not name an unimplemented adapter action',
    );
  }

  if (entry.state === 'implemented') implemented++;
  else if (entry.state === 'partial') partial++;
  else planned++;
}

const bulk = actionMap.actions.createVouchers;
assert.equal(bulk.capabilities?.bulkImport, 'implemented');
assert.equal(bulk.capabilities?.singleEntry, 'implemented');
assert.equal(bulk.capabilities?.bulkImportPath, '/imports/vouchers');
assert.match(routeSource, /Route::post\(\s*['"]\/imports\/vouchers['"]/);
assert.match(adapterSource, /mutate\(\s*['"]\/imports\/vouchers['"]/);
assert.match(transportTests, /voucher-import-batch/);
assert.match(transportTests, /quarantinedCount/);

const legacyActionsBlock = legacyRouteSource.match(/const ACTIONS = \{([\s\S]*?)\n\};/);
assert.ok(legacyActionsBlock, 'the Apps Script ACTIONS registry must remain discoverable');
const legacyActionNames = Array.from(
  legacyActionsBlock[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):\s*[A-Za-z_$][A-Za-z0-9_$]*,?\s*$/gm),
  (match) => match[1],
).sort();
const inventoriedActionNames = Object.keys(actionMap.actions).sort();
assert.deepEqual(
  inventoriedActionNames,
  legacyActionNames,
  'every Apps Script operation must have exactly one parity-map entry',
);

assert.ok(actionMap.fieldContracts, 'legacy request/response field parity must be inventoried');
for (const field of [
  'sourceRecordId',
  'sourceSystem',
  'sourceApprovalStatus',
  'sourceVoucherNo',
  'sourceReceipts',
  'duplicateConfirmationToken',
  'eventCategory',
  'nextCursor',
]) {
  assert.ok(
    adapterSource.includes(field),
    'the browser adapter must explicitly map audited field ' + field,
  );
}
for (const action of ['voucherHistory', 'checkVoucherDuplicates']) {
  assert.equal(actionMap.actions[action].state, 'implemented');
  assert.equal(actionMap.actions[action].clientState, 'implemented');
  assert.equal(actionMap.actions[action].serverState, 'implemented');
}
assert.equal(actionMap.shadowResources.voucherImport.state, 'implemented');
assert.equal(actionMap.shadowResources.voucherImport.maxRows, 100);

assert.equal(
  actionMap.actions.checkPaymentDuplicates.path,
  '/vouchers/duplicate-check',
  'the map must describe the route actually called by the adapter',
);
assert.equal(
  actionMap.actions.dailyOperationsSummary.path,
  '/cash-closes/preview',
  'daily operations preview must map to the registered cash-close preview route',
);
const shadowResources = actionMap.shadowResources || {};
assert.ok(
  shadowResources.entrySuggestions,
  'Laravel-only entry suggestions must be inventoried separately',
);
for (const [name, entry] of Object.entries(shadowResources)) {
  assert.ok(STATES.has(entry.serverState), name + ' shadow resource must declare serverState');
  assert.ok(STATES.has(entry.clientState), name + ' shadow resource must declare clientState');
  assert.ok(STATES.has(entry.state), name + ' shadow resource must declare aggregate state');
  const expectedState =
    entry.serverState === 'implemented' && entry.clientState === 'implemented'
      ? 'implemented'
      : entry.serverState !== 'planned' || entry.clientState !== 'planned'
        ? 'partial'
        : 'planned';
  assert.equal(
    entry.state,
    expectedState,
    name + ' shadow resource aggregate state must match coverage',
  );
  if (entry.serverState === 'implemented') {
    assert.ok(hasServerRoute(entry.method, entry.path), name + ' shadow resource route must exist');
  }
  if (entry.clientState === 'implemented' || entry.clientState === 'partial') {
    assert.equal(typeof entry.adapterAction, 'string');
    assert.ok(
      hasAdapterAction(entry.adapterAction),
      name + ' shadow resource adapter case must exist',
    );
  } else {
    assert.equal(entry.adapterAction, null);
  }
}

for (const action of ['saveUser', 'resetPassword', 'saveSettings']) {
  assert.equal(
    actionMap.actions[action].state,
    'implemented',
    action + ' must be end-to-end mapped',
  );
  assert.equal(actionMap.actions[action].clientState, 'implemented');
  assert.equal(actionMap.actions[action].serverState, 'implemented');
}

for (const action of [
  'recordedMovementReport',
  'cashClosePreview',
  'createCashClose',
  'recordCashCloseCorrection',
]) {
  assert.equal(actionMap.actions[action].state, 'implemented', action + ' must be fully mapped');
  assert.equal(actionMap.actions[action].clientState, 'implemented');
  assert.equal(actionMap.actions[action].serverState, 'implemented');
}
assert.match(adapterSource, /stableIdempotencyKey\('user-save'/);
assert.match(adapterSource, /stableIdempotencyKey\('user-reset'/);
assert.match(adapterSource, /stableIdempotencyKey\('settings-save'/);

console.log(
  'Laravel operation parity OK — ' +
    Object.keys(actionMap.actions).length +
    ' actions inventoried; ' +
    implemented +
    ' end-to-end implemented; ' +
    partial +
    ' partially implemented; ' +
    planned +
    ' planned; every claimed route and adapter action verified.',
);
