# PHP API session authentication — Phase 15

## Scope and rollout

This phase implements only the authentication boundary under /api/v1. The browser PWA still uses the Apps Script endpoint. No existing Apps Script user, password, session or role is changed. The PHP API does not yet expose voucher, vendor, report, approval or cash-close actions.

## Routes

| Method | Path                              | Purpose                                                         |
| ------ | --------------------------------- | --------------------------------------------------------------- |
| POST   | /api/v1/sessions                  | Validate credentials and issue a session                        |
| GET    | /api/v1/sessions/current          | Restore the signed-in user from the database                    |
| POST   | /api/v1/sessions/current/logout   | Revoke the active session                                       |
| POST   | /api/v1/sessions/current/password | Verify the current password, change it and revoke every session |

Health and metadata routes remain available. Unknown business routes still return 404.

## Password migration

The existing Apps Script credential is HMAC-SHA256 over the UTF-8 string `<salt>:<password>`, keyed by the Script Property `PEPPER`. The PHP verifier uses the same message order and key. The import contract encodes it in users.password_hash as:

    legacy-hmac-sha256$<legacy-salt>$<lowercase-hex-hmac>

During a successful login, the PHP API verifies the original HMAC using CV_LEGACY_PASSWORD_PEPPER, then immediately replaces it with a versioned PASSWORD_DEFAULT hash of a base64 SHA-384 prehash in the same transaction that creates the session and records the successful login audit event. The fixed-length prehash prevents bcrypt's 72-byte input limit from truncating passwords. Plaintext passwords are never imported or persisted.

CV_LEGACY_PASSWORD_PEPPER must be provided securely from the existing Script Property only for the migration period. It is not a source-controlled value. If it is missing, legacy accounts fail closed; do not disable verification or accept an unverified password to work around the missing key.

The existing 8–128 character password policy is retained. A legacy PIN shorter than eight characters is accepted only if both the Owner-approved environment flag CV_ALLOW_LEGACY_SHORT_PASSWORDS=true and the account's must_change_password=1 are present. This narrow compatibility path creates a session that remains marked mustChangePassword; it deliberately does not rehash the short PIN with the normal password hasher. The user must complete the existing password-change flow with a new 8–128 character password. That operation writes the new versioned hash, clears must_change_password and revokes all sessions. A short PIN cannot be used as a normal PHP password or to bypass the forced-change state. The flag defaults to false and must be turned off after the approved migration window.

## Session and CSRF controls

- Session tokens are 256-bit random values. Only SHA-256 digests are stored in user_sessions.
- The cv_session cookie is Secure, HttpOnly, SameSite=Strict and scoped to /api/v1.
- A separate random cv_csrf cookie is readable by same-origin JavaScript. Every authenticated state-changing request must echo it in X-CSRF-Token; both values must match each other and the stored token digest.
- Sessions have a six-hour absolute expiry. Every request joins the current user row, checks active status and resolves the current role. No role or permission claims are trusted from the cookie.
- Deactivation or an unknown role revokes all sessions. Password change revokes every session and requires a fresh sign-in.
- Logout and password change are CSRF protected. Cookies are expired on successful logout/password change.

## Rate limiting and audit

Login failures are keyed by HMAC digests so raw email/IP identifiers are not stored in login_attempts. Separate buckets limit a combined email/IP, an email identity and a source IP. The thresholds are five attempts per 15 minutes for an account/composite and 25 per 15 minutes for an IP. Password re-verification has its own per-user/IP bucket. Only REMOTE_ADDR is trusted; proxy forwarding headers are not used.

Successful login, failed login, logout, password change and failed password re-verification are written to append-only audit_events. Password values, session tokens, CSRF tokens and password hashes are never included in audit details.

## Environment configuration

Set these values in the hosting control panel or process manager, not in a public file:

- CV_AUTH_RATE_LIMIT_KEY: independent random secret, at least 32 characters. Used to HMAC rate-limit subjects.
- CV_LEGACY_PASSWORD_PEPPER: the existing Apps Script PEPPER, supplied only while imported legacy HMAC hashes are still present.
- CV_ALLOW_LEGACY_SHORT_PASSWORDS: false by default; temporarily true only for the Owner-approved, forced-change legacy PIN migration.

The test workflow uses throwaway test-only values. They are not production secrets.

## Remaining authentication/security work

This phase does not implement owner-admin user CRUD/password reset, password recovery, MFA, device inventory, login notification, session revocation UI, email verification or account lockout administration. These are separate follow-on features. Business API handlers must authenticate and authorize each request server-side before they are exposed. Do not switch the PWA, copy real users or migrate passwords until the host and secret handoff are independently approved.
