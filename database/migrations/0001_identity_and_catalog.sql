CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) NOT NULL PRIMARY KEY,
    full_name VARCHAR(80) NOT NULL,
    email VARCHAR(254) NOT NULL,
    email_normalized VARCHAR(254) NOT NULL,
    role VARCHAR(24) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    password_hash VARCHAR(255) NOT NULL,
    must_change_password TINYINT(1) NOT NULL DEFAULT 1,
    created_at_utc DATETIME(6) NOT NULL,
    updated_at_utc DATETIME(6) NOT NULL,
    last_login_at_utc DATETIME(6) NULL,
    UNIQUE KEY uq_users_email_normalized (email_normalized),
    KEY ix_users_role_active (role, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vendors (
    id CHAR(36) NOT NULL PRIMARY KEY,
    display_name VARCHAR(120) NOT NULL,
    company_name VARCHAR(120) NOT NULL DEFAULT '',
    mobile VARCHAR(32) NOT NULL DEFAULT '',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    default_category VARCHAR(40) NOT NULL DEFAULT '',
    default_payment_method VARCHAR(20) NOT NULL DEFAULT '',
    source_legacy_id VARCHAR(128) NULL,
    created_by_user_id CHAR(36) NULL,
    created_at_utc DATETIME(6) NOT NULL,
    updated_at_utc DATETIME(6) NOT NULL,
    UNIQUE KEY uq_vendors_legacy_id (source_legacy_id),
    KEY ix_vendors_display_name (display_name),
    KEY ix_vendors_active (is_active),
    CONSTRAINT fk_vendors_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
    value_json JSON NOT NULL,
    updated_by_user_id CHAR(36) NULL,
    updated_at_utc DATETIME(6) NOT NULL,
    CONSTRAINT fk_settings_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
