/*******************************************************
 * FILE: 01_Config.gs
 *
 * Central application configuration.
 *******************************************************/

const APP_CONFIG = {
  SPREADSHEET_ID: '1SLuhKS05CfiyrxVuiffckturyZxOrRqTzjepM3EmiF4',
  PROPERTY_NAME: 'Hotel Garh Jaisal Haveli',

  PROPERTY_ADDRESS:
    'Inside fort, kotari para, Jaisalmer, Rajasthan, India, 345001',

  CURRENCY_SYMBOL: '₹',

  TIMEZONE: 'Asia/Kolkata',

  SHEETS: {
    USERS: 'Users',
    VOUCHERS: 'Vouchers',
    VENDORS: 'Vendors',
    SETTINGS: 'Settings',
    AUDIT: 'AuditLog',
  },

  ROLES: {
    OWNER: 'owner',
    MANAGER: 'manager',
    STAFF: 'staff',
  },

  VOUCHER_STATUS: {
    ACTIVE: 'ACTIVE',
    DELETED: 'DELETED',
  },

  PAYMENT_MODES: ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'],

  PAYEE_TYPES: ['Vendor', 'Employee', 'Guest', 'Service Provider', 'Other'],

  EXPENSE_CATEGORIES: [
    'Housekeeping',
    'Maintenance',
    'Electrical',
    'Plumbing',
    'Kitchen',
    'Food & Beverage',
    'Laundry',
    'Guest Supplies',
    'Transport',
    'Fuel',
    'Staff Welfare',
    'Staff Advance',
    'Petty Cash',
    'Local Purchase',
    'Vendor Payment',
    'Repairs',
    'Gardening',
    'Security',
    'Office Expense',
    'Stationery',
    'Internet / Telecom',
    'Licenses',
    'Bank Charges',
    'Guest Refund',
    'Other',
  ],
  VOUCHER_NUMBER_START: 201,

  /*****************************************************
   * AUTHENTICATION
   *****************************************************/

  AUTH: {
    // Session lifetime: 6 hours.
    SESSION_TTL_SECONDS: 21600,

    // Maximum failed PIN attempts.
    MAX_FAILED_ATTEMPTS: 5,

    // Account lockout duration.
    LOCKOUT_MINUTES: 15,

    // PIN must be exactly six digits.
    PIN_LENGTH: 6,
  },

  /*****************************************************
   * INITIAL OWNER
   *
   * IMPORTANT:
   * Put your chosen temporary owner PIN here only
   * during initial setup.
   *
   * Example:
   *
   * INITIAL_OWNER_PIN: '483921'
   *
   * After setup/change of owner PIN, remove it.
   *****************************************************/

  DEFAULT_OWNER_EMAIL: 'garhjaisal8@gmail.com',

  INITIAL_OWNER_PIN: '253836',
};
function testVoucherConfiguration() {
  const result = {
    paymentModes: Array.isArray(APP_CONFIG.PAYMENT_MODES),

    payeeTypes: Array.isArray(APP_CONFIG.PAYEE_TYPES),

    expenseCategories: Array.isArray(APP_CONFIG.EXPENSE_CATEGORIES),

    voucherStart: APP_CONFIG.VOUCHER_NUMBER_START,

    spreadsheetId: APP_CONFIG.SPREADSHEET_ID,
  };

  console.log(JSON.stringify(result, null, 2));

  return result;
}
