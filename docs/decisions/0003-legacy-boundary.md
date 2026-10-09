# ADR 0003 — Legacy Frontend Boundary

**Status: historical / superseded for runtime entry.**

## Original decision

During modularization, retain root `app.js` as a compatibility implementation until the module composition root has behavioral parity. Deleting a legacy path and changing runtime ownership in the same patch would have expanded the failure surface.

## Current state

`index.html` loads `frontend/main.js` directly. `frontend/main.js` composes the active ES modules. Root `app.js` remains in the repository but is not loaded by the HTML entry point.

## Guardrail

Do not delete `app.js` as incidental cleanup. If removing it is desired, use a separate owner-reviewed PR that checks references/history and proves that no deployed or supported workflow depends on it. Do not force-update or rewrite history without explicit owner permission.
