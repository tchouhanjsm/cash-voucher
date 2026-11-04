<?php
declare(strict_types=1);

namespace CashVoucher\Api\Security;

use CashVoucher\Api\Support\ApiException;

final class Authorization
{
    /** @param array<string, mixed> $principal */
    public static function requireCapability(array $principal, string $capability): void
    {
        $role = $principal['role'] ?? null;
        if (!is_string($role) || !Role::allows($role, $capability)) {
            throw new ApiException(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
        }
    }

    /** @param array<string, mixed> $principal */
    public static function canViewVoucher(array $principal, string $creatorUserId, string $voucherId): bool
    {
        $role = $principal['role'] ?? null;
        if (!is_string($role) || !Role::isKnown($role)) {
            return false;
        }
        if (Role::allows($role, 'viewAll')) {
            return true;
        }
        return Role::allows($role, 'viewOwn')
            && is_string($principal['id'] ?? null)
            && hash_equals($creatorUserId, $principal['id']);
    }
}
