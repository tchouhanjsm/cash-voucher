<?php
declare(strict_types=1);

namespace CashVoucher\Api\Security;

final class Role
{
    /** Existing Apps Script grants. "Admin" is a UI label; the stored key remains manager. */
    private const CAPABILITIES = [
        'staff' => ['create', 'viewOwn'],
        'manager' => [
            'create', 'viewAll', 'edit', 'cancel', 'bulk', 'vendors',
            'receiptAny', 'cashClose', 'approvePayments', 'reports',
        ],
        'owner' => [
            'create', 'viewAll', 'edit', 'cancel', 'bulk', 'vendors',
            'receiptAny', 'users', 'settings', 'audit', 'cashClose',
            'approvePayments', 'reports',
        ],
        'accountant' => ['reports'],
    ];

    public static function isKnown(string $role): bool
    {
        return array_key_exists($role, self::CAPABILITIES);
    }

    public static function allows(string $role, string $capability): bool
    {
        return in_array($capability, self::CAPABILITIES[$role] ?? [], true);
    }

    /** @return list<string> */
    public static function capabilities(string $role): array
    {
        return self::CAPABILITIES[$role] ?? [];
    }

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::CAPABILITIES);
    }
}
