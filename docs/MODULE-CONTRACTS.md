# Frontend Module Contracts

These contracts describe the modules wired by the current `frontend/main.js`. Update this document when a public factory argument or returned method intentionally changes.

## Core modules

| Module                           | Public surface                                                                                     | Responsibility                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `frontend/core/api.js`           | `createApi({ getUrl, getToken })`                                                                  | JSON POST transport, timeout and normalized API errors           |
| `frontend/core/dom.js`           | `$`, `$$`                                                                                          | DOM querying                                                     |
| `frontend/core/state.js`         | `S`, `can`, `nm`, `isIn`, `vno`, `pays`, `recs`, `bySeq`, `rcats`, `categories`                    | Shared state and derived voucher/permission helpers              |
| `frontend/core/storage.js`       | `ls`                                                                                               | Browser localStorage wrapper                                     |
| `frontend/core/ui.js`            | `toast`, `fail`, `busy`, `closeModal`, `dialog`, `head`, `refreshBtn`                              | Common UI feedback, modal and page-header helpers                |
| `frontend/core/actions.js`       | `registerActions`, `installActionDelegation`                                                       | Cross-feature click action registry/delegation                   |
| `frontend/core/offline-queue.js` | `ready`, `enqueue`, `restore`, `list`, `count`, `claim`, `ack`, `release`, `clear`, `offlineQueue` | IndexedDB queue, migrations, leases and safe recovery operations |
| `frontend/core/utils.js`         | Pure formatting/validation/date/escaping/compression helpers                                       | Shared pure utilities                                            |

## Feature factories

### Authentication

Factory: `createAuth({ S, api, busy, dialog, closeModal, toast, start })`  
Returns: `showLogin`, `signOut`, `forcePinChange`, `handleApiError`.  
Owns login interaction, forced PIN-change dialog and inactivity/session feedback.

### Payments

Factory: `createPayments({ api, refresh })`  
Returns: `open`, `addRow`, `clearReceipt`, `showBanner`, `flushOutbox`, `exportOutbox`, `importOutbox`, `discardOutbox`.  
Owns payment/cash-receipt entry, receipt capture, pending queue display, recovery actions, cross-tab announcements and upload retry.

### Dashboard

Factory: `createDashboard()`  
Returns: `render` and `state`.  
Owns dashboard query range and aggregate presentation.

### Register

Factory: `createRegister({ api, go })`  
Returns: `bind`, `render`, `renderRows`, `clearFilters`, `csvExport`, `edit`, `cancel`, `receipts`, `state`.  
Owns filtering/search, register list and entry-level operations displayed according to the API-provided permission model.

### Bulk

Factory: `createBulk({ api, refresh, go })`  
Returns: `bind`, `render`, `parseInput`, `runImport`, `toggleDuplicates`, `goRegister`, `renderAgain`, `downloadTemplate`.  
Owns parse/preview/import workflow.

### Administration

Factory: `createAdministration({ api, getNavigation, signOut })`  
Returns: `bind`, `vendors`, `users`, `settings`, `account`, `handleSubmit`, `editVendor`, `toggleVendor`, `toggleUser`, `updateRole`, `resetPin`, `install`, `signOut`.  
The audit table is currently rendered from the owner Settings view by an internal API call to `auditLog`; there is no dedicated audit route/method today.

### Navigation

Factory: `createNavigation({ api, getAuth, getPayments, renderers })`  
Returns: `NAV`, `bind`, `load`, `start`, `go`, `refresh`.  
Owns navigation filtering, bootstrap, view routing and visibility-driven refresh.

### Printing

Stateless named exports: `amountInWords`, `printVoucher`.

## Integration rules

- `frontend/main.js` is the composition root; keep it wiring-focused.
- Server/API permissions are authoritative. UI guards improve usability only.
- Preserve action names when refactoring UI controllers.
- Keep feature-owned listeners local when they are intrinsic to a feature.
- When changing imports or cached modules, update and test `sw.js`.
