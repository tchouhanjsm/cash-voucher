<?php
declare(strict_types=1);

use CashVoucher\Api\Http\Kernel;
use CashVoucher\Api\Http\Request;
use CashVoucher\Api\Http\Response;
use CashVoucher\Api\Support\ApiException;

require __DIR__ . '/bootstrap.php';

try {
    $request = Request::fromGlobals();
    (new Kernel())->handle($request)->send();
} catch (ApiException $exception) {
    Response::failure($exception, bin2hex(random_bytes(16)))->send();
} catch (Throwable $exception) {
    error_log('Cash Voucher API bootstrap failure: ' . get_class($exception));
    Response::failure(
        new ApiException(500, 'INTERNAL_ERROR', 'The request could not be completed.'),
        bin2hex(random_bytes(16))
    )->send();
}
