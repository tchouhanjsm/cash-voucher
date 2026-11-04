# Role-based workspace architecture — 4 November 2026

## Decision

Present the existing single-property application as three distinct workspaces:

- **User workspace** — short, task-led navigation for New Entry, My Records and the user's Dashboard. Avoid finance administration language and management navigation.
- **Admin workspace** — daily operations, review work, Register, Reports, Cash Close, vendor management and bulk operations, according to the existing permission set.
- **Owner workspace** — business oversight plus the existing owner-only User, Settings, Audit and onboarding controls.

The Accountant remains a separate read-only Finance workspace.

## Compatibility decision

The existing backend role keys are retained:

| Stored role / permission source | User-facing label | Workspace         |
| ------------------------------- | ----------------- | ----------------- |
| `staff`                         | User              | My workspace      |
| `manager`                       | Admin             | Admin workspace   |
| `owner`                          | Owner             | Owner workspace   |
| `accountant`                    | Accountant        | Finance workspace |

**Admin is a presentation label, not a new backend role.** Existing deployed Apps Script projects and customer instances may continue to store `manager`. Do not add an `admin` role key, silently rewrite user rows, or reinterpret role grants as part of a visual redesign.

## Authorization invariants

1. Navigation is rendered from the authenticated user's server-provided capability map. Workspace grouping never grants a capability.
2. `navigation.go()` and feature entry points continue to check the same capability before exposing a destination.
3. The Apps Script API remains the final authorization boundary until the replacement API is live and independently tested.
4. `users`, `settings`, `audit`, recovery and owner control endpoints remain owner-only. Admin must not create, disable or promote an Owner.
5. Staff can create and view only their own permitted records; no cross-user report or Cash Close route is added.
6. Accountant remains reports-only and does not gain Register, voucher entry, receipt access or administration.
7. Backend permission-matrix tests remain authoritative. New UI tests assert that labels and navigation do not drift away from those tests.

## Implemented UI behavior

- Workspace-specific navigation headings and sections.
- User-facing role labels in the shell and My Account profile.
- User-management labels show Admin while the submitted value remains `manager`.
- Mobile bottom navigation hides desktop workspace headings; the overflow panel retains its workspace title.
- Existing route visibility, permission checks, server actions and data scopes remain unchanged.

## Follow-on product considerations

- Keep the User experience task-first: create a payment/receipt, see own records, find pending/offline work, and get clear confirmation.
- Keep Admin focused on queues and daily work rather than property-wide configuration.
- Keep Owner controls separate and require explicit re-authentication for particularly high-impact actions when the replacement identity layer is introduced.
- Do not make UI-only checks the security control. Add server-side denial tests for every new route/action when backend modules change.

## Cross-disciplinary review

The design was reviewed across UX/information architecture, IAM and authorization, accounting/data integrity, database design, resilience/backup, hosting cost and release operations. There is no independent code-agent delegation tool connected in this session; no external agent approval is being represented as evidence.
