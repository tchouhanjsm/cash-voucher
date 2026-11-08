'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { ESLint } = require('eslint');

const root = path.resolve(__dirname, '..');

async function run() {
  const eslint = new ESLint({ cwd: root });
  const cases = [
    ['laravel/vendor/laravel/framework/src/example.js', true],
    ['laravel/vendor/symfony/error-handler/Resources/assets/js/example.js', true],
    ['laravel/vendor/phpunit/php-code-coverage/src/Report/example.js', true],
    ['laravel/.phpunit.cache/example.js', true],
    ['frontend/core/laravel-api.js', false],
    ['test/test-eslint-dependency-exclusions.js', false],
  ];

  for (const [relativePath, expectedIgnored] of cases) {
    const ignored = await eslint.isPathIgnored(path.join(root, relativePath));
    assert.equal(
      ignored,
      expectedIgnored,
      relativePath +
        (expectedIgnored ? ' should be ignored by ESLint' : ' must remain in ESLint scope'),
    );
  }

  console.log(
    'ESLint dependency exclusions OK — Composer vendor and PHPUnit cache are ignored; first-party frontend and test files remain lintable.',
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
