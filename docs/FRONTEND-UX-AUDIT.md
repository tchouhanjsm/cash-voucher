# Frontend UX and Accessibility Review

**Review date:** 9 October 2026  
**Baseline:** `main` at `4d80152edc986011375230288c9801a0d8d0a505`  
**Scope:** shared modal/dialog primitive, primary navigation semantics, keyboard focus styling and release verification. This is a targeted source/browser review, not a full WCAG conformance audit.

The workflows in this batch also move checkout, Node setup, Python setup and failure-artifact upload to current Node 24-compatible action major versions, removing the observed Node 20 action-runtime deprecation warning.

## Findings and changes in this batch

| Finding                                                                                                               | Risk / user effect                                                                                              | Change                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared dialog lacked an accessible name even though its container used `role="dialog"` and `aria-modal`.              | Screen-reader users may not hear the purpose of the dialog.                                                     | Associate the dialog with its visible heading using `aria-labelledby`.                                                                                                                       |
| Keyboard focus was moved into a dialog but was not contained when tabbing past the first/last control.                | Keyboard users can leave the modal interaction while it is open.                                                | Cycle Tab and Shift+Tab within visible dialog controls; restore focus to the invoking element when it remains available after close.                                                         |
| Dialog errors were plain text without an assertive live announcement.                                                 | Users relying on assistive technology may miss submit errors.                                                   | Use a stable error ID with `role="alert"` and `aria-live="assertive"`.                                                                                                                       |
| Dialog submit code assumed a submit button existed and remained connected.                                            | Implicit form submission or a dialog closing during an async submit could produce a secondary JS error.         | Guard the optional submit button and only re-enable it while still connected.                                                                                                                |
| Navigation used visual selected styling only; icon glyphs were exposed as names.                                      | Current location was not programmatically announced and emoji could add noise.                                  | Set `aria-current="page"` for the selected view, clear stale values, mark icons decorative, and set navigation buttons to `type="button"`.                                                   |
| Gold accent was used for keyboard outlines and the active nav background with white text.                             | Focus/selected state contrast could be insufficient.                                                            | Use a darker focus token and active-nav color; use a light focus ring on the dark sidebar.                                                                                                   |
| The tag-based Release workflow ran `npm run check` but skipped the explicit advisory policy and Browser E2E workflow. | A tagged release could be created without the same dependency gate and core browser journey checks used on PRs. | Run `npm run audit:deps` and `npm run test:e2e` before verifying the release tag/creating the release. Use `.nvmrc` as the Node version source and retain diagnostic artifacts if E2E fails. |

## Browser verification added

- Dialog has a discoverable accessible name.
- Opening the forced-PIN dialog places focus on its first field.
- Tab and Shift+Tab wrap around the first and last dialog controls.
- The selected navigation button exposes `aria-current="page"`; switching views moves that state.
- Decorative navigation glyphs are hidden from assistive technology.

## Intentionally not changed

- Escape/backdrop dismissal was not introduced because several dialogs contain unsaved user input or mandatory PIN-change steps. Closing remains explicit through each dialog's existing Close action; forced PIN change continues to sign out when its Close control is used.
- No payment, cancellation, permissions, API payload, Sheets schema, offline-queue, cash-close or production deployment behavior was changed.
- This patch does not claim a complete contrast audit, screen-reader certification, touch-device audit, live Apps Script verification or WCAG conformance. Real-device checks and a broader form/validation review remain release-readiness items.

## Release gate

The tag-based workflow must pass dependency advisory policy, the repository quality gate, Browser E2E and the existing package-version/tag match before it creates a GitHub Release. Workflow success is not proof of a production Apps Script deployment or live Google account permissions.

## Follow-up: form control semantics and validation

This follow-up batch addresses the screen-level form findings identified during the previous review.

- Payment entry rows now receive distinct accessible names for payee/vendor, amount, category, note, receipt upload and row removal. Dynamic rows are renumbered after removal, and focus returns to a useful field.
- Invalid payment rows show an inline live error, associate it with the relevant field through `aria-describedby`, set `aria-invalid`, and focus the field needing correction. The error clears as the user edits the vendor or amount.
- Empty submissions receive a live error rather than only a transient toast.
- Register search and status/type/vendor/category/user filters have explicit accessible names without changing the filter layout.
- Vendor/user and PIN forms have explicit accessible names. Temporary/current/new PIN inputs are masked, use numeric input hints and use native six-digit pattern validation.
- Browser E2E covers the row error, focus/invalid state, clearing after correction, accessible field names, and remove-row focus/renumber behavior.

This remains a targeted form pass. It does not establish full WCAG conformance, validate every possible server-side error message, or replace real-device and screen-reader evaluation.

## Follow-up: HTML rendering sink review

- Clear-only operations for the shared dialog, receipt preview, and receipt viewer now use DOM APIs instead of assigning an empty `innerHTML` string. Navigation checks modal state without reading its markup.
- The shared `dialog()` body and `head()` extra slots remain trusted, app-authored HTML fragments. Persisted/API/user-controlled values must be escaped in their correct HTML context; untrusted strings must never be passed as whole fragments. This is an explicit review contract, not a sanitizer.
- Browser E2E now probes a stored HTML payload in the voucher register, printable voucher, and manager edit dialog, checking that it remains text and does not create image/SVG elements or execute an event handler.
- Complex screens still use template-based `innerHTML` rendering. This is a focused regression pass, not a formal proof of safety or a replacement for reviewing every future interpolation and live Apps Script response.
