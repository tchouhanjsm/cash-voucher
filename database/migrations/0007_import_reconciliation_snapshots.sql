ALTER TABLE voucher_import_rows
    ADD COLUMN imported_amount_paise BIGINT UNSIGNED NULL AFTER source_amount_paise;

UPDATE voucher_import_rows AS import_row
INNER JOIN vouchers AS voucher ON voucher.id = import_row.voucher_id
SET import_row.imported_amount_paise = voucher.amount_paise
WHERE import_row.status IN ('IMPORTED', 'REPLAYED')
  AND import_row.imported_amount_paise IS NULL
  AND import_row.voucher_id IS NOT NULL;
