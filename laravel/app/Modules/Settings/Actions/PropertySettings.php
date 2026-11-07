<?php

declare(strict_types=1);

namespace App\Modules\Settings\Actions;

use CashVoucher\Api\Financial\IdempotencyService;
use CashVoucher\Api\Support\ApiException;
use PDO;

final class PropertySettings
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

    /** @return array<string,mixed> */
    public function show(PDO $pdo): array
    {
        $settings = $this->loadSettings($pdo);
        $sequences = $this->loadSequences($pdo, false);

        return $this->present($settings, $sequences);
    }

    /**
     * @param array<string,mixed> $input
     * @param array<string,mixed> $principal
     * @return array{data:array<string,mixed>,replayed:bool}
     */
    public function save(
        PDO $pdo,
        array $input,
        array $principal,
        string $idempotencyKey,
    ): array {
        $values = $this->normalize($input);

        return (new IdempotencyService($pdo))->execute(
            (string) $principal['id'],
            (string) $principal['email'],
            'saveSettings',
            $idempotencyKey,
            $values,
            function (PDO $connection) use ($values, $principal): array {
                $oldSettings = $this->loadSettings($connection);
                $sequences = $this->loadSequences($connection, true);
                $this->validateNextNumber($connection, 'PAYMENT', $values['nextVoucherNo'], $sequences['PAYMENT']);
                $this->validateNextNumber($connection, 'RECEIPT', $values['nextReceiptNo'], $sequences['RECEIPT']);

                $nextSettings = [
                    'propertyName' => $values['propertyName'],
                    'propertyAddress' => $values['propertyAddress'],
                    'categories' => $values['categories'],
                    'receiptCategories' => $values['receiptCategories'],
                    'openingBalance' => $values['openingBalance'],
                ];

                $upsert = $connection->prepare(
                    'INSERT INTO settings (setting_key, value_json, updated_by_user_id, updated_at_utc)
                     VALUES (:key, :value, :actor, UTC_TIMESTAMP(6))
                     ON DUPLICATE KEY UPDATE
                        value_json = VALUES(value_json),
                        updated_by_user_id = VALUES(updated_by_user_id),
                        updated_at_utc = VALUES(updated_at_utc)'
                );
                foreach ($nextSettings as $key => $value) {
                    $upsert->execute([
                        'key' => $key,
                        'value' => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                        'actor' => (string) $principal['id'],
                    ]);
                }

                foreach (['PAYMENT' => $values['nextVoucherNo'], 'RECEIPT' => $values['nextReceiptNo']] as $type => $nextNumber) {
                    if ($sequences[$type] === $nextNumber) {
                        continue;
                    }
                    $update = $connection->prepare(
                        'UPDATE voucher_number_sequences
                         SET next_number = :next, updated_at_utc = UTC_TIMESTAMP(6)
                         WHERE voucher_type = :type'
                    );
                    $update->execute(['next' => $nextNumber, 'type' => $type]);
                    if ($update->rowCount() !== 1) {
                        throw new ApiException(409, 'VOUCHER_SEQUENCE_NOT_INITIALIZED', 'The voucher number sequence is not initialized. No settings were changed.');
                    }
                }

                $afterSettings = $this->loadSettings($connection);
                $afterSequences = $this->loadSequences($connection, false);
                $after = $this->present($afterSettings, $afterSequences);
                $before = $this->present($oldSettings, $sequences);
                $changes = [];
                foreach ([
                    'propertyName', 'propertyAddress', 'categories', 'receiptCategories',
                    'openingBalance', 'nextVoucherNo', 'nextReceiptNo',
                ] as $key) {
                    if (($before[$key] ?? null) !== ($after[$key] ?? null)) {
                        $changes[] = [
                            'field' => $key,
                            'before' => $before[$key] ?? null,
                            'after' => $after[$key] ?? null,
                        ];
                    }
                }

                return [
                    'settings' => $after,
                    '_audit' => [
                        'eventType' => 'PROPERTY_SETTINGS_UPDATED',
                        'targetType' => 'settings',
                        'targetId' => 'property',
                        'reason' => 'Owner-managed property settings updated.',
                        'before' => ['settings' => $before, 'changes' => $changes],
                    ],
                ];
            },
            [
                'eventType' => 'PROPERTY_SETTINGS_UPDATED',
                'targetType' => 'settings',
                'targetId' => 'property',
                'reason' => 'Owner-managed property settings updated.',
            ],
        );
    }

    /** @return array<string,mixed> */
    private function loadSettings(PDO $pdo): array
    {
        $query = $pdo->query('SELECT setting_key, value_json FROM settings');
        $settings = [];
        foreach ($query->fetchAll(PDO::FETCH_ASSOC) as $row) {
            try {
                $settings[(string) $row['setting_key']] = json_decode(
                    (string) $row['value_json'],
                    true,
                    64,
                    JSON_THROW_ON_ERROR,
                );
            } catch (\JsonException) {
                throw new ApiException(503, 'SETTINGS_DATA_INVALID', 'A saved property setting is malformed. Stop and inspect the settings record.');
            }
        }

        return $settings;
    }

    /** @return array{PAYMENT:int,RECEIPT:int} */
    private function loadSequences(PDO $pdo, bool $lock): array
    {
        $sql = 'SELECT voucher_type, next_number FROM voucher_number_sequences WHERE voucher_type IN (?, ?)';
        if ($lock) {
            $sql .= ' ORDER BY voucher_type FOR UPDATE';
        }
        $query = $pdo->prepare($sql);
        $query->execute(['PAYMENT', 'RECEIPT']);
        $result = [];
        foreach ($query->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $type = (string) $row['voucher_type'];
            $value = (int) $row['next_number'];
            if (in_array($type, ['PAYMENT', 'RECEIPT'], true) && $value > 0) {
                $result[$type] = $value;
            }
        }
        if (! isset($result['PAYMENT'], $result['RECEIPT'])) {
            throw new ApiException(503, 'VOUCHER_SEQUENCE_NOT_INITIALIZED', 'Both voucher number sequences must be initialized before property settings can be read or changed.');
        }

        return ['PAYMENT' => $result['PAYMENT'], 'RECEIPT' => $result['RECEIPT']];
    }

    /** @param array<string,mixed> $settings @param array{PAYMENT:int,RECEIPT:int} $sequences @return array<string,mixed> */
    private function present(array $settings, array $sequences): array
    {
        $categories = $settings['categories'] ?? self::DEFAULT_CATEGORIES;
        $receiptCategories = $settings['receiptCategories'] ?? self::DEFAULT_RECEIPT_CATEGORIES;
        if (! is_array($categories) || ! array_is_list($categories) || ! is_array($receiptCategories) || ! array_is_list($receiptCategories)) {
            throw new ApiException(503, 'SETTINGS_DATA_INVALID', 'Saved category settings are malformed. Stop and inspect the settings record.');
        }

        return [
            'propertyName' => is_string($settings['propertyName'] ?? null) ? $settings['propertyName'] : '',
            'propertyAddress' => is_string($settings['propertyAddress'] ?? null) ? $settings['propertyAddress'] : '',
            'categories' => $categories,
            'receiptCategories' => $receiptCategories,
            'openingBalance' => $this->openingBalanceValue($settings['openingBalance'] ?? '0.00'),
            'nextVoucherNo' => $sequences['PAYMENT'],
            'nextReceiptNo' => $sequences['RECEIPT'],
            'timeZone' => 'Asia/Kolkata',
            'currency' => 'INR',
            'moneyStorageUnit' => 'paise',
        ];
    }

    private function validateNextNumber(PDO $pdo, string $type, int $requested, int $current): void
    {
        $query = $pdo->prepare(
            "SELECT COALESCE(MAX(CAST(voucher_number AS UNSIGNED)), 0)
             FROM vouchers
             WHERE voucher_type = :type AND voucher_number REGEXP '^[0-9]+$'"
        );
        $query->execute(['type' => $type]);
        $maximumIssued = (int) $query->fetchColumn();
        if ($requested <= $maximumIssued || $requested < $current) {
            throw new ApiException(
                422,
                'VOUCHER_SEQUENCE_INVALID',
                'The next '.$type.' number cannot be lower than the current sequence or an already issued number.',
            );
        }
    }

    /** @param array<string,mixed> $input @return array<string,mixed> */
    private function normalize(array $input): array
    {
        $propertyName = $this->text($input['propertyName'] ?? null, 'property name', 120, true);
        $propertyAddress = $this->text($input['propertyAddress'] ?? '', 'property address', 300, false);
        $categories = $this->categoryList($input['categories'] ?? null, 'categories');
        $receiptCategories = $this->categoryList($input['receiptCategories'] ?? null, 'receipt categories');
        if (! in_array('Staff Salary', $categories, true)) {
            $categories[] = 'Staff Salary';
        }
        if (! in_array('Other', $categories, true)) {
            $categories[] = 'Other';
        }
        if (! in_array('Other', $receiptCategories, true)) {
            $receiptCategories[] = 'Other';
        }

        $openingBalance = $this->openingBalance($input['openingBalance'] ?? null);
        $nextVoucherNo = $this->positiveInteger($input['nextVoucherNo'] ?? null, 'next voucher number');
        $nextReceiptNo = $this->positiveInteger($input['nextReceiptNo'] ?? null, 'next receipt number');

        return [
            'propertyName' => $propertyName,
            'propertyAddress' => $propertyAddress,
            'categories' => $categories,
            'receiptCategories' => $receiptCategories,
            'openingBalance' => $openingBalance,
            'nextVoucherNo' => $nextVoucherNo,
            'nextReceiptNo' => $nextReceiptNo,
        ];
    }

    /** @return list<string> */
    private function categoryList(mixed $value, string $label): array
    {
        if (! is_array($value) || ! array_is_list($value) || count($value) < 1 || count($value) > 60) {
            throw new ApiException(422, 'SETTINGS_CATEGORIES_INVALID', ucfirst($label).' must contain 1 to 60 values.');
        }
        $result = [];
        foreach ($value as $item) {
            $name = $this->text($item, $label.' entry', 40, true);
            if (! in_array($name, $result, true)) {
                $result[] = $name;
            }
        }
        if ($result === []) {
            throw new ApiException(422, 'SETTINGS_CATEGORIES_INVALID', ucfirst($label).' must contain at least one valid value.');
        }

        return $result;
    }

    private function text(mixed $value, string $label, int $max, bool $required): string
    {
        if (! is_string($value)) {
            throw new ApiException(422, 'SETTINGS_FIELD_INVALID', ucfirst($label).' must be text.');
        }
        $text = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
        if (
            ($required && $text === '')
            || mb_strlen($text, 'UTF-8') > $max
            || preg_match('/[\x00-\x1F\x7F-\x9F\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{206F}\x{FEFF}]/u', $text)
        ) {
            throw new ApiException(422, 'SETTINGS_FIELD_INVALID', ucfirst($label).' is invalid.');
        }

        return $text;
    }

    private function openingBalance(mixed $value): string
    {
        if (! is_string($value) || ! preg_match('/^-?(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/D', $value)) {
            throw new ApiException(422, 'OPENING_BALANCE_INVALID', 'Opening balance must be a decimal string with up to two decimal places.');
        }
        $negative = str_starts_with($value, '-');
        $unsigned = $negative ? substr($value, 1) : $value;
        [$rupees, $fraction] = array_pad(explode('.', $unsigned, 2), 2, '0');
        $fraction = str_pad($fraction, 2, '0');
        $paise = ((int) $rupees * 100) + (int) $fraction;
        if ($paise > 100_000_000_000) {
            throw new ApiException(422, 'OPENING_BALANCE_INVALID', 'Opening balance is outside the supported range.');
        }

        return ($negative && $paise !== 0 ? '-' : '').(intdiv($paise, 100)).'.'.str_pad((string) ($paise % 100), 2, '0', STR_PAD_LEFT);
    }

    private function openingBalanceValue(mixed $value): string
    {
        if (is_string($value) && preg_match('/^-?[0-9]+(?:\.[0-9]{1,2})?$/D', $value)) {
            return $this->openingBalance($value);
        }
        if (is_int($value)) {
            return $this->openingBalance((string) $value);
        }

        throw new ApiException(503, 'SETTINGS_DATA_INVALID', 'Saved opening balance is malformed. Stop and inspect the settings record.');
    }

    private function positiveInteger(mixed $value, string $label): int
    {
        if (is_int($value)) {
            $number = $value;
        } elseif (is_string($value) && preg_match('/^[1-9][0-9]{0,8}$/D', $value)) {
            $number = (int) $value;
        } else {
            throw new ApiException(422, 'SETTINGS_NUMBER_INVALID', 'Enter a valid '.$label.'.');
        }
        if ($number < 1 || $number > 999_999_999) {
            throw new ApiException(422, 'SETTINGS_NUMBER_INVALID', 'Enter a valid '.$label.'.');
        }

        return $number;
    }
}
