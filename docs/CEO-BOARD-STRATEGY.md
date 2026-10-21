# Cash Voucher — CEO and Board Strategy

**Decision baseline:** 21 October 2026  
**Active engineering branch:** client-main  
**Source baseline reviewed:** d5ed3e77387d0f1896c97dbaac793ed23b17eb32, after PR #197  
**Status:** decision record; not deployment authorization.

## Board decision

Evolve Cash Voucher from a voucher register into the simplest dependable daily money-control workflow for an owner-operated business: know what came in, what went out, what needs attention, and whether today's physical cash can close.

The advantage is trust, fast daily use, honest offline recovery, separation of physical cash from digital payments, predictable onboarding and repeatable support—not a long feature list, generic AI or a premature multi-tenant rewrite.

**Immediate direction: release readiness before feature expansion.** PR #197's fast-entry and live batch-total source work has reported passing quality, Browser E2E and Full Flight Test runs on its then-current head. This is source-level evidence, not proof of the currently deployed Apps Script project, static site, backup/restore or customer acceptance.

## Customer wedge

Start with independent small hotels, restaurants and cafes where an owner/manager records receipts, cash/vendor payments, approvals and a daily drawer close. Validate with one real design-partner customer before expanding. Separate observed customer pain from founder hypotheses; a single customer's request does not automatically become a product requirement. Do not claim fit for retail, grocery, chains, accountants or multi-property groups without further evidence.

At shift start, the operator needs to know where to begin. During work, recording a movement should be quick. At close, the manager needs trusted reconciliation and visible exceptions. The owner needs a concise, credible summary without learning a complex accounting suite.

## Product principles

1. **Trust before speed:** pending, failed, offline, canceled, approved and closed states must remain distinct.
2. **Cash is not total money:** only physical cash affects the drawer; UPI and bank transfers do not.
3. **Preserve data:** prefer additive, schema-checked migrations and verified backups. Never infer historic payment method, approval, vendor identity or cash impact silently.
4. **Independent authority:** payments at or above ₹10,000 require an independent approver; a creator cannot approve their own payment. Close snapshots and corrections must be explicit.
5. **Offline truth:** local-only entries must not be represented as centrally saved or backed up.
6. **Safe core:** preserve customer export and essential recovery. No silent posting or destructive background automation.
7. **Stay focused:** no general POS/PMS, payroll, inventory or tax suite in the initial release.

## Product sequence

### Gate 0 — release confidence

Stop broad feature expansion while proving staging target identity, guarded UAT, live role boundaries, real backup and isolated restore, device/offline behavior, print/export and customer acceptance.

### Gate 1 — controlled customer pilot

Run a 14-day pilot only after launch gates pass. Track reconciliations, exceptions, offline queue state, backups, incidents and fallback daily. Pause on missing/duplicate vouchers, unexplained cash variance, missing receipts, failed backup, uncertain resource identity, unauthorized access or unrecoverable offline entries.

### Gate 2 — one integrated workflow batch

After pilot evidence, consider **Today → Close → Owner card** as one cohesive vertical slice. Today prioritizes actions/exceptions; Close guides sync, pending movements, physical cash, classification and sign-off; Owner card separates physical cash from digital movement and reports only verifiable sync/backup evidence. Build only if pilot observations show material friction. Establish a baseline and acceptance metric before implementation.

### Gate 3 — evidence-led extension

Possible later work: durable audit-failure fallback, device reconciliation, accountant export mapping and reusable onboarding. Each needs a named problem, risk analysis and acceptance criteria. A qualified professional must validate jurisdiction-specific tax treatment.

## Automation and AI

Use deterministic automation first: surface unsynchronized/rejected/pending/unclassified items, remind about incomplete closes, summarize verified owner metrics, suggest recurring entries as human-confirmed drafts, and provide exportable recovery reports. Do not auto-post, auto-approve, fabricate audit history, automatically reconcile an unknown variance, or start outbound WhatsApp messaging in the first release. AI is optional only when a validated task materially benefits and a deterministic fallback remains.

## Commercial thesis

Free core access can support adoption, but free code alone is not defensible. Defensibility comes from reliability, safe workflows, onboarding, support, recovery expertise and implementation/accountant relationships. Keep basic capture, data ownership, export and essential recovery in the core. Test paid onboarding, configured support, advanced reporting/automation or managed service only after observing recurring use and willingness to pay.

Treat the first customer as a design partner with documented scope, acceptance, support boundaries, fallback, data ownership and exit/export terms. Avoid a bespoke fork only one customer can maintain.

## Architecture

Keep the existing customer-specific Google Apps Script + Sheets + Drive model through the first validated pilot. Preserve migration seams with stable service boundaries, explicit IDs, export/import formats, separate config and idempotent operations. Reconsider a managed database only after measured quota/concurrency failures, unacceptable latency, a real multi-location requirement or justified economics. Any migration needs a tested reconciliation and rollback plan plus data isolation.

## Security and financial invariants

- Unique Script, Sheet, receipt/backup folders, deployment and origin for each customer; distinct staging and production resources.
- Backend-enforced Owner/Manager/Staff permissions and denied-operation tests.
- Independent payment approval, idempotent financial writes and controlled closed-period corrections.
- Actual backup artifact inspection and restore to a separate target; structural CI is not restore proof.
- Live response-header verification; generated header files are not proof of host behavior.
- No setup/migrations on an unverified or populated target. A merge is not upload, deploy, migration or production approval.
- Keep credentials, private records, customer IDs and OAuth data out of code review artifacts and logs.

## Decision register

- **First segment:** independent small hospitality operators. Reopen if research proves a stronger repeatable segment.
- **Architecture:** per-customer GAS + Sheets + Drive for the first pilot. Reopen if measured service limits or concrete customer demand justify cost.
- **AI:** not required for core workflows. Reopen only when a validated task benefits and a safe deterministic fallback exists.
- **Data export/recovery:** remains in core; do not remove access to customer-owned records as a monetization lever.
- **Denomination rows:** optional unless pilot evidence demonstrates material operational value.
- **Accountant export:** generic recorded-movement CSV first; destination-specific mapping waits for a selected software/version and validated anonymized fixture.
- **Next product batch:** Today → Close → Owner card, only if pilot evidence justifies it.

## First 90 days

1. **Release and acceptance:** verify branch controls, staging identity/UAT, backup/restore, device/accessibility and written acceptance.
2. **Observe usage:** capture daily evidence and incidents across the 14-day pilot; convert repeated friction into evidence-backed problems.
3. **Improve the measured bottleneck:** implement one cohesive batch with baseline and post-change checks for accuracy, time, failed saves, recovery and adoption.

Weekly review should ask what release/customer-risk gate changed with evidence, which repeated pain was observed, what the highest-value bottleneck is, what is being stopped/deferred, and which decision requires approval.

**Board conclusion:** prove the daily money-control loop before scaling. Release evidence before scale, a satisfied pilot before broad marketing, and measured reliability before architectural ambition.
