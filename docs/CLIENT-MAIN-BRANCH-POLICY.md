# Client-main branch policy

## Source-control rule

- `client-main` is the only integration branch.
- All feature, fix, docs and CI changes should use a short-lived branch prefixed `client/` and a pull request whose base is `client-main`.
- Direct pushes to `main` and `client-main` are blocked by the local pre-push hook. Git hooks can be bypassed or missing on another machine, so GitHub-side rulesets are authoritative.
- `main` is a legacy branch and should remain frozen. Changing the repository default branch alone does **not** prevent pull requests from targeting or merging into `main`.

## Required one-time repository settings

A repository owner with administration permission must complete these settings in GitHub:

1. **Settings → General → Default branch:** change the default from `main` to `client-main`.
2. **Settings → Rules → Rulesets** (or **Settings → Branches** if using classic protection): create an active ruleset for `client-main` requiring a pull request and successful CI quality, Browser E2E and Full Flight Test checks; require the branch to be up to date, block force pushes and deletion, and prevent bypass where available.
3. Create an active ruleset for `main` that restricts updates and deletions with no bypass actors. This makes `main` read-only; use this because the project has explicitly moved its integration target to `client-main`.
4. Keep staging and production releases as separate approval steps. A merged PR does not authorize `clasp push`, Apps Script deployment or cPanel uploads.

## Verification

- The CI target-policy job passes only when a PR's base branch is `client-main`.
- Browser E2E and Full Flight Test run on PRs and on `client/**` feature branches.
- Confirm the GitHub rulesets are Active. After the one-time settings are applied, a harmless test PR targeting `main` should be blocked; do not merge it.
