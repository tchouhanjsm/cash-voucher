# Development Workflow

## Session start and source-of-truth checks

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
npm run check
```

Before editing, verify the live GitHub PR state, target branch SHA, active branch head, changed-file list and latest CI/E2E runs. Compare hashes rather than inferring state from chat. If someone reports a merge while GitHub still reports the PR open or `main` unchanged, reconcile that conflict before basing dependent work on the expected merge. Do not claim a branch contains a change until its SHA proves it.

**Hard safety rules:** do not delete a repository or branch, rename a branch, or force-update a ref without explicit permission. Do not merge a PR or deploy to production on the owner's behalf.

## Batch model

Prefer a complete, coherent batch over one PR per small subtask. A batch can contain related product fixes, docs, targeted regression tests and CI guardrails; use multiple meaningful commits on the same PR while keeping the total at **10 commits or fewer**. Work in parallel across files only when changes do not race, then integrate and review the whole final diff.

- Start from the latest confirmed base or extend the currently active PR when that is the agreed workflow. Avoid overlapping PRs that duplicate each other's commits.
- Define the outcome and acceptance criteria before implementation.
- Keep unrelated features and unapproved product-policy changes out of the batch.
- If the work cannot be completed safely within 10 commits, stop at a coherent boundary and describe the dependency for a later batch.
- Do not force push or rewrite history to make the commit count fit.

## Active architecture

- `index.html` loads `frontend/main.js` as the only active JavaScript entry point.
- `frontend/main.js` is the composition root; it assembles shared core modules and feature controllers.
- `frontend/core/` owns infrastructure and cross-cutting primitives.
- `frontend/features/` owns feature behavior and feature-specific event listeners.
- `backend/Code.gs` is the Apps Script API source; `backend/appsscript.json` is the deployment manifest.
- Root `app.js` is retained as a legacy artifact but is not loaded by `index.html`.
- `test/test-backend.js` uses the in-memory Google services mock. `test/e2e.py` runs browser journeys against `test/server.js`, not the production Web App.

## Batch contract

Use the PR template and define:

```text
Outcome and users/roles:
Current behavior and source evidence:
Target behavior:
Acceptance criteria:
API/data contract:
In-scope / out-of-scope:
Security and failure modes:
Verification plan:
Release/deployment boundary:
Known unknowns:
```

Read the active implementation, consumers, public interfaces and side effects before editing. Separate facts from assumptions. Reconcile incoming review findings to current paths and verify whether earlier findings are already resolved.

## Build and verify continuously

Run the narrowest relevant check after each logical change. After the final code edit, run the full checks and review the complete diff:

```bash
npm ci
npm run check
npm run test:e2e
git diff --check
git status --short
git diff --stat
git diff
```

The CI workflow runs `npm run check`; the Browser E2E workflow separately runs `npm run test:e2e`. The PR quality check also blocks PRs with more than 10 commits or missing handoff sections. The exact head SHA must be checked after the last commit, not just an earlier commit.

If browser E2E or another environment-dependent check has not run, report it as pending/not run. A passing mock is not proof of behavior on a real Google account. Neither normal CI workflow deploys the Apps Script backend.

## Two-pass review gate

**Pass 1 — product and functional:** verify the user outcome, roles, acceptance criteria, data/API contract, normal flow, visible feedback, responsive layout, keyboard/focus behavior and accessibility implications.

**Pass 2 — principal engineering, security and recovery:** trace user-controlled data to rendering sinks; verify auth/permission boundaries, concurrency, idempotency, partial failures, stale sessions, storage limits, offline behavior, schema compatibility, privacy, safe rollback and regression exposure.

Fix findings introduced by the batch before handoff. Record accepted residual risks and external dependencies that could not be verified. Do not state or imply that checks guarantee the absence of all defects.

## Evidence-based PR handoff

The PR description must state:

- The user problem and observable outcome.
- Acceptance criteria and how each is verified.
- Commands or CI workflows run, with exact result and head SHA.
- Security, failure-mode and recovery review.
- Files/contracts changed and files intentionally out of scope.
- Remaining risks, not-run checks and any real-world verification still needed.
- Explicit statement that merge/deployment was not performed, where relevant.

Do not call a check passed unless the actual run for the exact head passed. Review the final file list, commit count, diff and workflow run details before stopping.

## Apps Script release boundary

Only the backend folder belongs in clasp. Before a backend upload, inspect the working tree and run `clasp status`. A merged backend source change is not a deployed Web App. `clasp push` and Apps Script **Deploy → New version** must be intentional release operations, not automatic consequences of a merge. No production deployment is included in normal PR work.

## Product decision boundary

Daily cash close remains design-only until the owner resolves the decisions in `docs/DAILY-CASH-CLOSE-DESIGN.md`. Improving delivery speed does not authorize a schema change, historical backfill, new settlement semantics, product scope expansion, PR merge or production deployment.
