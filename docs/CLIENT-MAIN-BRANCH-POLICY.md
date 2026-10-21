# Client-main branch policy

## Required workflow

- `client-main` is the only integration branch.
- Create feature/fix/docs work on a short-lived `client/*` branch.
- Every pull request must target `client-main`; review the latest diff and verify the exact head SHA's required checks before merging.
- Direct pushes to `main` and `client-main` are blocked by the local pre-push hook, but local hooks can be bypassed or missing. GitHub rulesets/branch protection are the authoritative controls.
- `main` is a legacy branch and must be kept read-only. Changing the repository default branch alone does not prevent a PR from targeting `main`.

## One-time GitHub repository settings (admin required)

1. Open **Settings → General → Default branch**, select `client-main`, then **Update**. This makes new PRs default to `client-main`.
2. Under **Settings → Rules → Rulesets** (or **Settings → Branches** for classic protection), create an active ruleset targeting `client-main` that requires PRs, successful CI/Browser E2E/Full Flight Test checks, up-to-date branches, no force pushes and no deletion. Remove bypass actors where the plan permits.
3. Create a second active ruleset targeting `main` with **Restrict updates** and **Restrict deletions**, and no bypass actors, so `main` remains frozen. Do not use this rule if you have not confirmed that `client-main` has become the agreed integration branch and the current live source.
4. Keep Apps Script, staging cPanel and production releases separately approved. A merge is not a deployment authorization.

## Current release pipeline

The active next step is the six-step staging release pipeline in [the execution plan](EXECUTION-PLAN-2026-10-21.md): complete source release (PR #197 and #198 merged), identify staging and host access, back up and verify schema before required migrations, deploy backend before static frontend and guarded UAT, prove operations plus isolated restore, then run the 14-day hotel pilot after acceptance. This is a plan, not proof of live staging completion. Production remains excluded.

## Current execution documents

- [CEO and board product strategy](CEO-BOARD-STRATEGY.md)
- [Release execution plan](EXECUTION-PLAN-2026-10-21.md)
- [Client-main engineering and release strategy](CLIENT-MAIN-ENGINEERING-STRATEGY-2026-10-21.md)
- [Staging release audit](STAGING-RELEASE-AUDIT.md)
- [Current engineering handoff](HANDOFF.md)

PR #198 is the current release-governance baseline. The execution plan records the six-step staging pipeline; these documents do not certify that live staging or customer acceptance has passed.

## Verification

- Workflow triggers for CI, Browser E2E and Full Flight Test are scoped to PRs targeting `client-main` and client feature branches.
- Verify both GitHub rulesets say **Active** and the repository default is `client-main`.
- After rules are active, a harmless test PR targeting `main` should be blocked by branch policy; never merge that test PR.
