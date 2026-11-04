CREATE TABLE IF NOT EXISTS user_sessions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    session_token_hash CHAR(64) NOT NULL,
    csrf_token_hash CHAR(64) NOT NULL,
    created_at_utc DATETIME(6) NOT NULL,
    last_seen_at_utc DATETIME(6) NOT NULL,
    expires_at_utc DATETIME(6) NOT NULL,
    revoked_at_utc DATETIME(6) NULL,
    UNIQUE KEY uq_user_sessions_token_hash (session_token_hash),
    KEY ix_user_sessions_user_expiry (user_id, expires_at_utc),
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
    subject_hash CHAR(64) NOT NULL PRIMARY KEY,
    window_started_at_utc DATETIME(6) NOT NULL,
    attempt_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until_utc DATETIME(6) NULL,
    updated_at_utc DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS idempotency_requests (
    id CHAR(36) NOT NULL PRIMARY KEY,
    actor_user_id CHAR(36) NOT NULL,
    action_key VARCHAR(80) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    state VARCHAR(16) NOT NULL DEFAULT 'IN_PROGRESS',
    response_json JSON NULL,
    created_at_utc DATETIME(6) NOT NULL,
    completed_at_utc DATETIME(6) NULL,
    UNIQUE KEY uq_idempotency_actor_action_key (actor_user_id, action_key, idempotency_key),
    KEY ix_idempotency_created_at (created_at_utc),
    CONSTRAINT fk_idempotency_actor FOREIGN KEY (actor_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_events (
    id CHAR(36) NOT NULL PRIMARY KEY,
    actor_user_id CHAR(36) NULL,
    actor_email_snapshot VARCHAR(254) NOT NULL DEFAULT '',
    event_type VARCHAR(80) NOT NULL,
    target_type VARCHAR(40) NOT NULL DEFAULT '',
    target_id VARCHAR(128) NOT NULL DEFAULT '',
    before_json JSON NULL,
    after_json JSON NULL,
    reason VARCHAR(500) NOT NULL DEFAULT '',
    occurred_at_utc DATETIME(6) NOT NULL,
    KEY ix_audit_events_time (occurred_at_utc),
    KEY ix_audit_events_actor_time (actor_user_id, occurred_at_utc),
    KEY ix_audit_events_target (target_type, target_id),
    CONSTRAINT fk_audit_events_actor FOREIGN KEY (actor_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
