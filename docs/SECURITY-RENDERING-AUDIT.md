# Frontend Rendering Security Audit

**Status:** incremental; not a full security certification  
**Historical baseline:** merged source at `b1f2a3234577301e4e9536dd424695976f1d8fca` (PR #76 merge)  
**Latest merged review baseline:** `fabf4bba1a964c99c55391c4d4be3f260d787906` (main after PR #137; 28 assignment sites across nine modules before Phase 8's proposed modal change).
**Active frontend:** `index.html` loads `frontend/main.js`; root `app.js` is a legacy artifact and is not the active entry point.

## Objective and rule

**Phase 5 / PR #134 (merged):** ordered source fingerprints now detect edits to a known assignment's template, expression or escaping helper; its tested head passed all three required workflows. A matching fingerprint does not prove contextual safety, eliminate DOM-based risk, or replace manual review and hostile-input tests.

**Phase 6 / PR #135 (merged):** five status/error-only assignments were replaced by DOM nodes and `textContent`, including the Daily Cash Close API error boundary. The active inventory falls from 33 to 28 sinks. Browser E2E verifies that SVG markup in an API-error response is displayed as inert text. This is partial risk reduction; the 28 remaining assignments still require context-specific review.

**Phase 7 / PR #136 (merged):** the accountant Recorded Movement Report is given an adversarial valid-shaped response containing hostile text fields and a formula-leading vendor value. The browser test checks inert HTML rendering, CSV apostrophe neutralization and recovery to the normal report response. This expands verification; it does not claim a confirmed report-renderer defect.

**Phase 4 follow-up — 15 October 2026:** the active modular frontend currently has 33 `innerHTML` assignment sites across nine modules. `scripts/check-dom-sinks.js` locks those per-module counts and fails if they drift or if specified high-risk DOM APIs are introduced. A new mock-authenticated role/action suite separately tests staff/manager/owner/accountant access and own-versus-foreign record visibility. These are drift and regression controls, not proofs that each interpolation is safe or that every authorization scenario has been penetration-tested. The live deployment and production data boundaries remain unverified.

**Cross-phase status update — 15 October 2026:** PR #132 adds a limited high-confidence credential-pattern scan across current tracked text and reachable history, plus a route-registry regression asserting registered actions reject unauthenticated calls. These guardrails do not certify every credential format, prove every role/action combination, or replace the full active DOM-sink review. Count them as verified only after final-head CI passes.

The active application uses HTML template strings for several views. The review traces persisted or user-controlled values into text and attribute contexts. Values must be escaped for the output context, and dynamic resource URLs should be assigned through DOM properties after validation rather than concatenated into markup. A green test suite only supports the paths exercised; it does not prove all sinks are safe.

## Changes in this batch

- Apply `esc(dmy(...))` where formatted voucher or date-range values are written into HTML in the register, printed voucher, dashboard, and bulk-preview renderers. `dmy()` is a display formatter, not an HTML sanitizer.
- Escape the three settings values interpolated into quoted numeric-input `value` attributes (`nextVoucherNo`, `nextReceiptNo`, `openingBalance`). Although the normal backend contract emits numbers, malformed API/cache state must remain inert at an HTML sink.
- Add Browser E2E regression cases using hostile markup in user name, vendor name, vendor company, audit details, and a pasted/bulk-preview vendor value. Tests assert the values remain visible as literal text, no injected `img`/ `svg` nodes appear in those view containers, and the payload handler does not execute.
- Preserve existing coverage for a hostile voucher note in the register and for receipt previews being rendered with DOM APIs and generated blob URLs.

## Reviewed rendering surfaces

### Shared modal shell — `frontend/core/ui.js`

- The dialog title and submit label use `esc()`; error content is assigned with `textContent`.
- `dialog()` accepts only a DOM `Node` or `DocumentFragment`; string bodies are rejected before modal state changes.
- Modal callsites build controls with DOM APIs, use `textContent` for user-derived visible text, and assign input/option values through DOM properties. The modal shell remains a static template with escaped title/submit labels and text-only error output.

### Administration and audit — `frontend/features/administration.js`

- Vendor fields, user identity fields, settings text fields, IDs in attributes, and audit-log values use `esc()`; role options are sourced from an in-code allowlist.
- The audit-log response is an active API boundary: require an array envelope and string fields for `time`, `user`, `action`, `target`, and `details` before filtering, option population, or rendering. Invalid rows are omitted with a visible count; an invalid envelope has an explicit unavailable state, distinct from a genuine empty history. Valid user-supplied strings still render through DOM `textContent`.
- The active Vendors view treats the bootstrap vendor list as untrusted: it validates record/id/name/contact/status shapes before sorting or rendering, omits malformed rows with a visible count, and distinguishes an invalid response envelope from a genuinely empty vendor list. The Edit action resolves against the same validated records.
- The active Users view treats `listUsers` as an untrusted API boundary: only records with a non-empty string ID/name/email, an allowlisted role, and a boolean active flag reach rendering or mutation lookup. It omits malformed rows visibly, distinguishes a non-array response from a valid empty list, and guards user-toggle lookup against stale/missing IDs.
- Verify future fields at the insertion site, including both element text and attribute values.

### Shared form options — `frontend/core/form-options.js`

- Category labels and vendor names in datalist value attributes use `esc()`.
- Vendor frequency aggregation uses a `Map` instead of a normal object, avoiding prototype-name collisions for legitimate vendor values such as `__proto__`, `constructor`, and `toString`.
- Voucher/vendor/cache collections are treated as untrusted shape-wise: only record rows and non-empty string vendor names enter the suggestion list. Invalid cache envelopes, non-array vendor lists, null rows and object-valued names are ignored rather than crashing form render or invoking unsafe object-to-string coercion.
- Browser E2E exercises the actual New Entry datalist using prototype-named bootstrap vendors, disables the cached-name fallback to prove the aggregate path works, and injects a null vendor record plus an object-valued name. This is a focused integrity/resilience regression, not an exhaustive proof of all form sinks.

### Bulk import — `frontend/features/bulk.js`

- Vendor/category/error text is escaped; parsed dates are validated; formatted date output now receives HTML escaping.
- Progress/results are built from numeric counters and fixed text. Excel/CSV parsing remains a separate input-validation boundary; imported text must remain escaped even when server validation exists.

### Dashboard — `frontend/features/dashboard.js`

- Vendor/category bars escape visible labels and title attributes; custom date input values and formatted date-range text are escaped; chart labels are escaped.
- Numeric chart geometry is derived from amounts and counts, not raw strings.

- Dashboard aggregation keys are user-controlled vendor, category and user-name values. A plain object used as the grouping dictionary collides with inherited keys such as `constructor`, `__proto__`, `toString` and `hasOwnProperty`, causing valid groups to be lost or corrupted before rendering and allowing inherited properties to be touched. The follow-up uses `Map` and tests those values end-to-end.

### Navigation — `frontend/features/navigation.js`

- Display name and role are escaped. Navigation labels, icons, keys and action markup are static constants.
- Bootstrap data is untrusted even before it reaches a renderer: the vendor-list cache projection ignores non-record voucher members and accepts only string vendor names, so one malformed entry cannot abort refresh before the register can disclose it.
- Keep navigation metadata in the source-controlled allowlist.

### Payments and receipt handling — `frontend/features/payments.js`

- Receipt previews use DOM APIs and assign generated `blob:` URLs through `img.src`; receipt API data URLs are checked against supported base64 raster-image patterns before assignment. Vendor/ID/error values interpolated in templates use `esc()`.
- Version-1 offline recovery JSON is untrusted input, not a trusted export merely because the app generated it. The recovery boundary uses strict scalar types and allowlists for IDs, account binding, payment fields and receipt metadata; receipt data is size-bounded and only supported MIME values reach the queue. Storage-level restore repeats the validation independently. Legacy migration rejects malformed pre-existing ID types before conversion, preserving the legacy copy rather than silently deleting or coercing it.
- PR #88 closes the preview-resource lifecycle gap: release generated preview object URLs on
  clear, row removal, successful online/offline save, form replacement, and navigation away. If
  asynchronous compression completes after its owning row leaves the active form, its generated
  URL is revoked instead of retained. The preview conversion is not a substitute for backend
  receipt authorization.

### Register — `frontend/features/register.js`

- Vendor/category/note/user/cancellation text and voucher IDs in attributes use `esc()`; formatted voucher date output receives HTML escaping.
- Register search now treats vendor and note fields as untrusted scalars instead of calling `.toLowerCase()` on assumed strings. Non-record entries in the bootstrap voucher list are omitted and disclosed in a status message rather than crashing filtering/rendering.
- Receipt metadata must be an array of non-empty string file IDs before the register opens or adds receipt images. Missing or malformed metadata is visibly flagged; the receipt dialog blocks operations and directs the user to refresh. Valid receipt rows still use the existing data-URL validation and DOM-only image construction.
- Voucher formatting still relies on the backend for semantic date validation; output escaping protects the HTML context if persisted data is malformed.

### Recorded movement report — `frontend/features/reports.js`

- The report response must be an object with an `items` array. An invalid envelope clears stale result rows and shows a recoverable error with Retry rather than crashing the result renderer.
- Each row must have string-shaped text fields, a supported `PAYMENT / RECEIPT` type, a supported `ACTIVE / CANCELLED` status, and a finite non-negative numeric amount before normalization/rendering/export. Rows with malformed members or field shapes are omitted and counted visibly instead of being normalized into apparently valid blank rows.
- The renderer escapes fields at HTML text sinks; output escaping remains distinct from validating the report data contract.
- These checks improve resilience at the client rendering boundary. They do not validate or repair the authoritative Sheet records.

### Printing — `frontend/features/printing.js`

- Property and voucher text, category, notes and amount-in-words are escaped; formatted voucher date output now receives HTML escaping.
- Print correctness and physical print fidelity have not been validated on a real printer/device in this audit.

### Other active template renderers

- Remaining `innerHTML` assignments render structured markup templates, but each interpolation still requires a source-level security review.
- This audit has not replaced all template rendering with DOM APIs or formally proved all interpolations safe.

## Browser regression coverage

Existing Browser E2E regression coverage in `test/e2e.py` includes:

- **User list:** malicious user name is rendered as text.
- **Vendor list:** malicious vendor name and company are rendered as text.
- **Vendor administration list:** Browser E2E injects null, object-valued name and object-valued company records into bootstrap data; the active view must remain usable, disclose omitted rows, retain valid vendors, and create no injected markup.
- **Owner audit log:** vendor details remain text when displayed from audit records.
- **Bulk preview:** imported vendor content remains text.
- **Existing register check:** malicious voucher note remains text with no injected image.
- **Malformed register bootstrap:** null/non-string vendor and note fields, missing receipt metadata, and a non-record voucher are exercised together; search, empty-state recovery, receipt warnings and row omission must remain usable.
- **Malformed report response:** null/string row members and object-valued fields are covered; an invalid `items` envelope must show an error, clear stale rows, and recover when a later retry receives a valid response.
- **Modal edit/cancel:** hostile persisted vendor text remains in the input/text context and creates no `img`/`svg` nodes.
- **Existing receipt preview check:** preview source is a generated blob URL.
- **Settings numeric inputs:** a hostile bootstrap response attempts to break out of each `value` attribute; the settings form must contain no injected image/SVG nodes and the payload handler must not execute.
- **Dashboard grouping keys:** a tampered bootstrap response supplies vendor/category values `constructor`, `__proto__`, `toString` and `hasOwnProperty`; every group must remain visible. The test also asserts the relevant built-in object/function properties remain unchanged, restoring any changed test-only descriptors to avoid contaminating later journeys. This is a data-integrity regression for dynamic keys, not a full XSS certification.

The E2E suite runs against the repository's local mock Apps Script service. It does not verify a live Google deployment, real Sheet/Drive permissions, backup restoration, or every possible payload/output context.

## Out of scope / residual risk

- No claim that every dynamic HTML sink has been exhaustively or formally proven safe.
- No full taint analysis, external penetration test, DOM-XSS fuzzing campaign, or real Google-account test was performed.
- Other active `innerHTML` template renderers remain in the architecture and still require a complete sink-by-sink review. Recent batches address specific sinks and malformed-data paths; they are not a full migration or formal proof of rendering safety.
- The reported dependency audit findings (three high-severity advisories during dependency installation) are a separate dependency-maintenance task. This PR does not change dependency versions.
- No production data, API schema, Apps Script deployment, branch protection, or cash-close behavior is changed.

## PR #69 — DOM-only modal body contract

- Replace the shared dialog's raw HTML body slot with a required DOM `Node`/`DocumentFragment` contract and fail fast on strings.
- Migrate PIN reset, forced PIN change, voucher edit, voucher cancellation and receipt dialogs to DOM-created nodes.
- Build category options, vendor datalist options, and user-derived summary text using DOM properties rather than HTML interpolation.
- Add a Browser E2E regression that creates a voucher with hostile vendor text and exercises edit/cancel dialogs, asserting no injected image/SVG nodes and no payload execution.
- This is a targeted reduction in the shared modal attack surface, not a full migration of every `innerHTML` renderer.

## PR #70 — Escape voucher numbers in register and print

- Escape `vno(voucher)` at the register-row and printed-voucher text sinks; voucher numbers are normally backend-generated but persisted values remain untrusted at rendering time.
- Browser E2E tampers with a bootstrap response so a persisted voucher number contains hostile SVG markup, then asserts literal text in the register and print preview, with no injected SVG or payload execution.
- This is a narrow output-context fix. Other active dynamic HTML sinks remain in scope.

## Acceptance gate

Before considering this batch ready for review, the CI quality gate and Browser E2E must both pass on the exact final PR head. If an assertion fails, fix the test or product defect and rerun both workflows; do not report an earlier SHA's result as final.

## PR #73 — Escape report date-range labels

- The Recorded Movement Report previously interpolated `dmy(R.from)` and `dmy(R.to)` directly into the `#view.innerHTML` template. The date control constrains ordinary input, but `dmy()` is only a formatter and does not encode HTML.
- Escape both formatted labels with `esc()` at the rendering sink.
- Browser E2E installs a hostile value getter on the report's date input, submits the malformed range, and asserts the payload appears only as literal text with no injected SVG node or handler execution. This validates output-context escaping under malformed state, not a claim that ordinary date inputs permit markup.
- Remaining active template renderers still need ongoing source-level review; this change does not provide full XSS certification.

## PR #74 — Escape voucher number in save confirmation

- The successful payment/receipt save panel interpolated `vno(c)` directly into the `#nres.innerHTML` template. The API response is a trust boundary even though normal voucher numbers are server-generated.
- Escape the formatted voucher number at the HTML text sink.
- Browser E2E tampers with the `createVouchers` response and asserts the number appears as literal text, no SVG node is created, and the payload handler does not execute.
- PR #70 covered register and print sinks; this is a separate success-panel sink. Other active template renderers remain in the review scope.

## PR #77 — Escape numeric settings attributes

- The settings renderer interpolated `nextVoucherNo`, `nextReceiptNo` and `openingBalance` directly into quoted HTML input `value` attributes. These fields are numeric under the normal backend contract, but a malformed response can still alter the HTML parser's attribute context.
- Apply `esc()` at each of the three attribute sinks. This is an output-encoding fix, not a replacement for backend validation or a claim that every active template sink is safe.
- Browser E2E tampers with the bootstrap response to place a quote-breaking SVG payload into all three fields, then asserts no image/SVG node is created and no payload handler runs. The test restores a normal bootstrap response before proceeding.

## PR #86 — Dashboard numeric values at CSS geometry sink

- **Confirmed rendering-integrity defect:** `frontend/features/dashboard.js` interpolated computed bar widths into CSS and aggregate amounts into SVG `y`/`height` attributes without a finite-number boundary. Malformed bootstrap/persisted values produced invalid SVG dimensions such as `NaN` during Browser E2E, as confirmed by browser console errors.
- Normalize non-finite amounts out of trend aggregation, use `Map` for date buckets to avoid inherited-key collisions on malformed date values, normalize non-finite group totals to zero for bar presentation, and clamp computed CSS widths to `2–100%`. This bounds rendered geometry without altering source voucher records or claiming ledger validity.
- Browser E2E tampers with bootstrap response values including `NaN`, `Infinity`, a negative value, a hostile amount string, and a hostile vendor label. It checks finite/bounded CSS widths, finite/non-negative SVG geometry, absence of injected nodes, and no payload execution.
- This is a dashboard presentation/integrity guard, not a substitute for backend amount validation or a full XSS audit. The active template/sink inventory remains incomplete.

## PR #87 — Encode report summary count fields

- **Confirmed rendering defect:** the active Recorded Movement Report renderer interpolated API-derived `summary.count`, `summary.activeCount`, and `summary.cancelledCount` directly into HTML text in the summary cards; `summary.count` was also inserted unescaped in the source-voucher metadata line. These are API response values and cannot be assumed safe merely because the normal backend contract returns numbers.
- Apply `esc()` at each HTML text insertion. The backend contract, counting semantics, summary calculations and CSV export behavior are unchanged.
- Browser E2E tampers with the `recordedMovementReport` response using hostile SVG/image markup in all three count fields and verifies they remain literal text, create no SVG/image nodes, and do not execute handlers.
- This is a targeted API-output encoding regression, not a claim that every active rendering sink has been audited or that the application is fully XSS-certified.

## PR #88 — Release receipt preview object URLs

- **Confirmed resource-lifecycle defect:** receipt previews created by `compress()` use
  browser-managed `blob:` URLs. The active payment form did not release them when receipts were
  cleared, rows were removed, saves completed, forms were replaced, or SPA navigation discarded
  an unsaved draft.
- Centralize preview URL revocation in the payment controller and release URLs at those lifecycle
  boundaries. A preview produced by asynchronous compression after its row is detached is
  immediately revoked and is not added to the stale row. Cleanup errors do not block payment
  entry or navigation.
- Browser E2E instruments object URL creation/revocation and covers clear, row removal, successful
  online save, navigation away from an unsaved entry, and compression completing after navigation and clearing during compression.
  Existing receipt data remains available to the save/outbox payload because preview URLs are
  presentation-only and are not submitted to the API.
- This is resource cleanup, not receipt authorization or input-content validation. Backend receipt
  permissions and live Google deployment behavior remain separate verification gates.

## PR #89 — Finite monetary rendering and aggregate integrity

- **Confirmed data-integrity gap:** dashboard summary totals, team/vendor/category aggregates and register paid/received totals still added API/bootstrap amounts directly, even though the dashboard trend/chart geometry already filtered non-finite values. A malformed amount could poison summary totals or produce `NaN`/`Infinity` in money labels.
- Add shared finite-amount and sum helpers. Monetary formatting displays an em dash for non-finite values; dashboard/register calculations exclude invalid amounts from aggregates, and visible status text discloses that active invalid amounts were excluded. Source vouchers are not modified, and this does not certify backend ledger correctness.
- Browser E2E tampers with bootstrap amounts including `NaN`, `Infinity`, a hostile string and valid numeric values. It checks finite dashboard monetary text, the explicit exclusion notice, bounded chart geometry, and register totals with the same malformed records.
- Report summary totals and payment-save confirmations also use the shared formatter, so non-finite values display as an em dash rather than `NaN`/`Infinity`. CSV/API contracts and persisted records are unchanged.

## PR #90 — Guard malformed amounts in printed vouchers

- **Confirmed denial-of-service / presentation defect:** `amountInWords()` called recursive `words()` directly with the raw bootstrap amount. An `Infinity` value can recurse without reaching a base case; `NaN`, negative values and malformed null-like values can produce incorrect text. The shared finite parser also previously coerced missing, blank and boolean values to zero.
- Reject null/undefined, blank strings, booleans, nonnumeric strings and non-finite numbers from the shared finite-amount helper. The print formatter returns `Amount unavailable` for invalid, negative or unrepresentable paise totals, and rounds through integer paise before splitting rupees/paise.
- Browser E2E tampers with bootstrap data and prints records containing `NaN`, `Infinity`, null, blank, boolean and negative amounts. It asserts prompt completion, safe fallback text, and absence of `undefined`, `NaN Rupees` or `Infinity`; the ordinary ₹1,250.50 case remains `One Thousand Two Hundred Fifty Rupees and Fifty Paise Only`.
- These are presentation guards, not authorization, ledger repair or a replacement for the backend's positive/max-amount validation. Persisted vouchers and API/schema/CSV contracts are unchanged.

## PR #92 — Prototype-safe vendor suggestions

- **Confirmed integrity/resilience defect:** `vendorNames()` grouped voucher vendors in a normal object. The special key `__proto__` interacts with the object's prototype setter instead of behaving like a regular vendor key, so a valid vendor suggestion can be lost. The same function assumed all voucher/vendor/cache entries were records with string names; malformed values could abort payment entry before a datalist was rendered.
- Replace the count object with a `Map`; validate row/collection shapes and accept only non-empty string vendor names from vouchers, active vendor records and cached suggestions. Keep HTML attribute escaping in the datalist template and DOM-property assignment in the DOM-node variant.
- Browser E2E verifies `constructor`, `__proto__`, `toString` and `hasOwnProperty` survive into the actual New Entry datalist after disabling cached-name fallback. The bootstrap fixture also includes a null vendor record and object-valued vendor name, which must be ignored without crashing or rendering active markup.
- No persisted data, API/schema, authorization, or production setting changes. Other active template sinks and the complete stored-XSS audit remain open.

## PR #93 — Omit malformed audit-log API rows

- **Confirmed resilience defect:** the active owner audit view accepted an array response but assumed each element was an object. A null row caused `populateAuditOptions()` to throw while reading `row.user`, preventing audit data from rendering.
- Filter response entries to non-null, non-array objects before population/filtering/rendering, and append a visible count of omitted malformed entries. Valid hostile text remains rendered through DOM `textContent`; this is a malformed-response resilience guard, not a new XSS claim.
- Browser E2E tampers with the real `auditLog` API response to prepend null, string and numeric members plus a record containing hostile text. It verifies the audit view and filters remain usable, malformed entries are disclosed, and no injected markup or handler execution occurs.
- No backend/API schema, authorization, persisted records, deployment or production mutation changes. The full active-renderer inventory remains incomplete.

## PR #94 — Guard Administration vendor rendering against malformed records

- **Confirmed resilience/integrity defect:** the active owner/manager Vendors view sorted `S.vendors` using `a.name.localeCompare(b.name)` and rendered every item without validating the bootstrap envelope or row shape. A null member throws during sorting; an object-valued name lacks the expected string method and can also stop the view from rendering. The same unvalidated array was searched by the Edit action.
- Validate the vendor envelope and row fields before sorting or rendering. Only records with a non-empty string ID/name, boolean active flag, and scalar optional contact fields are accepted. Normalize absent/null company/mobile fields to empty strings, visibly disclose omitted malformed rows, and avoid presenting malformed responses as a legitimate empty list. Resolve Edit using the validated collection.
- Browser E2E extends the active bootstrap-tampering scenario with null, object-valued name, and object-valued company records. It verifies valid vendor rows remain actionable, the exact omitted count is announced, invalid rows do not appear, and no markup is created from object-valued metadata.
- All visible vendor fields and IDs remain escaped at their HTML insertion sites. No backend/API contract, permissions, persisted data, or deployment changes. The wider dynamic-renderer inventory remains incomplete.

## PR #95 — Guard Administration user list against malformed API data

- **Confirmed resilience/integrity defect:** the active owner Users view assigned the `listUsers` response directly to its local collection and called `.map()` while interpolating row fields. A non-array envelope failed at rendering; a null row or object-valued identity field failed during rendering, and the same unvalidated collection was used for role/activation lookup.
- Validate the top-level array and each user record before rendering. Require a non-empty string ID/name/email, role from the in-code `staff / manager / owner` allowlist, and a boolean active state. Omit malformed rows with visible status; a non-array envelope gets an explicit unavailable message instead of the valid-empty-list message. Guard user activation lookup against missing validated records.
- Browser E2E intercepts the active `listUsers` endpoint and appends null, primitive, object-valued name/email, and an object-valued role. It also supplies a non-array envelope, checks that retained users and controls remain usable, then restores the valid response and verifies recovery.
- User-supplied display fields and IDs continue to be escaped at HTML insertion points; role-option markup remains sourced from the in-code allowlist. No backend/API contract, authorization, persisted data, or deployment changes. This is a targeted data-boundary resilience fix; the full active-renderer inventory remains incomplete.

## PR #96 — Validate audit-log envelopes and row fields

- **Confirmed resilience defect:** the active audit view treated any non-array `auditLog` response as an empty history and accepted object rows even when individual fields were not strings. An object-valued user field with non-callable `toString`/`valueOf` could throw during filter-option population and cause otherwise valid events to be hidden behind a load-error state.
- Require the server response to be an array and validate the five string fields emitted by `auditLog_()` (`time`, `user`, `action`, `target`, `details`) before records reach filters or rendering. Omit malformed rows with a visible count; show an explicit unavailable state for an invalid response envelope and preserve the distinct valid-empty-list state. CSV export also reports when the source response is unavailable.
- Browser E2E covers malformed members, an object-valued hostile field, a hostile but valid text record, invalid envelope, valid empty array, and recovery to a normal response. It verifies inert rendering and the visible state/counts.
- No backend/API schema, authorization, persisted data, dependency, or deployment changes. The complete active-renderer audit and real deployment/backup/restore checks remain open.

## PR #97 — Reject malformed report-row field types

- **Confirmed report-integrity defect:** the report validated only that each item was an object. An object-valued field (or a string amount) was then normalized to an empty value while the row remained in the table, without increasing the malformed-row count. This could hide malformed source data behind a plausible report row and make the displayed rows/CSV disagree with what the API returned.
- Validate the backend report projection before normalization: expected text fields must be strings, type and status must be from the backend's supported enums, and amount must be a finite non-negative number. Omit invalid rows and disclose the full malformed-row count while preserving valid rows; the backend/API contract and summary accounting are unchanged.
- Browser E2E injects null and primitive members, object-valued row fields with a visible marker, and a string-valued amount row. It asserts all are counted and omitted, and the report recovers to unmodified results after the route interception is removed.
- No backend/schema, permission, persisted data, dependency, or deployment changes. The complete active-renderer inventory and live Apps Script/backup/restore checks remain open.

## PR #99 — Combined operator workflow reliability and rejected-entry recovery

- Queue failure details remain inserted through the existing escaped HTML path; the new client ID action attribute is escaped and resolved through the delegated action registry, not evaluated as markup or script.
- Removing a rejected device-local entry is explicit and owner-bound. The complete recovery queue is exported before confirmation, and the IndexedDB operation rechecks both the `failed` status and matching account key before deleting only that one row. Other account bindings and non-failed queue entries are not eligible for this action.
- Register now distinguishes an invalid bootstrap envelope from a real empty collection without offering the misleading first-entry empty-state guidance. An invalid envelope withholds Register totals and disables CSV export, avoiding plausible-looking zeros or empty exports. A reversed Register date range presents a specific error, withholds totals, and disables CSV export until corrected. Report state clears before a replacement request and exposes retry feedback; report rows continue through strict shape validation and escaped output. The Register total itself is not a live region, avoiding repeated long announcements on every search keystroke.
- This is a scoped review of changed sinks and recovery controls, not completion of the full dynamic-HTML sink inventory or a general security certification.

## PR #98 — Shared bootstrap voucher integrity across Dashboard and Register

- **Confirmed cross-view defect:** bootstrap voucher collections were reduced to arrays of arbitrary members. The Dashboard consumed the shared state via `pays()` / `recs()` and could dereference malformed entries or assume date/vendor/category fields were usable; Register filtered non-records locally but silently blanked malformed metadata, leaving the two views with different diagnostics.
- Add one shared voucher-collection projection at the frontend state boundary. Require a valid array envelope and core voucher identity/date/type/status shapes before records enter shared state. Omit malformed core records with one shared count. Treat a malformed voucher number as a display-field defect so the row stays inspectable: preserve scalar strings for existing escaped sinks, blank non-scalar values, and count the defect. Normalize other malformed display metadata to empty text, and retain malformed receipt metadata for the Register's existing explicit receipt warning. Invalid monetary values remain in the row to preserve the existing `Amount unavailable` printing behavior and are still excluded from totals by the existing finite-amount checks.
- Both Dashboard and Register announce the same malformed-record and normalized-field counts. An invalid voucher-list envelope has an explicit unavailable message, separate from a genuinely empty array, and browser coverage verifies recovery after a valid list returns. The dashboard's balance card is relabeled **Book balance** with an explicit statement that it is not a physical cash count.
- No backend/API/schema, permission, persisted data, accounting formula, dependency, or deployment changes. This is client-side integrity and semantic labeling, not ledger reconciliation or proof of live Sheet correctness.

## PR #100 — Fail closed when Dashboard voucher data is unavailable

- **Confirmed rendering/integrity gap:** Dashboard diagnostics already surfaced an invalid voucher-list envelope, but the same render still produced KPI cards and trend/vendor/category visualizations from empty arrays. That made missing/unavailable data visually resemble zero activity.
- The shared diagnostic separates `dataAvailable` from response-envelope validation. Invalid server response and offline startup with no locally cached voucher set both mark the data unavailable, while retaining distinct reason codes for accurate recovery copy. Vouchers are not added to the local identity cache as part of this change.
- Dashboard omits monetary KPIs and charts while unavailable; Register omits rows and totals and disables CSV export. The normal refresh control remains available. A valid empty array is still an available, genuine empty collection; a subsequent valid bootstrap response restores ordinary views.
- Browser E2E covers an invalid server envelope and the offline cached-session restart path, including unavailable copy, withheld totals/charts/rows/export, and the existing valid-response recovery path.
- No accounting formula, backend/API schema, authorization, dependency, persistence, deployment, or production data changes. This narrows a data-availability ambiguity; it does not certify the complete stored-XSS sink inventory or replace live Sheet validation.

## PR #101 — Fail closed on malformed owner diagnostic responses

- **Confirmed API-boundary resilience gap:** the Settings data-quality scan assumed the response contained numeric summary fields and an issues array of records with string fields; a malformed envelope or issue could throw during rendering. The backup-integrity scan likewise trusted the snapshot list, summary counts, nested row-count map and per-snapshot checks.
- Validate the data-quality summary contract and each issue record before display. Omit malformed issue rows with a visible count; invalid summary envelopes fail closed with an accessible alert and a retryable scan. Keep the issue table DOM-only with textContent, including hostile but valid string values.
- Validate backup-integrity summaries and every snapshot/check shape before rendering. If the report is malformed or summary counts do not reconcile with snapshot states, show a generic accessible error instead of partial or zero-like success data; keep inspection retryable and clear the error after a valid response.
- Browser E2E tampers with both active API responses, asserts malformed records cannot create markup, and verifies recovery on valid responses. These are client-side response-integrity guardrails; they do not prove that Drive backups are complete or restorable, and they do not close the wider dynamic-HTML sink inventory or certify the live deployment.

## PR #102 — Scalar-only HTML and CSV output conversion

- The initial CI failure was formatting-only: Prettier rejected `frontend/core/utils.js` and `test/test-csv-export.js`. The earlier Browser E2E success did not override the failed quality gate or Full Flight Test.
- The shared scalar conversion boundary allows strings and supported primitive values only. Objects, arrays and symbols return empty output before any property access or coercion, avoiding hostile `toString`, `valueOf`, getters or `Symbol.toPrimitive` hooks at both HTML escaping and CSV cell output.
- Preserve context-appropriate HTML entity encoding, CSV double-quote escaping and formula/control-prefix neutralization. Unit coverage includes supported primitives, hostile strings, non-scalar values and throwing coercion hooks; Browser E2E verifies malformed object-valued Settings fields remain blank, keep the view functional and cannot inject markup.
- This narrows the shared output-boundary risk; it does not validate authoritative source records, replace field-level API validation, complete the active `innerHTML` inventory, or certify production deployment/backup restore.

## PR #103 — Guard DOM text sinks against malformed bootstrap scalars

- **Confirmed resilience defect:** the active navigation bootstrap wrote `S.settings.propertyName` to `#brand.textContent` and `document.title`, and converted `S.me.name` / `S.me.role` with `String(...)`. Malformed JSON objects with non-callable own `toString` and `valueOf` fields can throw during implicit/explicit primitive conversion and abort startup. The Settings-save completion path repeated the direct brand assignment.
- Reuse the exported scalar-only text conversion helper for the persisted display name, navigation brand/title, profile label text nodes, and post-save brand update. Preserve DOM-only text construction and the existing neutral brand/title fallback; render malformed fields blank rather than invoking coercion hooks.
- Unit coverage checks strings and supported primitive types, non-scalars, a throwing getter and `Symbol.toPrimitive`; Browser E2E injects object-valued property/profile names and verifies navigation boots, fallback branding appears, Settings remains reachable, and no payload markup executes.
- This is targeted DOMString resilience for non-HTML sinks. It does not complete the dynamic-HTML sink inventory or certify all application rendering, live authorization, backup/restore, real-device behavior or production readiness.

## PR #104 — Harden category option lists against malformed Settings data

- **Confirmed rendering/resilience defect:** shared state exposed `S.settings.categories` and `S.settings.receiptCategories` with only a truthy fallback. The active HTML-template option builder called `.map()`, and the modal/editor DOM-option builder called `.forEach()` before assigning each category to `option.value`. Malformed object/string containers can throw; object-valued members can throw during DOMString conversion.
- Normalize both collections once at the shared state boundary. Only non-empty strings reach renderers; whitespace is trimmed, duplicate labels removed with first-seen order preserved, and non-array/all-invalid values yield the neutral `Other` option. Valid category configuration keeps its existing order and labels otherwise.
- Standard unit tests cover normal, duplicate, whitespace-only, malformed-container and hostile-member cases. Browser E2E exercises the Settings textarea and payment/receipt option paths with a mixed hostile category list and an object-valued receipt-category container.
- This is client display-option resilience. It does not loosen backend category validation, rewrite stored settings or vouchers, or complete the active HTML/DOM rendering-sink inventory.

## PR #105 — Strict offline recovery contract and legacy migration boundary

- **Confirmed resilience gap:** the recovery importer used `String(...)` for client IDs, account bindings, date values and receipt MIME fields from a user-selected JSON file. A plain JSON object with own `toString: null` / `valueOf: null` fields could throw during validation. The same checks lived only in the UI; `offlineQueue.restore()` revalidated only a subset of payment fields before writing to IndexedDB. Legacy localStorage migration also coerced an existing client ID before checking that it was a string.
- Centralize a pure, non-coercive validator and call it at both the file-import and storage-restore boundaries. Validate duplicate IDs, endpoint/account binding, actual ISO dates and supported date range, payment/receipt type, vendor, numeric finite positive amount, optional text fields, receipt MIME/base64 format and bounded payload sizes. Project imported rows and receipt objects onto explicit allowlisted fields before they are queued.
- Use a strict optional-client-ID parser in legacy migration. Malformed pre-existing IDs/account bindings fail closed with recovery-preserving errors; no localStorage or IndexedDB data is silently removed as part of this phase.
- Add the validator module to the service-worker app-shell precache list and increment the cache version. The release-integrity gate checks that every imported local module is present in the shell; the new validator must be available for a cold/offline app start.
- Browser E2E mutates version-1 recovery files to contain hostile ID, owner and receipt-MIME objects. Each case must show a useful rejection, leave the original queue unchanged, and avoid coercion-based exceptions. Standard unit tests cover valid legacy/unbound defaults, schema failures, duplicate IDs, size limits and allowlisting; existing duplicate, conflict, stale-lease, cross-account and lost-response checks remain in the same browser suite.
- This is local recovery-data validation, not a guarantee that a queued entry will be accepted or authorized by the backend. No server/schema/permission/accounting/deployment behavior changes. The full HTML/DOM sink inventory and live backup/restore gates remain open.

## PR #108 — Safe review of device-local queued entries

- The offline banner previously summarized pending work only by aggregate counts. Add a per-entry disclosure for owned pending/sending records while limiting it to five visible rows and explaining how to export the full queue.
- IndexedDB content remains untrusted even though the app normally writes queue rows itself. Display vendor text only after scalar checking, cap its length, validate the date label's shape, allowlist the type/status labels, format only finite numeric amounts, and HTML-escape all untrusted displayed values. Receipt metadata is reduced to a bounded count; it is not rendered as markup or URLs.
- The view is scoped to the normalized endpoint/account owner key. Unbound legacy records retain their separate account-confirmation warning and foreign-account records remain hidden. Pending records are never removed through this disclosure; existing rejected-entry removal still requires recovery export and explicit confirmation.
- Browser E2E checks expected status fields and injects hostile markup into a persisted local queue vendor field, then verifies literal text/no injected elements and restores the fixture before continuing sync tests.
- This closes only the new queue-review sink and a specific operator-visibility gap. It does not prove local storage is tamper-proof, guarantee that a pending row reached the server, complete the overall dynamic-rendering audit, or close live backup/restore and deployment checks.

## Daily Cash Close saved snapshot and rendering boundary — 14 October 2026

The active Cash Close renderer in `frontend/features/cash-close.js` was added after the earlier surface inventory and must remain part of the active sink audit. This batch traced saved-close fields through `backend/54-cash-close.gs`, the API response, close-report/correction/history templates and print rendering.

- **Confirmed financial-integrity defect:** `cashCloseOut_` silently filtered malformed `IncludedVouchers` members and non-string `IncludedVoucherIds` entries. That could make displayed/exported detail incomplete while the stored totals and original close row remained unchanged.
- **Boundary fix:** validate the full voucher snapshot contract; validate the parallel ID list for type, count, identity, ordering and duplicates; and require `IncludedVoucherCount` to match the snapshot. Fail closed with `CASH_CLOSE_DATA`; do not drop, coerce, backfill or rewrite stored history. Valid zero-voucher closes remain supported.
- **Rendering review:** dynamic report, correction, history and print text is inserted through `esc(...)` or the shared finite money formatter plus HTML escaping. Browser E2E injects hostile vendor/correction strings in a successful mock API response and asserts they remain literal text without creating active SVG/image elements or firing the payload.
- This is a targeted response-integrity and rendering regression, not exhaustive taint analysis, a penetration test or XSS certification. The remaining active `innerHTML` inventory, live Google authorization, backup/restore and deployed-source checks remain outstanding.

## Printed-voucher date-shape resilience — 14 October 2026

- **Confirmed resilience gap:** the New Entry success path adds returned `createVouchers` response objects directly to `S.vouchers`. This response does not necessarily pass through the bootstrap voucher normalizer before the user clicks Print. The active print renderer called `dmy(voucher.date)` directly; `dmy` uses string methods and could throw when a malformed successful API response contains an object-valued date.
- **Boundary fix:** a dedicated print-date formatter accepts only a real ISO `YYYY-MM-DD` calendar date before using `dmy`. Malformed/missing date values display the constant `Date unavailable` rather than crashing printing or echoing malformed data.
- **Browser regression:** the mocked `createVouchers` response supplies an object-valued date and a hostile voucher number. The test verifies the print output completes, uses the unavailable-date fallback, leaves the hostile voucher number as inert text and creates no image/SVG elements or page error. A second voucher with a normal date verifies the ordinary display format is preserved.
- This is an output-path resilience guard, not acceptance/repair of malformed server records and not a complete rendering-security certification. Backend validation is still authoritative; the dynamic HTML/DOM audit, live Google authorization, backup/restore and deployed-source checks remain outstanding.

## Recorded Movement Report summary-count coercion guard — 14 October 2026

- **Confirmed malformed-response crash path:** the report validates the summary object and `items` array, then validates individual rows. However, three optional-notice conditions still converted API-derived summary counts with `Number(value)`. A JSON object with own `toString: null` and `valueOf: null` members can throw during numeric coercion while the renderer is rebuilding the view.
- **Boundary fix:** the report boundary requires approval-exception, unmatched-vendor and ambiguous-vendor counts to be non-negative safe integers before accepting the summary. Malformed counts fail closed with a retryable error and suppress stale report totals/rows instead of silently hiding the affected notice. Render-time predicates also avoid implicit object conversion.
- **Browser regression:** the mocked Recorded Movement Report API returns the coercion-trap object for all three fields. E2E verifies the report enters the accessible error/retry state, does not retain report rows or inject SVG/image markup, and reloads successfully after the normal response is restored. Existing hostile scalar-string output tests remain in place.
- This guard addresses a narrowly scoped renderer crash, not general response integrity or full XSS certification. The broader active sink inventory, live authorization, scheduled backup and isolated restore remain open.

## Daily Cash Close preview response-contract validation — 14 October 2026

- **Confirmed client-boundary gap:** the `cashClosePreview` response was passed to the active renderer without validating the envelope or nested arrays. Null entries in unclassified/invalid/pending issue lists or recent close history could throw in row renderers. Object-valued summary counts could also throw during string conversion. The refresh error path retained the previous `data` object.
- **Boundary fix:** validate the open and closed response variants, required fields, dates, booleans, finite money/count values, issue rows, saved-close snapshot IDs/count and correction/history rows before assigning the response to the view. Reset prior preview state at refresh start; malformed responses render a retryable error and provide no Save control.
- **Regression:** Browser E2E removes the required unclassified list, injects a null issue row, supplies a JSON object with non-callable `toString`/`valueOf`, and injects a null recent-history row. Each response must fail closed without a stale closed report or Save action, then recover when the normal response is restored.
- This is targeted response-integrity and rendering resilience, not full XSS certification or proof of live deployment, backup restore, all HTML sinks or accessibility conformance.

## Phase 1 review status — 14 October 2026

PR #126 adds targeted Daily Cash Close preview response validation; see the section above for its exact scope. The complete active HTML/DOM sink inventory, live authorization, secret/history scan, real backup/restore and device validation remain open. See `docs/PHASE-1-REPOSITORY-AUDIT.md`; do not treat this incremental audit as a security certification.

## Phase 8 proposal — reusable modal DOM boundary (15 October 2026)

- Baseline is `fabf4bba1a964c99c55391c4d4be3f260d787906`, after PR #137.
- The shared dialog validates its body as a DOM Node/DocumentFragment but creates the surrounding form, heading, alert and buttons through `modal.innerHTML`.
- Proposed change: create the fixed dialog frame with DOM APIs and write title/submit labels via scalar normalization and `textContent`, preserving current focus and keyboard behavior.
- This is attack-surface reduction, not a confirmed exploit. Browser regression supplies hostile labels and asserts inert text and functional controls.
- If merged, source fingerprints record removal of this sink and the count/API baseline no longer includes `frontend/core/ui.js`. The other templates remain under review.
- No production deployment, live role test, backup/restore, schema or financial-policy change is in scope.
