<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class EntrySuggestionApiTest extends TestCase
{
    public function test_staff_suggestions_use_only_their_own_active_entries(): void
    {
        $this->setClassification($this->insertVoucherFixture($this->userId, 'North Electrical', 12500), 'Maintenance', 'UPI');
        $this->setClassification($this->insertVoucherFixture($this->userId, 'North Electrical', 25000), 'Maintenance', 'UPI');
        $this->setClassification($this->insertVoucherFixture($this->userId, 'North Electrical', 5000), 'Office Expense', 'CASH');

        $otherUser = $this->createUser('staff');
        for ($index = 0; $index < 4; $index++) {
            $this->setClassification($this->insertVoucherFixture($otherUser, 'North Electrical', 3000), 'Food & Beverage', 'BANK_TRANSFER');
        }

        $beforeCount = DB::table('vouchers')->count();
        $this->withLegacySession()
            ->getJson('/api/v1/entry-suggestions?vendor=North%20Electrical&type=PAYMENT')
            ->assertOk()
            ->assertJsonPath('data.scope', 'OWN')
            ->assertJsonPath('data.suggestions.category.value', 'Maintenance')
            ->assertJsonPath('data.suggestions.category.evidenceCount', 2)
            ->assertJsonPath('data.suggestions.paymentMethod.value', 'UPI')
            ->assertJsonPath('data.suggestions.paymentMethod.evidenceCount', 2);
        self::assertSame($beforeCount, DB::table('vouchers')->count(), 'Suggestions must be read-only.');
    }

    public function test_manager_uses_property_history_and_accountant_is_denied(): void
    {
        $otherUser = $this->createUser('staff');
        $this->setClassification($this->insertVoucherFixture($otherUser, 'Property Supplier', 10000), 'Kitchen', 'BANK_TRANSFER');
        $this->setClassification($this->insertVoucherFixture($otherUser, 'Property Supplier', 15000), 'Kitchen', 'BANK_TRANSFER');

        $this->withRoleSession('manager')
            ->getJson('/api/v1/entry-suggestions?vendor=Property%20Supplier&type=PAYMENT')
            ->assertOk()
            ->assertJsonPath('data.scope', 'PROPERTY')
            ->assertJsonPath('data.suggestions.category.value', 'Kitchen')
            ->assertJsonPath('data.suggestions.paymentMethod.value', 'BANK_TRANSFER');

        $this->withRoleSession('accountant')
            ->getJson('/api/v1/entry-suggestions?vendor=Property%20Supplier&type=PAYMENT')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'FORBIDDEN');
    }

    public function test_saved_vendor_defaults_are_returned_as_explicit_suggestions(): void
    {
        $vendorId = $this->insertVendorFixture('Configured Supplier');
        DB::table('vendors')->where('id', $vendorId)->update([
            'default_category' => 'Electrical',
            'default_payment_method' => 'UPI',
        ]);

        $this->withLegacySession()
            ->getJson('/api/v1/entry-suggestions?vendor=Configured%20Supplier&type=PAYMENT')
            ->assertOk()
            ->assertJsonPath('data.suggestions.category.value', 'Electrical')
            ->assertJsonPath('data.suggestions.category.source', 'VENDOR_DEFAULT')
            ->assertJsonPath('data.suggestions.paymentMethod.value', 'UPI')
            ->assertJsonPath('data.suggestions.paymentMethod.source', 'VENDOR_DEFAULT');
    }

    public function test_tied_history_does_not_choose_an_accounting_classification(): void
    {
        $this->setClassification($this->insertVoucherFixture($this->userId, 'Ambiguous Supplier', 5000), 'Maintenance', 'UPI');
        $this->setClassification($this->insertVoucherFixture($this->userId, 'Ambiguous Supplier', 5000), 'Office Expense', 'CASH');

        $this->withLegacySession()
            ->getJson('/api/v1/entry-suggestions?vendor=Ambiguous%20Supplier&type=PAYMENT')
            ->assertOk()
            ->assertJsonPath('data.suggestions.category', null)
            ->assertJsonPath('data.suggestions.paymentMethod', null);
    }

    private function setClassification(string $voucherId, string $category, string $paymentMethod): void
    {
        DB::table('vouchers')->where('id', $voucherId)->update([
            'category' => $category,
            'payment_method' => $paymentMethod,
        ]);
    }
}
