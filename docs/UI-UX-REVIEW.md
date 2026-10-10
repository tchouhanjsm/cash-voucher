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

## Measured contrast and dialog keyboard behavior — October 2026

The source-token contrast pass is recorded in `docs/ACCESSIBILITY-CONTRAST-AUDIT.md`. It identified two concrete gaps: warning badge text at 4.34:1 against its pale-yellow surface, and the chart hover accent at 2.85:1 against the chart track. The warning token is now `#895b00` (5.26:1); the chart accent is now `#946515` (4.48:1). A dependency-free Node check verifies 19 explicitly selected pairs as part of `npm run check`.

Dialog keyboard behavior is also strengthened: Escape closes an idle dialog, and Browser E2E checks modal semantics, its accessible title, and focus restoration to the exact opener. Escape does not dismiss a dialog while its primary submit action is disabled.

This is a source-token audit, not a complete WCAG audit. Manual keyboard traversal, real screen-reader testing, rendered-state inspection and role-based usability review remain open.

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

## Modal background isolation and keyboard focus — October 2026

PR #52 makes the application container inert while a modal is open and restores its previous inert state on close. Browser E2E covers accessible modal/title semantics, background isolation, Tab/Shift+Tab wraparound, Escape handling when the primary action is disabled, and return of focus to the exact opener. This improves keyboard and assistive-technology isolation, but does not replace real screen-reader testing, dialog-by-dialog manual traversal, zoom/reflow checks, or testing across browser/assistive-technology combinations.

## Narrow payment-entry reflow and reduced motion — October 2026

PR #53 adds a compact-width layout for payment rows at widths up to 380 CSS pixels. Vendor input spans the row, amount and remove action sit on the next line, category and note fields stack, and the remove-row target is at least 44 × 44 CSS pixels. Browser E2E checks that the payment form has no page-level horizontal overflow at 320 CSS pixels and that the row geometry remains within the viewport.

The stylesheet already contained a `prefers-reduced-motion: reduce` rule; PR #53 adds a browser assertion that the preference is detected and transition/animation durations are minimized. These checks approximate the narrow viewport used by 400% zoom at a 1280px desktop width, but they do not simulate every browser zoom behavior or replace manual keyboard-order, real-device and assistive-technology checks.

## Register empty states — October 2026

PR #54 distinguishes a populated register whose current filters return no matches from a register with no vouchers available to show. The filtered-empty state exposes a polite status announcement and an in-context Clear filters action with a 44px minimum height. The no-data message includes safe next steps without assuming that an empty in-memory list proves the server has no historical vouchers. Browser E2E covers the filtered-empty state and recovery action; offline/real-device and assistive-technology behavior remain separate validation items.

## Receipt loading and register refresh feedback — October 2026

PR #55 adds explicit per-receipt loading status and a retry action when a receipt fetch or image validation fails. Failed receipt content is not cached, so retry can make a fresh request. The register refresh control announces its busy state, disables duplicate refresh clicks, and is restored if the request fails; the existing toast communicates the error while preserving the last rendered register data. Browser E2E injects one transient receipt failure and one bootstrap failure, then verifies recovery affordances. This does not prove live Google service behavior, real-device behavior, or screen-reader output across assistive-technology combinations.

## Staff mobile entry task clarity — October 2026

PR #56 improves the first staff-facing task journey without changing the underlying voucher model: the primary save action now names the selected workflow (payment or cash receipt), switches between singular and plural as entered rows change, and the saved result uses the same task terminology. Save outcomes are exposed as a polite status region. On mobile, the save button and payment/cash-receipt mode controls have a minimum 44px target height.

Browser E2E asserts the dynamic labels and touch-target dimensions at 320 CSS pixels. This is automated viewport coverage, not a substitute for staff observation on a physical phone, thumb-reach testing, screen-reader output checks, or validating manager and owner journeys.

## Manager register mobile review — October 2026

The manager register currently presents edit/cancel/receipt/print as compact controls inside a horizontally scrollable table. The mobile pass gives each voucher clearer type and amount identity, reflows the record into a compact card-like row at phone widths, arranges filters for narrow screens, and groups actions under an accessible label. Row action targets are raised to at least 44px on mobile. These are source-level and browser viewport guardrails; they do not establish real-device thumb reach, assistive-technology quality, or a complete WCAG conformance result. Existing capability checks are presentation only; server authorization remains authoritative.


## Owner audit discoverability — October 2026

The audit log has moved from the bottom of Settings to a dedicated owner-only navigation route. The view provides search, user/action filters, date bounds, an explicit loaded-record count, clear-filter recovery, and CSV export. It uses the existing `auditLog` API and keeps audit values rendered with `textContent`.

The current backend returns at most the latest 200 events. Filters and CSV export operate only on that loaded window; this is intentionally stated in the UI so users do not mistake a filtered export for a complete audit archive. The existing server permission remains the security boundary; a hidden navigation item is not authorization. Browser E2E covers route visibility for the owner, safe rendering of untrusted audit text, filtering, clearing, and CSV download. Live Google-account authorization and audit-history completeness remain unverified.
