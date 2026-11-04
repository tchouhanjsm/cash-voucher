<?php
declare(strict_types=1);

namespace CashVoucher\Api\Financial;

use PDO;
use RuntimeException;
use InvalidArgumentException;

final class VoucherNumberAllocator
{
    private const TYPES = ['PAYMENT', 'RECEIPT'];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Allocate a number while the caller's transaction is open.
     * The per-type row lock serializes concurrent requests; a rollback also rolls back
     * the counter increment, so a failed financial transaction does not consume a number.
     */
    public function allocate(string $voucherType, int $firstNumber): string
    {
        if (!$this->pdo->inTransaction()) {
            throw new RuntimeException('Voucher numbers must be allocated inside the financial transaction.');
        }
        if (!in_array($voucherType, self::TYPES, true)) {
            throw new InvalidArgumentException('Unsupported voucher type.');
        }
        if ($firstNumber < 1 || $firstNumber > 9_223_372_036_854_775_000) {
            throw new InvalidArgumentException('The initial voucher number is outside the supported range.');
        }

        $seed = $this->pdo->prepare(
            'INSERT IGNORE INTO voucher_number_sequences (voucher_type, next_number, updated_at_utc)
             VALUES (:voucher_type, :first_number, UTC_TIMESTAMP(6))'
        );
        $seed->execute([
            'voucher_type' => $voucherType,
            'first_number' => $firstNumber,
        ]);

        $select = $this->pdo->prepare(
            'SELECT next_number FROM voucher_number_sequences
             WHERE voucher_type = :voucher_type FOR UPDATE'
        );
        $select->execute(['voucher_type' => $voucherType]);
        $next = $select->fetchColumn();
        if ($next === false || !ctype_digit((string) $next)) {
            throw new RuntimeException('The voucher number sequence is missing or invalid.');
        }

        $number = (int) $next;
        if ($number < 1 || $number >= 9_223_372_036_854_775_000) {
            throw new RuntimeException('The voucher number sequence is exhausted.');
        }

        $advance = $this->pdo->prepare(
            'UPDATE voucher_number_sequences
             SET next_number = :next_number, updated_at_utc = UTC_TIMESTAMP(6)
             WHERE voucher_type = :voucher_type'
        );
        $advance->execute([
            'next_number' => $number + 1,
            'voucher_type' => $voucherType,
        ]);
        if ($advance->rowCount() !== 1) {
            throw new RuntimeException('The voucher number sequence could not be advanced.');
        }

        return (string) $number;
    }
}
