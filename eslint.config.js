const eslint = require('@eslint/js');
const globals = require('globals');

const gasGlobals = {
  SpreadsheetApp: 'readonly',
  PropertiesService: 'readonly',
  Utilities: 'readonly',
  DriveApp: 'readonly',
  LockService: 'readonly',
  CacheService: 'readonly',
  ContentService: 'readonly',
  Session: 'readonly',
  ScriptApp: 'readonly',
  UrlFetchApp: 'readonly',
  MimeType: 'readonly',
  HtmlService: 'readonly',
  Logger: 'readonly',
  console: 'readonly',
};

module.exports = [
  {
    ignores: ['node_modules/**', '.git/**', '*.min.js'],
  },

  eslint.configs.recommended,

  {
    files: ['app.js', 'config.js', 'sw.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        CV_CONFIG: 'readonly',
        XLSX: 'readonly',
        console: 'readonly',
        setup: 'readonly',
        doGet: 'readonly',
        doPost: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    files: ['frontend/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        console: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    files: ['backend/**/*.gs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: gasGlobals,
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    files: ['eslint.config.js', 'test/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
];
