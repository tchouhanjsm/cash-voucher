<?php

declare(strict_types=1);

namespace App\Modules\Bootstrap\Http\Controllers;

use App\Modules\Identity\RoleCapabilities;
use App\Modules\Settings\Actions\PropertySettings;
use App\Modules\Shared\ApiResponse;
use CashVoucher\Api\Security\Role;
use CashVoucher\Api\Support\ApiException;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class BootstrapController
{
    private const VOUCHER_LIMIT = 200;

    public function show(Request $request, PropertySettings $settings): JsonResponse
    {
        $principal = $request->attributes->get('principal');
        if (! is_array($principal) || ! isset($principal['id'], $principal['name'], $principal['email'], $principal['role'])) {
            throw new ApiException(401, 'SESSION_REQUIRED', 'Sign in to continue.');
        }

        $role = (string) $principal['role'];
        $canViewAll = RoleCapabilities::allows($role, 'viewAll');
        $canViewOwn = RoleCapabilities::allows($role, 'viewOwn');
        $canViewSettings = RoleCapabilities::allows($role, 'settings');

        $propertySettings = $settings->show(DB::connection()->getPdo());
        if (! $canViewAll) {
            $propertySettings['openingBalance'] = '0.00';
        }

        $data = [
            'user' => [
                'id' => (string) $principal['id'],
                'name' => (string) $principal['name'],
                'email' => (string) $principal['email'],
                'role' => $role,
                'perms' => array_fill_keys(Role::capabilities($role), true),
                'mustChangePassword' => (bool) ($principal['mustChangePassword'] ?? false),
            ],
            'settings' => $propertySettings,
            'vouchers' => $this->vouchers($principal, $canViewAll, $canViewOwn),
            'vendors' => $role === 'accountant' ? [] : $this->vendors(),
            'names' => $canViewAll ? $this->allNames() : [
                strtolower((string) $principal['email']) => (string) $principal['name'],
            ],
            'onboarding' => null,
            'onboardingError' => $canViewSettings
                ? 'Owner onboarding checks are not implemented in the Laravel shadow API.'
                : '',
        ];

        return ApiResponse::success($data, (string) $request->attributes->get('request_id'));
    }

    /**
     * @param array{id:string,name:string,email:string,role:string} $principal
     * @return list<array<string,mixed>>
     */
    private function vouchers(array $principal, bool $canViewAll, bool $canViewOwn): array
    {
        if (! $canViewAll && ! $canViewOwn) {
            return [];
        }

        $query = DB::table('vouchers as v')
            ->leftJoin('users as updated_user', 'updated_user.id', '=', 'v.updated_by_user_id')
            ->leftJoin('users as approved_user', 'approved_user.id', '=', 'v.approved_by_user_id');

        if (! $canViewAll) {
            $query->where('v.created_by_user_id', (string) $principal['id']);
        }

        $rows = $query
            ->orderByDesc('v.created_at_utc')
            ->orderByRaw('CAST(v.voucher_number AS UNSIGNED) DESC')
            ->limit(self::VOUCHER_LIMIT)
            ->get([
                'v.id',
                'v.voucher_number',
                'v.business_date',
                'v.vendor_name_snapshot',
                'v.vendor_id',
                'v.vendor_type',
                'v.payment_method',
                'v.amount_paise',
                'v.category',
                'v.notes',
                'v.voucher_type',
                'v.status',
                'v.created_by_email_snapshot',
                'v.created_at_utc',
                'v.cancel_reason',
                'v.cash_impact',
                'v.approval_status',
                'v.approved_at_utc',
                'v.approval_reason',
                'updated_user.email as updated_by_email',
                'v.updated_at_utc',
                'approved_user.email as approved_by_email',
            ]);

        if ($rows->isEmpty()) {
            return [];
        }

        $voucherIds = $rows->pluck('id')->map(static fn ($id): string => (string) $id)->all();
        $receiptMap = [];
        DB::table('voucher_receipts')
            ->whereIn('voucher_id', $voucherIds)
            ->orderBy('created_at_utc')
            ->orderBy('id')
            ->get(['voucher_id', 'id'])
            ->each(static function (object $receipt) use (&$receiptMap): void {
                $receiptMap[(string) $receipt->voucher_id][] = (string) $receipt->id;
            });

        return $rows->map(function (object $row) use ($receiptMap): array {
            $paise = (int) $row->amount_paise;

            return [
                'id' => (string) $row->id,
                'no' => (int) $row->voucher_number,
                'date' => (string) $row->business_date,
                'vendor' => (string) $row->vendor_name_snapshot,
                'vendorId' => $row->vendor_id === null ? '' : (string) $row->vendor_id,
                'vendorType' => $this->vendorType($row->vendor_type, $row->vendor_id),
                'paymentMethod' => (string) $row->payment_method,
                'amount' => intdiv($paise, 100).'.'.str_pad((string) ($paise % 100), 2, '0', STR_PAD_LEFT),
                'category' => (string) $row->category,
                'notes' => (string) $row->notes,
                'type' => (string) $row->voucher_type,
                'status' => (string) $row->status,
                'createdBy' => (string) $row->created_by_email_snapshot,
                'createdAt' => $this->timestamp($row->created_at_utc),
                'updatedBy' => (string) ($row->updated_by_email ?? ''),
                'updatedAt' => $this->timestamp($row->updated_at_utc),
                'receipts' => $receiptMap[(string) $row->id] ?? [],
                'cancelReason' => (string) $row->cancel_reason,
                'cashImpact' => $this->cashImpact($row->cash_impact),
                'approvalStatus' => $this->approvalStatus($row->approval_status),
                'approvedBy' => (string) ($row->approved_by_email ?? ''),
                'approvedAt' => $this->timestamp($row->approved_at_utc),
                'approvalReason' => (string) $row->approval_reason,
            ];
        })->all();
    }

    /**
     * @return list<array<string,mixed>>
     */
    private function vendors(): array
    {
        return DB::table('vendors')
            ->orderBy('display_name')
            ->orderBy('id')
            ->get([
                'id',
                'display_name',
                'company_name',
                'mobile',
                'is_active',
                'default_category',
                'default_payment_method',
            ])
            ->map(fn (object $vendor): array => [
                'id' => (string) $vendor->id,
                'name' => (string) $vendor->display_name,
                'company' => (string) $vendor->company_name,
                'mobile' => $this->mobileDisplay($vendor->mobile),
                'active' => (int) $vendor->is_active === 1,
                'defaultCategory' => (string) $vendor->default_category,
                'defaultPaymentMethod' => (string) $vendor->default_payment_method,
            ])
            ->all();
    }

    /**
     * @return array<string,string>
     */
    private function allNames(): array
    {
        $names = [];
        DB::table('users')
            ->orderBy('email_normalized')
            ->get(['email_normalized', 'full_name'])
            ->each(static function (object $user) use (&$names): void {
                $email = strtolower((string) $user->email_normalized);
                if ($email !== '') {
                    $names[$email] = (string) $user->full_name;
                }
            });

        return $names;
    }

    private function vendorType(mixed $value, mixed $vendorId): string
    {
        $type = is_string($value) ? $value : '';
        if ($type !== '') {
            return $type;
        }

        return $vendorId ? 'REGISTERED' : 'UNVERIFIED';
    }

    private function cashImpact(mixed $value): string
    {
        $impact = is_string($value) ? $value : '';

        return in_array($impact, ['CASH_IN', 'CASH_OUT', 'NO_CASH'], true)
            ? $impact
            : 'UNCLASSIFIED';
    }

    private function approvalStatus(mixed $value): string
    {
        $status = is_string($value) ? $value : '';
        if ($status === '') {
            return 'NOT_REQUIRED';
        }

        return in_array($status, ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'], true)
            ? $status
            : 'REVIEW_REQUIRED';
    }

    private function mobileDisplay(mixed $value): string
    {
        $mobile = is_string($value) ? $value : '';

        return strlen($mobile) > 1
            && $mobile[0] === "'"
            && preg_match('/^[=+@-]/', $mobile[1]) === 1
                ? substr($mobile, 1)
                : $mobile;
    }

    private function timestamp(mixed $value): string
    {
        if (! is_string($value) || trim($value) === '') {
            return '';
        }

        try {
            return (new DateTimeImmutable($value, new DateTimeZone('UTC')))
                ->setTimezone(new DateTimeZone('UTC'))
                ->format('Y-m-d\TH:i:s.u\Z');
        } catch (\Throwable) {
            return '';
        }
    }
}
