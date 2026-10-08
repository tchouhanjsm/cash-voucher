# ADR 0002 — Declarative Action Dispatch

Status: Accepted

## Decision

Use `data-act` attributes and a shared action registry for cross-feature click actions.

The registry owns lookup and dispatch. The composition root registers handlers that connect the UI action to the appropriate feature API.

## Rules

- preserve existing action names during refactoring
- do not place business logic in the registry
- do not force non-click workflows into click dispatch
- feature-specific event listeners remain feature-owned

## Example

```html
<button data-act="print" data-id="..."><button></button></button>
```

The action registry dispatches `print` to the printing service through composition.
