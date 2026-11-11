<?php

declare(strict_types=1);

namespace App\Modules\Imports\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class HistoricalMigrationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $principal = $this->attributes->get('principal');
        return is_array($principal) && ($principal['role'] ?? '') === 'owner';
    }

    public function rules(): array
    {
        return [
            'contractVersion' => ['required', 'integer', 'in:1'],
            'sourceSystem' => ['required', 'in:apps-script-vouchers'],
            'batchId' => ['required', 'string', 'max:128', 'regex:/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D'],
            'sourceExtractedAtUtc' => ['required', 'string', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/D'],
            'vouchers' => ['required', 'array', 'min:1', 'max:100'],
            'vouchers.*.sourceRecordId' => ['required', 'string', 'max:100'],
            'vouchers.*.voucher' => ['required', 'array'],
            'approvals' => ['sometimes', 'array', 'max:1000'],
            'approvals.*.sourceRecordId' => ['required', 'string', 'max:160'],
            'approvals.*.voucherSourceRecordId' => ['required', 'string', 'max:100'],
            'approvals.*.decision' => ['required', 'string', 'max:24'],
            'approvals.*.occurredAtUtc' => ['required', 'string', 'regex:/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?Z$/D'],
            'approvals.*.previousStatus' => ['sometimes', 'string', 'max:24'],
            'approvals.*.nextStatus' => ['sometimes', 'string', 'max:24'],
            'approvals.*.reason' => ['sometimes', 'string', 'max:500'],
            'approvals.*.actorSourceId' => ['sometimes', 'string', 'max:160'],
            'approvals.*.actorEmail' => ['sometimes', 'nullable', 'email', 'max:254'],
            'approvals.*.extensions' => ['sometimes', 'array'],
            'auditEvents' => ['sometimes', 'array', 'max:2000'],
            'auditEvents.*.sourceRecordId' => ['required', 'string', 'max:160'],
            'auditEvents.*.voucherSourceRecordId' => ['required', 'string', 'max:100'],
            'auditEvents.*.eventType' => ['required', 'string', 'max:80'],
            'auditEvents.*.occurredAtUtc' => ['required', 'string', 'regex:/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?Z$/D'],
            'auditEvents.*.actorSourceId' => ['sometimes', 'string', 'max:160'],
            'auditEvents.*.actorEmail' => ['sometimes', 'nullable', 'email', 'max:254'],
            'auditEvents.*.reason' => ['sometimes', 'string', 'max:500'],
            'auditEvents.*.extensions' => ['sometimes', 'array'],
            'auditEvents.*.before' => ['sometimes', 'nullable', 'array'],
            'auditEvents.*.after' => ['sometimes', 'nullable', 'array'],
            'receipts' => ['sometimes', 'array', 'max:300'],
            'receipts.*.sourceRecordId' => ['required', 'string', 'max:160'],
            'receipts.*.voucherSourceRecordId' => ['required', 'string', 'max:100'],
            'receipts.*.originalFileId' => ['required', 'string', 'max:160'],
            'receipts.*.name' => ['required', 'string', 'max:255'],
            'receipts.*.contentType' => ['required', 'in:image/jpeg,image/png,image/webp'],
            'receipts.*.byteSize' => ['required', 'integer', 'min:1', 'max:1600000'],
            'receipts.*.sha256' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/D'],
            'receipts.*.createdAtUtc' => ['required', 'string', 'regex:/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?Z$/D'],
            'receipts.*.createdByEmail' => ['sometimes', 'nullable', 'email', 'max:254'],
            'receipts.*.extensions' => ['sometimes', 'array'],
        ];
    }
}
