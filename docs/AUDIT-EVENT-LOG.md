# Audit Event Log

**Status:** source-level traceability contract; not a tamper-evident ledger.

## Event contract

The existing `AuditLog` sheet remains the append target with its existing five columns: `Time`, `User`, `Action`, `Target`, and `Details`. No additional sheet or migration is introduced.

New structured `Details` entries use JSON version 1:

```json
{
  "version": 1,
  "eventId": "unique event identifier",
  "eventType": "VOUCHER_UPDATED",
  "entityType": "voucher",
  "entityId": "source record identifier",
  "reason": "operator-entered reason, when required",
  "summary": "human-readable event summary",
  "changes": [
    {
      "field": "amount",
      "before": 120,
      "after": 175
    }
  ]
}
```

The example is illustrative; IDs and values are generated from the transaction at runtime. Create events represent previously absent fields with `before: null`. Voucher updates and cancellations capture changed fields and the reason. Receipt attachment events record the change in attachment count without copying receipt contents. Daily cash close and correction events record the relevant summary values and attribution.

Bulk voucher creation writes one event per created voucher plus a batch summary. Idempotently skipped duplicate entries are not recorded as new voucher creations. Bulk events are appended in one Sheets range write; audit persistence remains best-effort and must not make a completed voucher write appear to fail.

## Pagination and owner access

The existing owner-only API returns newest-first pages of up to 200 events using a row-number cursor. The cursor is an exclusive upper bound, so rows appended after a page was read do not displace already returned rows from the next page. The UI can load older pages, filter all rows loaded so far, and export those filtered loaded rows.

Old plain-text audit details remain readable. The owner-only UI renders recognized JSON fields as text and exposes the event ID for follow-up.

## Audit health snapshot

The owner-only Audit Log offers a JSON health snapshot download. It contains the monitor status, failure metadata when known, the number of loaded rows, server-reported total when the page read is valid, malformed-row count and explicit limitations. It intentionally does not export audit-event contents. `NO_KNOWN_FAILURE` means no failure marker was read; it is not a completeness guarantee. The snapshot is a point-in-time support artifact, not a durable second audit log, not a tamper-evident record, and not a repair mechanism for missing events. An unavailable or invalid health read is exported as unknown rather than as zero failures.

## Boundaries

- An event ID is a correlation identifier, not a cryptographic integrity proof.
- Audit writes still use best-effort error handling; a failed audit append is not transactionally coupled to a voucher write.
- There is no tamper-evident hash chain, retention guarantee, external archive, or complete financial ledger.
- This does not add roles or approval thresholds. The owner must separately define whether approvals are needed and which amounts/actions/roles and override rules they cover.
