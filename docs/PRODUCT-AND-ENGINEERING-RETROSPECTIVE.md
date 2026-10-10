# Product and Engineering Retrospective

**Review phase:** PR #60  
**Review date:** 10 October 2026  
**Reviewed baseline:** `main` at `d02c6e3f95ec838a285bb86ef2bf0bd1cdee994c` (PR #59 merge)  
**Method:** static source and documentation review of the merged repository plus recorded CI/Browser E2E evidence. No production account, live Google services, physical device, assistive technology, or restore target was accessed.

## Executive assessment

The product has moved beyond a basic voucher form into a modular single-property cash-voucher PWA with server-side role checks, an IndexedDB offline outbox, backup status/recovery affordances, audit visibility, mobile task improvements, and repeatable CI/browser checks. The engineering process also has explicit handoff documents, dependency-advisory checks, formatting/lint/syntax/contrast/frontend gates, and a PR quality gate.

The main remaining risk is not a missing visual feature. It is the gap between **source/test confidence** and **operational confidence with real money and real Google services**. Offline data exists in a device-local durability domain until sync; backup metadata is not a restore proof; mock browser tests do not prove deployed Apps Script permissions; and the Audit CSV is a latest-200 event view, not a complete accounting ledger.

This PR is intentionally a retrospective and ranked plan. It changes no runtime code, API, schema, schedule, deployment, or production data.

## 1. Verified product achievements

The following are evidenced by the current source tree and merged handoffs. “Implemented” does not imply live production validation.

| Area | Achievement in source/history | Boundary that remains |
| --- | --- | --- |
| Product architecture | Active entry point is `index.html` → `frontend/main.js`; shared infrastructure lives in `frontend/core/`, features in `frontend/features/`, Apps Script API in `backend/Code.gs`. | Root `app.js` is legacy and can drift unless clearly excluded from active-source checks. |
| Authentication and permissions | Backend routes authenticate sessions and check capabilities server-side; write actions are serialized with a script lock. | Live deployment settings, session expiry/invalid-token behavior, and a complete role/action matrix need operational/integration evidence. |
| Financial write safety | Backend write routes are bounded by request/amount/row limits; the client outbox has stable client IDs and conflict checks. | Ambiguous network outcomes, repeated requests, simultaneous tabs, and duplicate attempts need a documented end-to-end guarantee for every write action. |
| Offline recovery | IndexedDB outbox, migration safeguards, non-destructive JSON export/import, duplicate matching and same-ID/different-content rejection are present. | Device-local records can be evicted or lost and are not included in backend backups until synced. Test actual browser/device recovery and make this boundary unmistakable in every relevant state. |
| Backup/recovery | Daily backup trigger, spreadsheet copy, receipt copies and manifest, retention pruning, failure metadata, owner-only status panel, and cleanup of incomplete snapshots are implemented. | A “success” status is metadata only; live folder permissions, snapshot integrity, and restore to a separate Sheet/folder have not been demonstrated. |
| Security rendering | Incremental escaping and hostile-markup Browser E2E cases cover several user-controlled render surfaces. | Shared modal body intentionally accepts trusted HTML; all dynamic HTML sinks are not formally proven safe. Continue sink-by-sink review. |
| Financial UI | Mobile payment/cash-receipt entry, clearer manager register rows/actions, tabular numerals, empty/filter states, receipt retry and refresh feedback are covered by targeted browser assertions. | Viewport tests do not prove physical-device ergonomics, complete WCAG conformance, or assistive-technology output. |
| Owner audit | Dedicated owner-only Audit route, filters, loaded count, latest-200 disclosure and filtered CSV export exist. | Live authorization is unverified; the loaded window is capped at 200 and is not a complete audit archive or accounting export. |
| CI/CD | CI checks dependencies, lint, formatting, JSON, syntax, contrast, frontend release consistency and tests; Browser E2E runs separately; release workflow validates tagged version and reruns checks. | PR checks use mocks. Release workflow creates a GitHub release; it is not proof of Apps Script deployment. Exact-head CI and E2E should be required for every code-changing PR. |
| Delivery discipline | Per-PR handoff, roadmap, security/UX notes, and evidence gates support bounded review. | Handoff content can become stale; the live PR head and workflow URLs must remain authoritative. |

### Recent verified sequence

- PR #48–#50 improved contrast, financial-number readability, responsive layout and keyboard behavior.
- PR #52 isolated modal background interaction and added focus containment/return coverage.
- PR #53 improved narrow payment-row reflow and reduced-motion coverage.
- PR #54 improved register empty/filter-recovery states.
- PR #55 added receipt retry and register refresh feedback.
- PR #56 clarified staff payment/cash-receipt entry.
- PR #57 improved manager register mobile review.
- PR #58 added owner-only Audit navigation, filters and a clearly limited latest-200 CSV export.
- PR #59 documented export decision gates and safe automation requirements.
- PR #59's exact PR head `4d9ef3b86bdfa80ab1220ef119877b2604820248` passed CI and Browser E2E (125 checks, 0 failures). After merge, main at `d02c6e3f95ec838a285bb86ef2bf0bd1cdee994c` also has a successful CI push run. The PR's Browser E2E evidence is on the PR head; do not claim a post-merge E2E run unless a matching run is verified.

## 2. Cross-functional review

### Product owner

**Strengths**
- The app is explicitly single-property and preserves a useful staff/manager/owner distinction.
- Common daily tasks have received incremental usability improvements rather than a risky wholesale redesign.
- Export and automation requirements are now separated from assumptions about accounting policy.

**Gaps / decisions**
- Observe one real staff payment/receipt task, one manager review/correction task, and one owner audit/recovery task before choosing the next automation.
- Establish operational measures: failed/pending sync count and age, duplicate/conflict incidents, backup freshness, restore-drill result, and task completion/error rate. Baselines and thresholds must be measured/approved, not invented.
- Owner must choose an accounting destination and provide an accountant-reviewed import template before destination-specific export work.
- Daily cash close stays blocked until the owner explicitly approves the design in `docs/DAILY-CASH-CLOSE-DESIGN.md`.

### Principal engineer / backend

**Strengths**
- Protected actions route through centralized authentication/authorization.
- Writes are serialized through a script lock, and request size/amount limits exist.
- Audit and backup status are exposed through existing server permissions rather than relying solely on hidden UI controls.

**Gaps / next verification**
- Add an explicit action × role authorization test matrix, including inactive users, expired/invalid sessions, forced PIN change, unknown actions and malformed payloads.
- Prove idempotency under an ambiguous response: server commits a voucher, client loses the response, then retries. Assert exactly one canonical voucher and a deterministic client-visible result.
- Exercise lock timeout/contention and partial failure paths for voucher create/update/cancel, receipt writes and backup operations. Ensure failure responses do not imply success.
- Review audit completeness and failure semantics: what happens when a business write succeeds but audit append fails? Document and test whether audit is best-effort or transactionally required.
- Keep API input validation, authorization and financial inclusion rules server-side; front-end state is never authority.
- Keep accounting fields, new roles, scheduled jobs and cash-close schema out until the owner decisions are made.

### CI/CD and developer workflow

**Strengths**
- CI and Browser E2E are separate workflows, concurrency cancels superseded runs, dependency advisory policy is enforced, and PR handoff validation exists.
- The release workflow repeats quality and browser checks and verifies the tag matches `package.json`.

**Gaps / next verification**
- For every code-changing PR, record CI and Browser E2E run URLs tied to the exact same final PR head SHA; re-run after the last source commit.
- Keep local `npm run check`, `npm run test:e2e` and `git diff --check` evidence distinct from CI; never mark them passed when not run.
- Add focused tests when a gap is identified instead of relying on broad E2E counts alone.
- Make the local workflow easy to repeat with one documented preflight command and a clear distinction between safe checks and commands that can push/deploy.
- Do not automate `clasp push`, Apps Script deployment, or production data actions as part of ordinary PR CI.

### Security reviewer

**Strengths**
- Server-side authorization is the documented trust boundary.
- Several XSS regressions use hostile text values, and audit data is rendered as text in the dedicated route.
- Dependency advisory policy is part of CI; backup and offline recovery docs describe the durability boundary.

**Risks to keep visible**
- Dynamic HTML template strings remain a broad class of risk. The modal primitive intentionally inserts caller-authored HTML, so every caller interpolation must be escaped for the exact HTML context.
- CSV quoting alone does not neutralize spreadsheet formula execution. Any future CSV containing untrusted fields needs formula-injection tests for leading `=`, `+`, `-`, `@`, tabs and newlines, in addition to commas/quotes/Unicode.
- A hidden navigation item is not authorization. Test API denial directly for every protected action and role.
- Audit details and backup error strings should not leak tokens, secrets, unnecessary personal data, or sensitive payloads.
- Public/anonymous Apps Script web-app access makes correct session enforcement and actual deployed settings especially important; repository source cannot confirm the live deployment configuration.

### QA lead: realistic failure scenarios

The next code PR should choose one bounded scope and add regression tests for the scenarios relevant to that scope. The overall regression matrix is:

| Scenario | Expected invariant | Evidence status |
| --- | --- | --- |
| Double tap on Save / duplicate browser request | One intended voucher, no duplicate financial movement, visible outcome | Partial source safeguards; end-to-end retry guarantee needs focused proof |
| Server commits but response is lost | Retry returns/recognizes the same transaction rather than creating a second one | Must be explicitly tested against the client ID/idempotency contract |
| Offline entry followed by reload/browser restart | Pending entry remains visible or recovery error is actionable; never called server-saved | Mock/local test coverage only; real-device validation open |
| Two tabs retry the same pending item | No duplicate server voucher; queue lease/state remains understandable | Source has lease/cross-tab mechanisms; contention scenario needs focused proof |
| IndexedDB unavailable/quota/eviction | No false “saved safely” claim; clear export/recovery guidance | Must be exercised in supported browsers/devices |
| Session expires during edit/save | Protected write denied; entered data and retry path handled without false success | Add focused API/UI scenario |
| Staff attempts manager/owner endpoint | Server denies access even if action is manually invoked | Complete role/action matrix needed |
| Partial receipt upload or invalid image | No false receipt success; retry is safe; orphan cleanup behavior is known | Receipt retry exists; live Drive behavior open |
| Backup fails mid-copy or retention pruning fails | Incomplete snapshot handled safely; error visible; valid snapshot not destroyed | Mock tests exist; live backup and restore remain unverified |
| Audit event set exceeds 200 | UI/export explicitly states scope; no claim of completeness | Latest-200 limitation is visible; full-history support remains a separate decision |
| Malicious vendor/note/audit value | Displayed as text; no HTML execution; CSV export does not execute formulas | Several XSS surfaces covered; exhaustive sink and CSV-injection audit remains open |
| Export includes cancelled/edited/unsynced entries | Explicit, reproducible inclusion rules and reconciliation totals | Destination and mapping not selected; blocked for accounting export |
| Network failure during refresh/receipt fetch | Existing valid data remains, busy state resets, retry is available | Targeted mock E2E exists; live service behavior open |

### UI/UX lead

**Strengths**
- The app has a skip link, landmarks, live/status regions, shared focus treatment, dialog naming/focus handling, reduced-motion coverage, mobile touch-target assertions and distinct empty states.
- Money/status legibility and mobile staff/manager flows have improved in bounded changes.

**Gaps**
- Conduct actual 320/390px and desktop walkthroughs on a physical phone/tablet; verify thumb reach and form keyboard behavior.
- Complete manual keyboard, zoom/reflow and screen-reader checks; the automated contrast script checks selected source-token pairs, not every rendered state.
- Audit every workflow's loading, success, offline, stale-session, permission-denied, empty, partial-failure and retry states.
- Keep “saved on this device”, “pending sync”, and “saved to central records” visually and semantically distinct.
- Ensure destructive cancel/edit actions explain the financial consequence and preserve an attributable reason where required.

## 3. Prioritized backlog

Priorities are risk/value judgments from source review, not measured incident rates. Each item is deliberately separable into its own PR.

### P0 — Operational confidence gate (no feature coding first)

**Acceptance criteria**
- Owner witnesses a backup under the actual deployed account.
- Snapshot is inspected for expected tabs, row counts, receipt manifest mappings and plausible totals.
- Restore is demonstrated into a separate recovery Sheet/folder; original production files remain untouched.
- Owner/staff/manager login and a minimal voucher create/cancel/receipt/audit smoke test are completed in the recovery environment.
- Evidence and gaps are recorded in `docs/DATA-DURABILITY.md` and release readiness.
- No production deployment or mutation occurs without separate explicit authorization.

### P1 — Offline sync and write idempotency assurance (recommended first implementation PR)

**Problem:** financial entries can remain on one device while pending; ambiguous responses and retries are high-consequence.

**Acceptance criteria**
- Deterministic tests cover commit-then-lost-response, repeated submission with the same client ID, same ID with changed content, two-tab retry, stale lease recovery and server denial.
- One intended logical entry yields at most one canonical voucher.
- UI never says centrally saved until server acknowledgement; pending/failed state and recovery action remain discoverable.
- Retry is safe and actionable; no automatic destructive discard.
- Logs and errors contain no session token or unnecessary financial payload.

### P1 — Server authorization and audit reliability matrix

**Acceptance criteria**
- Table-driven tests cover each action for staff, manager, owner, inactive user, invalid/expired session and forced-PIN-change state.
- Direct API calls are tested, not only menu visibility.
- Business-write/audit-write failure semantics are documented and tested.
- Sensitive values are excluded from logs and user-visible errors.
- Existing valid role behavior is preserved.

### P1 — Backup restore drill and status semantics

This is the operational P0 gate above; only after a successful witnessed drill should product wording or release claims change. Do not add “restore verified” status based only on metadata.

### P2 — Audit history/export contract

**Acceptance criteria**
- Decide whether owner needs pagination/full-history export or whether latest-200 is adequate.
- If full history is approved, design server pagination, stable ordering, range/retention semantics, permission checks and bounded export size first.
- Test CSV formula injection, Unicode, quotes, newlines, date/amount formatting and reconciliation counts.
- Never call this an accounting ledger without a separate approved accounting mapping.

### P2 — Targeted frontend accessibility/usability pass

**Acceptance criteria**
- Manual keyboard traversal and focus return checked across major dialogs.
- At least one real screen-reader/browser combination checked for login, voucher save, errors, sync state, register filters and audit route.
- Physical phone walkthrough covers staff save, manager row actions and offline recovery.
- Findings are ranked by user impact; automated checks remain regression guardrails.

### P3 — Low-risk workflow automation

Start only after staff tasks are observed. The first candidate is a **pending-sync recovery entry point**, not a scheduled financial operation.

**Acceptance criteria**
- Reads real outbox state and differentiates pending, failed and synchronized records.
- Provides a user-initiated retry/export recovery action.
- Does not create a new voucher on its own, spam repeated alerts, or claim cloud persistence for local-only records.
- Permission, duplicate/retry, offline, storage-failure and accessible status tests pass.
- No scheduled trigger or external delivery is introduced.

### Blocked / deferred
- Destination-specific accounting export: blocked on owner-selected product/version and accountant-reviewed template.
- Daily cash close and variance notifications: blocked on explicit approval of `docs/DAILY-CASH-CLOSE-DESIGN.md`.
- Scheduled owner summaries: blocked on agreed metrics, timezone, recipient, channel, privacy and retry policy.
- Recurring vouchers/petty-cash floats: defer until actual use is observed.
- Full template-to-DOM migration: plan separately after sink inventory and risk-based tests; do not mix into a financial workflow PR.

## 4. Automation strategy

### Developer workflow automation — approved direction
1. Keep CI quality and Browser E2E as required, separate checks.
2. Require exact-final-SHA evidence in the PR handoff.
3. Run a small focused test locally for changed logic, then full `npm run check` and `npm run test:e2e` when the environment permits.
4. Keep dependency audit, formatting, syntax, contrast, frontend-release consistency and handoff validation in CI.
5. Provide failure diagnostics/artifacts and avoid duplicated concurrent runs.
6. Treat deployment/push commands as explicit manual release actions, never a side effect of test automation.

### In-app automation — proposal only
- First: pending-sync recovery guidance and safe user-triggered retry.
- Later: reviewed voucher presets that prefill approved fields but never auto-submit.
- Much later: scheduled owner summary after recipient/data/privacy decisions.
- Backup assurance must be based on a witnessed restore drill, not a green metadata flag.
- No recurring vouchers, cash close, external delivery or scheduled triggers are approved by this retrospective.

## 5. Risk register

| Risk | Severity | Current mitigation | Residual action |
| --- | --- | --- | --- |
| Device-local pending vouchers lost before sync | High | IndexedDB, export/restore and visible sync state | P1 idempotency/sync tests and physical-device drill |
| Backup appears successful but cannot restore | High | Status panel, manifest, cleanup and recovery guide | P0 witnessed restore drill |
| Deployed auth differs from source/mock assumptions | High | Central backend auth and role checks in source | Live deployment smoke test and role matrix |
| Duplicate financial write after ambiguous response | High | Client IDs, locking and retry safeguards | Prove exactly-once logical outcome with fault injection |
| Untrusted HTML/CSV values execute | High | Incremental escaping and hostile markup tests | Continue sink audit and formula-injection tests |
| Audit CSV mistaken for full history/accounting export | Medium–High | Latest-200 disclosure | Preserve disclosure; owner decision for pagination/export |
| UI inaccessible on real device/assistive tech | Medium | Automated focus, target-size, contrast and responsive checks | Manual/device usability and screen-reader review |
| Unapproved automation silently creates/sends financial data | High | Design contract and no scheduled automation added | Maintain decision gate and owner kill switch requirements |

## 6. Decisions and scope boundaries

- Keep one focused PR at a time; no stacked implementation PRs.
- Owner reviews and merges; no automated merge.
- No Apps Script deployment, `clasp push`, live Drive/Sheet operation, or production-data mutation is authorized here.
- No accounting destination, extra role, scheduled owner summary, recurring voucher, or cash-close policy is inferred.
- Treat exact live GitHub refs and workflow runs as evidence; distinguish source review, mock tests, CI and live operational validation.

## 7. Recommended next phase

After PR #60 is reviewed and merged, the recommended first implementation is a **bounded offline sync/idempotency assurance PR**, unless the owner chooses to make the P0 witnessed restore drill the immediate operational priority. Keep the implementation PR test-first, with fault-injection cases and clear saved/pending/failed semantics. No implementation is bundled into this retrospective.
