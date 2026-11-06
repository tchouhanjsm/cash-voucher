<?php

namespace Tests;

use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    private static int $businessDateOffset = 100;

    protected string $userId;
    protected string $sessionToken;
    protected string $csrfToken;
    protected string $businessDate;

    protected function setUp(): void
    {
        parent::setUp();

        $this->userId = self::uuid();
        $this->sessionToken = bin2hex(random_bytes(32));
        $this->csrfToken = bin2hex(random_bytes(32));
        // Every feature test receives a distinct historical business date. Shared
        // synthetic cash-close rows must never poison a later test's date guard.
        $offset = self::$businessDateOffset++;
        $this->businessDate = (new DateTimeImmutable('now', new DateTimeZone('Asia/Kolkata')))
            ->modify('-'.$offset.' days')
            ->format('Y-m-d');

        $this->insertUser($this->userId, 'staff');
        $this->insertSession($this->userId, $this->sessionToken, $this->csrfToken);

        $pdo = DB::connection()->getPdo();
        $seed = $pdo->prepare(
            'INSERT IGNORE INTO voucher_number_sequences (voucher_type, next_number, updated_at_utc)
             VALUES (:type, :number, UTC_TIMESTAMP(6))'
        );
        $seed->execute(['type' => 'PAYMENT', 'number' => 80000]);
    }

    /**
     * @return array<string, mixed>
     */
    protected function authenticatedHeaders(): array
    {
        return [
            'X-CSRF-Token' => $this->csrfToken,
        ];
    }

    protected function withLegacySession(): static
    {
        return $this
            ->withCredentials()
            ->withUnencryptedCookies([
                'cv_session' => $this->sessionToken,
                'cv_csrf' => $this->csrfToken,
            ])
            ->withHeaders($this->authenticatedHeaders());
    }

    protected function withRoleSession(string $role): static
    {
        $this->userId = self::uuid();
        $this->sessionToken = bin2hex(random_bytes(32));
        $this->csrfToken = bin2hex(random_bytes(32));
        $this->insertUser($this->userId, $role);
        $this->insertSession($this->userId, $this->sessionToken, $this->csrfToken);

        return $this->withLegacySession();
    }

    protected function insertVendorFixture(string $name, bool $active = true): string
    {
        $id = self::uuid();
        $statement = DB::connection()->getPdo()->prepare(
            'INSERT INTO vendors (
                id, display_name, company_name, mobile, is_active,
                default_category, default_payment_method, source_legacy_id,
                created_by_user_id, created_at_utc, updated_at_utc
            ) VALUES (
                :id, :name, :company, :mobile, :active,
                :category, :payment_method, NULL,
                :creator, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
            )'
        );
        $statement->execute([
            'id' => $id,
            'name' => $name,
            'company' => '',
            'mobile' => '',
            'active' => $active ? 1 : 0,
            'category' => '',
            'payment_method' => '',
            'creator' => $this->userId,
        ]);

        return $id;
    }

    protected function createUser(string $role): string
    {
        $id = self::uuid();
        $this->insertUser($id, $role);

        return $id;
    }

    protected function insertVoucherFixture(
        string $creatorId,
        string $vendor,
        int $amountPaise,
        ?string $businessDate = null,
    ): string {
        $id = self::uuid();
        $pdo = DB::connection()->getPdo();
        $statement = $pdo->prepare(
            'INSERT INTO vouchers (
                id, voucher_type, voucher_number, business_date,
                vendor_name_snapshot, vendor_id, vendor_type, amount_paise,
                category, notes, status, cash_impact, approval_status,
                approval_reason, payment_method, cancel_reason, client_id,
                source_legacy_id, created_by_user_id, created_by_email_snapshot,
                updated_by_user_id, approved_by_user_id, created_at_utc,
                updated_at_utc, approved_at_utc
            ) VALUES (
                :id, :type, :number, :business_date,
                :vendor, NULL, :vendor_type, :amount,
                :category, :notes, :status, :cash_impact, :approval,
                :approval_reason, :payment_method, :cancel_reason, :client_id,
                NULL, :creator, :email, NULL, NULL,
                UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), NULL
            )'
        );
        $statement->execute([
            'id' => $id,
            'type' => 'PAYMENT',
            'number' => 'fixture-'.substr($id, 0, 8),
            'business_date' => $businessDate ?? $this->businessDate,
            'vendor' => $vendor,
            'vendor_type' => 'UNVERIFIED',
            'amount' => $amountPaise,
            'category' => 'Other',
            'notes' => '',
            'status' => 'ACTIVE',
            'cash_impact' => 'CASH_OUT',
            'approval' => 'NOT_REQUIRED',
            'approval_reason' => '',
            'payment_method' => 'CASH',
            'cancel_reason' => '',
            'client_id' => 'fixture-'.$id,
            'creator' => $creatorId,
            'email' => 'fixture-'.$creatorId.'@example.test',
        ]);

        return $id;
    }

    protected function insertCashCloseFixture(string $creatorId, string $date): void
    {
        $pdo = DB::connection()->getPdo();
        $statement = $pdo->prepare(
            'INSERT INTO cash_closes (
                id, business_date, drawer_key, opening_cash_paise, opening_source,
                opening_close_id, opening_reason, cash_in_total_paise, cash_out_total_paise,
                expected_cash_paise, counted_cash_paise, variance_paise, variance_reason,
                included_voucher_count, included_voucher_ids, included_voucher_snapshot,
                created_by_user_id, created_at_utc, time_zone, request_id, request_payload_hash
            ) VALUES (
                :id, :date, :drawer, 0, :source, NULL, :opening_reason, 0, 0,
                0, 0, 0, :variance_reason, 0, JSON_ARRAY(), JSON_OBJECT(),
                :creator, UTC_TIMESTAMP(6), :timezone, :request_id, :payload_hash
            )'
        );
        $statement->execute([
            'id' => self::uuid(),
            'date' => $date,
            'drawer' => 'TEST-'.substr(self::uuid(), 0, 8),
            'source' => 'MANUAL',
            'opening_reason' => '',
            'variance_reason' => '',
            'creator' => $creatorId,
            'timezone' => 'Asia/Kolkata',
            'request_id' => self::uuid(),
            'payload_hash' => hash('sha256', self::uuid()),
        ]);
    }

    private function insertUser(string $id, string $role): void
    {
        $pdo = DB::connection()->getPdo();
        $statement = $pdo->prepare(
            'INSERT INTO users (
                id, full_name, email, email_normalized, role, is_active,
                password_hash, must_change_password, created_at_utc, updated_at_utc
            ) VALUES (
                :id, :name, :email, :normalized, :role, 1,
                :password_hash, 0, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
            )'
        );
        $email = 'laravel-'.str_replace('-', '', $id).'@example.test';
        $statement->execute([
            'id' => $id,
            'name' => 'Laravel Test '.$role,
            'email' => $email,
            'normalized' => strtolower($email),
            'role' => $role,
            'password_hash' => 'test-only-not-a-usable-password-hash',
        ]);
    }

    private function insertSession(string $userId, string $sessionToken, string $csrfToken): void
    {
        $pdo = DB::connection()->getPdo();
        $statement = $pdo->prepare(
            'INSERT INTO user_sessions (
                id, user_id, session_token_hash, csrf_token_hash,
                created_at_utc, last_seen_at_utc, expires_at_utc, revoked_at_utc
            ) VALUES (
                :id, :user, :session, :csrf,
                UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), UTC_TIMESTAMP(6) + INTERVAL 6 HOUR, NULL
            )'
        );
        $statement->execute([
            'id' => self::uuid(),
            'user' => $userId,
            'session' => hash('sha256', $sessionToken),
            'csrf' => hash('sha256', $csrfToken),
        ]);
    }

    protected static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);

        return substr($hex, 0, 8).'-'.substr($hex, 8, 4).'-'.substr($hex, 12, 4).'-'
            .substr($hex, 16, 4).'-'.substr($hex, 20);
    }
}
