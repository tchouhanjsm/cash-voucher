<?php

declare(strict_types=1);

namespace App\Modules\Receipts\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class AttachReceiptRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'receipt' => ['required', 'array:mime,data'],
            'receipt.mime' => ['required', 'string', 'in:image/jpeg,image/png,image/webp'],
            'receipt.data' => ['required', 'string', 'max:2200000'],
        ];
    }
}
