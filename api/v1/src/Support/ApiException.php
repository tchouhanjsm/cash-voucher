<?php
declare(strict_types=1);

namespace CashVoucher\Api\Support;

use RuntimeException;

final class ApiException extends RuntimeException
{
    public function __construct(
        public readonly int $httpStatus,
        public readonly string $errorCode,
        string $safeMessage
    ) {
        parent::__construct($safeMessage);
    }
}
