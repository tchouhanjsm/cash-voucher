<?php

declare(strict_types=1);

namespace App\Modules\Reports\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class RecordedMovementReportRequest extends FormRequest
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
            'type' => ['sometimes', 'in:ALL,PAYMENT,RECEIPT'],
            'status' => ['sometimes', 'in:ALL,ACTIVE,CANCELLED'],
            'paymentMethod' => ['sometimes', 'in:ALL,CASH,UPI,BANK_TRANSFER,UNRECORDED,UNRECOGNIZED'],
            'offset' => ['sometimes', 'integer', 'min:0', 'max:1000000'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ];
    }
}
