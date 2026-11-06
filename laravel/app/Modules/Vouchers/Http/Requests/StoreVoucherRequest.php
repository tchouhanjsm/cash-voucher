<?php

namespace App\Modules\Vouchers\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class StoreVoucherRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'date' => ['required', 'string', 'date_format:Y-m-d'],
            'vendor' => ['required', 'string', 'max:200'],
            'vendorId' => ['sometimes', 'nullable', 'string', 'max:36'],
            'amount' => ['required', 'string', 'regex:/^(?:0|[1-9][0-9]{0,7})(?:\\.[0-9]{1,2})?$/D'],
            'category' => ['sometimes', 'nullable', 'string', 'max:80'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:500'],
            'type' => ['sometimes', 'nullable', 'in:PAYMENT,RECEIPT'],
            'cashImpact' => ['required', 'in:CASH_IN,CASH_OUT,NO_CASH'],
            'paymentMethod' => ['sometimes', 'nullable', 'in:CASH,UPI,BANK_TRANSFER'],
            'clientId' => ['required', 'string', 'max:128', 'regex:/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D'],
            'duplicateConfirmationToken' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'receipts' => ['sometimes', 'array', 'max:0'],
            'bulk' => ['sometimes', 'boolean'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('vendor') && is_string($this->input('vendor'))) {
            $this->merge(['vendor' => trim($this->input('vendor'))]);
        }

        if ($this->has('type') && ($this->input('type') === null || $this->input('type') === '')) {
            $this->merge(['type' => 'PAYMENT']);
        }

        if ($this->has('category') && ($this->input('category') === null || $this->input('category') === '')) {
            $this->merge(['category' => 'Other']);
        }
    }
}
