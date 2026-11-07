<?php

declare(strict_types=1);

namespace App\Modules\Vendors\Http\Requests;

use App\Modules\Identity\RoleCapabilities;
use Illuminate\Foundation\Http\FormRequest;

final class SaveVendorRequest extends FormRequest
{
    public function authorize(): bool
    {
        $principal = $this->attributes->get('principal');

        return is_array($principal)
            && isset($principal['role'])
            && RoleCapabilities::allows((string) $principal['role'], 'vendors');
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'company' => ['sometimes', 'nullable', 'string', 'max:120'],
            'mobile' => ['sometimes', 'nullable', 'string', 'max:15', 'regex:/^[0-9+ -]{7,15}$/D'],
            'defaultCategory' => ['sometimes', 'nullable', 'string', 'max:40'],
            'defaultPaymentMethod' => ['sometimes', 'nullable', 'in:CASH,UPI,BANK_TRANSFER'],
        ];
    }

    protected function prepareForValidation(): void
    {
        foreach (['name', 'company', 'mobile', 'defaultCategory', 'defaultPaymentMethod'] as $field) {
            $value = $this->input($field);
            if (! is_string($value)) {
                continue;
            }

            $value = trim($value);
            if ($field !== 'name' && $value === '') {
                $value = null;
            }

            $this->merge([$field => $value]);
        }
    }
}
