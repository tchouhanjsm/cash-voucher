# UI shell and design system

Status: phases 1–3 shipped; phases 4–6 are grouped into the current design-system batch.

## Approach

No Figma file is imported. The app is vanilla JS with no build step, so the design system is implemented as CSS tokens and small modules. The selected source palette is the reviewed warm-neutral surface, restrained navy identity and gold accent; it remains compatible with replacing color, radius, spacing and type-scale tokens from a chosen kit without changing markup.

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

| Phase | Outcome                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4     | Establish the warm-neutral and navy/gold token palette, system-aware dark mode, persistent explicit theme choice, and light/dark contrast checks. |
| 5     | Make A5 voucher printing independent of screen theme, with application chrome hidden and print layout/break behavior guarded by Browser E2E.      |
| 6     | Align PWA launch metadata, browser theme color, Apple icon metadata, standard/maskable manifest icons, and the service-worker cache revision.     |

## Phase 4 — palette and theme behavior

- Use warm-neutral page surfaces, white/light cards, navy identity and gold accent; use the same named tokens for control borders, hover surfaces, semantic states and overlays instead of scattering new raw colors.
- The initial theme follows `prefers-color-scheme`. The account menu lets the user explicitly switch between light and dark; only an explicit choice is stored under `cv.theme`, while an unset choice continues following OS changes.
- The selected theme is applied to the document root, native browser control scheme and browser chrome `theme-color` metadata. The static manifest launch background remains brand navy so the installed-app splash matches the existing brand mark and boot screen.
- The contrast gate checks the light and dark palettes separately, including text, controls, semantic badges, warnings, chart track and focus indicators.

## Phase 5 — print-safe vouchers

- Voucher output remains A5 portrait with a 10mm page margin and is explicitly white paper / near-black ink regardless of current screen theme.
- Print media hides the application, login, boot overlay, modal, toast and skip link, and avoids breaking voucher sections across pages where possible.
- Browser E2E checks screen chrome visibility and computed print foreground/background rather than claiming physical-printer certification.

## Phase 6 — PWA launch consistency

- Keep the existing 192px, 512px and maskable PNG app icons; declare their sizes/types/purposes consistently in the manifest, link the 192px icon for browser and Apple touch usage, and add install metadata.
- Keep the manifest splash background aligned with the existing navy brand/boot surface; dynamic system theme applies after the app launches.
- Advance the app-shell cache and precache the new theme controller so installed PWAs request the revised launch metadata and theme code.

## Rules

- Identity, status and sign-out belong in the shell, never inside a page.
- New components use semantic tokens, not raw colors. `npm run check:contrast` checks the supported light and dark palettes; manual rendered-state checks remain required.
- No inline scripts or handlers (CSP). Use `data-act` actions or module listeners.
