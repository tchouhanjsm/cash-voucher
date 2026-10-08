# ADR 0003 — Temporary Legacy Boundary

Status: Accepted

## Decision

Keep `app.js` as a compatibility implementation during frontend modularization. Do not remove it until the modular composition root demonstrates behavioral parity for the affected workflows.

## Rationale

A refactor that replaces runtime ownership and deletes the old path simultaneously has too large a failure surface. The legacy implementation provides a known behavioral reference while the module graph is assembled.

## Exit criteria

`app.js` can be retired only when:

1. `frontend/main.js` boots the application without importing `app.js`.
2. all required views are reachable.
3. authentication and session handling work.
4. payment and receipt workflows work.
5. register and bulk workflows work.
6. administration workflows work.
7. printing works.
8. offline queue behavior is preserved.
9. `npm run check` passes.
10. the affected behavior has been manually verified.
