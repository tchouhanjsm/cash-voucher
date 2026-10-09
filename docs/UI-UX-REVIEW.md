# UI/UX Source Review

**Scope:** static review of the current PWA shell and feature architecture against the supplied review memo. This is not a pixel-level visual approval: no live hotel session or real-device visual/usability study was performed in this documentation pass.

## What is already better than the legacy review described

- `index.html` loads the modular `frontend/main.js` entry point rather than relying on the old monolithic path.
- The shell includes a skip link, form labels, status/live regions, a login error announcement, a navigation landmark and dialog semantics.
- The UI shares rendering helpers in `frontend/core/ui.js` and CSS styling in `style.css`.
- The app has explicit dashboard, register, payment, bulk, administration and account flows.
- Offline status is surfaced to users; recovery actions are available rather than silently discarding the outbox.
- Browser E2E captures desktop and mobile viewport screenshots, but a screenshot capture alone does not prove visual quality or accessibility.

The old memo's numerical UI scores referred to a different implementation and were **not copied forward**.

## Gaps to evaluate

1. **Visual hierarchy:** test whether key totals, current view title, primary action and sync status have consistent priority at 390px and desktop widths.
2. **Design-system consistency:** inspect colors, typography, spacing, radii, borders, shadows, focus rings and disabled states for token coverage; avoid component-specific one-off styling.
3. **Cash-control semantics:** present money with stable tabular digits, currency/locale consistency, explicit payment-vs-receipt type and plain-language statuses.
4. **Offline clarity:** distinguish “saved on this device / waiting to upload” from server-confirmed success; keep pending/recovery/discard controls visible without making the banner dominate every page.
5. **Register density:** verify columns, filters, horizontal overflow, focus and cancellation state remain understandable on a phone. Ensure CSV/export actions are discoverable.
6. **Accessible interaction:** measure text/background contrast; test keyboard navigation and visible focus, dialog focus/escape/return behavior, zoom/reflow, touch targets, reduced motion and screen-reader announcements. Color must not be the only state signal.
7. **Error and empty states:** replace raw/technical failures with actionable language while retaining diagnostic details for developers; ensure dashboard/register/audit views explain “no records” versus “failed to load.”
8. **Print fidelity:** verify the printable voucher is clean, independent from glass/translucent screen treatments, and legible when physically printed.
9. **Audit discoverability:** audit data is available in Settings today, but has no dedicated navigation route or advanced filters/export. Evaluate the access pattern with the owner before exposing more sensitive event details.

## Design direction

- Start with hierarchy, spacing, readable type, component consistency and accessible states.
- Use a quiet, warm-neutral base with a restrained accent and clear semantic status colors; keep the existing brand direction only if it supports clarity.
- Glassmorphism should be progressive enhancement for contextual overlays, not an app-wide surface. Use opacity and blur only behind clear separation layers, check contrast with blur/opacity, and provide a solid fallback.
- Avoid low-contrast muted text, translucent table rows, blur behind financial amounts and needless animation.
- Prefer one primary action per task screen, clear destructive-action confirmation and resilient mobile forms.

## Verification plan for the dedicated design phase

- Capture and inspect dashboard, new payment/receipt, register, Settings/audit, bulk import, modal/error and offline banner at phone/tablet/desktop widths.
- Run an automated accessibility scan plus manual keyboard and screen-reader checks.
- Measure WCAG AA text contrast and document actual ratios for any exceptions.
- Test with a staff, manager and owner using realistic but non-production data; observe task completion and errors.
- Add targeted browser assertions where behavior can be automated; don't treat automated scores as a substitute for usability research.

## Responsive and keyboard guardrails — October 2026

PR #49 adds regression coverage at 320, 360, 390, 768, 801, 1024 and 1280 CSS-pixel widths for both Dashboard and Register page-level overflow. Horizontal scrolling remains allowed inside purpose-built containers such as the mobile navigation and register table wrapper.

Mobile navigation controls now have a minimum 44px height. Browser E2E checks the target height at mobile widths and verifies that keyboard navigation exposes the shared 3px focus indicator.

These automated checks cover selected layouts and focus behavior only. They do not replace manual keyboard traversal, screen-reader testing, zoom/reflow evaluation, a complete WCAG contrast audit or testing on real devices.

## Implemented foundation — October 2026

The current UI foundation batch makes two low-risk, cross-screen improvements:

- The shared muted-text token is darkened from `#667585` to `#596978` to improve legibility on the light surfaces used by labels, metadata, table headings and supporting text.
- Cancelled register rows now use the shared muted token instead of a lighter one-off gray; cancellation remains indicated by the explicit status label and struck-through amount rather than relying on color alone.
- Dashboard statistics, chart values, register amounts and printed voucher amounts use tabular numerals for easier financial comparison.
- Browser E2E now checks the mobile viewport for page-level horizontal overflow and verifies the financial-number and muted-color styles.

This is a focused foundation change, not a complete redesign or formal WCAG conformance claim. CI/E2E results and the exact reviewed head are authoritative in the PR. Real-device, keyboard/screen-reader, contrast-tool and role-based usability checks remain open.

## Phase boundary

Phase 22 addresses authentication controls and documentation drift. It does not change visual styling, markup, or feature navigation. A visual redesign should follow the separate design/acceptance review above, so it can be tested without mixing security changes into the visual diff.

## Follow-up: backup status clarity

The owner Settings screen now includes a `🛡️ Backup & recovery` status panel with configuration presence, retention period, last attempt, last recorded success and the latest recorded error. The panel explicitly states that recorded metadata does not prove Drive contents are complete or that a restore will succeed. It is owner-only through the server API permission check; mock E2E covers the visible never-run state. This is an operational status affordance, not the broader visual redesign. Real-device contrast/usability and a live restore drill remain outstanding.


## Measured contrast audit — October 2026 (PR #50)

Ratios below are calculated from the current CSS token values and specified UI pairings using the WCAG relative-luminance formula. They are source-based measurements, not a claim that every rendered state or surface has been audited.

| Pairing | Before | WCAG target | Disposition |
| --- | ---: | ---: | --- |
| Shared muted text `#596978` on white | 5.65:1 | 4.5:1 for normal text | Pass |
| Shared muted text `#596978` on page `#f3f5f7` | 5.17:1 | 4.5:1 for normal text | Pass |
| Error `#b3261e`, success `#1b7a43`, warning `#9a6700` text on white | 6.54:1, 5.37:1, 4.87:1 | 4.5:1 for normal text | Pass |
| Control border `#c9d1d9` on white | 1.54:1 | 3:1 where the boundary is needed to identify a control | Fix in PR #50 |
| Focus ring `#725018` on dark brand `#1f3a4d` | 1.62:1 | 3:1 for visible non-text focus indication | Fix in PR #50 |
| Chart hover accent `#b8862f` on chart track `#eef1f4` | 2.84:1 | 3:1 for meaningful graphical objects | Fix in PR #50 |

PR #50 changes the shared control-border token to `#7b8792`, adds a light focus token `#f3d28a` for keyboard-focused navigation on dark surfaces, and darkens the chart accent to `#9b6b1c`. Browser E2E computes contrast ratios from CSS tokens and asserts the selected text pairings meet 4.5:1 and selected non-text pairings meet 3:1. It also checks focus returns to the receipt trigger when its dialog closes.

This is a targeted token-pair audit. It does not prove conformance for every component, state, browser, or translucent/overlapping surface. Manual review of dialogs, screen-reader announcements, 200%/400% zoom and reflow, reduced motion, real devices and role-specific workflows remains open.
