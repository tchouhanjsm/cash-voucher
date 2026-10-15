# Engineering Handoff

Updated: 15 October 2026  
Repository: tchouhanjsm/cash-voucher  
Last verified main SHA: 8169cd69cba1251121cc018683c2978a360c037c (PR #132 merge)  
Current phase: Phase 4 — authorization and rendering assurance  
Current working PR: #133 (pending creation at this handoff revision)  
Branch: phase-4/authorization-rendering-assurance-2026-10-15

Canonical documents: docs/PRODUCT-ROADMAP.md, docs/PHASE-4-AUTHORIZATION-RENDERING.md, docs/ACTIVE-DOM-SINK-INVENTORY.md, docs/SECURITY-RENDERING-AUDIT.md and docs/RELEASE-READINESS.md.

## Verified state

- PR #132 is merged at 8169cd69cba1251121cc018683c2978a360c037c.
- PR #132 CI, Browser E2E and Full Flight Test passed on its exact final head e9b09d05909d5da866afc1e2870b07cba6f6cbf9. Browser E2E reported 342 checks passed, zero failed.
- No open pull requests were present when the next phase was started.
- All earlier checks are bounded evidence. They do not prove a deployed Apps Script version, live Sheets/Drive permissions, backup restore, physical-device behavior or assistive-technology accessibility.

## Phase 4 — authorization and rendering assurance

### Outcomes

1. Exercise authenticated API action permissions for staff, manager, owner and accountant against a checked-in expected role/action matrix.
2. Prove bootstrap data separation across two staff accounts, manager/owner, and the report-only accountant role.
3. Prove report access stays separate from receipt, audit, user administration, property settings, backup diagnostics and Daily Cash Close.
4. Keep an inventory of the current 33 innerHTML assignment sites across nine frontend modules and make changes to that inventory fail CI until reviewed.
5. Prohibit new outerHTML assignments, insertAdjacentHTML, document.write, createContextualFragment, eval and new Function use in frontend JavaScript without a separately reviewed design.
6. Preserve the existing end-to-end adversarial rendering tests and avoid claims of full XSS certification.

### Acceptance

- New role/action tests must use real authenticated mock sessions and assert expected allowed/forbidden behavior; the static PERMS map alone is not enough.
- Staff must not read another staff member's vouchers or receipts, or see opening cash or other staff names.
- Accountant can access the recorded movement report but not the register, vendor directory, receipts, audit, user administration, settings or cash close.
- CI, Browser E2E and Full Flight Test must all pass on the same final PR head SHA.
- If any route is found contrary to policy, fix it and add regression coverage. Never weaken an authorization boundary to make a test pass.

## Operational release gates — not verified

1. Owner verifies the intended Apps Script project/version, execution identity, Script Properties, deployment ID and Sheet binding.
2. After explicit release approval and a verified backup, the owner may validate live schemas and perform only the necessary guarded migration steps.
3. Verify actual owner/manager/staff/accountant access and receipt authorization against the deployed endpoint.
4. Witness a real scheduled backup and restore into a separate destination; reconcile row counts, voucher numbering and receipt references.
5. Run install/update/offline/recovery workflows on physical phones/tablets and conduct keyboard, zoom, focus and screen-reader checks.
6. Measure Google Sheets latency, quotas, contention and concurrent numbering before setting production thresholds.
7. Review the time-bounded clasp/micromatch/braces security exception by 9 November 2026.

## Engineering boundaries

- Owner retains merge and release authority. Do not merge, deploy, run clasp push, setup, migration, change production data, or rewrite git history without explicit authorization.
- Preserve local untracked docs/AI-ENGINEERING-PROTOCOL.md; never stage, overwrite or delete it.
- Keep this as the single current handoff. Do not create per-PR handoff files.
