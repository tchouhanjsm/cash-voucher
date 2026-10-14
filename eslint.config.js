const eslint = require('@eslint/js');
const globals = require('globals');
const fs = require('fs');
const path = require('path');

// Apps Script shares one global scope across backend/*.gs, so every top-level
// declaration in one file is a legitimate global in the others.
function backendGlobals() {
  const dir = path.join(__dirname, 'backend');
  const found = {};
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.gs'))) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const match of source.matchAll(
      /^(?:async function|function|const|let|var) +([A-Za-z0-9_$]+)/gm,
    )) {
      found[match[1]] = 'writable';
    }
  }
  return found;
}

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
  MailApp: 'readonly',
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
    files: ['app.js', 'frontend/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        CV_CONFIG: 'readonly',
        XLSX: 'readonly',
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
    files: ['config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
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
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.serviceworker,
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
      globals: { ...gasGlobals, ...backendGlobals() },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': [
        'warn',
        {
          vars: 'local',
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
