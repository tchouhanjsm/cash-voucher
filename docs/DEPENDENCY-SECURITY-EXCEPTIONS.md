# Dependency Security Exception Register

**Last reviewed:** 31 October 2026  
**Scope:** development/build dependencies installed by `npm ci`; this does not claim the local developer toolchain is risk-free.

## Current time-bounded exception

### GHSA-mrhx-c7xc-m3w5 — Zod oversized-collection validation memory exhaustion

- **Severity:** High.
- **Affected package/range:** `zod` versions below `4.6.6`; patched release: `4.6.6`.
- **Observed dependency path:** `@google/clasp@3.4.1 → zod@3.x`. The current lockfile resolves Clasp 3.4.1 and its declared Zod range is `^3.25.76`; Zod 4.6.6 is outside that declared major-version range.
- **Upstream status checked 31 October 2026:** the [GitHub Advisory Database](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) lists versions below 4.6.6 as affected and 4.6.6 as patched. The official [google/clasp releases](https://github.com/google/clasp/releases) list 3.4.1 as the latest Clasp release currently available.
- **Why no dependency override was applied:** forcing Zod 4.x into Clasp's declared Zod 3.x range is an unverified major-version override. npm's suggested repair downgrades Clasp to 2.5.0, also a major-version downgrade from the locked 3.4.1. Neither option is accepted without compatibility and security verification.
- **Decision:** retain Clasp 3.4.1 and time-bound this exact Zod advisory as a developer/CI-toolchain exception only. This is explicit risk acceptance, not a claim that Zod 3.x is fixed.
- **Scope/exposure:** the package exists in `devDependencies`; it is not bundled into the static client artifact or Apps Script runtime. It can still affect developer/CI availability when the affected validation path is exercised.
- **Compensating controls:** CI reports every package, severity, installed path and advisory URL. The gate permits only this exact GHSA attached to `zod`; any other high/critical path fails. Reassess by **9 November 2026**. CI rejects the exception from **10 November 2026** if it has not been renewed.
- **Owner follow-up:** check for a Clasp release with a supported patched Zod dependency by 9 November. If one appears, update the Clasp lockfile and remove the exception only after compatibility, full audit, CI and Apps Script staging-deploy validation. Do not change the Clasp version solely to quiet npm's suggested fix.

## Withdrawn advisory — not an active exception

### GHSA-vfj7-8cjw-p6xm — braces stack-exhaustion report

GitHub withdrew this advisory on **23 October 2026**, stating it was not a practically exploitable vulnerability. It is no longer an active exception. Keep it only as historical context: [withdrawn GitHub advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Enforcement behavior

`npm run audit:deps` runs full `npm audit --json`, reports package paths and advisory links, and fails on every high/critical finding unless all high/critical paths resolve only to the single reviewed Zod GHSA above, the exception is still within its review period, and it is attached to the expected package.

Moderate, low and informational findings remain visible but do not block CI. When npm attributes a moderate advisory branch to a high-severity parent, the gate evaluates the severity of each transitive branch independently: moderate/low branches are reported, while every high/critical child branch still requires an exact, current exception. This does not blanket-exempt the parent package or its other dependencies.

The exception is never applied by package name alone, inherited by a new advisory, or used to suppress the full npm audit report.

## Runtime dependencies

The current `package.json` defines only development dependencies; the app frontend is static JavaScript and the backend is Apps Script source. This reduces deployed application exposure to npm package code, but it does not remove developer/CI toolchain risk. Do not treat `npm audit --omit=dev` alone as a substitute for auditing the development toolchain.

## Runtime-loaded browser scripts

Runtime-loaded browser scripts are a separate supply-chain surface from npm `devDependencies`; the dependency audit above does not cover scripts appended to the document at runtime.

- **Previously loaded:** the bulk importer dynamically loaded `xlsx@0.18.5` from jsDelivr when an `.xls` or `.xlsx` file was selected.
- **Advisory:** [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) identifies SheetJS CE versions through 0.19.2 as affected by prototype pollution in specially crafted workbooks. The advisory states that a fixed 0.19.3 build is available from SheetJS's CDN, not the npm registry.
- **Containment in PR #79:** reject `.xls/.xlsx` before parsing, remove dynamic script loading, and retain CSV/TSV/TXT and pasted-row import. The UI explains the safe conversion/paste fallback. This avoids accepting untrusted workbook files through the vulnerable runtime-loaded parser.
- **Re-enable gate:** only after a vetted, licensed build is self-hosted, its provenance and checksum are recorded, workbook import is covered by adversarial and compatibility tests, and no runtime request to an unpinned third-party script is required. SRI or a CSP alone would not repair vulnerable parser logic.
