# Dependency Security Exception Register

**Last reviewed:** 9 October 2026  
**Scope:** development/build dependencies installed by `npm ci`; this does not claim the local developer toolchain is risk-free.

## Current exception

### GHSA-vfj7-8cjw-p6xm — braces stack-exhaustion denial of service

- **Severity:** High
- **Affected package:** `braces` through version 3.0.3
- **Observed dependency path:** `@google/clasp@3.4.1 → micromatch@4.x → braces@3.0.3`
- **Why three npm audit entries appear:** npm aggregates the same underlying advisory at the affected `braces` package, its `micromatch` parent, and the direct `@google/clasp` dependency. The audit output lists three high-severity package entries, but one distinct GHSA is present in this chain.
- **Upstream status as checked on 9 October 2026:** the [GitHub Advisory Database record](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) states that versions through 3.0.3 are affected and that no patched version is listed. The [upstream issue](https://github.com/micromatch/braces/issues/70) discusses the uncontrolled-recursion flaw.
- **Why we are not applying npm's automated suggestion:** npm proposes a semver-major downgrade of `@google/clasp` to 2.5.0. The current lockfile uses clasp 3.4.1, whose newer releases include security-related filesystem and credential-handling hardening. A blind major downgrade could remove those protections and may introduce older transitive dependencies; it is not a verified safe fix.
- **Decision:** retain the current lock while upstream has no published patched release; track this exact advisory as a time-bounded exception. This is a risk acceptance, not a claim that the dependency is fixed.
- **Scope/exposure:** the vulnerable package exists only in the repository's `devDependencies`, and it is not bundled into the static app or Apps Script runtime. It can affect developer/CI availability when a vulnerable brace pattern is actually processed; do not pass untrusted brace patterns or untrusted file-name patterns to the clasp CLI.
- **Compensating controls:** the full audit remains visible in CI logs; the script permits only this exact advisory through its package-dependency chain; any new or unrelated high/critical finding fails CI. Review is due by **9 November 2026**; CI will reject the exception from **10 November 2026** if it has not been renewed.
- **Owner follow-up:** review upstream for a patched `braces` release or a clasp release removing this dependency path before the review date. If upstream ships a fix, remove the exception and update the lockfile in the same batch.

## Enforcement behavior

`npm run audit:deps` runs full `npm audit --json`, reports package paths and advisory links, and fails on every high/critical finding unless **all** high/critical paths resolve only to the single reviewed GHSA above, the exception is still within its review period, and it is attached to the expected package. New advisory branches through `micromatch` or `@google/clasp` do not inherit an exemption automatically.

This gate does not waive moderate/low findings; it prints them for review without blocking. It also does not hide the high advisory: the count, URLs, dependency paths, and explicit exception are printed on every run.

## Runtime dependencies

The current `package.json` defines only development dependencies; the app frontend is static JavaScript and the backend is Apps Script source. This reduces deployed application exposure to npm package code, but it does not remove the developer/CI toolchain risk. Do not treat `npm audit --omit=dev` alone as a substitute for auditing the development toolchain.


## Runtime-loaded browser scripts

Runtime-loaded browser scripts are a separate supply-chain surface from npm `devDependencies`; the dependency audit above does not cover scripts appended to the document at runtime.

- **Previously loaded:** the bulk importer dynamically loaded `xlsx@0.18.5` from jsDelivr when an `.xls` or `.xlsx` file was selected.
- **Advisory:** [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) identifies SheetJS CE versions through 0.19.2 as affected by prototype pollution in specially crafted workbooks. The advisory states that a fixed 0.19.3 build is available from SheetJS's CDN, not the npm registry.
- **Containment in PR #79:** reject `.xls/.xlsx` before parsing, remove dynamic script loading, and retain CSV/TSV/TXT and pasted-row import. The UI explains the safe conversion/paste fallback. This avoids accepting untrusted workbook files through the vulnerable runtime-loaded parser.
- **Re-enable gate:** only after a vetted, licensed build is self-hosted, its provenance and checksum are recorded, workbook import is covered by adversarial and compatibility tests, and no runtime request to an unpinned third-party script is required. SRI or a CSP alone would not repair vulnerable parser logic.
