# Engineering Build Method (EBL v1)

This project uses a repeatable engineering loop for feature work, refactoring, and releases.

## Core loop

```text
DISCOVER → DEFINE → DESIGN → CONTRACT → BUILD → VERIFY → INTEGRATE → REVIEW → SHIP → LEARN
                                      ↑                                             │
                                      └─────────────────────────────────────────────┘
```

## 1. Discover

Before editing code, establish:

- current branch and working tree
- current behavior
- relevant files and dependency direction
- public interfaces and side effects
- API/data contracts
- files that are explicitly out of scope

Required baseline commands:

```bash
git status --short
git branch --show-current
git diff --check
npm run check
```

Do not use a file simply because it is convenient. Identify its owner, consumers, dependencies, public interface, and side effects first.

## 2. Define

Write a compact change definition:

```text
Change:
Why:
Current behavior:
Desired behavior:
Files likely affected:
Files explicitly not affected:
Acceptance criteria:
Risk:
```

A change is not ready to build until the acceptance criteria are observable.

## 3. Design

Assign ownership before implementation.

For the frontend:

| Concern                | Owner                                 |
| ---------------------- | ------------------------------------- |
| application state      | `frontend/core/state.js`              |
| API transport          | `frontend/core/api.js`                |
| shared UI primitives   | `frontend/core/ui.js`                 |
| pure utilities         | `frontend/core/utils.js`              |
| local storage          | `frontend/core/storage.js`            |
| action dispatch        | `frontend/core/actions.js`            |
| authentication         | `frontend/features/auth.js`           |
| payments/offline queue | `frontend/features/payments.js`       |
| dashboard              | `frontend/features/dashboard.js`      |
| register               | `frontend/features/register.js`       |
| bulk upload            | `frontend/features/bulk.js`           |
| administration         | `frontend/features/administration.js` |
| printing               | `frontend/features/printing.js`       |
| navigation/lifecycle   | `frontend/features/navigation.js`     |
| dependency composition | `frontend/main.js`                    |

`main.js` is a composition root. It must not become another business-logic monolith.

## 4. Contract

Before wiring a module, record:

```text
Factory/function:
Inputs/dependencies:
Public API:
Events installed:
DOM owned:
State read:
State written:
API actions used:
Side effects:
```

Internal implementation may change without changing the public contract unless the change is intentional and reviewed.

## 5. Build

Work in vertical waves, not one-file micro-batches.

A wave should contain:

1. preparation
2. implementation
3. integration
4. verification
5. review

A wave may touch many files when they form one cohesive architectural change.

## 6. Verify

Every wave has two verification levels.

### Static

```bash
npm run check
git diff --check
```

### Behavioral

Verify the affected user workflows and regression-sensitive behavior. Static checks do not prove runtime wiring.

For frontend architectural changes, at minimum consider:

- login/session
- navigation
- dashboard
- new payment / cash received
- register
- bulk upload
- administration
- printing
- offline queue
- permission-gated navigation

## 7. Integrate

The application dependency direction is:

```text
index.html
    ↓
frontend/main.js
    ↓
feature modules
    ↓
core modules
    ↓
API transport
    ↓
Apps Script
```

`main.js` creates services, creates feature controllers, connects dependencies, registers cross-feature actions, and starts the application.

It must not contain large feature renderers or duplicate shared utilities.

## 8. Review

Review every substantial wave from three perspectives:

### Engineering

- coupling and cohesion
- dependency direction
- failure behavior
- security/permission boundaries
- maintainability
- performance

### Product/UX

- workflow continuity
- behavior preservation
- understandable feedback
- accessibility and keyboard/touch behavior

### Operations/business

- operator workflow
- offline/recovery behavior
- data safety
- permission correctness
- recoverability from failure

## 9. Ship

Use the normal Git path:

```text
main
  ↓
feature/<purpose>
  ↓
local verification
  ↓
commit
  ↓
push
  ↓
PR
  ↓
CI
  ↓
review
  ↓
merge
```

Prefer meaningful commits such as:

```text
feat(frontend): ...
refactor(frontend): ...
fix(frontend): ...
docs(engineering): ...
chore(ci): ...
```

## 10. Learn

After each substantial wave record:

```text
What worked?
What caused confusion?
What repeated?
What should become reusable?
What should become a script or rule?
```

The engineering process itself is part of the project and should improve over time.

## Non-negotiable rules

1. Do not change behavior accidentally while refactoring.
2. Do not change backend/API contracts during a frontend-only architecture change.
3. Do not introduce a framework or dependency without a demonstrated problem it solves.
4. Do not delete the legacy path until parity is established.
5. Prefer composition over inheritance for frontend features.
6. Prefer shared utilities over duplicated helpers.
7. Keep feature-specific event listeners inside the feature unless there is a clear cross-feature reason to centralize them.
8. Keep action names stable during refactors unless the change is explicitly part of the feature contract.
