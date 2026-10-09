# Engineering Method

The product is built through outcome-based work batches, not one tiny PR per isolated task:

```text
DISCOVER → PRIORITIZE → PLAN BATCH → IMPLEMENT → VERIFY CONTINUOUSLY
         → INDEPENDENT SELF-REVIEW → PR HANDOFF
```

A batch may include several related fixes, documentation updates, regression tests and workflow improvements when they share a clear product or risk outcome. Use multiple focused commits on the same branch; the hard limit is **10 commits per PR/batch**. Prefer fewer, coherent review cycles over opening a PR for every small subtask.

## 1. Establish the actual state first

Before editing, verify the repository, active branch, PR state, base/head SHA, changed files, latest checks and working-tree state. Read active implementation and callers, not just stale notes or prior conversation.

- Treat GitHub's live branch/PR state and exact commit SHA as the source of truth.
- If a reported merge and the live API disagree, stop dependent work long enough to reconcile the mismatch. Never assume an unmerged change is in `main`.
- Label findings **present**, **already resolved**, **not applicable**, or **not verified**.
- Keep existing branches untouched unless the owner explicitly authorizes an operation.

## 2. Define the batch contract

Before implementation, record the outcome and acceptance conditions in the PR description:

```text
User/role:
Outcome:
Existing behavior and evidence:
Target behavior:
API/data contract:
In-scope / out-of-scope files:
Acceptance criteria:
Failure and recovery paths:
Security/privacy impact:
Release boundary:
Verification plan:
```

The batch should be broad enough to deliver a complete, coherent outcome but bounded enough to review. Do not combine unrelated product changes simply to reduce PR count. If a batch would require more than 10 commits, pause at a safe boundary and split it into dependent, reviewable batches.

## 3. Architecture and ownership

| Concern | Current owner |
| --- | --- |
| Composition and feature wiring | `frontend/main.js` |
| API transport | `frontend/core/api.js` |
| App state / permission flags | `frontend/core/state.js` |
| DOM helpers | `frontend/core/dom.js` |
| Shared UI feedback | `frontend/core/ui.js` |
| Browser storage | `frontend/core/storage.js` |
| Durable offline queue | `frontend/core/offline-queue.js` |
| Action delegation | `frontend/core/actions.js` |
| Auth | `frontend/features/auth.js` and server auth in `backend/Code.gs` |
| Payments and offline recovery UX | `frontend/features/payments.js` |
| Dashboard / register / bulk / administration / navigation / printing | matching `frontend/features/*.js` modules |
| Persisted rules, validation and authorization | `backend/Code.gs` |
| Integration and regression coverage | `test/` |

Prefer focused module contracts and dependency injection. Do not add a framework/library merely for convention or move business logic into the composition root. Server-side permissions are authoritative; hidden UI is not a security boundary.

## 4. Continuous verification while building

After each logical change, run the narrowest relevant check. Before handoff, run the complete applicable suite and inspect the **final** diff; earlier green checks do not validate later commits.

```bash
npm ci
npm run check
npm run test:e2e
git diff --check
git status --short
git diff --stat
git diff
```

The current quality gate covers lint, formatting, JSON/JS checks, frontend release integrity and mock backend tests. Browser E2E exercises local mock-backend workflows. Neither proves real Google-account permissions, live backup/restore, physical-device usability or production readiness.

## 5. Two independent review passes

### Pass A — product, functional behavior and UI/UX

- Verify the user outcome and each acceptance criterion.
- Trace the normal flow, permissions by role, loading/empty/success/failure/offline states and mobile behavior.
- Check accessibility implications, focus, keyboard/touch interaction, readable status and destructive-action feedback.
- Confirm the UI matches existing design patterns rather than adding one-off behavior.

### Pass B — principal engineering, security and recovery

- Trace user-controlled data to DOM/HTML, URLs, logs and export sinks.
- Verify server-side authorization, validation, session behavior, concurrent writes and idempotency.
- Inspect timeout, quota, stale session, malformed input, duplicate ID, storage failure and partial-success paths.
- Review schema/API compatibility, offline synchronization, privacy exposure, backup/restore and rollback.
- Inspect the final diff for accidental edits, unrelated scope, placeholders, secrets, unsafe commands and undocumented contract changes.

Fix findings introduced by the batch. Record remaining risk and what could not be tested. A checklist and CI can reduce known error classes; they cannot prove that a change is defect-free.

## 6. CI handoff and evidence

A batch is ready for owner review only when:

1. The PR body has outcome, acceptance criteria, verification, security/failure review, release boundary and residual risks.
2. The PR has no more than 10 commits.
3. The quality workflow passes on the exact current head SHA.
4. Browser E2E passes for changed browser behavior; relevant tests are added for regressions.
5. The exact diff and changed-file list have been reviewed after the final commit.
6. Each reported result is backed by a workflow run, command output or clearly labeled static review. Pending, skipped and unverified checks are not described as passed.
7. The handoff lists known limitations and makes no unsupported claim about deployment or production readiness.

The PR workflow quality gate enforces the commit ceiling and required handoff sections. It is an additional guardrail, not a substitute for code review, behavioral tests or human approval.

## 7. UI/UX direction

Adopt a restrained, polished cash-control interface: clear hierarchy, typography and spacing; consistent color/radius/shadow tokens; stable high-contrast content; clear status text in addition to color; responsive tables/forms; predictable focus states; accessible dialogs; and strong empty/loading/error/offline feedback. Use blur/translucency only where it improves contextual layering. Do not put blur over financial tables, receipts or primary form content. Keep receipt/print layouts legible and separate from screen decoration.

See `docs/UI-UX-REVIEW.md` for the current source review and validation plan.

## 8. Product and release boundaries

- **Owner approval is still required for product-policy decisions.** Daily cash close stays design-only until the owner resolves the open decisions in `docs/DAILY-CASH-CLOSE-DESIGN.md`.
- The owner reviews and merges PRs; the agent must not merge or deploy.
- Backend source changes are not a production Apps Script deployment. `clasp push`, deployment versions and release tags remain deliberate, separately authorized operations.
- Never delete/rename branches or force-update refs without explicit permission.
