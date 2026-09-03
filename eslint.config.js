export default [
  {
    files: ['src/**/*.js'],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',

      globals: {
        // Google Apps Script
        SpreadsheetApp: 'readonly',
        HtmlService: 'readonly',
        Utilities: 'readonly',
        CacheService: 'readonly',
        Session: 'readonly',
        PropertiesService: 'readonly',
        ScriptApp: 'readonly',
        DriveApp: 'readonly',
        DocumentApp: 'readonly',
        FormApp: 'readonly',
        GmailApp: 'readonly',
        UrlFetchApp: 'readonly',
        Logger: 'readonly',
        LockService: 'readonly',
        ContentService: 'readonly',
        MimeType: 'readonly',

        // Browser / JS runtime
        console: 'readonly',

        // Shared application globals
        APP_CONFIG: 'readonly',

        // Shared server functions
        getSpreadsheet_: 'readonly',
        getSheet_: 'readonly',
        setSetting_: 'readonly',
        getSetting_: 'readonly',
        writeAuditLog_: 'readonly',
        requireUser_: 'readonly',
        requirePermission_: 'readonly',
        validatePin_: 'readonly',
        hashPin_: 'readonly',
        findUserByEmail_: 'readonly',
        generateVoucherNumber_: 'readonly',
        formatIndianDate_: 'readonly',
        formatDateTime_: 'readonly',
        numberToIndianWords_: 'readonly',
        parseOptionalDate_: 'readonly',
      },
    },

    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'no-console': 'off',
    },
  },
];