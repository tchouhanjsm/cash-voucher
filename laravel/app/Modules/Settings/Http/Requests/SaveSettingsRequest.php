<?php

declare(strict_types=1);

namespace App\Modules\Settings\Http\Requests;

use App\Modules\Identity\RoleCapabilities;
use Illuminate\Foundation\Http\FormRequest;

final class SaveSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        $principal = $this->attributes->get('principal');

        return is_array($principal)
            && isset($principal['role'])
            && RoleCapabilities::allows((string) $principal['role'], 'settings');
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'propertyName' => ['required', 'string', 'max:120'],
            'propertyAddress' => ['nullable', 'string', 'max:300'],
            'categories' => ['required', 'array', 'list', 'min:1', 'max:60'],
            'categories.*' => ['required', 'string', 'max:40'],
            'receiptCategories' => ['required', 'array', 'list', 'min:1', 'max:60'],
            'receiptCategories.*' => ['required', 'string', 'max:40'],
            'nextVoucherNo' => ['nullable', 'integer', 'min:1', 'max:999999999'],
            'nextReceiptNo' => ['nullable', 'integer', 'min:1', 'max:999999999'],
            'openingBalance' => ['required', 'string', 'regex:/^-?(?:0|[1-9][0-9]{0,8})(?:\\.[0-9]{1,2})?$/D'],
        ];
    }
}
