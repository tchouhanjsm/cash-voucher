CREATE TABLE IF NOT EXISTS shadow_onboarding_states (
    environment VARCHAR(16) NOT NULL PRIMARY KEY,
    stage VARCHAR(32) NOT NULL,
    confirmations_json JSON NOT NULL,
    created_by_user_id CHAR(36) NOT NULL,
    updated_by_user_id CHAR(36) NOT NULL,
    created_at_utc DATETIME(6) NOT NULL,
    updated_at_utc DATETIME(6) NOT NULL,
    CONSTRAINT fk_onboarding_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id),
    CONSTRAINT fk_onboarding_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_issue_rate_limits (
    scope_key CHAR(64) NOT NULL PRIMARY KEY,
    window_started_at_utc DATETIME(6) NOT NULL,
    attempt_count SMALLINT UNSIGNED NOT NULL,
    updated_at_utc DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_issues (
    id CHAR(36) NOT NULL PRIMARY KEY,
    ticket_id VARCHAR(20) NOT NULL,
    reported_by_user_id CHAR(36) NOT NULL,
    reporter_email_snapshot VARCHAR(254) NOT NULL,
    category VARCHAR(16) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    message VARCHAR(2000) NOT NULL,
    context VARCHAR(300) NOT NULL DEFAULT '',
    environment VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'QUEUED',
    delivery_status VARCHAR(16) NOT NULL DEFAULT 'QUEUED',
    delivery_error VARCHAR(300) NULL,
    sent_at_utc DATETIME(6) NULL,
    created_at_utc DATETIME(6) NOT NULL,
    UNIQUE KEY uq_support_ticket (ticket_id),
    KEY ix_support_issue_user_time (reported_by_user_id, created_at_utc),
    KEY ix_support_issue_status_time (status, created_at_utc),
    CONSTRAINT fk_support_issue_reporter FOREIGN KEY (reported_by_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
