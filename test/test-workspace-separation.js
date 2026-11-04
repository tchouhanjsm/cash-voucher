'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const workspaces = read('frontend/core/workspaces.js');
const navigation = read('frontend/features/navigation.js');
const shell = read('frontend/features/shell.js');
const administration = read('frontend/features/administration.js');
const backendRoles = read('backend/00-config.gs');
const authorizationMatrix = read('test/test-authorization-matrix.js');
const styles = read('frontend-workspace.css');

assert.match(workspaces, /staff:\s*\{[\s\S]*?roleLabel:\s*'User',[\s\S]*?title:\s*'My workspace'/);
assert.match(
  workspaces,
  /manager:\s*\{[\s\S]*?roleLabel:\s*'Admin',[\s\S]*?title:\s*'Admin workspace'/,
);
assert.match(
  workspaces,
  /owner:\s*\{[\s\S]*?roleLabel:\s*'Owner',[\s\S]*?title:\s*'Owner workspace'/,
);
assert.match(workspaces, /accountant:\s*\{[\s\S]*?roleLabel:\s*'Accountant'/);
assert.doesNotMatch(workspaces, /\badmin\s*:/, 'Admin is a display label, not a new API role key');
assert.match(workspaces, /key:\s*'restricted'/);
assert.match(
  workspaces,
  /typeof role === 'string'/,
  'role objects do not trigger coercion hooks during workspace resolution',
);
assert.match(navigation, /workspaceForRole\(S\.me\?\.role\)/);
assert.match(
  navigation,
  /item\[3\]\(\)/,
  'navigation continues to use server-provided capabilities',
);
assert.match(navigation, /nav-workspace-title/);
assert.match(navigation, /workspace\.groups\[view\]/);
assert.match(navigation, /dataset\.workspace = workspace\.key/);
assert.match(shell, /displayRole\(S\.me\?\.role\)/);
assert.match(administration, /displayRole\(S\.me\?\.role\)/);
assert.match(administration, /const roles = \['staff', 'manager', 'accountant', 'owner'\]/);
assert.match(
  administration,
  /value="\$\{esc\(role\)\}"[\s\S]*?esc\(displayRole\(role\)\)/,
  'role selector interpolates only fixed role keys and escaped labels',
);
assert.match(administration, /<b>Admin<\/b>/);
assert.match(backendRoles, /manager:\s*\{[\s\S]*?reports:\s*1,\s*\},\s*owner:\s*\{/);
assert.match(
  backendRoles,
  /owner:\s*\{[\s\S]*?users:\s*1,[\s\S]*?settings:\s*1,[\s\S]*?audit:\s*1,/,
);
assert.doesNotMatch(backendRoles, /\n\s*admin:\s*\{/, 'backend role contract is unchanged');
assert.match(authorizationMatrix, /action:\s*'saveUser',[\s\S]*?allowed:\s*\['owner'\]/);
assert.match(authorizationMatrix, /action:\s*'saveSettings',[\s\S]*?allowed:\s*\['owner'\]/);
assert.match(authorizationMatrix, /action:\s*'auditLog',[\s\S]*?allowed:\s*\['owner'\]/);
assert.match(styles, /\.nav-workspace-title/);
assert.match(styles, /\.nav-more-workspace-title/);
assert.match(
  styles,
  /\.app > \.side \.nav-label,\s*\.app > \.side \.nav-workspace-title\s*\{\s*display:\s*none;/,
);
assert.match(styles, /min-height:\s*44px/);

// Execute the actual mapper: untrusted non-string roles must never be coerced.
const executable = workspaces
  .replace('export function workspaceForRole', 'function workspaceForRole')
  .replace('export function displayRole', 'function displayRole');
const context = {};
vm.runInNewContext(
  executable + '\nglobalThis.__workspaceApi = { workspaceForRole, displayRole };',
  context,
);
let coercions = 0;
const hostileRole = {
  toString() {
    coercions += 1;
    throw new Error('role coercion must not run');
  },
  [Symbol.toPrimitive]() {
    coercions += 1;
    throw new Error('role coercion must not run');
  },
};
assert.equal(context.__workspaceApi.displayRole(hostileRole), 'Restricted');
assert.equal(context.__workspaceApi.displayRole('manager'), 'Admin');
assert.equal(context.__workspaceApi.workspaceForRole('owner').groups.users, 'Owner controls');
assert.equal(coercions, 0, 'untrusted role objects are never coerced');

console.log(
  'Role workspaces OK — safe non-coercing role mapping, User/Admin/Owner/Accountant labels, and owner-only authorization preserved.',
);
