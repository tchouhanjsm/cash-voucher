# Engineering Method

The product is built using a small-scope, evidence-led loop:

~~~text
DISCOVER → DEFINE → DESIGN → CONTRACT → BUILD → VERIFY → REVIEW → PR
~~~

The objective is to improve reliability and owner value without speculative rewrites.

## 1. Discover

Before changing files, establish the current base commit, branch state, runtime entry points, public interfaces, dependency direction and relevant tests. Read current code and docs; review files from an attached audit against actual current paths. Label each finding **present**, **already resolved**, **not applicable to this codebase**, or **not verified**.

## 2. Define a measurable change

~~~text
User/role:
Outcome:
Existing behavior and source:
Target behavior:
API/data contract:
In-scope / out-of-scope files:
Acceptance criteria:
Failure modes:
Release boundary:
~~~

Don't implement a strategy idea as a requirement until the intended users, decision maker and success metric are clear.

## 3. Architecture and ownership

| Concern | Current owner |
|---|---|
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

Prefer focused module contracts and dependency injection. Do not add a framework/library merely for convention. Do not move business logic into the composition root. Server-side permissions are authoritative; hidden UI is not a security boundary.

## 4. Two-pass self-review

### Pass A: product, workflow and UI

- Does the feature address a real owner/operator problem?
- Is the primary action apparent, and does the screen explain loading, empty, success, failure and offline states?
- Are role differences understandable and confirmed by server-side permissions?
- Is keyboard, touch, mobile viewport and screen-reader behavior preserved?
- Does a new screen reuse established tokens/components rather than inventing one-off styles?

### Pass B: security, failure and operational recovery

- Is authentication revalidated correctly around concurrent writes?
- Are rate limits and counters safe under concurrency?
- Are writes idempotent and financial records recoverable after a lost response?
- What happens on timeout, quota exhaustion, duplicate ID, stale session, malformed data or storage failure?
- Are user-controlled strings escaped at rendering boundaries?
- What data remains only on the device versus synced to the Sheet/Drive?
- Is rollback/recovery possible without deleting or overwriting the only copy?

Fix defects introduced by the change; document residual risks and tests that the environment cannot perform.

## 5. Verification

~~~bash
npm run check
npm run test:e2e
git diff --check
~~~

The quality gate covers lint, formatting, JSON/JS checks, frontend release integrity and mock backend tests. Browser E2E exercises local mock-backend workflows. Neither replaces actual Google-account permission checks, live backup/restore or device usability testing. State only commands and checks verified in CI or locally.

## 6. UI/UX direction

Adopt a restrained, polished cash-control interface: clear hierarchy, typography and spacing; consistent color/radius/shadow tokens; stable high-contrast content; clear status text in addition to color; responsive tables/forms; predictable focus states; accessible dialogs; and strong empty/loading/error/offline feedback. Use blur/translucency only where it improves contextual layering, such as a modal or floating overlay. Do not place blur over financial tables, receipts, or primary form content. Keep receipt/print layouts legible and separate from screen decoration.

See `docs/UI-UX-REVIEW.md` for the current source review and validation plan.

## 7. PR ownership and phase gates

Branch from merged `main`; run checks; open a focused PR; review the exact patch and Actions results. **The owner reviews and merges. The agent must not merge the PR or begin the next phase before the owner has reviewed and merged this one.** Never delete/rename branches or force-update refs without explicit permission. Backend deployments and release tags are separate, explicit actions.
