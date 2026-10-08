# Data Durability and Recovery

## Objective

The hotel must be able to recover financial records after an accidental edit, deletion, failed deployment, browser/device loss, or a Google Drive/Sheet operational mistake.

## Backend backup model

The backend creates a daily Google Drive backup using an Apps Script installable time-driven trigger.

Each backup contains:

- a copy of the Google Sheet database
- a copy of every receipt image currently in the receipt folder
- a CSV manifest mapping original receipt file IDs to backup receipt file IDs
- a timestamped backup folder

The backup job is serialized with the same ScriptLock used by application writes so a backup does not run concurrently with a voucher write.

The default retention is 90 days.

Apps Script installable triggers run under the account that created the trigger, so the backup trigger must be installed by the hotel owner account that owns the Sheet and Drive data. Google documents time-driven installable triggers and their execution identity here: https://developers.google.com/apps-script/guides/triggers/installable

## Backup status

The script stores BACKUP_LAST_SUCCESS, BACKUP_LAST_ERROR and BACKUP_FOLDER_ID in Script Properties.

## Recovery procedure

If the live Sheet is damaged:

1. Stop using the application.
2. Identify the last known-good backup folder.
3. Open the backed-up spreadsheet copy.
4. Confirm the Vouchers, Users, Vendors, Settings and AuditLog tabs.
5. Confirm receipt images and receipt-manifest.csv.
6. Preserve the damaged production Sheet for investigation.
7. Restore data into a new recovery Sheet rather than overwriting the original immediately.
8. Repoint the Apps Script SS_ID only after the recovered data has been verified.
9. Deploy the reviewed backend version.
10. Verify login, permissions, voucher numbering and receipt access before reopening the application.

## Important frontend boundary

The backend backup protects data that has successfully reached Google Sheets and Drive.

It does not protect an unsynced offline entry stored only inside a user's browser.

The offline queue therefore needs its own durability work before production cutover:

- use IndexedDB instead of localStorage for queued financial entries
- make queued entries durable across browser restarts
- provide an explicit pending-sync state
- prevent accidental discard
- provide a user-visible export/recovery mechanism for entries that cannot sync
- keep client IDs stable across retries
- verify recovery after browser restart and temporary storage/network loss

## Release rule

No production cutover should occur until:

- at least one real backup has completed successfully
- a backup can be opened
- receipt recovery has been demonstrated
- the offline queue recovery workflow has been verified on the actual hotel device
- the hotel owner knows where backups are stored and how recovery is initiated
