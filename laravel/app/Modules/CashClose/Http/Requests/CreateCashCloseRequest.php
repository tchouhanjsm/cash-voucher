<?php

declare(strict_types=1);

namespace App\Modules\CashClose\Http\Requests;

use App\Modules\Identity\RoleCapabilities;
use Illuminate\Foundation\Http\FormRequest;

final class CreateCashCloseRequest extends FormRequest
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
        $amount = ['string', 'regex:/^(?:0|[1-9][0-9]{0,7})(?:\\.[0-9]{1,2})?$/D'];

        return [
            'date' => ['required', 'string', 'date_format:Y-m-d'],
            'countedCash' => ['required', ...$amount],
            'openingCash' => ['sometimes', 'nullable', ...$amount],
            'openingReason' => ['sometimes', 'nullable', 'string', 'max:200'],
            'varianceReason' => ['sometimes', 'nullable', 'string', 'max:200'],
        ];
    }
}
