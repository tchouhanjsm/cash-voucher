ALTER TABLE audit_events
    ADD COLUMN source_system VARCHAR(48) NULL AFTER occurred_at_utc,
    ADD COLUMN source_event_id VARCHAR(160) NULL AFTER source_system,
    ADD COLUMN actor_source_id VARCHAR(160) NULL AFTER actor_email_snapshot,
    ADD UNIQUE KEY uq_audit_source_event (source_system, source_event_id);

CREATE TABLE historical_import_batches (
    id CHAR(36) PRIMARY KEY,
    source_system VARCHAR(48) NOT NULL,
    source_batch_id VARCHAR(128) NOT NULL,
    contract_version SMALLINT UNSIGNED NOT NULL,
    source_extracted_at_utc DATETIME(6) NOT NULL,
    manifest_sha256 CHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    voucher_count INT UNSIGNED NOT NULL,
    approval_count INT UNSIGNED NOT NULL,
    audit_event_count INT UNSIGNED NOT NULL,
    receipt_count INT UNSIGNED NOT NULL,
    source_total_paise BIGINT UNSIGNED NOT NULL DEFAULT 0,
    imported_total_paise BIGINT UNSIGNED NOT NULL DEFAULT 0,
    variance_paise BIGINT NOT NULL DEFAULT 0,
    validation_json JSON NULL,
    validated_at_utc DATETIME(6) NULL,
    committed_at_utc DATETIME(6) NULL,
    created_by_user_id CHAR(36) NOT NULL,
    created_at_utc DATETIME(6) NOT NULL,
    updated_at_utc DATETIME(6) NOT NULL,
    UNIQUE KEY uq_historical_source_batch (source_system, source_batch_id),
    KEY ix_historical_batch_status (status, created_at_utc),
    CONSTRAINT fk_historical_batch_creator FOREIGN KEY (created_by_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE historical_import_rows (
    id CHAR(36) PRIMARY KEY,
    batch_id CHAR(36) NOT NULL,
    source_system VARCHAR(48) NOT NULL,
    record_type VARCHAR(16) NOT NULL,
    source_record_id VARCHAR(160) NOT NULL,
    voucher_source_record_id VARCHAR(100) NULL,
    row_sha256 CHAR(64) NOT NULL,
    payload_json JSON NOT NULL,
    storage_key VARCHAR(255) NULL,
    status VARCHAR(16) NOT NULL,
    target_record_id VARCHAR(128) NULL,
    error_code VARCHAR(80) NULL,
    created_at_utc DATETIME(6) NOT NULL,
    updated_at_utc DATETIME(6) NOT NULL,
    UNIQUE KEY uq_historical_source_record (source_system, record_type, source_record_id),
    UNIQUE KEY uq_historical_batch_record (batch_id, record_type, source_record_id),
    KEY ix_historical_batch_type_status (batch_id, record_type, status),
    KEY ix_historical_voucher_reference (batch_id, voucher_source_record_id),
    CONSTRAINT fk_historical_row_batch FOREIGN KEY (batch_id) REFERENCES historical_import_batches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE historical_approval_events (
    id CHAR(36) PRIMARY KEY,
    source_system VARCHAR(48) NOT NULL,
    source_event_id VARCHAR(160) NOT NULL,
    voucher_id CHAR(36) NOT NULL,
    decision VARCHAR(24) NOT NULL,
    previous_status VARCHAR(24) NOT NULL DEFAULT '',
    next_status VARCHAR(24) NOT NULL DEFAULT '',
    reason VARCHAR(500) NOT NULL DEFAULT '',
    actor_source_id VARCHAR(160) NOT NULL DEFAULT '',
    actor_email_snapshot VARCHAR(254) NOT NULL DEFAULT '',
    occurred_at_utc DATETIME(6) NOT NULL,
    payload_json JSON NOT NULL,
    UNIQUE KEY uq_historical_approval_source (source_system, source_event_id),
    KEY ix_historical_approval_voucher_time (voucher_id, occurred_at_utc),
    CONSTRAINT fk_historical_approval_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
