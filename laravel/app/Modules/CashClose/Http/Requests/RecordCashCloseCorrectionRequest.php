<?php

declare(strict_types=1);

namespace App\Modules\CashClose\Http\Requests;

use App\Modules\Identity\RoleCapabilities;
use Illuminate\Foundation\Http\FormRequest;

final class RecordCashCloseCorrectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        $principal = $this->attributes->get('principal');

        return is_array($principal)
            && isset($principal['role'])
            && RoleCapabilities::allows((string) $principal['role'], 'cashClose');
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'type' => ['required', 'in:VOUCHER,CASH_COUNT,OPENING_CASH,OTHER'],
            'details' => ['required', 'string', 'min:3', 'max:500'],
            'reason' => ['required', 'string', 'min:3', 'max:200'],
            'voucherId' => ['sometimes', 'nullable', 'uuid'],
        ];
    }
}
