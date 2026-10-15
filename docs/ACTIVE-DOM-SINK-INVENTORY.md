# Active DOM Sink Inventory

**Source baseline:** main merge commit \`8169cd69cba1251121cc018683c2978a360c037c\` (PR #132).  
**Status:** inventory drift is automatically checked; each use still requires context-specific review. This is not XSS certification.

## Reviewed HTML assignment sites

The active modular frontend currently has 33 \`innerHTML =\` assignment sites across nine JavaScript modules:

| Module | Assignment sites | Main rendering contexts |
|---|---:|---|
| \`frontend/core/ui.js\` | 1 | Modal frame; title and submit label use \`esc()\`, body accepts DOM nodes rather than arbitrary HTML strings |
| \`frontend/features/administration.js\` | 7 | Vendors, users, settings, audit, account and administration surfaces |
| \`frontend/features/bulk.js\` | 3 | Bulk page shell, preview rows and import results |
| \`frontend/features/cash-close.js\` | 7 | Cash-close page, loading/error states, saved-close details, preview results and print output |
| \`frontend/features/dashboard.js\` | 1 | Dashboard shell and financial summaries |
| \`frontend/features/payments.js\` | 7 | Payment form/rows and save/queue feedback |
| \`frontend/features/register.js\` | 4 | Register shell, totals, rows and pagination |
| \`frontend/features/reports.js\` | 2 | Report shell and returned report rows/results |
| \`frontend/features/printing.js\` | 1 | Printable voucher |
| **Total** | **33** | |

The machine-readable expected counts live in \`scripts/dom-sink-baseline.json\`. \`npm run check:dom-sinks\` fails when a new sink is added, a reviewed sink disappears/changes count, a new module introduces an HTML sink, or one of the disallowed dynamic DOM APIs is used. A deliberate change requires review of its full interpolation/data flow, a focused adversarial test, and a reviewed baseline update.

## Disallowed dynamic APIs

No active frontend module may introduce the following without an explicit security-design review and separately approved exception: \`outerHTML\` assignment, \`insertAdjacentHTML\`, \`document.write\`, \`createContextualFragment\`, \`eval\`, or \`new Function\`.

## Interpretation limits

- The baseline locks sink count and placement by file, not the safety of every interpolation expression. A changed interpolation within an existing sink still requires ordinary code review and targeted taint/XSS regression.
- Most sinks render templates and many interpolate values. The relevant value must be escaped for its output context or placed via DOM APIs; numeric display formatting is not an HTML sanitizer.
- Existing Browser E2E tests exercise hostile text for specific admin, audit, bulk, register, dashboard, receipt and cash-close surfaces. They do not cover every possible persisted field, API response or browser engine.
- The complete semantic source-to-sink review, live-host headers/CSP, live authorization and adversarial manual review remain release gates.
