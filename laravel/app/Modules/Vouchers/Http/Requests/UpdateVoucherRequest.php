<?php

declare(strict_types=1);

namespace App\Modules\Vouchers\Http\Requests;

use App\Modules\Identity\RoleCapabilities;
use Illuminate\Foundation\Http\FormRequest;

final class UpdateVoucherRequest extends FormRequest
{
    public function authorize(): bool
    {
        $principal = $this->attributes->get('principal');

        return is_array($principal)
            && isset($principal['role'])
            && RoleCapabilities::allows((string) $principal['role'], 'edit');
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'fields' => ['required', 'array:date,vendor,amount,category,notes,paymentMethod,cashImpact', 'min:1'],
            'fields.date' => ['sometimes', 'string', 'date_format:Y-m-d'],
            'fields.vendor' => ['sometimes', 'string', 'max:200'],
            'fields.amount' => ['sometimes', 'string', 'regex:/^(?:0|[1-9][0-9]{0,7})(?:\\.[0-9]{1,2})?$/D'],
            'fields.category' => ['sometimes', 'string', 'max:80'],
            'fields.notes' => ['sometimes', 'string', 'max:500'],
            'fields.paymentMethod' => ['sometimes', 'in:CASH,UPI,BANK_TRANSFER'],
            'fields.cashImpact' => ['sometimes', 'in:CASH_IN,CASH_OUT,NO_CASH'],
            'reason' => ['required', 'string', 'min:3', 'max:200'],
        ];
    }
}
