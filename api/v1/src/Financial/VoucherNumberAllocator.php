<?php
declare(strict_types=1);

namespace CashVoucher\Api\Financial;

use CashVoucher\Api\Support\ApiException;
use InvalidArgumentException;
use PDO;
use RuntimeException;

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

        // A previously issued/imported numeric voucher number may be above the
        // current sequence. Never skip/reuse numbers automatically: the Owner
        // must reconcile the series from the source ledger before writes resume.
        // This check runs after the per-type sequence lock, serializing normal
        // allocator writes while keeping the sequence itself server-authoritative.
        $issued = $this->pdo->prepare(
            "SELECT COALESCE(MAX(CAST(voucher_number AS UNSIGNED)), 0)
             FROM vouchers
             WHERE voucher_type = :voucher_type
               AND voucher_number <> ''
               AND voucher_number NOT REGEXP '[^0-9]'"
        );
        $issued->execute(['voucher_type' => $voucherType]);
        $maxIssued = (int) $issued->fetchColumn();
        if ($number <= $maxIssued) {
            throw new ApiException(
                503,
                'VOUCHER_SEQUENCE_RECONCILIATION_REQUIRED',
                'The voucher number sequence is not above every issued numeric voucher number. An Owner must reconcile the series before more vouchers can be created.',
            );
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
