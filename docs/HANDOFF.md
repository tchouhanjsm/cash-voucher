# Engineering Handoff

**Updated:** 12 October 2026  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified `main` SHA:** `8dd0c0b9d53e1e22f5449f214ddcabf5601b1043` (PR #101 merge)  
**Verified `main` SHA:** `cf1ae45363d9ba7126be722388dcf7c75a45ffd3` (PR #100 merge)  
**Purpose:** this is the one live handoff for the next engineering/chat session. Verify live GitHub refs before relying on any SHA or PR state recorded here.

## Current phase

**PR #102 — Harden scalar output conversion at HTML and CSV boundaries**  
Branch: `security/scalar-only-html-escaping`  
Base: `8dd0c0b9d53e1e22f5449f214ddcabf5601b1043`

Scope: fix the formatting failure, make shared HTML escaping and CSV cell output accept only scalar values, and ensure untrusted object/array/symbol values cannot invoke coercion hooks. Preserve HTML entity encoding, CSV quoting and formula-prefix defenses. Extend unit and Browser E2E coverage for hostile coercion and malformed Settings values. No API/schema, permissions, accounting semantics, dependency, deployment or production-data changes.

**Last completed:** PR #101 — [Harden owner diagnostics against malformed API responses](https://github.com/tchouhanjsm/cash-voucher/pull/101), merged at `8dd0c0b9d53e1e22f5449f214ddcabf5601b1043`. Exact tested head `d9a70d9c18814931fe6915b422764b202a5687d7` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38231620604) (129 backend checks), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38231620660) (240 checks), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38231620643) (129 backend + 240 browser checks).

**Acceptance gate:** exact final PR #102 head must pass CI, Browser E2E, and Full Flight Test. Owner review and merge remain required. Live Google authorization, scheduled backup/isolated restore, real-device/accessibility checks, and the complete rendering audit remain open.
**PR #101 — Fail closed on malformed owner diagnostic responses**  
Branch: `product/admin-diagnostics-integrity`  
Base: `cf1ae45363d9ba7126be722388dcf7c75a45ffd3`

Scope: validate the owner-only data-quality and backup-integrity report contracts before rendering. Reject malformed summary envelopes, filter and disclose malformed data-quality issue rows, withhold invalid backup snapshot reports, provide accessible failure/retry feedback, and prove recovery when valid responses return. Preserve backend authorization, backup/restore semantics, accounting behavior and production configuration. No deployment or production data mutation.

**Last completed:** PR #100 — [Prevent zero-like totals when voucher data is unavailable](https://github.com/tchouhanjsm/cash-voucher/pull/100), merged at `cf1ae45363d9ba7126be722388dcf7c75a45ffd3`. Exact tested head `ff409d641762d2a808c11509b7edfa37aa1e208e` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38228814467) (129 backend checks), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38228814429) (236 checks), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38228814454) (129 backend + 236 browser checks).

**Acceptance gate:** exact final PR #101 head must pass CI, Browser E2E, and Full Flight Test. Owner review and merge remain required. Live Google authorization, scheduled backup/isolated restore, real-device/accessibility checks, and the complete rendering audit remain open.

Adopt three distinct sources of information:

- This file is the current state, blockers and next actions.
- Each GitHub PR description is the permanent record of that change, acceptance criteria, exact-head verification and review decisions.
- Domain documents change only when their substance changes.

From PR #76 onward, do not create `docs/pr-handoffs/PR-<number>.md` files. Existing per-PR handoff files remain historical artifacts. `docs/PR-HANDOFFS.md` is frozen through PR #75. Do not create a separate post-merge PR just to update handoff metadata.

## Product and architecture

Cash Voucher is a single-property cash-voucher PWA backed by Google Apps Script, Google Sheets and Drive.

- `index.html` loads `frontend/main.js`; the root `app.js` is legacy and is not the active entry point.
- `frontend/core/` owns shared infrastructure; `frontend/features/` owns feature behavior; `backend/Code.gs` is the Apps Script API source.
- Backend role enforcement is the security boundary; UI visibility does not authorize requests.
- Browser-local outbox entries are not centrally backed up until synchronized.
- Voucher records are deliberately not included in the offline identity/settings cache. During an offline bootstrap fallback, `dataAvailable` is false; Dashboard/Register must not infer genuine zero activity from an empty in-memory placeholder.
- Dashboard cash-in-hand and movement reporting are recorded-voucher views, not proof of physical cash, accounting, tax, or general-ledger reconciliation.
- Daily cash close remains design-only until owner/accountant decisions in `docs/DAILY-CASH-CLOSE-DESIGN.md` are approved.
- Preserve the owner's local untracked `docs/AI-ENGINEERING-PROTOCOL.md`; do not stage or overwrite it.

## Durable engineering rules

- One coherent, focused PR at a time; avoid stacked/overlapping PRs. No arbitrary commit-count ceiling.
- Verify live PR/main refs, exact head SHA, changed files, and final workflow results. Never infer a merge or test result from prior chat.
- Run the two-pass functional/product and security/recovery review in `docs/DEVELOPMENT-WORKFLOW.md`.
- The PR description must have the required outcome, acceptance criteria, verification evidence, security/failure review, release boundary, and residual-risk sections.
- The PR's exact final head must pass CI, Browser E2E and Full Flight Test. Do not report earlier-SHA checks as current evidence.
- The owner reviews and merges. Never merge, force-push, delete branches, run Apps Script `setup()`, use `clasp push`, deploy, or mutate production data without explicit authorization.
- A merged Apps Script source change is not a deployed Web App; live access, backup and restore require operational evidence.

## Open production and quality gates

These remain open regardless of green mock-backed CI:

1. Owner verifies the intended Apps Script project, active deployment/execution settings, Sheet binding, and Script Properties in the Apps Script editor.
2. Verify real owner/manager/staff authorization, including receipt access and staff restrictions, against the live deployment.
3. Observe a scheduled backup in Drive, inspect copied Sheet/receipt/manifest contents, and witness a restore into a separate recovery Sheet/folder; validate counts and voucher numbering.
4. Complete physical-device PWA install/update/offline checks, assistive-technology testing, and a controlled hotel pilot.
5. Continue the incremental stored-XSS/rendering sink audit. It is not a full security certification.
6. The current lint warning for unused `backupData_` and the documented time-limited `@google/clasp → micromatch → braces` dependency-advisory exception remain visible. The documented review-by date is 9 November 2026.

## Recent completed milestones

- **PR #91 — Register/report malformed-data resilience:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/91) at `a50b38e5dc9a60576a9f56953a512f2f4b498f7b`; exact tested head `5e3764f206d16e6b16c05160e0a63e910c45d12f` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38199469555), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38199469567) (202 checks), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38199469560) (129 backend + 202 browser checks). Register/report/bootstrap vendor-cache paths now reject malformed records with visible recovery feedback.

- **PR #90 — Guard malformed amounts in printed vouchers:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/90) at `4ea8c478be7ce33d5b54b098bff3f0f523fc6d33`; exact tested head `095b3aaeb43f001a89001cb9d45b0ad7445f075a` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38197516457), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38197516410) (195 checks) and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38197516419) (129 backend + 195 browser checks). Printed amount-in-words now returns a clear unavailable message for malformed or unrepresentable inputs.

- **PR #89 — Finite monetary rendering and aggregate integrity:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/89) at `f15cbde5b752755b4740b8f8c67db0d3e72073c2`; exact tested head `15b28b298fa54d11946d0e3e08e75cf5ac25ee40` passed CI, Browser E2E (189 checks) and Full Flight Test (129 backend + 189 browser checks). Non-finite and malformed amounts are kept out of key dashboard/register totals and monetary labels.

- **PR #88 — Receipt preview lifecycle cleanup:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/88) at `8dc477863eadd4113928c88f074c3349bb2965d5`; exact tested head `3f5b563abc9b1bb818a6f5bb5a4c89c5025f34b7` passed CI, Browser E2E (187 checks) and Full Flight Test (129 backend + 187 browser checks). Preview URLs are revoked across clear/remove/save/navigation, including asynchronous compression races.

- **PR #87 — Escape API-derived report summary count fields:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/87) at `68982f99a9b3ab795cb77a2ff1531d75aeefc91e`; exact tested head `863ee174675ea0311124b0e39c7510f1221e7a54` passed CI (129 backend checks), Browser E2E (181 checks), and Full Flight Test (129 backend + 181 browser checks). Report summary API values are encoded at their HTML text sinks; test coverage verifies hostile values remain literal text.
- **PR #86 — Dashboard numeric rendering integrity:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/86) at `ac1ea5977dcfc763dfae30e0c80d081affade998`; exact tested head `482de368714e093ad3671ae20bac0290f656fcde` passed CI (129 backend checks), Browser E2E (180 checks) and Full Flight Test (129 backend + 180 browser checks). The change bounds CSS/SVG geometry under malformed bootstrap amounts; it does not validate source ledger data.

- **PR #73 — Report date-range escaping:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/73); 141 browser checks passed.
- **PR #74 — Save-confirmation voucher-number escaping:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/74); Full Flight, CI and Browser E2E passed, with 142 browser checks.
- **PR #75 — Bulk import completion feedback:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/75) at `0d9a6a4ae904862d213144e7a823ca1ec5d547f9`; CI passed, Browser E2E passed 145 checks / 0 failures, and Full Flight Test passed 110 backend checks plus 145 browser checks.
- **PR #76 — Consolidate engineering handoff documentation:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/76) at `b1f2a3234577301e4e9536dd424695976f1d8fca`; three exact-head workflows passed. No application behavior or deployment changed.
- **PR #77 — Escape settings numeric input attributes:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/77) at `539d5d8afd101136f0f1a3922068fc9624d12890`; CI, Browser E2E and Full Flight Test passed at its exact tested head with 146 browser checks.
- **PR #78 — Harden backend action and role allowlists:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/78) at `3ac0c387d52fc2631f26b48f6169a5b6c03a995d`; exact tested head passed CI (112 backend/unit checks), Browser E2E (146 checks) and Full Flight Test.
- **PR #79 — Disable vulnerable runtime Excel parser:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/79) at `df6f3354c4ef30321941c0bf1d9b9b15a399a066`; exact tested head passed CI (112 backend/unit checks), Browser E2E (152 checks) and Full Flight Test. Excel workbook import remains intentionally disabled; CSV/TSV/TXT and paste remain available.
- **PR #80 — Offline outbox failure isolation and account binding:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/80) at `cb98b8ae9e329d34ebb9c068de38a78c3f6902ac`; exact tested head `95c3252a2f58a5453ec5a9e55a88e6f67d69dcc7` passed CI (112 backend/unit checks), Browser E2E (165 checks) and Full Flight Test (112 backend + 165 browser checks).
- **PR #81 — Serialize authentication lockout transitions and handle contention safely:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/81) at `7fc05bb27e4ec6bfca6bc56e35cd31965cea5bcc`; exact tested head `46410471c025b3f2476807db39ee73f5cc1fcb6e` passed CI (120 backend/unit checks), Browser E2E (165 checks) and Full Flight Test (120 backend + 165 browser checks).
- **PR #82 — Voucher correction history and required edit reasons:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/82) at `4082503cf96bf08a2aa6408bde14fbd0bef14d2c`; exact tested head `8b894512bc6903c824c8a69fd4a8bdadc70ad4d6` passed CI (127 backend checks), Browser E2E (171 checks) and Full Flight Test (127 backend + 171 browser checks). Existing AuditLog remains an operational audit, not a tamper-proof ledger.
- **PR #83 — Backup workload observability and failure alerts:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/83) at `dd1a00a1dced79346bbdcb514eea1be7669bcac5`; exact tested head `60b60f25fe7fe0d0d07922930e6215f98a6a7cbc` passed CI, Browser E2E and Full Flight Test. Live MailApp authorization, real scheduled backup observation and isolated restore remain unverified.

For full acceptance criteria, diffs, review discussions and CI evidence, use those GitHub PR records. Do not copy their full histories into this handoff.

## Resume procedure for a new ChatGPT thread

1. Read this file first.
2. Verify the live `main` SHA, the current open PR(s), branch and PR head. Live GitHub state wins if this file is stale.
3. Read `docs/DEVELOPMENT-WORKFLOW.md` and follow its source-of-truth, two-pass review and exact-head verification gates.
4. Read `docs/PRODUCT-ROADMAP.md` to choose the next product/engineering priority. Read `docs/SECURITY-RENDERING-AUDIT.md`, `docs/RELEASE-READINESS.md`, or a requirements/design document only when needed for the chosen scope.
5. Use the verified SHA and current phase at the top of this handoff as the live state; older PR details belong in their GitHub records and the milestones below.
6. Before choosing a new batch, confirm the current open PR and latest `main` SHA from GitHub, then review the roadmap and relevant domain audit. Do not start overlapping work while a focused PR awaits owner review/merge.
7. Live MailApp authorization, real scheduled backup observation and a witnessed restore into a separate recovery Sheet/folder remain owner-authorized operational gates. Do not run `setup()`, `clasp push`, deploy or mutate production without explicit authorization. Preserve the owner's local untracked engineering protocol.

## Current implementation status — PR #102

**Initial failure diagnosed:** the CI quality gate failed because Prettier rejected `frontend/core/utils.js` and `test/test-csv-export.js`. Browser E2E passed on that earlier head, but Full Flight Test failed because the quality gate failed. Those earlier runs do not verify the updated source.

**Consolidated implementation:** one scalar-only conversion boundary serves HTML escaping and CSV cell output. Strings, numbers, booleans and bigints retain scalar conversion; arrays, objects, symbols and other non-scalars become empty output without reading coercion properties or invoking `toString`, `valueOf`, getters or `Symbol.toPrimitive`. HTML entity encoding, CSV quoting and formula/control-prefix neutralization remain required.

**Exit gate:** product/functionality review, independent security/recovery review, lint/format/backend tests, Browser E2E and Full Flight Test must pass on the exact same final PR head. Live deployment, role/receipt authorization, real backup/isolated restore, device/accessibility and complete rendering-audit gates remain open. Owner review and merge remain required.
