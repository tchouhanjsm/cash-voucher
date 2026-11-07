<?php

declare(strict_types=1);

namespace App\Modules\Users\Http\Requests;

use App\Modules\Identity\RoleCapabilities;
use Illuminate\Foundation\Http\FormRequest;

final class ResetUserPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        $principal = $this->attributes->get('principal');

        return is_array($principal)
            && isset($principal['role'])
            && RoleCapabilities::allows((string) $principal['role'], 'users');
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'temporaryPassword' => ['required', 'string', 'min:8', 'max:128'],
        ];
    }
}
