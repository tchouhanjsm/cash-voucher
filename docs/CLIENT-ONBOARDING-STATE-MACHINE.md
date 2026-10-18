# Server-backed Client Onboarding

## Scope and release boundary
The onboarding dashboard uses customer-owned Apps Script Script Properties for durable progress. Backend checks use live instance configuration; owner confirmations store actor identity, timestamp, a bounded evidence note and an audit event. The client-facing HTML checklist remains a guide, not authoritative server state.
No customer Google resources, deployments, website or data are changed by this source PR. Mock and CI results do not prove public deployment, Google permissions, physical-device UAT or restore success.

## Environment binding
Every customer must own a unique Apps Script project, bound Sheet, receipt folder, backup folder, Web App deployment and static website origin. Configure `CV_ENVIRONMENT` as `staging` or `production`, `CV_DEPLOYMENT_ID` as the exact active deployment ID, and target properties `CV_STAGING_SCRIPT_ID`, `CV_STAGING_SPREADSHEET_ID`, `CV_STAGING_DEPLOYMENT_ID`, `CV_STAGING_RECEIPT_FOLDER_ID`, `CV_STAGING_BACKUP_FOLDER_ID`, plus equivalent `CV_PRODUCTION_*` properties.
A customer build requires `CV_API_URL` and `CV_ENVIRONMENT`; it derives `DEPLOYMENT_ID` from the verified `/exec` URL. Backend checks compare this against active properties and Script/Sheet/folder identity. Apps Script cannot directly introspect the URL loaded by the client, so deployment identity must be independently verified and registered by the operator. Never infer identity from hostname or reuse root `config.js` without verification.

## Staging
1. Preflight automatically checks environment/resource identity, non-placeholder property configuration, active Owner/Manager/Staff users whose temporary passwords are changed, schema, folder access, scheduled backup trigger, and a recent successful backup with no later attempt or recorded failure.
2. After preflight passes, owner advances to staging UAT. Protected financial routes accept test writes only during that stage. Manual tests cover login/roles; voucher/receipt; approval at INR 10,000 or more plus no self-approval; cash close/reconciliation; offline queue sync and duplicate prevention on the actual device; restore into separate recovery resources; final owner sign-off.
3. Complete status only proves required owner confirmations were saved; it is not production acceptance.

## Production acceptance
Production independently runs preflight against its own resources. After that, the owner records operator-witnessed restore drill, acknowledges offline-data/backup limitations, and provides final acceptance. Production writes remain blocked until accepted and technical requirements continue to pass. Synthetic UAT transactions are prohibited on production.

## Security and evidence
- Onboarding actions require authenticated owner/Settings permission; confirm/advance also explicitly require owner role.
- State is stored per environment in Script Properties, not localStorage. Evidence is 12–500 characters; never enter passwords, session tokens or private resource IDs.
- Confirmations and transitions produce audit events. Evidence is an owner assertion, not automatic proof of physical-device tests or restore success.
- Financial mutation routes are checked centrally. Login, password change, user administration, settings and read-only diagnostics remain available to aid recovery.
- The separate staging GitHub workflow and its CI records cannot satisfy public deployment, device UAT or a restore drill.

## Existing instances
Never run `setup()` on a populated Sheet; it rewrites expected headers and may install/replace triggers. Verify identities and backups first, then use a reviewed migration. Do not deploy from this PR without separate authorization. Exact-head CI, browser E2E and Full Flight Test must pass before merge.