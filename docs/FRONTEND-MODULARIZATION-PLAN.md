# Frontend Modularization Plan — Status

**Status: core module extraction/composition is implemented in the active source tree.** This file is retained as a historical planning record; the former step list is not a current TODO.

## Current runtime

- `index.html` loads `frontend/main.js`.
- `frontend/main.js` instantiates the feature factories and registers action handlers.
- `frontend/core/` contains shared API, DOM, state, storage, queue, UI and dispatch modules.
- `frontend/features/` contains auth, payments, dashboard, register, bulk, administration, navigation and printing.
- `sw.js` has an app-shell list that must stay aligned with the active module graph.
- Root `app.js` still exists, but it is not loaded by the HTML entry point.

## What is complete

The current implementation no longer depends on a future "move the rest out of app.js" integration wave. Existing PRs #6–#9 and the later feature/queue waves established the modules and current composition root. PRs #18–#21 hardened the offline store and recovery behavior.

## Guardrails for future modular work

1. Trace each active import from `index.html` and `frontend/main.js` before touching modules.
2. Keep feature dependencies explicit and avoid one feature importing another feature's private implementation.
3. Register shared `data-act` handlers in `frontend/core/actions.js` and the composition root; keep intrinsic feature listeners inside their feature.
4. Update `sw.js` cache version and shell list only when the active graph actually changes.
5. Keep root `app.js` untouched unless a dedicated, reviewed removal task confirms it is safe to remove.
6. Prefer a cohesive user-visible outcome over file extraction for its own sake.
7. Verify all affected journeys using `npm run check` and `npm run test:e2e`.

The next major frontend improvement should be a measured design/accessibility pass, not another broad architectural rewrite. See `docs/UI-UX-REVIEW.md` and `docs/PRODUCT-ROADMAP.md`.
