<?php

declare(strict_types=1);

namespace App\Modules\Vendors\Http\Requests;

use App\Modules\Identity\RoleCapabilities;
use Illuminate\Foundation\Http\FormRequest;

final class SetVendorActiveRequest extends FormRequest
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
            'active' => ['required', 'boolean'],
        ];
    }
}
