# Frontend Modularization Wave

## Objective

Stop extracting one feature per PR. Complete the remaining frontend modularization as one controlled feature wave, then return to smaller PRs only for functional changes.

## Current baseline

The application has already extracted:

- `frontend/core/api.js`
- `frontend/core/dom.js`
- `frontend/core/state.js`
- `frontend/core/storage.js`
- `frontend/core/utils.js`
- `frontend/features/auth.js`
- `frontend/features/payments.js`

`app.js` still owns the remaining dashboard, register, printing, bulk, administration, navigation, UI primitives, and composition logic.

## Feature pack in this ZIP

Safe-to-add modules that do not require `app.js` changes yet:

- `frontend/core/ui.js`
- `frontend/features/dashboard.js`
- `frontend/features/register.js`
- `frontend/features/printing.js`
- `frontend/features/bulk.js`
- `frontend/features/administration.js`
- `frontend/features/navigation.js`

These modules are designed as factories/controllers with explicit dependencies. They avoid importing `app.js` and are intended to be wired once from the composition root.

## Target architecture

```text
index.html
   |
   v
frontend/main.js                 <- single composition root
   |
   +-- core/api.js
   +-- core/state.js
   +-- core/storage.js
   +-- core/utils.js
   +-- core/ui.js
   |
   +-- features/auth.js
   +-- features/payments.js
   +-- features/dashboard.js
   +-- features/register.js
   +-- features/printing.js
   +-- features/bulk.js
   +-- features/administration.js
   +-- features/navigation.js
```

## Composition rule

`main.js` is the only file responsible for assembling controllers and resolving circular dependencies with getter callbacks.

Feature files should not know about the existence of `app.js`.

`app.js` should ultimately become a compatibility entry point or be removed from the HTML entry path.

## Next integration change

One integration PR should make these changes together:

1. Move the remaining application orchestration from `app.js` into `frontend/main.js`.
2. Import and instantiate all feature controllers from `main.js`.
3. Replace the current dynamic `main.js -> app.js` loading path.
4. Keep `app.js` as a minimal compatibility shim until the PWA cache has been updated and verified.
5. Add all module files required by the composition root to `sw.js`'s app-shell cache list.
6. Keep the existing ES-module ESLint configuration; no new ESLint architecture change is required for `frontend/**/*.js`.

## Verification strategy

Do not add test/demo/sample data.

For the integration PR:

- `npm run check`
- `git diff --check`
- verify all feature files are imported exactly once
- verify no feature function definitions remain in `app.js`
- verify `index.html` has one frontend module entry point
- verify `sw.js` contains the module app shell
- verify `app.js` is not used as the active application implementation

## Faster project cadence

After the current payment PR:

### Wave 1 — Remaining frontend modularization

Dashboard + Register + Printing + Bulk + Administration + Navigation + UI + composition root.

One feature-wave branch, one PR, one merge boundary.

### Wave 2 — PWA / production reliability

Service-worker cache versioning, offline shell behavior, reconnect handling, cache invalidation, deployment checks.

### Wave 3 — Observability / recovery

Operational logging, backup/recovery controls, production health checks, release verification.

This removes the need for a separate PR for every individual frontend feature extraction.

## Intentionally deferred

- UI redesign
- backend API redesign
- database/schema changes
- sample/demo data
- automated browser test framework

Those are separate concerns and should not be mixed into the modularization wave.
