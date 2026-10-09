# Frontend Integration Checklist

Use this checklist whenever an active frontend module, route, shared component or cached asset changes.

## Runtime and dependency graph

- [ ] Confirm `index.html` still has one active frontend entry point: `frontend/main.js`.
- [ ] Confirm composition happens in `frontend/main.js` and no feature imports another feature's private code.
- [ ] Confirm shared infrastructure remains in `frontend/core/` and feature workflows remain in `frontend/features/`.
- [ ] If the ES-module graph or shell changes, update and verify `sw.js` precache entries/cache version.
- [ ] Keep root `app.js` untouched unless removal is a specifically reviewed scope.

## Interaction and accessibility

- [ ] Keep one shared delegated click dispatcher for cross-feature `data-act` controls.
- [ ] Keep feature-specific submit/change/file listeners owned by their feature.
- [ ] Confirm keyboard/focus order, labels, status announcements, error feedback and responsive behavior.
- [ ] Verify empty, loading, validation, success, failure and offline states for the affected journey.
- [ ] Escape all untrusted text inserted into HTML/attribute templates.

## Data and failure behavior

- [ ] Preserve API action names/contracts unless an API change is explicitly in scope.
- [ ] Preserve role checks on the server; client navigation is only presentation.
- [ ] Test idempotency, stale-session behavior, timeouts/retries and local queue persistence where relevant.
- [ ] Confirm synced data versus device-local pending data is clearly distinguished.

## Required verification

~~~bash
npm run check
npm run test:e2e
git diff --check
~~~

Inspect desktop and mobile browser results for the touched workflow; don't infer visual quality solely from passing tests. No production Apps Script deployment is part of this checklist.
