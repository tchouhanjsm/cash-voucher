<?php
declare(strict_types=1);

namespace CashVoucher\Api\Support;

use InvalidArgumentException;

final class Money
{
    public const MAX_AMOUNT_PAISE = 1_000_000_000;

    public static function toPaise(string $rupees): int
    {
        $value = trim($rupees);
        if (!preg_match('/^(?:0|[1-9][0-9]{0,7})(?:\.([0-9]{1,2}))?$/', $value, $matches)) {
            throw new InvalidArgumentException('Amount must be a positive rupee value with at most two decimal places.');
        }

        $parts = explode('.', $value, 2);
        $rupeesPart = (int) $parts[0];
        $paisePart = isset($parts[1]) ? (int) str_pad($parts[1], 2, '0') : 0;
        $paise = ($rupeesPart * 100) + $paisePart;

        if ($paise <= 0 || $paise > self::MAX_AMOUNT_PAISE) {
            throw new InvalidArgumentException('Amount is outside the supported range.');
        }

        return $paise;
    }
}
