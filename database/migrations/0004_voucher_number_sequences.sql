CREATE TABLE IF NOT EXISTS voucher_number_sequences (
    voucher_type VARCHAR(12) NOT NULL PRIMARY KEY,
    next_number BIGINT UNSIGNED NOT NULL,
    updated_at_utc DATETIME(6) NOT NULL,
    CONSTRAINT chk_voucher_sequence_positive CHECK (next_number > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
