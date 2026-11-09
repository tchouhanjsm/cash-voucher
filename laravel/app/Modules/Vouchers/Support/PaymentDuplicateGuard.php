<?php

namespace App\Modules\Vouchers\Support;

use App\Modules\Identity\RoleCapabilities;
use CashVoucher\Api\Support\ApiException;
use PDO;

final class PaymentDuplicateGuard
{
    /**
     * Find conservative exact-payee/date/amount candidates. The legacy app's
     * confirmation UX is preserved: possible duplicates are shown, not silently saved.
     *
     * @param array<string, mixed> $voucher
     * @return list<array<string, mixed>>
     */
    public function candidates(PDO $pdo, array $voucher): array
    {
        if (($voucher['type'] ?? 'PAYMENT') !== 'PAYMENT') {
            return [];
        }

        $statement = $pdo->prepare(
            'SELECT id, voucher_number, business_date, vendor_name_snapshot,
                    vendor_id, amount_paise, created_by_user_id
             FROM vouchers
             WHERE voucher_type = :type
               AND status = :status
               AND business_date = :business_date
               AND amount_paise = :amount_paise
             ORDER BY created_at_utc DESC
             LIMIT 101'
        );
        $statement->execute([
            'type' => 'PAYMENT',
            'status' => 'ACTIVE',
            'business_date' => $voucher['date'],
            'amount_paise' => $voucher['amountPaise'],
        ]);

        $matches = [];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $leftId = (string) ($voucher['vendorId'] ?? '');
            $rightId = (string) ($row['vendor_id'] ?? '');

            if ($leftId !== '' && $rightId !== '') {
                $samePayee = hash_equals($leftId, $rightId);
            } else {
                $samePayee = self::normalizeName((string) $voucher['vendor'])
                    === self::normalizeName((string) $row['vendor_name_snapshot']);
            }

            if ($samePayee) {
                $matches[] = $row;
            }
        }

        if (count($matches) > 100) {
            throw new ApiException(
                409,
                'DUPLICATE_REVIEW_LIMIT_EXCEEDED',
                'Too many possible matches exist. Ask an Owner to review this payment before retrying.',
            );
        }

        return $matches;
    }

    /**
     * @param array<string, mixed> $voucher
     * @param list<array<string, mixed>> $matches
     * @param array<string, mixed> $principal
     * @return array<string, mixed>
     */
    public function present(array $voucher, array $matches, array $principal): array
    {
        $visible = array_values(array_filter(
            $matches,
            static fn (array $row): bool => RoleCapabilities::canViewVoucher(
                ['id' => $principal['id'], 'role' => $principal['role']],
                (string) ($row['created_by_user_id'] ?? ''),
            ),
        ));

        return [
            'matches' => array_slice(array_map(
                static fn (array $row): array => [
                    'voucherNo' => (string) $row['voucher_number'],
                    'date' => (string) $row['business_date'],
                    'vendor' => (string) $row['vendor_name_snapshot'],
                    'amountPaise' => (int) $row['amount_paise'],
                ],
                $visible,
            ), 0, 4),
            'duplicateCount' => count($matches),
            'hiddenCount' => count($matches) - count($visible),
            'confirmationToken' => $matches === []
                ? ''
                : $this->issueToken($voucher, $matches, $principal),
        ];
    }

    /**
     * @param array<string, mixed> $voucher
     * @param list<array<string, mixed>> $matches
     * @param array<string, mixed> $principal
     */
    public function requireConfirmation(
        array $voucher,
        array $matches,
        array $principal,
        string $token,
    ): void {
        if ($matches === []) {
            return;
        }

        if (! $this->tokenIsValid($voucher, $matches, $principal, $token)) {
            throw new ApiException(
                409,
                'DUPLICATE_CONFIRMATION_REQUIRED',
                'A possible duplicate payment was found. Review the matching payment(s), then confirm only if this is a separate transaction.',
            );
        }
    }

    /**
     * @param array<string, mixed> $voucher
     * @param list<array<string, mixed>> $matches
     * @param array<string, mixed> $principal
     */
    private function issueToken(array $voucher, array $matches, array $principal): string
    {
        // Keep the review token stable during the current ten-minute window.
        // This lets a second Save reuse the fresh token without prompting again
        // merely because another second elapsed; expiry never exceeds ten minutes.
        $expiresAt = (intdiv(time(), 600) + 1) * 600;
        $payload = json_encode([
            'actor' => (string) $principal['id'],
            'fingerprint' => $this->fingerprint($voucher),
            'candidates' => $this->candidateIds($matches),
            'expiresAt' => $expiresAt,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

        $secret = $this->secret();
        $signature = hash_hmac('sha256', $payload, $secret, true);

        return self::base64UrlEncode($payload).'.'.self::base64UrlEncode($signature);
    }

    /**
     * @param array<string, mixed> $voucher
     * @param list<array<string, mixed>> $matches
     * @param array<string, mixed> $principal
     */
    private function tokenIsValid(
        array $voucher,
        array $matches,
        array $principal,
        string $token,
    ): bool {
        if (strlen($token) > 2048 || ! str_contains($token, '.')) {
            return false;
        }

        [$encodedPayload, $encodedSignature] = explode('.', $token, 2);
        $payload = self::base64UrlDecode($encodedPayload);
        $signature = self::base64UrlDecode($encodedSignature);

        if ($payload === null || $signature === null) {
            return false;
        }

        $expected = hash_hmac('sha256', $payload, $this->secret(), true);
        if (! hash_equals($expected, $signature)) {
            return false;
        }

        try {
            $decoded = json_decode($payload, true, 16, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return false;
        }

        return is_array($decoded)
            && ($decoded['actor'] ?? null) === (string) $principal['id']
            && ($decoded['fingerprint'] ?? null) === $this->fingerprint($voucher)
            && ($decoded['candidates'] ?? null) === $this->candidateIds($matches)
            && is_int($decoded['expiresAt'] ?? null)
            && $decoded['expiresAt'] >= time();
    }

    /**
     * @param array<string, mixed> $voucher
     * @return array<string, mixed>
     */
    private function fingerprint(array $voucher): array
    {
        return [
            'date' => (string) $voucher['date'],
            'vendorId' => (string) ($voucher['vendorId'] ?? ''),
            'vendor' => self::normalizeName((string) $voucher['vendor']),
            'amountPaise' => (int) $voucher['amountPaise'],
            'type' => (string) ($voucher['type'] ?? 'PAYMENT'),
            'category' => (string) ($voucher['category'] ?? 'Other'),
            'cashImpact' => (string) $voucher['cashImpact'],
            'paymentMethod' => (string) ($voucher['paymentMethod'] ?? ''),
            'notes' => (string) ($voucher['notes'] ?? ''),
        ];
    }

    /**
     * @param list<array<string, mixed>> $matches
     * @return list<string>
     */
    private function candidateIds(array $matches): array
    {
        $ids = array_map(static fn (array $row): string => (string) $row['id'], $matches);
        sort($ids, SORT_STRING);

        return $ids;
    }

    private function secret(): string
    {
        $secret = (string) config('services.duplicate_confirmation_key', '');

        if (strlen($secret) < 32) {
            throw new ApiException(
                503,
                'DUPLICATE_GUARD_NOT_CONFIGURED',
                'The duplicate-payment safety control is not configured.',
            );
        }

        return $secret;
    }

    private static function normalizeName(string $name): string
    {
        $normalized = preg_replace('/\s+/u', ' ', trim($name)) ?? trim($name);

        return function_exists('mb_strtolower')
            ? mb_strtolower($normalized, 'UTF-8')
            : strtolower($normalized);
    }

    private static function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $value): ?string
    {
        if (! preg_match('/^[A-Za-z0-9_-]+$/D', $value)) {
            return null;
        }

        $decoded = base64_decode(strtr($value, '-_', '+/').str_repeat('=', (4 - strlen($value) % 4) % 4), true);

        return $decoded === false ? null : $decoded;
    }
}
