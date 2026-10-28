# Operational Gate Evidence Schema

## Purpose and security boundary

The release bundle validates both exact SHA-256 digests and JSON contracts for private operational evidence records. The governance gate keeps its dedicated schema from the read-only governance verifier. The other seven gates use the schema in this document; plain text, unrelated JSON, false checks, gate-name mismatch, timestamp drift or a different client-main SHA are rejected even if the declared digest has been recomputed to match.

This validates record integrity and consistency. It does not fetch supporting source records, authenticate a human, independently observe live systems or prove that an asserted check was honestly performed. Reviewers must inspect supporting records. Fixtures prove rejection logic only and must never be reused as live release evidence.

## Required fields

Every non-governance record has exactly these fields and no extras:

| Field               | Required value                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| schemaVersion       | Number 1                                                                                                                   |
| evidenceType        | cash-voucher-operational-gate-evidence                                                                                     |
| repository          | tchouhanjsm/cash-voucher                                                                                                   |
| gate                | Exact gate key from the bundle                                                                                             |
| outcome             | pass                                                                                                                       |
| evidenceRef         | Exact evidenceRef from that bundle gate                                                                                    |
| verifiedAt          | Canonical UTC time, exactly equal to the bundle gate verifiedAt                                                            |
| testedClientMainSha | Full 40-character SHA-1 commit ID matching the bundle source and gate                                                      |
| reviewerRole        | An allowed role for that gate                                                                                              |
| verificationMethod  | Exact method ID assigned to that gate                                                                                      |
| sourceRecordRefs    | One to eight unique safe IDs for separately retained supporting records; no URL, path, email, credential or self-reference |
| checks              | Precisely the gate-specific keys below; every value must be boolean true                                                   |

Safe source IDs use an uppercase type and identifier separated by a hyphen, such as QA-12345 or RUN-71234. The validator checks only ID syntax. It does not retrieve those records or check their contents. Retain the raw captures, UAT output, approval or sign-off privately under appropriate operational controls; never put credentials, customer rows or unredacted logs in these JSON records.

## Gate-specific evidence contracts

| Bundle gate                   | Required checks (all true)                                                                                                      | Allowed reviewerRole               | verificationMethod                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------- |
| liveStagingUatPassed          | dedicatedAccounts, roleMatrix, voucherCreateReadback, editAndVoid, refreshPersistence, receiptConsistency, noProductionMutation | owner, qa, staging-operator        | manual-live-uat                    |
| liveSecurityHeadersVerified   | httpsRedirect, strictTransportSecurity, contentSecurityPolicy, frameAncestors, nosniff, referrerPolicy                          | owner, security-reviewer           | http-header-capture                |
| liveRoleAuthorizationVerified | ownerAccess, managerAccess, staffRestrictions, crossRoleDenial, receiptAccessControl, safeUnauthorizedResponses                 | owner, qa, security-reviewer       | authorization-matrix               |
| offlineReconnectVerified      | offlineIndicator, offlineReadOnlyBehavior, queuedWriteVisibility, reconnectSync, duplicatePrevention, conflictHandling          | owner, qa, customer-representative | device-reconnect-test              |
| printPdfVerified              | voucherPreview, paperLayout, currencyAndDates, pageBreaks, browserPrint, pdfOutput                                              | owner, qa, customer-representative | browser-print-pdf-test             |
| accessibilityVerified         | keyboardNavigation, visibleFocus, labelsAndNames, contrast, zoomAndReflow, screenReaderSmoke                                    | owner, qa, accessibility-reviewer  | automated-and-manual-accessibility |
| customerAcceptanceApproved    | scopeReviewed, criticalWorkflowsAccepted, knownLimitationsAccepted, dataOwnershipAccepted, supportHandoverAccepted              | customer-representative only       | customer-signoff                   |

The reviewer role is self-declared, not authenticated. Customer acceptance must name the customer-representative role, but an owner/reviewer must independently verify the real sign-off source. Mark a check true only after the stated procedure has passed; do not use default-true templates to manufacture a pass.

## Validation workflow

1. Complete the real live test using approved staging identity and resource scope. Evidence generation must not deploy, migrate, write Sheets/Drive or modify production.
2. Retain source captures and sign-off records privately. Create a JSON record containing the exact gate, release SHA, timestamp, allowed reviewer role, method ID, safe supporting IDs and explicit true check map.
3. Save each of the eight evidence files in a private directory outside the repository. The owner-governance file remains the JSON output from the read-only governance verifier.
4. Set the matching bundle evidenceRef, verifiedAt and evidenceSha256 from each actual record. For application gates, set testedClientMainSha to the release source SHA. Do not edit records after hashing.
5. Run the offline bundle validator, then optional read-only GitHub source-run provenance verification. Failures remain blocked and must not be represented as passes.

The directory and file permissions, symlink, size, timestamp freshness and exact-byte digest rules in RELEASE-GATE-BUNDLE.md remain in force. The validator always requires human review; it never grants release approval.
