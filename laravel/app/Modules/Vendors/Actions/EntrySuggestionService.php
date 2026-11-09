<?php

declare(strict_types=1);

namespace App\Modules\Vendors\Actions;

use App\Modules\Identity\RoleCapabilities;
use CashVoucher\Api\Support\ApiException;
use PDO;

final class EntrySuggestionService
{
    /**
     * Read-only suggestions from explicit vendor defaults and active voucher history.
     *
     * @param array<string, mixed> $principal
     * @return array<string, mixed>
     */
    public function suggest(PDO $pdo, array $principal, string $vendorName, string $voucherType): array
    {
        $vendorName = trim($vendorName);
        if ($vendorName === '' || mb_strlen($vendorName, 'UTF-8') > 120) {
            throw new ApiException(422, 'SUGGESTION_VENDOR_INVALID', 'Enter a valid payee name.');
        }
        if (! in_array($voucherType, ['PAYMENT', 'RECEIPT'], true)) {
            throw new ApiException(422, 'SUGGESTION_TYPE_INVALID', 'Choose a valid entry type.');
        }

        $canViewAll = RoleCapabilities::allows((string) $principal['role'], 'viewAll');
        $canViewOwn = RoleCapabilities::allows((string) $principal['role'], 'viewOwn');
        if (! $canViewAll && ! $canViewOwn) {
            throw new ApiException(403, 'FORBIDDEN', 'Your role cannot request entry suggestions.');
        }

        $normalized = mb_strtolower($vendorName, 'UTF-8');
        $catalog = $pdo->prepare(
            'SELECT default_category, default_payment_method
             FROM vendors
             WHERE is_active = 1 AND LOWER(display_name) = :vendor
             ORDER BY id
             LIMIT 2'
        );
        $catalog->execute(['vendor' => $normalized]);
        $catalogRows = $catalog->fetchAll(PDO::FETCH_ASSOC);
        $catalogDefaults = count($catalogRows) === 1 ? $catalogRows[0] : null;

        $scopeUserId = $canViewAll ? null : (string) $principal['id'];
        $category = $this->suggestFromHistory($pdo, $normalized, $voucherType, 'category', $scopeUserId);
        $paymentMethod = $this->suggestFromHistory(
            $pdo,
            $normalized,
            $voucherType,
            'payment_method',
            $scopeUserId,
        );

        $categoryDefault = is_array($catalogDefaults)
            ? trim((string) ($catalogDefaults['default_category'] ?? ''))
            : '';
        $methodDefault = is_array($catalogDefaults)
            ? trim((string) ($catalogDefaults['default_payment_method'] ?? ''))
            : '';

        if ($categoryDefault !== '') {
            $category = [
                'value' => $categoryDefault,
                'source' => 'VENDOR_DEFAULT',
                'evidenceCount' => 0,
            ];
        }
        if (in_array($methodDefault, ['CASH', 'UPI', 'BANK_TRANSFER'], true)) {
            $paymentMethod = [
                'value' => $methodDefault,
                'source' => 'VENDOR_DEFAULT',
                'evidenceCount' => 0,
            ];
        }

        return [
            'vendor' => $vendorName,
            'scope' => $canViewAll ? 'PROPERTY' : 'OWN',
            'suggestions' => [
                'category' => $category,
                'paymentMethod' => $paymentMethod,
            ],
        ];
    }

    /**
     * Tied top frequencies return no suggestion; accounting classification stays human-led.
     *
     * @return array{value:string,source:string,evidenceCount:int}|null
     */
    private function suggestFromHistory(
        PDO $pdo,
        string $vendor,
        string $voucherType,
        string $field,
        ?string $scopeUserId,
    ): ?array {
        if (! in_array($field, ['category', 'payment_method'], true)) {
            throw new \LogicException('Unsupported suggestion field.');
        }

        $scope = $scopeUserId === null ? '' : ' AND created_by_user_id = :creator';
        $query = $pdo->prepare(
            "SELECT ".$field." AS candidate, COUNT(*) AS evidence_count
             FROM vouchers
             WHERE LOWER(vendor_name_snapshot) = :vendor
               AND voucher_type = :type
               AND status = 'ACTIVE'
               AND amount_paise > 0
               AND ".$field." IS NOT NULL
               AND COALESCE(".$field.", '') <> ''".$scope."
             GROUP BY ".$field."
             ORDER BY evidence_count DESC, candidate ASC
             LIMIT 2"
        );
        $parameters = ['vendor' => $vendor, 'type' => $voucherType];
        if ($scopeUserId !== null) {
            $parameters['creator'] = $scopeUserId;
        }
        $query->execute($parameters);
        $rows = $query->fetchAll(PDO::FETCH_ASSOC);
        if (! isset($rows[0]['candidate'], $rows[0]['evidence_count'])) {
            return null;
        }

        $topCount = (int) $rows[0]['evidence_count'];
        if (isset($rows[1]['evidence_count']) && (int) $rows[1]['evidence_count'] === $topCount) {
            return null;
        }

        $value = trim((string) $rows[0]['candidate']);
        if ($value === '') {
            return null;
        }

        return [
            'value' => $value,
            'source' => 'HISTORY',
            'evidenceCount' => $topCount,
        ];
    }
}
