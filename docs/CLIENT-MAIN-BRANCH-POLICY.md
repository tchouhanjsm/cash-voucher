# Client-main branch policy

## Authoritative branch contract

- The repository integration target is **client-main**.
- The legacy **main** branch is read-only. Do not use it for application development, release commits or PR targets.
- All code, tests, workflows and documentation changes go through a short-lived **client/** feature branch and a pull request into **client-main**.
- A merge is not deployment authorization. Apps Script, Google resources, staging hosting and production remain separate release boundaries.

## Live governance finding — 28 October 2026

The read-only repository snapshot on 28 October 2026 shows:

- Repository default branch is **main**, not **client-main**.
- GitHub reports **client-main protected=false**.
- Active repository ruleset **24624368** targets **~DEFAULT_BRANCH**. Because the current default is main, it does not govern client-main.
- That ruleset requires only the **quality** status and zero approving reviews. It does not establish the four-check and human-review policy required for client-main.
- The inspected ruleset does not contain an **update** restriction for main, so it does not freeze the legacy branch against ordinary updates.

These are governance blockers, not source-test failures. PR code and green CI do not correct repository settings.

## Verify governance without changing settings

Run the read-only verifier from a trusted local shell using a token with repository metadata and **Administration: read-only** permission. Use `--json` to emit a single machine-readable report for the private release evidence record:

    npm run verify:client-main-governance

Set GITHUB_TOKEN or GH_TOKEN in the shell environment before running the command. Do not put a token in the repository, command output, PR body or evidence file.

For a release bundle, retain the JSON report as the `ownerBranchProtectionVerified` evidence file. The release-bundle validator checks its digest and validates the report's `ok` flag, repository/default branch, four required check groups, integration policy, distinct legacy-main freeze, read-only marker and observation-time binding. This prevents synthetic prose or a hash-only placeholder from passing that gate; it does not authenticate a human witness.

The verifier checks that:

- The default branch is client-main and both branch references are readable.
- client-main is protected by either complete classic protection or an active applicable ruleset.
- The integration policy requires up-to-date CI / Quality, Browser E2E, Full Flight Test and Autonomous Development Monitor checks, at least one approving review, dismissal of stale approvals, resolved review threads, no force-pushes and no deletion.
- The legacy main branch has a distinct active ruleset that restricts updates and deletion, with no bypass actors.
- The GitHub API request scope is sufficient to inspect the governance metadata.

It uses GET requests only, logs sanitized error codes instead of API bodies, and fails closed when permissions or metadata are unavailable. It does not create rulesets, change the default branch, alter branch protection or dispatch workflows.

## Required owner/admin correction

1. Set the repository default branch to **client-main**.
2. Configure and verify active client-main protection. Require pull requests, at least one independent human approval, dismissal of stale approvals, up-to-date checks, review-thread resolution, and the four release checks: CI / Quality, Browser E2E, Full Flight Test and Autonomous Development Monitor. Block force pushes and branch deletion. Remove bypass actors.
3. Create a distinct active ruleset explicitly targeting **main**, with **Restrict updates** and **Restrict deletions**, and no bypass actors. Do not leave the legacy freeze scoped only to **~DEFAULT_BRANCH**, because that target moves when the default branch changes.
4. Rerun the verifier and retain its sanitized result for owner review. Confirm the exact required check contexts in the GitHub UI before enabling release operations.

Do not let engineering automation change owner/admin governance settings. The checker is diagnostic; only the repository owner/admin can apply and verify the required settings.

## Operational gate evidence contract — 28 October 2026

The private release bundle uses two evidence contracts: ownerBranchProtectionVerified must be the JSON output of the read-only governance verifier; the other seven gates must follow docs/RELEASE-GATE-EVIDENCE-SCHEMA.md. All records are exact-byte hashed and bound to the gate, repository, integration SHA and timestamp. Required checks and reviewer/method fields must conform, so a text placeholder or digest-consistent mismatched JSON cannot pass. Supporting record IDs are pointers only and require independent owner/reviewer inspection; schema validation does not prove identity or truth.

The source contract does not resolve the live governance blocker. An authorized owner/admin must correct GitHub settings, and authorized operators must gather real staging/UAT/restore/reconciliation/device/accessibility/customer-acceptance evidence.

## Release boundary

Branch-governance verification does not prove staging identities, credential correctness, deployment version, UAT, isolated restore, seven-sheet/header/count reconciliation, voucher/receipt reconciliation, unchanged production state, live security headers, live authorization, offline/reconnect, print/PDF, accessibility or customer acceptance. Those gates remain blocked until independently witnessed and recorded.

## Execution documents

- [CEO and board product strategy](CEO-BOARD-STRATEGY.md)
- [Release execution plan](EXECUTION-PLAN-2026-10-21.md)
- [Client-main engineering and release strategy](CLIENT-MAIN-ENGINEERING-STRATEGY-2026-10-21.md)
- [Staging release audit](STAGING-RELEASE-AUDIT.md)
- [Current engineering handoff](HANDOFF.md)
