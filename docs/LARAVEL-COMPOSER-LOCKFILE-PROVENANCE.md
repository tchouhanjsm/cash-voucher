# Laravel Composer lockfile provenance

## Purpose

The Laravel shadow API must resolve dependencies reproducibly. CI must install the exact dependency graph committed in `laravel/composer.lock`; it must not recalculate the graph with `composer update` on every build.

## Authoritative artifact

The lockfile was resolved by the existing CI workflow against the merged `client-main` commit:

- Base commit: `50eb17f5dfe663f3edf5afb2516aa8184776a635`
- Workflow run: [42353574761](https://github.com/tchouhanjsm/cash-voucher/actions/runs/42353574761)
- Artifact: [13567160799](https://github.com/tchouhanjsm/cash-voucher/actions/runs/42353574761/artifacts/13567160799)
- Artifact ZIP SHA-256: `d01590ecd9d156637cc84554303125d80e3d176f090405c6fab9e038aca1fb2f`
- Extracted `composer.lock` SHA-256: `5e96358914da923e3a0f6dda2a52c7b2ca5935cebeea2ef748486178720636d3`
- Composer lock content hash: `ab9c1c053f23955c8366c8c345ac54e9`
- Locked packages: 75 production and 25 development packages
- Laravel framework: `v13.40.0`
- PHPUnit: `12.5.43`

The extracted file checksum was independently verified against the artifact. Composer validation passed for the manifest and this lockfile.

## CI policy

The Laravel dependency step uses:

```bash
composer install --working-dir=laravel --no-interaction --prefer-dist --no-progress
```

The workflow retains Composer manifest validation, dependency advisory checks, PHP lint, and the Laravel PHPUnit suite against the isolated MySQL 8.0 test service. The lockfile is not regenerated during CI.

## Local validation record

On the project owner's Intel Mac running macOS Ventura:

- PHP CLI explicitly selected: MacPorts PHP 8.3.36 (`/opt/local/bin/php83`)
- Laravel runtime: 13.40.0
- PHPUnit runtime: 12.5.43
- Laravel application/test PHP syntax checks: passed
- Composer manifest/lock validation: passed
- Lockfile checksum: matches the CI artifact
- A local MySQL 8.0 service is not installed; database-backed tests remain covered by the disposable MySQL 8.0 CI service.

The machine's default `php` still resolves to XAMPP PHP 8.2.4. Laravel and Composer commands on that machine must explicitly invoke `/opt/local/bin/php83`; this is a local shell configuration detail and is not changed by this project update.

## Release boundary

This is dependency reproducibility work only. It does not switch the PWA API endpoint, change the production financial writer, connect to production databases, run production migrations, migrate data, enable dual writes, deploy, or authorize cutover. Apps Script remains the production financial writer until a separately approved and rehearsed cutover.
