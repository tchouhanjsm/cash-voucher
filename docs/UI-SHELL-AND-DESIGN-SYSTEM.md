# UI shell and design system

Status: FrontUI Studio (PR #151) and the light-first redesign (PR #157) are merged. Phase 23 applies the shared system consistently to real workflow screens and adds responsive browser regressions. Physical-device, zoom/reflow and assistive-technology validation remain release gates.

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

| Phase | Outcome                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4     | Establish the warm-neutral and navy/gold token palette, system-aware dark mode, persistent explicit theme choice, and light/dark contrast checks.             |
| 5     | Make A5 voucher printing independent of screen theme, with application chrome hidden and print layout/break behavior guarded by Browser E2E.                  |
| 6     | Align PWA launch metadata, browser theme color, Apple icon metadata, standard/maskable manifest icons, and the service-worker cache revision.                 |
| 7     | Keep owner admin list views from confusing transient request failures, invalid response envelopes, malformed rows and genuinely empty lists.                  |
| 8     | Add directly actionable retry paths for Users, Audit log and Backup status without forcing unrelated form resets or implying success before a retry succeeds. |

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

## Phase 7 — admin read states

- Users must not remain on an indefinite loading message if `listUsers` fails. Show a plain-language alert that separates the failed read from a valid empty user list.
- Vendors and Users keep invalid response envelopes/malformed records distinct from real empty collections, with a reachable Refresh action.
- Audit loading failures must not look like an empty history; keep the failure visible and give the owner a contextual retry.
- Backup status failure is an unknown state, never a green/success state. Make its own read retryable without rerendering Settings or discarding unsaved property edits.

## Phase 8 — local recovery actions and regression checks

- Users retry calls `listUsers` again without reloading the app.
- Audit retry repeats the audit read and leaves the failure row only until a response is received.
- Backup retry refreshes only the status panel in place; a subsequent server response is rendered normally.
- Browser E2E injects transient failures and verifies that each retry affordance recovers the screen. This is mock-backed regression evidence, not live Apps Script availability evidence.
- Existing server-side role checks and malformed-envelope/row handling remain the security boundaries; the retry controls do not expand permissions.

## Rules

- Identity, status and sign-out belong in the shell, never inside a page.
- New components use semantic tokens, not raw colors. `npm run check:contrast` checks the supported light and dark palettes; manual rendered-state checks remain required.
- No inline scripts or handlers (CSP). Use `data-act` actions or module listeners.

## Phase 9 — FrontUI Studio and shared UI kit (complete in PR #151)

**Merged main SHA:** `91b8b46f4a09b868db0157d6f89dcebd0d14eae0`. The exact PR head passed CI/quality, Browser E2E (382 checks) and Full Flight Test (281 backend plus 382 browser checks), with zero failures. The gallery remains a static design reference, not a production route.

- `frontend-ui-kit.css` is the shared, dependency-free visual layer loaded after `style.css`. It adds the 4px spacing scale, type and radius tokens, low-elevation surface rules, consistent field/button sizes, KPI hierarchy, table states and focus treatment without a framework, remote font, icon service or build step.
- `ui-studio.html` is a standalone, static component gallery. It documents palette, type, spacing, radius, elevation, buttons, fields, statuses, attention patterns, KPI cards, a keyboard-scroll table and light/dark treatments. It contains no scripts or inline styles and uses the same stylesheet pair as the live app.
- The component gallery is deliberately not an application route or a financial workflow. It is safe sample data for design review; no API, permission, approval, cash-impact, report or close behavior is changed.
- The app-shell cache revision advances to `cv2-v17` and precaches `frontend-ui-kit.css`. `scripts/verify-frontend-release.js` now requires the stylesheet to be both linked by `index.html` and present in the offline shell.
- The kit follows the existing warm-neutral, navy and gold palette. Spacing and typography tokens are centralized; status colors remain semantic and retain text labels. Dark-mode app tokens continue to come from the root `data-theme` palette.
- Acceptance is source and browser regression only. No screenshot gallery or automated token checks replace rendered-device inspection, manual keyboard traversal, zoom/reflow, screen-reader review or live-service validation.


## Phase 23 — production workflow adoption (candidate)

The Studio is a static reference page; it does not replace adoption in the real portal. This batch applies section context through the shared page header and standardizes the live New Entry form, Register filters, Daily Cash Close intro, Bulk Upload panel, and owner Settings layout. Settings groups editable property configuration separately from operational diagnostics on desktop and stacks those groups on smaller screens. The service-worker cache version advances with the shared UI-kit changes.

The batch intentionally adds no breadcrumb trail, financial rules, API routes, role permissions or schema changes. Source and browser checks cover targeted rendered CSS/layout behavior only; screenshots, physical-device interaction, zoom/reflow, manual keyboard traversal and screen-reader review remain human release checks. Treat this as candidate work until review, exact-head CI/E2E/Flight results, and owner merge.
