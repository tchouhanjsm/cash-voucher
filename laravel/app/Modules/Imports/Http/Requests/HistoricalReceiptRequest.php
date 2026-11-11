<?php

declare(strict_types=1);

namespace App\Modules\Imports\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class HistoricalReceiptRequest extends FormRequest
{
    public function authorize(): bool
    {
        $principal = $this->attributes->get('principal');
        return is_array($principal) && ($principal['role'] ?? '') === 'owner';
    }

    public function rules(): array
    {
        return [
            'mime' => ['required', 'in:image/jpeg,image/png,image/webp'],
            'data' => ['required', 'string', 'max:2200000'],
        ];
    }
}
