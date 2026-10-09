# Frontend Rendering Security Audit

**Status:** incremental; not a full security certification  
**Baseline:** merged source at `15c98c9c2470e1149828b249760661290257544a`, extended in this PR  
**Active frontend:** `index.html` loads `frontend/main.js`; root `app.js` is a legacy artifact and is not the active entry point.

## Objective and rule

The active application uses HTML template strings for several views. The review traces persisted or user-controlled values into text and attribute contexts. Values must be escaped for the output context, and dynamic resource URLs should be assigned through DOM properties after validation rather than concatenated into markup. A green test suite only supports the paths exercised; it does not prove all sinks are safe.

## Changes in this batch

- Apply `esc(dmy(...))` where formatted voucher or date-range values are written into HTML in the register, printed voucher, dashboard, and bulk-preview renderers. `dmy()` is a display formatter, not an HTML sanitizer.
- Add Browser E2E regression cases using hostile markup in user name, vendor name, vendor company, audit details, and a pasted/bulk-preview vendor value. Tests assert the values remain visible as literal text, no injected `img`/ `svg` nodes appear in those view containers, and the payload handler does not execute.
- Preserve existing coverage for a hostile voucher note in the register and for receipt previews being rendered with DOM APIs and generated blob URLs.

## Reviewed rendering surfaces

| File / surface | Current handling observed | Remaining review note |
| --- | --- | --- |
| `frontend/core/ui.js` dialog shell | Dialog title and submit label use `esc()`; error content is assigned with `textContent`. The `body` parameter is intentionally inserted as HTML. | Treat `body` as trusted, caller-authored markup only. Each caller must escape any interpolated persisted or user-controlled value. Consider replacing this raw-template contract in a separately tested refactor. |
| `frontend/features/administration.js` | Vendor fields, user identity fields, settings text fields, IDs in attributes, and audit-log values use `esc()`; role options are sourced from an in-code allowlist. | Verify future fields at the insertion site, including both element text and attribute values. |
| `frontend/core/form-options.js` | Category labels and vendor names in datalist value attributes use `esc()`. | Cached browser data is treated as untrusted input and escaped when rendered. |
| `frontend/features/bulk.js` | Vendor/category/error text is escaped; parsed dates are validated; formatted date output now receives HTML escaping. Progress/results are built from numeric counters and fixed text. | Excel/CSV parsing remains a separate input-validation boundary. Keep imported text escaped even when server validation exists. |
| `frontend/features/dashboard.js` | Vendor/category bars escape visible labels and title attributes; custom date input values and formatted date-range text are escaped; chart labels are escaped. | Numeric geometry is derived from amounts and counts, not raw strings. |
| `frontend/features/navigation.js` | Display name and role are escaped. Navigation labels, icons, keys and action markup are static constants. | Keep navigation metadata in the source-controlled allowlist. |
| `frontend/features/payments.js` | Receipt previews use DOM APIs and assign generated `blob:` URLs through `img.src`; receipt API data URLs are checked against supported base64 raster-image patterns before assignment. Vendor/ID/error values interpolated in templates use `esc()`. | Revoke generated preview object URLs on removal/clear/save in a future resource-lifecycle improvement. The preview conversion is not a substitute for backend receipt authorization. |
| `frontend/features/register.js` | Vendor/category/note/user/cancellation text and voucher IDs in attributes use `esc()`; formatted voucher date output now receives HTML escaping. | Voucher formatting still relies on the backend for semantic date validation; output escaping protects the HTML context if persisted data is malformed. |
| `frontend/features/printing.js` | Property and voucher text, category, notes and amount-in-words are escaped; formatted voucher date output now receives HTML escaping. | Print correctness and physical print fidelity have not been validated on a real printer/device in this audit. |
| `frontend/core/ui.js` and feature renderers generally | Remaining `innerHTML` assignments render app-owned template structure. | A source-based review is required for every new interpolation; this audit has not replaced all template rendering with DOM APIs. |

## Browser regression coverage

Added to `test/e2e.py` in this PR:

- **User list:** malicious user name is rendered as text.
- **Vendor list:** malicious vendor name and company are rendered as text.
- **Owner audit log:** vendor details remain text when displayed from audit records.
- **Bulk preview:** imported vendor content remains text.
- **Existing register check:** malicious voucher note remains text with no injected image.
- **Existing receipt preview check:** preview source is a generated blob URL.

The E2E suite runs against the repository's local mock Apps Script service. It does not verify a live Google deployment, real Sheet/Drive permissions, backup restoration, or every possible payload/output context.

## Out of scope / residual risk

- No claim that every dynamic HTML sink has been exhaustively or formally proven safe.
- No full taint analysis, external penetration test, DOM-XSS fuzzing campaign, or real Google-account test was performed.
- Raw HTML slots such as `dialog(title, body, ...)` remain part of the current architecture. Keep arguments caller-authored and review all interpolation paths.
- The reported dependency audit findings (three high-severity advisories during dependency installation) are a separate dependency-maintenance task. This PR does not change dependency versions.
- No production data, API schema, Apps Script deployment, branch protection, or cash-close behavior is changed.

## Acceptance gate

Before considering this batch ready for review, the CI quality gate and Browser E2E must both pass on the exact final PR head. If an assertion fails, fix the test or product defect and rerun both workflows; do not report an earlier SHA's result as final.
