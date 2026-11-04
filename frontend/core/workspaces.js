const WORKSPACES = Object.freeze({
  staff: { roleLabel: 'User', title: 'My workspace', groups: Object.freeze({ dash: 'My day', new: 'My day', reg: 'My records' }) },
  manager: {
    roleLabel: 'Admin', title: 'Admin workspace',
    groups: Object.freeze({ dash: 'Overview', new: 'Daily operations', reg: 'Daily operations', reports: 'Finance', cashClose: 'Finance', bulk: 'Administration', vend: 'Administration' }),
  },
  owner: {
    roleLabel: 'Owner', title: 'Owner workspace',
    groups: Object.freeze({ dash: 'Business overview', new: 'Operations', reg: 'Operations', reports: 'Finance', cashClose: 'Finance', bulk: 'Administration', vend: 'Administration', users: 'Owner controls', set: 'Owner controls', audit: 'Owner controls', onboarding: 'Owner controls' }),
  },
  accountant: { roleLabel: 'Accountant', title: 'Finance workspace', groups: Object.freeze({ reports: 'Reports' }) },
});
const RESTRICTED_WORKSPACE = Object.freeze({ roleLabel: 'Restricted', title: 'Restricted workspace', groups: Object.freeze({}) });
/** Presentation only. Backend role keys and permission checks remain authoritative. */
export function workspaceForRole(role) {
  return Object.prototype.hasOwnProperty.call(WORKSPACES, role) ? WORKSPACES[role] : RESTRICTED_WORKSPACE;
}
export function displayRole(role) {
  return workspaceForRole(role).roleLabel;
}
