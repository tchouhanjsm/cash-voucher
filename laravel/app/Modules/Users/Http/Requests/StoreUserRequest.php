<?php

declare(strict_types=1);

namespace App\Modules\Users\Http\Requests;

use App\Modules\Identity\RoleCapabilities;
use Illuminate\Foundation\Http\FormRequest;

final class StoreUserRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:80'],
            'email' => ['required', 'string', 'email', 'max:254'],
            'role' => ['required', 'in:staff,manager,owner,accountant'],
            'temporaryPassword' => ['required', 'string', 'min:8', 'max:128'],
        ];
    }
}
