<?php

namespace App\Modules\Identity;

use CashVoucher\Api\Security\Role;
use CashVoucher\Api\Support\ApiException;

final class RoleCapabilities
{
    public static function allows(string $role, string $capability): bool
    {
        return Role::isKnown($role) && Role::allows($role, $capability);
    }

    /**
     * @param array{id:string,role:string} $principal
     */
    public static function require(array $principal, string $capability): void
    {
        if (! self::allows($principal['role'], $capability)) {
            throw new ApiException(
                403,
                'FORBIDDEN',
                'You do not have permission to perform this action.',
            );
        }
    }

    /**
     * @param array{id:string,role:string} $principal
     */
    public static function canViewVoucher(array $principal, string $creatorUserId): bool
    {
        if (! Role::isKnown($principal['role'])) {
            return false;
        }

        if (Role::allows($principal['role'], 'viewAll')) {
            return true;
        }

        return Role::allows($principal['role'], 'viewOwn')
            && hash_equals($principal['id'], $creatorUserId);
    }
}
