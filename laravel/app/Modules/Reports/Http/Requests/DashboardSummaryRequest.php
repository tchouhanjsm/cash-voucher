<?php

declare(strict_types=1);

namespace App\Modules\Reports\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class DashboardSummaryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'from' => ['required', 'string', 'date_format:Y-m-d'],
            'to' => ['required', 'string', 'date_format:Y-m-d'],
        ];
    }
}
