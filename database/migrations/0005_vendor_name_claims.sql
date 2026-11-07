CREATE TABLE IF NOT EXISTS vendor_name_claims (
    normalized_name VARCHAR(120) NOT NULL,
    vendor_id CHAR(36) NOT NULL,
    created_at_utc DATETIME(6) NOT NULL,
    PRIMARY KEY (normalized_name),
    UNIQUE KEY uq_vendor_name_claim_vendor (vendor_id),
    CONSTRAINT fk_vendor_name_claim_vendor FOREIGN KEY (vendor_id) REFERENCES vendors (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
