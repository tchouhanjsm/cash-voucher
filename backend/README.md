# Backend layout

Apps Script loads every `.gs` file into **one global scope**, in file-name order. The files are numbered so the order is explicit.

| File                   | Owns                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `00-config.gs`         | `CFG`, `PERMS`. Loaded first.                               |
| `10-setup.gs`          | One-time `setup()`.                                         |
| `15-migrations.gs`     | Guarded, owner-run schema migrations.                       |
| `20-backup.gs`         | Backup, integrity report, restore support.                  |
| `25-helpers.gs`        | Sheets access, validation, audit helpers, password hashing. |
| `30-entry.gs`          | `doGet`, `doPost`, request validation, `route_`.            |
| `40-auth.gs`           | Login, session, lock.                                       |
| `45-bootstrap.gs`      | Bootstrap payload and voucher output shape.                 |
| `50-vouchers.gs`       | Create, edit, cancel, receipts, numbering, cash impact.     |
| `52-approvals.gs`      | High-value payment approval.                                |
| `54-cash-close.gs`     | Daily cash close, corrections.                              |
| `60-vendors.gs`        | Vendors and vendor identity.                                |
| `70-users.gs`          | Users and password management.                              |
| `80-settings-audit.gs` | Settings and audit log.                                     |
| `99-routes.gs`         | `ACTIONS` and `WRITES`. Loaded last.                        |

## Rules

1. **A new feature gets its own file** with the next free number between its neighbours, for example `55-reports.gs`.
2. **Register routes only in `99-routes.gs`.** It reads every handler when it loads, so it must come last.
3. **No duplicate top-level names across files.** Apps Script silently keeps the last one. `npm run check:backend` fails the build if this happens.
4. **No top-level code that runs at load time** except constant tables in `00-config.gs` and `99-routes.gs`.
5. `clasp push` uploads the folder as is. The tests, lint and syntax check read `backend/*.gs` in the same sorted order.
