<?php

use Illuminate\Support\Facades\Artisan;

Artisan::command('cash-voucher:about', function (): void {
    $this->info('Cash Voucher Laravel API is isolated from production.');
})->purpose('Display the isolated Laravel API runtime status.');
