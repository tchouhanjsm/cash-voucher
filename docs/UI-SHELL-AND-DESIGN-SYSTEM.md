# UI shell and design system

Status: phases 1–2 shipped; phase 3 shared page components are in this PR. Phase 4 remains on the UI roadmap.

## Approach

No Figma file is imported. The app is vanilla JS with no build step, so the layout follows the patterns used by free admin kits (Tabler, shadcn/ui dashboard blocks, Untitled UI free) and is written as CSS tokens plus small modules. To apply a specific Figma kit later, copy its colors, radius, spacing and type scale into the `:root` tokens in `style.css`; the markup does not change.

## Phase 1 — app shell (PR #117)

- Top bar: logo, property name, connection pill (Online or Offline), user menu with avatar initials, name and role.
- User menu: My profile, Change PIN, Sign out. Keyboard: Esc closes and returns focus.
- Sidebar: grouped as Work, Money, Manage. Sign out is always visible on desktop.
- Profile page: avatar, name, email, role, property, Install app, Sign out, Change PIN.
- Logo: `icons/logo.svg`, original mark, used in the sidebar, the top bar and the service-worker cache.
- Module: `frontend/features/shell.js`. Tokens: `--radius`, `--shadow-1`, `--shadow-2`, `--topbar-h`.

## Phase 2 — mobile navigation

- Replace the horizontally scrolling mobile navigation with four shortcuts: Dashboard, New Entry, Register and Reports, where permitted by role.
- Put remaining role-authorized routes in a bottom More sheet. The list follows the current navigation permissions and online/offline route allowlist; the sheet never grants a route the user cannot already open.
- The sheet has an accessible dialog name, outside-click and Escape closing, focus containment, and focus return to the More trigger. Staff/accountant users with no additional routes receive a clear empty state rather than hidden privileged links.
- Bump the service-worker cache revision so installed PWAs can receive the updated shell.

## Phase 3 — shared page components

- Page headers render semantic breadcrumbs, one H1, an optional description, and a right-aligned action slot. Dashboard and Register show a create-permitted “New entry” primary action; unauthorized roles do not receive that control.
- Shared `formPanel` wraps a semantic form with a heading/description and optional supporting content. Vendor and user administration adopt the same panel without changing form IDs or delegated actions.
- Shared `tableView` renders escaped column labels, scoped headers, a caption, an accessible horizontally scrollable region, and a visible empty row. Reports, vendors and users use this implementation; API/user-derived row cells remain escaped by their feature renderers.
- Shared `emptyState` presents a clear initial report state with a reachable Run report action.
- E2E assertions cover breadcrumbs, role-aware primary actions, shared forms/tables and the report initial empty state. Service-worker cache advances with the shell CSS/UI changes.

## Roadmap

| Phase | Outcome |
| ----- | ------- |
| 4     | Dark mode and print-safe tokens; swap tokens to the chosen kit palette; PWA splash and icons. |

## Rules

- Identity, status and sign-out belong in the shell, never inside a page.
- New components use tokens, not raw colors. Contrast is checked by `npm run check:contrast`.
- No inline scripts or handlers (CSP). Use `data-act` actions or module listeners.
