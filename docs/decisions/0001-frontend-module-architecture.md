# ADR 0001 — Native ES Modules for Frontend Architecture

Status: Accepted

## Context

The application is a static PWA using a Google Apps Script backend. The existing frontend has a large `app.js` containing state, API transport, rendering, navigation, actions, authentication, payments, and administration.

## Decision

Use native browser ES modules with:

- shared `frontend/core/*` modules
- feature factories/controllers in `frontend/features/*`
- `frontend/main.js` as the composition root
- `frontend/core/actions.js` for shared click action delegation

Do not introduce React, Vue, Svelte, a bundler, or another dependency solely to solve modularization.

## Consequences

### Positive

- no new runtime dependency
- clear dependency direction
- easy static hosting
- aligns with the existing PWA architecture
- feature modules can be changed independently

### Negative

- composition must be designed explicitly
- browser module boundaries require disciplined contracts
- some cross-feature dependencies still need adapters

## Guardrail

The goal is to reduce coupling, not merely move code into more files.
