<?php
declare(strict_types=1);

namespace CashVoucher\Api\Security;

use RuntimeException;

final class PasswordVerifier
{
    private const LEGACY_PREFIX = 'legacy-hmac-sha256$';
    private const PHP_PREFIX = 'php-sha384$';
    private static ?string $dummyHash = null;

    /**
     * Legacy import format: legacy-hmac-sha256$<Apps-Script-Salt>$<lowercase-hmac-hex>.
     * Current PHP format: php-sha384$<adaptive-password-hash>.
     *
     * @return array{valid:bool,needsRehash:bool,legacy:bool}
     */
    public function verify(string $storedHash, string $password, bool $mustChangePassword): array
    {
        $length = self::characterLength($password);
        if ($length > 128) {
            return ['valid' => false, 'needsRehash' => false, 'legacy' => str_starts_with($storedHash, self::LEGACY_PREFIX)];
        }

        if (str_starts_with($storedHash, self::LEGACY_PREFIX)) {
            $parts = explode('$', $storedHash);
            if (count($parts) !== 3
                || $parts[0] !== 'legacy-hmac-sha256'
                || $parts[1] === ''
                || !preg_match('/^[a-f0-9]{64}$/D', $parts[2])
            ) {
                return ['valid' => false, 'needsRehash' => false, 'legacy' => true];
            }

            $pepper = getenv('CV_LEGACY_PASSWORD_PEPPER');
            if (!is_string($pepper) || strlen($pepper) < 16) {
                throw new RuntimeException('Legacy password verification is not configured.');
            }
            $shortAllowed = strtolower((string) (getenv('CV_ALLOW_LEGACY_SHORT_PASSWORDS') ?: '')) === 'true';
            $length = self::characterLength($password);
            if ($length < 8 && !($shortAllowed && $mustChangePassword && $length > 0)) {
                return ['valid' => false, 'needsRehash' => false, 'legacy' => true];
            }
            if ($length > 128) {
                return ['valid' => false, 'needsRehash' => false, 'legacy' => true];
            }

            $candidate = hash_hmac('sha256', $parts[1] . ':' . $password, $pepper);
            $valid = hash_equals($parts[2], $candidate);
            return ['valid' => $valid, 'needsRehash' => $valid, 'legacy' => true];
        }

        if (str_starts_with($storedHash, self::PHP_PREFIX)) {
            if ($length < 8) {
                return ['valid' => false, 'needsRehash' => false, 'legacy' => false];
            }
            $encodedHash = substr($storedHash, strlen(self::PHP_PREFIX));
            $valid = $encodedHash !== '' && password_verify(self::prehash($password), $encodedHash);
            return [
                'valid' => $valid,
                'needsRehash' => $valid && password_needs_rehash($encodedHash, PASSWORD_DEFAULT),
                'legacy' => false,
            ];
        }

        // Plain PASSWORD_DEFAULT hashes are accepted only as a one-way transition format.
        // A successful login upgrades them to the full-input prehash representation above.
        if ($length < 8) {
            return ['valid' => false, 'needsRehash' => false, 'legacy' => false];
        }
        $valid = password_verify($password, $storedHash);
        return ['valid' => $valid, 'needsRehash' => $valid, 'legacy' => false];
    }

    public function isAcceptablePassword(string $password): bool
    {
        $length = self::characterLength($password);
        return $length >= 8 && $length <= 128;
    }

    public function hash(string $password): string
    {
        if (!$this->isAcceptablePassword($password)) {
            throw new \InvalidArgumentException('Password must be between 8 and 128 characters.');
        }

        $hash = password_hash(self::prehash($password), PASSWORD_DEFAULT);
        if (!is_string($hash)) {
            throw new RuntimeException('Password hashing failed.');
        }
        return self::PHP_PREFIX . $hash;
    }

    public function burnUnknownUserVerification(string $password): void
    {
        self::$dummyHash ??= password_hash(self::prehash('cash-voucher-invalid-account-dummy-password'), PASSWORD_DEFAULT);
        password_verify(self::prehash($password), (string) self::$dummyHash);
    }

    private static function prehash(string $password): string
    {
        // SHA-384 encoded as base64 is 64 characters, below bcrypt's 72-byte input limit.
        return base64_encode(hash('sha384', $password, true));
    }

    private static function characterLength(string $value): int
    {
        if (function_exists('mb_strlen')) {
            return mb_strlen($value, 'UTF-8');
        }
        $count = preg_match_all('/./us', $value, $matches);
        return $count === false ? strlen($value) : $count;
    }
}
