## Outcome

What user/operator problem does this change solve? State the observable outcome.

## Acceptance criteria

- [ ] Describe each observable acceptance criterion.
- [ ] Identify intentional exclusions and compatibility constraints.

## Verification evidence

List exact commands and workflows to run, and link/paste exact-head results before review. Distinguish passed, failed, skipped and not-run checks.

## Security and failure review

Describe authorization, untrusted input/rendering, concurrency, failure/recovery and regression implications. State what was reviewed and what was not applicable.

## Release boundary

State whether API/schema/dependencies/production data/configuration/deployment are affected. Confirm no merge or production deployment was performed by the contributor/agent.

## Residual risks / not verified

List remaining risks, assumptions, external dependencies and any live Google-account, backup-restore, accessibility or device checks that were not performed. Use "None identified in scope" only when a real review supports it.

## Session handoff

Update `docs/HANDOFF.md` as the single live handoff for the next engineering/chat session. Do not create a per-PR handoff Markdown file; this PR description and GitHub's retained checks/review history are the durable change record.

Update a domain document only when the underlying product decision, roadmap priority, security finding, or release-readiness evidence materially changes. Do not update every document just to record the latest PR or main SHA. Exact-head workflow links/results belong in this PR description. Do not merge or deploy on behalf of the owner.
