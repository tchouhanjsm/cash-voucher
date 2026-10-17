# UI shell and design system

Status: FrontUI Studio (PR #151), light-first redesign (PR #157), production-screen adoption (PR #159), responsive reporting/admin adoption (PR #160), Bulk Upload/Cash Close completion (PR #161), cross-workflow visual matrix (PR #162), navigation/accessibility contract (PR #163), validation/async-state work (PR #164), route-safe asynchronous views (PR #165), customer static packaging (PR #166) and password authentication/staging-readiness consolidation (PR #169) are merged. The verified main baseline is `8e18b4f3ed8601f70e192b6d32587675ad4cdb7b`; main CI passed. None of this certifies manual assistive-technology or live operational readiness.

## Approach

No Figma file is imported. The app is vanilla JS with no build step, so the design system is implemented as CSS tokens and small modules. The selected source palette is the reviewed warm-neutral surface, restrained navy identity and gold accent; it remains compatible with replacing color, radius, spacing and type-scale tokens from a chosen kit without changing markup.

## Phase 1 — app shell (PR #117)

- Top bar: logo, property name, connection pill (Online or Offline), user menu with avatar initials, name and role.
- User menu: My profile, Change password, Sign out. Keyboard: Esc closes and returns focus.
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

## Phase 23 — production workflow adoption (merged PR #159)

The Studio remains a static reference gallery, not a production route. PR #159 integrated the shared section eyebrow and responsive layout hooks into the live New Entry, Register, Daily Cash Close, Bulk Upload and Settings workflows. It also advanced the service-worker cache revision. Its exact PR head passed CI/quality, Browser E2E and Full Flight Test; the merge commit is `dabd39b2b70d516d714e08ac0cf6ed57fa806eee`.

The batch made no financial-rule, API, role-permission or schema changes. Screenshot comparison, physical-device interaction, zoom/reflow, manual keyboard traversal and screen-reader review remain human release checks.

## Phase 24 — reporting and administration workflow adoption (merged PR #160)

PR #160 completed responsive Report filters/results, Register totals, Vendor/User forms, Audit filters, Account/PIN layout and sign-in styling. Exact-head CI/quality, Browser E2E (418 checks) and Full Flight Test (285 backend + 418 browser checks) passed; post-merge main CI passed. It made no live deployment.

## Phases 25–27 — Fresh Design Studio workflow completion (merged PR #161)

PR #161 integrated shared presentation and accessibility states into Bulk Upload and Daily Cash Close, removed one-off inline style declarations from workflow surfaces, refreshed the app-shell cache, and added responsive/browser regressions. Tested head `27ceda070f38fe2a445e4e165fbbde20ee6377c9` passed CI, Browser E2E and Full Flight Test; merge SHA is `525f8d0a8af73194ca73c83d05b02d38c02d1b8c`.

## Phases 28–30 — cross-workflow visual regression and accessibility states (merged PR #162)

PR #162 merged at `754df59cf62ab228ec0d66f9d3f90dfae5eea3d1`; exact tested head `6f103e863cd0e7fe5c2f2ae12196e594134faec0` passed CI/quality, Browser E2E (898 checks) and Full Flight Test (285 backend + 898 browser checks). It adds a cross-screen responsive/theme matrix, higher-contrast and forced-colors coverage, and screenshot artifacts for human review; it does not claim visual or WCAG sign-off.

## Phases 31–33 — route focus and accessible interaction contract (merged PR #163)

PR #163 merged at `ae8eb594a33f7e33338009d75c52d0b010cea678`; exact tested head `a6b1eff7593bb7a58f4e6063fb31befd2a646773` passed CI/quality, Browser E2E (936 checks) and Full Flight Test (285 backend + 936 browser checks). It introduces opt-in page-heading focus, an accessible-name regression heuristic for 11 workflows, account-menu Escape/focus restoration and cache `cv2-v21`. These tests do not replace manual WCAG review.

## Phases 34–36 — form guidance and async-state consistency (candidate)

Branch: `phase-34-36-form-guidance-and-async-state-2026-10-17`, based on merged main SHA `ae8eb594a33f7e33338009d75c52d0b010cea678`.

- **Form guidance:** associate each dynamic cash-impact selector with its explanatory hint. Attach field error IDs in addition to, not instead of, persistent help; clearing an error removes only its own description token.
- **Report validation:** both date inputs are marked invalid when the range is rejected and reference the same alert. A valid request clears the invalid relationship; a stable results wrapper exposes the loading state with `aria-busy`.
- **Regression:** source assertions and browser tests check IDs, resolved descriptions, error state, recovery and the busy/settled wrapper. Styling makes invalid date fields visible while retaining existing contrast/forced-colors rules; app-shell cache advances to `cv2-v22`.
- **Boundary:** no accounting calculation, approval policy, permission, API, schema, dependency or production data change. Human keyboard traversal, screen-reader output, real devices, zoom/reflow and live operational checks remain separate release gates.

## Phases 37–39 — route-safe asynchronous view state (PR #165 merged)

The current source review found a late Report response rerendering the active workspace, plus stale/out-of-order Report requests and an equivalent risk in Users and post-save administration redraws. The batch sequences Report and Users requests, protects the destination route during async completion, and updates the shell cache to `cv2-v23`. E2E tests hold requests/save operations across navigation so route correctness is exercised against the browser and mock API, not inferred from CSS presence.

No shared component framework, external runtime resources, APIs, schemas or financial/authorization behavior are changed. Existing screenshot coverage supports visual review but does not replace manual review at real device sizes, zoom/reflow and assistive technology.
