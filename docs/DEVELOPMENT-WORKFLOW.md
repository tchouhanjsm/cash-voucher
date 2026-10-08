# Development Workflow

## Starting a work session

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
npm run check
```

If the working tree is unexpectedly dirty, stop and reconcile before changing files.

## Before implementation

Create a change note using this structure:

```text
# Change

## Goal

## Current behavior

## Target behavior

## Ownership

## Contract

## Files in scope

## Files out of scope

## Acceptance criteria

## Risks
```

## During implementation

Use this order:

```text
Contract → implementation → wiring → static check → behavioral review
```

Do not mix unrelated cleanup into the same wave.

## Before commit

```bash
npm run check
git diff --check
git status --short
git diff --stat
```

Then inspect the actual diff, not only the status summary.

## Commit / PR boundary

A commit should describe the engineering change, not the editing activity.

Bad:

```text
updates
fix
changes
```

Good:

```text
refactor(frontend): move register workflow behind feature controller
```

## Frontend runtime rule

The frontend currently contains legacy `app.js` behavior plus extracted feature modules. During modularization:

- extracted modules are the candidate implementation
- `main.js` is the composition root
- `app.js` remains the compatibility implementation until behavior parity is demonstrated
- backend deployment is not required for frontend-only changes

## Stop conditions

Stop and reassess when:

- a module needs many unrelated dependencies
- `main.js` begins accumulating business logic
- a feature imports another feature's internals
- the backend contract must change to complete a frontend refactor
- the same helper appears in multiple modules
- static checks pass but runtime ownership is unclear
