<?php

declare(strict_types=1);

namespace App\Modules\Vendors\Actions;

use CashVoucher\Api\Financial\IdempotencyService;
use CashVoucher\Api\Support\ApiException;
use PDO;

final class VendorCatalog
{
    private const DEFAULT_CATEGORIES = [
        'Housekeeping', 'Maintenance', 'Electrical', 'Plumbing', 'Kitchen',
        'Food & Beverage', 'Laundry', 'Guest Supplies', 'Transport', 'Fuel',
        'Staff Welfare', 'Staff Salary', 'Staff Advance', 'Petty Cash',
        'Local Purchase', 'Vendor Payment', 'Repairs', 'Gardening', 'Security',
        'Office Expense', 'Stationery', 'Internet / Telecom', 'Licenses',
        'Bank Charges', 'Guest Refund', 'Other',
    ];

    private const DEFAULT_RECEIPT_CATEGORIES = [
        'Room Revenue', 'Restaurant', 'Guest Advance', 'Bank Withdrawal',
        'Refund Received', 'Owner Deposit', 'Other',
    ];

    /**
     * @param array<string, mixed> $input
     * @param array<string, mixed> $principal
     * @return array{data:array<string,mixed>,replayed:bool}
     */
    public function save(
        PDO $pdo,
        array $input,
        array $principal,
        string $idempotencyKey,
        ?string $vendorId = null,
    ): array {
        if ($vendorId !== null && ! self::isUuid($vendorId)) {
            throw new ApiException(422, 'VENDOR_ID_INVALID', 'The vendor identifier is invalid.');
        }

        $values = $this->normalizeInput($input);
        $payload = ['vendorId' => $vendorId] + $values;
        $actorId = (string) $principal['id'];
        $email = (string) $principal['email'];

        return (new IdempotencyService($pdo))->execute(
            $actorId,
            $email,
            'saveVendor',
            $idempotencyKey,
            $payload,
            function (PDO $connection) use ($values, $vendorId, $actorId): array {
                $this->assertDefaultCategory($connection, $values['defaultCategory']);

                $before = null;
                if ($vendorId !== null) {
                    $select = $connection->prepare('SELECT * FROM vendors WHERE id = :id LIMIT 1 FOR UPDATE');
                    $select->execute(['id' => $vendorId]);
                    $existing = $select->fetch(PDO::FETCH_ASSOC);
                    if (! is_array($existing)) {
                        throw new ApiException(404, 'VENDOR_NOT_FOUND', 'The vendor could not be found.');
                    }
                    $before = $this->snapshot($existing);
                } else {
                    $vendorId = self::uuidV4();
                }

                // Historical vendors may predate the claim table. Check the source table as
                // well as the unique claim so legacy duplicates fail closed during adoption.
                $duplicate = $connection->prepare(
                    'SELECT id FROM vendors WHERE display_name = :name AND id <> :id LIMIT 1'
                );
                $duplicate->execute(['name' => $values['name'], 'id' => $vendorId]);
                if ($duplicate->fetchColumn() !== false) {
                    throw new ApiException(
                        409,
                        'VENDOR_DUPLICATE',
                        'A vendor with this name already exists, including inactive vendors.',
                    );
                }

                if ($before === null) {
                    $insert = $connection->prepare(
                        'INSERT INTO vendors (
                            id, display_name, company_name, mobile, is_active,
                            default_category, default_payment_method, source_legacy_id,
                            created_by_user_id, created_at_utc, updated_at_utc
                        ) VALUES (
                            :id, :name, :company, :mobile, 1,
                            :category, :payment_method, NULL,
                            :created_by, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
                        )'
                    );
                    $insert->execute([
                        'id' => $vendorId,
                        'name' => $values['name'],
                        'company' => $values['company'],
                        'mobile' => $values['mobile'],
                        'category' => $values['defaultCategory'],
                        'payment_method' => $values['defaultPaymentMethod'],
                        'created_by' => $actorId,
                    ]);
                } else {
                    // Release the vendor's prior claim inside this transaction. If the new
                    // claim conflicts, rollback restores the old claim and source row.
                    $release = $connection->prepare('DELETE FROM vendor_name_claims WHERE vendor_id = :id');
                    $release->execute(['id' => $vendorId]);

                    $update = $connection->prepare(
                        'UPDATE vendors
                         SET display_name = :name, company_name = :company, mobile = :mobile,
                             default_category = :category, default_payment_method = :payment_method,
                             updated_at_utc = UTC_TIMESTAMP(6)
                         WHERE id = :id'
                    );
                    $update->execute([
                        'name' => $values['name'],
                        'company' => $values['company'],
                        'mobile' => $values['mobile'],
                        'category' => $values['defaultCategory'],
                        'payment_method' => $values['defaultPaymentMethod'],
                        'id' => $vendorId,
                    ]);
                }

                $claim = $connection->prepare(
                    'INSERT IGNORE INTO vendor_name_claims (normalized_name, vendor_id, created_at_utc)
                     VALUES (:name, :vendor_id, UTC_TIMESTAMP(6))'
                );
                $claim->execute([
                    'name' => mb_strtolower($values['name'], 'UTF-8'),
                    'vendor_id' => $vendorId,
                ]);

                $owner = $connection->prepare(
                    'SELECT vendor_id FROM vendor_name_claims WHERE normalized_name = :name LIMIT 1'
                );
                $owner->execute(['name' => mb_strtolower($values['name'], 'UTF-8')]);
                $claimedBy = $owner->fetchColumn();
                if (! is_string($claimedBy) || ! hash_equals($vendorId, $claimedBy)) {
                    throw new ApiException(
                        409,
                        'VENDOR_DUPLICATE',
                        'A vendor with this name was created or renamed concurrently. Refresh and try again.',
                    );
                }

                $saved = $connection->prepare('SELECT * FROM vendors WHERE id = :id LIMIT 1');
                $saved->execute(['id' => $vendorId]);
                $row = $saved->fetch(PDO::FETCH_ASSOC);
                if (! is_array($row)) {
                    throw new \RuntimeException('The saved vendor could not be reloaded.');
                }

                return [
                    'vendor' => $this->present($row),
                    '_audit' => [
                        'eventType' => $before === null ? 'VENDOR_CREATED' : 'VENDOR_UPDATED',
                        'targetType' => 'vendor',
                        'targetId' => $vendorId,
                        'reason' => $before === null ? 'Vendor created.' : 'Vendor details updated.',
                        'before' => $before,
                    ],
                ];
            },
            [
                'eventType' => 'VENDOR_SAVED',
                'targetType' => 'vendor',
                'targetId' => $vendorId ?? 'pending',
                'reason' => 'Vendor catalog write.',
            ],
        );
    }

    /**
     * Set the desired active state rather than toggling it. Repeated delivery is safe.
     *
     * @param array<string, mixed> $principal
     * @return array{data:array<string,mixed>,replayed:bool}
     */
    public function setActive(
        PDO $pdo,
        string $vendorId,
        bool $active,
        array $principal,
        string $idempotencyKey,
    ): array {
        if (! self::isUuid($vendorId)) {
            throw new ApiException(422, 'VENDOR_ID_INVALID', 'The vendor identifier is invalid.');
        }

        $actorId = (string) $principal['id'];
        $email = (string) $principal['email'];

        return (new IdempotencyService($pdo))->execute(
            $actorId,
            $email,
            'setVendorActive',
            $idempotencyKey,
            ['vendorId' => $vendorId, 'active' => $active],
            function (PDO $connection) use ($vendorId, $active): array {
                $select = $connection->prepare('SELECT * FROM vendors WHERE id = :id LIMIT 1 FOR UPDATE');
                $select->execute(['id' => $vendorId]);
                $row = $select->fetch(PDO::FETCH_ASSOC);
                if (! is_array($row)) {
                    throw new ApiException(404, 'VENDOR_NOT_FOUND', 'The vendor could not be found.');
                }

                $before = $this->snapshot($row);
                $wasActive = (int) $row['is_active'] === 1;
                if ($active && ! $wasActive) {
                    $duplicate = $connection->prepare(
                        'SELECT id FROM vendors
                         WHERE display_name = :name AND is_active = 1 AND id <> :id
                         LIMIT 1'
                    );
                    $duplicate->execute(['name' => $row['display_name'], 'id' => $vendorId]);
                    if ($duplicate->fetchColumn() !== false) {
                        throw new ApiException(
                            409,
                            'VENDOR_NAME_AMBIGUOUS',
                            'Another active vendor has this name. Resolve the duplicate before activating this vendor.',
                        );
                    }
                }

                if ($wasActive !== $active) {
                    $update = $connection->prepare(
                        'UPDATE vendors SET is_active = :active, updated_at_utc = UTC_TIMESTAMP(6) WHERE id = :id'
                    );
                    $update->execute(['active' => $active ? 1 : 0, 'id' => $vendorId]);
                }

                $saved = $connection->prepare('SELECT * FROM vendors WHERE id = :id LIMIT 1');
                $saved->execute(['id' => $vendorId]);
                $updated = $saved->fetch(PDO::FETCH_ASSOC);
                if (! is_array($updated)) {
                    throw new \RuntimeException('The vendor state could not be reloaded.');
                }

                return [
                    'vendor' => $this->present($updated),
                    '_audit' => [
                        'eventType' => $wasActive === $active
                            ? 'VENDOR_STATE_UNCHANGED'
                            : ($active ? 'VENDOR_ACTIVATED' : 'VENDOR_DEACTIVATED'),
                        'targetType' => 'vendor',
                        'targetId' => $vendorId,
                        'reason' => $wasActive === $active
                            ? 'Requested active state already applied.'
                            : ($active ? 'Vendor activated.' : 'Vendor deactivated.'),
                        'before' => $before,
                    ],
                ];
            },
            [
                'eventType' => 'VENDOR_STATE_SET',
                'targetType' => 'vendor',
                'targetId' => $vendorId,
                'reason' => 'Vendor active state changed.',
            ],
        );
    }

    /**
     * @param array<string, mixed> $input
     * @return array{name:string,company:string,mobile:string,defaultCategory:string,defaultPaymentMethod:string}
     */
    private function normalizeInput(array $input): array
    {
        $name = $this->name($input['name'] ?? null, 'Vendor name', 120, false);
        $company = $this->name($input['company'] ?? '', 'Company name', 120, true);
        $mobile = $input['mobile'] ?? '';
        if ($mobile === null) {
            $mobile = '';
        }
        if (! is_string($mobile)) {
            throw new ApiException(422, 'VENDOR_MOBILE_INVALID', 'Enter a valid mobile number.');
        }
        $mobile = trim($mobile);
        if ($mobile !== '' && ! preg_match('/^[0-9+ -]{7,15}$/D', $mobile)) {
            throw new ApiException(422, 'VENDOR_MOBILE_INVALID', 'Enter a valid mobile number.');
        }

        $category = $input['defaultCategory'] ?? '';
        $paymentMethod = $input['defaultPaymentMethod'] ?? '';
        $category = is_string($category) ? trim($category) : '';
        $paymentMethod = is_string($paymentMethod) ? trim($paymentMethod) : '';
        if ($category !== '' && mb_strlen($category, 'UTF-8') > 40) {
            throw new ApiException(422, 'VENDOR_CATEGORY_INVALID', 'Choose a valid default category.');
        }
        if ($paymentMethod !== '' && ! in_array($paymentMethod, ['CASH', 'UPI', 'BANK_TRANSFER'], true)) {
            throw new ApiException(422, 'VENDOR_PAYMENT_METHOD_INVALID', 'Choose a valid default payment method.');
        }

        return [
            'name' => $name,
            'company' => $company,
            'mobile' => $mobile,
            'defaultCategory' => $category,
            'defaultPaymentMethod' => $paymentMethod,
        ];
    }

    private function name(mixed $value, string $label, int $max, bool $optional): string
    {
        if ($value === null && $optional) {
            return '';
        }
        if (! is_string($value)) {
            throw new ApiException(422, 'VENDOR_NAME_INVALID', $label.' must be text.');
        }

        $text = $value;
        if (class_exists(\Normalizer::class)) {
            $normalized = \Normalizer::normalize($text, \Normalizer::FORM_KC);
            if (! is_string($normalized)) {
                throw new ApiException(422, 'VENDOR_NAME_INVALID', 'Enter a valid '.$label.'.');
            }
            $text = $normalized;
        }

        if (preg_match('/[\x00-\x1F\x7F-\x9F\x{00AD}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{206F}\x{FEFF}]/u', $text)) {
            throw new ApiException(422, 'VENDOR_NAME_INVALID', 'Enter a valid '.$label.'.');
        }

        $text = preg_replace('/\s+/u', ' ', trim($text)) ?? '';
        if ($text === '' && $optional) {
            return '';
        }
        if ($text === '' || mb_strlen($text, 'UTF-8') > $max
            || ! preg_match('/\p{L}/u', $text)
            || ! preg_match('/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,\'’&()\/#:+_©®-]*$/u', $text)
        ) {
            throw new ApiException(
                422,
                'VENDOR_NAME_INVALID',
                'Enter a valid '.$label.' using letters, numbers and common punctuation.',
            );
        }

        return $text;
    }

    private function assertDefaultCategory(PDO $pdo, string $category): void
    {
        if ($category === '') {
            return;
        }

        $categories = $this->configuredChoices($pdo, 'categories', self::DEFAULT_CATEGORIES);
        if (! in_array('Staff Salary', $categories, true)) {
            $categories[] = 'Staff Salary';
        }
        $receiptCategories = $this->configuredChoices(
            $pdo,
            'receiptCategories',
            self::DEFAULT_RECEIPT_CATEGORIES,
        );

        if (! in_array($category, array_unique(array_merge($categories, $receiptCategories)), true)) {
            throw new ApiException(422, 'VENDOR_CATEGORY_INVALID', 'Choose a valid default category.');
        }
    }

    /** @param list<string> $fallback @return list<string> */
    private function configuredChoices(PDO $pdo, string $key, array $fallback): array
    {
        $query = $pdo->prepare('SELECT value_json FROM settings WHERE setting_key = :key LIMIT 1');
        $query->execute(['key' => $key]);
        $raw = $query->fetchColumn();
        if (! is_string($raw) || $raw === '') {
            return $fallback;
        }

        try {
            $decoded = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return $fallback;
        }

        if (! is_array($decoded) || ! array_is_list($decoded)) {
            return $fallback;
        }

        $values = [];
        foreach ($decoded as $value) {
            if (is_string($value) && $value !== '') {
                $values[] = $value;
            }
        }

        return $values === [] ? $fallback : array_values(array_unique($values));
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function present(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'name' => (string) $row['display_name'],
            'company' => (string) $row['company_name'],
            'mobile' => (string) $row['mobile'],
            'active' => (int) $row['is_active'] === 1,
            'defaultCategory' => (string) $row['default_category'],
            'defaultPaymentMethod' => (string) $row['default_payment_method'],
            'createdAt' => (string) $row['created_at_utc'],
            'updatedAt' => (string) $row['updated_at_utc'],
        ];
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function snapshot(array $row): array
    {
        $vendor = $this->present($row);
        unset($vendor['createdAt'], $vendor['updatedAt']);

        return $vendor;
    }

    private static function isUuid(string $value): bool
    {
        return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $value) === 1;
    }

    private static function uuidV4(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);

        return substr($hex, 0, 8).'-'.substr($hex, 8, 4).'-'.substr($hex, 12, 4).'-'
            .substr($hex, 16, 4).'-'.substr($hex, 20);
    }
}
