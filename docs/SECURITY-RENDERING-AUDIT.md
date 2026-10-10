# Frontend Rendering Security Audit

**Status:** incremental; not a full security certification  
**Baseline:** merged source at `970475dc440a3dc84b788087e60a73836d3d8814` (PR #74 merge)  
**Active frontend:** `index.html` loads `frontend/main.js`; root `app.js` is a legacy artifact and is not the active entry point.

## Objective and rule

The active application uses HTML template strings for several views. The review traces persisted or user-controlled values into text and attribute contexts. Values must be escaped for the output context, and dynamic resource URLs should be assigned through DOM properties after validation rather than concatenated into markup. A green test suite only supports the paths exercised; it does not prove all sinks are safe.

## Changes in this batch

- Apply `esc(dmy(...))` where formatted voucher or date-range values are written into HTML in the register, printed voucher, dashboard, and bulk-preview renderers. `dmy()` is a display formatter, not an HTML sanitizer.
- Add Browser E2E regression cases using hostile markup in user name, vendor name, vendor company, audit details, and a pasted/bulk-preview vendor value. Tests assert the values remain visible as literal text, no injected `img`/ `svg` nodes appear in those view containers, and the payload handler does not execute.
- Preserve existing coverage for a hostile voucher note in the register and for receipt previews being rendered with DOM APIs and generated blob URLs.

## Reviewed rendering surfaces

### Shared modal shell — `frontend/core/ui.js`

- The dialog title and submit label use `esc()`; error content is assigned with `textContent`.
- `dialog()` accepts only a DOM `Node` or `DocumentFragment`; string bodies are rejected before modal state changes.
- Modal callsites build controls with DOM APIs, use `textContent` for user-derived visible text, and assign input/option values through DOM properties. The modal shell remains a static template with escaped title/submit labels and text-only error output.

### Administration and audit — `frontend/features/administration.js`

- Vendor fields, user identity fields, settings text fields, IDs in attributes, and audit-log values use `esc()`; role options are sourced from an in-code allowlist.
- Verify future fields at the insertion site, including both element text and attribute values.

### Shared form options — `frontend/core/form-options.js`

- Category labels and vendor names in datalist value attributes use `esc()`.
- Cached browser data is treated as untrusted input and escaped when rendered.

### Bulk import — `frontend/features/bulk.js`

- Vendor/category/error text is escaped; parsed dates are validated; formatted date output now receives HTML escaping.
- Progress/results are built from numeric counters and fixed text. Excel/CSV parsing remains a separate input-validation boundary; imported text must remain escaped even when server validation exists.

### Dashboard — `frontend/features/dashboard.js`

- Vendor/category bars escape visible labels and title attributes; custom date input values and formatted date-range text are escaped; chart labels are escaped.
- Numeric chart geometry is derived from amounts and counts, not raw strings.

### Navigation — `frontend/features/navigation.js`

- Display name and role are escaped. Navigation labels, icons, keys and action markup are static constants.
- Keep navigation metadata in the source-controlled allowlist.

### Payments and receipt handling — `frontend/features/payments.js`

- Receipt previews use DOM APIs and assign generated `blob:` URLs through `img.src`; receipt API data URLs are checked against supported base64 raster-image patterns before assignment. Vendor/ID/error values interpolated in templates use `esc()`.
- Revoke generated preview object URLs on removal/clear/save in a future resource-lifecycle improvement. The preview conversion is not a substitute for backend receipt authorization.

### Register — `frontend/features/register.js`

- Vendor/category/note/user/cancellation text and voucher IDs in attributes use `esc()`; formatted voucher date output now receives HTML escaping.
- Voucher formatting still relies on the backend for semantic date validation; output escaping protects the HTML context if persisted data is malformed.

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
- **Owner audit log:** vendor details remain text when displayed from audit records.
- **Bulk preview:** imported vendor content remains text.
- **Existing register check:** malicious voucher note remains text with no injected image.
- **Modal edit/cancel:** hostile persisted vendor text remains in the input/text context and creates no `img`/`svg` nodes.
- **Existing receipt preview check:** preview source is a generated blob URL.

The E2E suite runs against the repository's local mock Apps Script service. It does not verify a live Google deployment, real Sheet/Drive permissions, backup restoration, or every possible payload/output context.

## Out of scope / residual risk

- No claim that every dynamic HTML sink has been exhaustively or formally proven safe.
- No full taint analysis, external penetration test, DOM-XSS fuzzing campaign, or real Google-account test was performed.
- Other active `innerHTML` template renderers remain in the architecture and still require a complete sink-by-sink review; this PR narrows only the shared modal contract and its current callers.
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

- The successful payment/receipt save panel interpolated `vno(c)` directly into
  `#nres.innerHTML`. The API response is a trust boundary even though normal
  voucher numbers are server-generated.
- Escape the formatted voucher number at the HTML text sink.
- Browser E2E tampers with the `createVouchers` response and asserts the number
  appears as literal text, no SVG node is created, and the payload handler does
  not execute.
- PR #70 covered register and print sinks; this is a separate success-panel sink. Other active template renderers remain in the review scope.