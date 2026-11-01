# Cash Voucher — TailAdmin-inspired finance workspace

**Date:** 1 November 2026  
**Repository:** `tchouhanjsm/cash-voucher`  
**Integration target:** `client-main`  
**Implementation branch:** `client/frontend-audit-44px-e2e-stability-20261101`  
**Reference:** [TailAdmin free Tailwind admin dashboard](https://github.com/Tailwind-Admin/free-tailwind-admin-dashboard-template)

## Objective

Translate the reference's clean admin dashboard language into a finance-focused Cash Voucher workspace without replacing the existing product architecture or importing a generic demo application.

The product should feel like a mature finance operations tool: clear information hierarchy, measured spacing, strong action hierarchy, calm surfaces, legible tables, restrained accent color and responsive navigation.

## Implemented batch

- A dedicated local `frontend-workspace.css` layer with shared canvas, surface, border, typography, radius, elevation and accent tokens.
- A light-first workspace and explicit dark-theme treatment that continues to use the existing selected palette accent.
- A wider desktop navigation rail with section labels, icon alignment, clear active state and compact sticky topbar.
- Consistent page headings, button hierarchy, form controls, filters, cards, tables, readiness panels and modal surfaces.
- A dashboard composition for the existing live KPI, trend, vendor/category breakdown, attention and empty-period states.
- Responsive tablet/mobile layouts that retain permission-filtered bottom navigation and the More sheet.
- Reduced-motion and forced-colors fallbacks, 44px interaction baseline and screen-only CSS scope.
- Static build and service-worker integration, cache revision `cv2-v43`, and dedicated regression checks.

## Architecture and data guarantees

The change preserves the Vanilla JavaScript module architecture, Apps Script API, server-side dashboard read models, authentication/session handling, permissions, Register paging, accounting rules, offline queue, IndexedDB data and print renderer.

Dashboard amounts and chart values continue to come from validated API responses. The stylesheet changes presentation only; it does not introduce template metrics or new client-side financial calculations.

## Deliberate non-imports

The design is adapted from the public reference; it is not a wholesale copy of the HTML demo package. No Tailwind compiler, Preline, jQuery, Iconify, external icon font, remote Google Font, CDN script or vendor runtime is added. This avoids new runtime dependencies and keeps the existing same-origin CSP and offline asset policy intact.

## Validation

The batch adds a dedicated workspace design-contract test and extends:

- static customer build asset inclusion,
- service-worker cache and offline shell allowlist,
- the npm regression test chain,
- engineering handoff and frontend audit records.

Fresh Quality, Browser E2E and Full Flight results must be produced on the latest PR head. Passing checks from the pre-milestone head are historical evidence only.

## Release boundary

Source-only implementation. No merge, deployment, Apps Script push, spreadsheet migration, staging financial write, cPanel publication or production change is part of this milestone.

## Extended workspace adoption — PR #258 candidate

- Extend the same local TailAdmin-inspired tokens and screen-scoped component language across Vendor Management, User Management, Settings, Audit, Bulk Upload, Daily Cash Close and Onboarding. Forms use visible labels; operational panels use consistent card, table, metric, status and responsive layouts.
- Preserve source-of-truth business data and actions: no demo values, new finance formulas, role changes, route changes or backend API mutations.
- Replace the repeatable New Entry row's HTML-string parser with DOM construction. Keep the active vendor master, ONE_TIME payee and `vendorId` contracts intact.
- Add customer build measurement metadata for public assets (raw bytes, gzip bytes and SHA-256) so a later bundling/minification decision can be made from exact build output rather than an unsupported claim.
- Tailwind's multi-framework reference remains a visual/design reference. No React/Next/Shadcn runtime or CDN assets are introduced.
