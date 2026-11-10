<?php

declare(strict_types=1);

namespace App\Modules\Imports\Http\Requests;

use App\Modules\Identity\RoleCapabilities;
use Illuminate\Foundation\Http\FormRequest;

final class VoucherImportRequest extends FormRequest
{
    public function authorize(): bool
    {
        $principal = $this->attributes->get('principal');

        return is_array($principal)
            && isset($principal['role'])
            && RoleCapabilities::allows((string) $principal['role'], 'bulk');
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'sourceSystem' => ['required', 'in:apps-script-vouchers,manual-csv'],
            'batchId' => ['required', 'string', 'max:128', 'regex:/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D'],
            'rows' => ['required', 'array', 'min:1', 'max:100'],
            'rows.*' => ['required', 'array'],
            'rows.*.sourceRecordId' => [
                'required',
                'string',
                'max:100',
                'regex:/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/D',
            ],
            'rows.*.voucher' => ['required', 'array'],
        ];
    }
}
