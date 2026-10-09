# Data Durability and Recovery

## The two durability boundaries

The application has two distinct stores and two recovery paths:

1. **Backend records:** Google Sheets records and Drive receipt images, covered by the Apps Script daily backup mechanism after a transaction is synchronized.
2. **Unsynchronized browser records:** pending payments held in IndexedDB on the originating browser/device. They are not in the backend backup until successfully uploaded.

A browser queue export is a recovery aid, not a substitute for backend backup. IndexedDB can be cleared, evicted, corrupted, or lost with the device; it does not replicate pending entries to another device.

## Backend backup mechanism

The current backend source:

- creates a backup root folder and installs a daily time-driven trigger during setup;
- takes a copy of the Sheet;
- copies receipt images into a timestamped snapshot;
- writes a receipt ID mapping manifest;
- uses the script lock to avoid overlapping application writes;
- prunes backup folders older than the configured 90-day retention period;
- records last-success/error metadata in Script Properties.

**Operational status:** the implementation is present in source and mock setup tests. A successful run on the live property account, the backup folder permissions, the completeness of a real snapshot, and a restore drill have not been verified in this review. Do not mark recovery-ready until those gates pass.

## Browser outbox safeguards

The current frontend implements:

- IndexedDB persistence across page restarts;
- stable client IDs and backend idempotency for retries after ambiguous server responses;
- transaction-scoped queue operations and leases;
- cross-tab announcements so open tabs refresh pending state;
- non-destructive JSON export of pending payments;
- recovery import with size/record/content validation;
- skip of matching records and rejection of same-ID/different-content collisions;
- deterministic legacy IDs and preservation of old localStorage content when migration fails.

If a transaction shows as saved on this device, it is **not yet confirmed in the central Sheet**. Users must keep the device/browser available and watch for the pending banner to clear, or export the pending queue if they need to recover/transfer it.

## Backend recovery procedure

If the production Sheet or receipt folder may be damaged:

1. Pause financial entry and preserve the affected production files.
2. Identify a timestamped backup created before the incident.
3. Open the backed-up spreadsheet and confirm the expected tabs and plausible voucher totals.
4. Confirm the receipt folder and manifest map expected source receipts to backup copies.
5. Restore to a new Sheet/folder first; do not overwrite the only remaining copy.
6. Verify row counts, numbering counters, statuses, users, settings and receipt references.
7. Repoint Apps Script Script Properties only after the recovered set is reviewed.
8. Deploy a reviewed backend version only if required, recording the deployment version.
9. Verify owner login, staff/manager permissions, voucher create/cancel, audit output and receipt access.
10. Record the incident, restore point and any transactions that need reconciliation.

This procedure is a guide; it has not been demonstrated against a real backup during this code review.

## Release gate

Before production cutover, the owner must witness all of the following:

- [ ] at least one backup completes under the actual owner account;
- [ ] backup status and location can be retrieved by an operator;
- [ ] spreadsheet copy opens and receipt mapping matches actual files;
- [ ] restore into a separate recovery Sheet is demonstrated;
- [ ] offline queue and recovery import are tested on the actual phone/browser;
- [ ] a pending device-local payment is distinguished clearly from a server-saved voucher;
- [ ] the owner and operators know who is responsible for exporting/retaining pending records.
