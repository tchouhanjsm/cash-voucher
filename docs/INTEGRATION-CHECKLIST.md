# Frontend Modularization Wave — Integration Checklist

## Goal

Move the remaining frontend feature logic out of `app.js` without changing backend contracts or introducing a UI framework.

## Rules

1. `frontend/main.js` becomes the composition root.
2. `frontend/core/*` contains reusable infrastructure only.
3. `frontend/features/*` owns feature behavior.
4. Features receive dependencies through factory arguments; do not import application-local functions from `app.js`.
5. Keep one delegated `[data-act]` click listener.
6. Do not add another dependency/library unless it solves a demonstrated problem.
7. `app.js` should become a compatibility/bootstrap layer, then be retired.

## Integration order

1. Add the feature pack.
2. Run formatting and quality checks.
3. Move reusable UI helpers to `core/ui.js`.
4. Move action registration to `core/actions.js`.
5. Create feature controllers in `main.js`.
6. Register all `data-act` handlers once.
7. Reduce `app.js` to bootstrap/compatibility code.
8. Update `sw.js` only after the module graph is final.
9. Run the complete quality gate.

## Do not do

- Do not rewrite the backend.
- Do not change API action names.
- Do not redesign the UI in this wave.
- Do not introduce React/Vue/Svelte.
- Do not add a bundler unless the native module graph proves insufficient.
