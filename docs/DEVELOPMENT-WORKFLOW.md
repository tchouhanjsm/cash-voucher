# Development Workflow

## Session start and branch safety

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
npm run check
```

If the working tree is unexpectedly dirty, stop and reconcile it before editing. Start every phase branch from the latest merged `main` and leave existing branches untouched unless the owner explicitly authorizes a branch operation.

**Hard rules:** do not delete a repository or branch, rename a branch, or force-update a branch without explicit permission. Do not merge a PR on the owner's behalf. Do not start the next phase until the owner has reviewed and merged the current PR.

## Active architecture

- `index.html` loads `frontend/main.js` as the only active JavaScript entry point.
- `frontend/main.js` is the composition root; it assembles shared core modules and feature controllers.
- `frontend/core/` owns infrastructure and cross-cutting primitives.
- `frontend/features/` owns feature behavior and feature-specific event listeners.
- `backend/Code.gs` is the Apps Script API source; `backend/appsscript.json` is the deployment manifest.
- Root `app.js` is retained as a legacy artifact but is not loaded by `index.html`.
- `test/test-backend.js` uses the in-memory Google services mock. `test/e2e.py` runs browser journeys against `test/server.js`, not the production Web App.

## Change note before implementation

Record:

```text
Change:
User / role:
Outcome:
Current behavior:
Desired behavior:
API and data contracts:
Files in scope:
Files out of scope:
Acceptance criteria:
Failure and recovery paths:
Risks:
```

Read the active implementation, consumers, public interfaces and side effects before editing. Separate facts from assumptions. Reconcile incoming review findings to current file paths, not an earlier implementation's names.

## Build and verify

Use the smallest coherent scope that satisfies an observable outcome.

```text
Discover → define → design → implementation → integration
         → static checks → behavioral checks → two-pass review → PR
```

Run:

```bash
npm ci
npm run check
npm run test:e2e
git diff --check
git status --short
git diff --stat
```

Run relevant checks after changing code; inspect the actual diff. If browser E2E requires extra dependencies, report that explicitly rather than implying it ran. A passing mock does not prove behavior on a real Google account. Neither CI workflow deploys the Apps Script backend.

## Two-pass review gate

**Pass 1 — product and functional:** verify the user need, roles, acceptance criteria, data/API contract, normal flow, visible feedback, responsive layout and accessibility implications.

**Pass 2 — principal engineering and recovery:** verify auth/permission boundaries, concurrency, idempotency, partial failures, stale sessions, storage limits, migrations, offline behavior, safe rollback and regression exposure.

Resolve findings introduced by the change before requesting review. Document accepted residual risks and unverified external dependencies.

## Apps Script release boundary

Only the backend folder belongs in clasp. Before a backend upload, inspect the working tree and run `clasp status`. A merged backend source change is not a deployed Web App. `clasp push` and Apps Script **Deploy → New version** must be intentional release operations, not automatic consequences of a merge. No production deployment is included in normal PR work.

## PR and phase boundary

- Keep one PR focused and reviewable.
- Include what changed, commands/checks actually run, their outcomes, and remaining risks.
- Leave the PR open for owner review.
- Stop after the PR is ready; wait for owner review and merge before beginning another phase.
