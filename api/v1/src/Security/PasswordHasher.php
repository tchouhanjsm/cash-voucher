<?php
declare(strict_types=1);

namespace CashVoucher\Api\Security;

use InvalidArgumentException;
use RuntimeException;

final class PasswordHasher
{
    private const LEGACY_PREFIX = 'legacy-hmac-sha256-v1$';
    private const DUMMY_BCRYPT_HASH = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

    /**
     * Verify an imported Apps Script HMAC credential or a native PHP password hash.
     *
     * Imported values use:
     * legacy-hmac-sha256-v1$<legacy-salt>$<lowercase-hex-hmac>
     *
     * @return array{valid:bool,upgradedHash:?string}
     */
    public static function verify(
        string $password,
        string $storedHash,
        ?string $legacyPepper,
        bool $mustChangePassword,
        bool $allowLegacyShortCredential
    ): array {
        if (!self::isLoginPasswordLengthAllowed($password)
            || (self::characterLength($password) < 8
                && !($mustChangePassword && $allowLegacyShortCredential))
        ) {
            password_verify($password, self::DUMMY_BCRYPT_HASH);
            return ['valid' => false, 'upgradedHash' => null];
        }

        if (str_starts_with($storedHash, self::LEGACY_PREFIX)) {
            // Keep legacy and unknown-user paths near the same password-hashing cost.
            password_verify($password, self::DUMMY_BCRYPT_HASH);

            $parts = explode('$', $storedHash, 3);
            if (count($parts) !== 3
                || $parts[0] !== 'legacy-hmac-sha256-v1'
                || $parts[1] === ''
                || !preg_match('/^[a-f0-9]{64}$/D', $parts[2])
                || !is_string($legacyPepper)
                || strlen($legacyPepper) < 16
            ) {
                return ['valid' => false, 'upgradedHash' => null];
            }

            $expected = hash_hmac('sha256', $parts[1] . ':' . $password, $legacyPepper);
            if (!hash_equals($parts[2], $expected)) {
                return ['valid' => false, 'upgradedHash' => null];
            }

            return [
                'valid' => true,
                // A short imported PIN may be upgraded only so the forced-change flow can work.
                'upgradedHash' => self::hashVerifiedCredential($password),
            ];
        }

        $valid = password_verify($password, $storedHash);
        if (!$valid) {
            return ['valid' => false, 'upgradedHash' => null];
        }

        return [
            'valid' => true,
            'upgradedHash' => password_needs_rehash($storedHash, PASSWORD_DEFAULT)
                ? self::hashVerifiedCredential($password)
                : null,
        ];
    }

    public static function hash(string $password): string
    {
        self::assertNewPassword($password);
        return self::hashVerifiedCredential($password);
    }

    public static function assertNewPassword(string $password): void
    {
        if (!self::isValidUtf8($password)
            || self::characterLength($password) < 8
            || self::characterLength($password) > 128
            || strlen($password) > 512
        ) {
            throw new InvalidArgumentException('Password must be 8–128 characters.');
        }
    }

    private static function hashVerifiedCredential(string $password): string
    {
        $hash = password_hash($password, PASSWORD_DEFAULT);
        if (!is_string($hash) || $hash === '') {
            throw new RuntimeException('The password hash could not be generated.');
        }
        return $hash;
    }

    private static function isLoginPasswordLengthAllowed(string $password): bool
    {
        return $password !== '' && self::isValidUtf8($password)
            && self::characterLength($password) <= 128
            && strlen($password) <= 512;
    }

    private static function characterLength(string $value): int
    {
        $count = preg_match_all('/./us', $value);
        return $count === false ? PHP_INT_MAX : $count;
    }

    private static function isValidUtf8(string $value): bool
    {
        return preg_match('//u', $value) === 1;
    }
}
