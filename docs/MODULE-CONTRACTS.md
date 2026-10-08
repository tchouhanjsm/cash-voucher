# Frontend Module Contracts

## Contract format

Every feature should document its public surface in this form:

```text
Module:
Factory:
Dependencies:
Public methods:
Public state:
Listeners installed:
DOM roots owned:
API actions:
Side effects:
```

## Current target contracts

### Auth

Factory: `createAuth({ S, api, busy, dialog, closeModal, toast, start })`

Public methods:

- `showLogin`
- `signOut`
- `forcePinChange`
- `handleApiError`

Auth owns login form binding and session-idle behavior.

### Payments

Factory: `createPayments({ S, api, busy, toast, fail, refresh, head, vendorList, catOpts, vno, compress })`

Public methods:

- `open`
- `addRow`
- `clearReceipt`
- `showBanner`
- `flushOutbox`
- `discardOutbox`

Payments owns payment-entry UI, receipt attachment handling, offline queue, and online flush behavior.

### Dashboard

Factory: `createDashboard()`

Public methods:

- `render`

Public state:

- `state` (dashboard view state)

### Register

Factory: `createRegister({ api, go })`

Public methods:

- `bind`
- `render`
- `renderRows`
- `clearFilters`
- `csvExport`
- `edit`
- `cancel`
- `receipts`

Public state:

- `state`

### Bulk

Factory: `createBulk({ api, refresh, go })`

Public methods:

- `bind`
- `render`
- `parseInput`
- `runImport`
- `toggleDuplicates`
- `goRegister`
- `renderAgain`
- `downloadTemplate`

### Administration

Factory: `createAdministration({ api, getNavigation, signOut })`

Public methods:

- `bind`
- `vendors`
- `users`
- `settings`
- `account`
- `handleSubmit`
- `editVendor`
- `toggleVendor`
- `toggleUser`
- `updateRole`
- `resetPin`
- `install`
- `signOut`

### Navigation

Factory: `createNavigation({ api, getAuth, getPayments, renderers })`

Public methods:

- `NAV`
- `bind`
- `load`
- `start`
- `go`
- `refresh`

Navigation owns application loading, permission-filtered navigation, view selection, refresh, and visibility-based refresh behavior.

### Printing

Stateless exports:

- `amountInWords`
- `printVoucher`

Printing is intentionally not forced into a factory merely for symmetry.

## Event ownership

### Centralized action delegation

`frontend/core/actions.js` owns click delegation for `[data-act]` controls.

### Feature-owned listeners

Feature modules may own listeners for behavior that is intrinsic to the feature:

- auth: login form and activity timeout
- payments: receipt file changes, keyboard row navigation, new-payment submit, online flush
- bulk: preview/file-related changes
- register: filter inputs
- administration: settings/vendor/user form submission and install prompt
- navigation: navigation clicks and visibility refresh

Do not centralize every listener merely for uniformity.

### Special case: `change`

Not every `data-act` belongs to click delegation. For example, `data-act="urole"` is a select-change workflow and remains on the change-event path.
