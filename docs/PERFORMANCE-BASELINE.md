# Seeded mock performance baseline

## Purpose and limits

The baseline measures source-level backend operations against the repository's in-memory Google services mock. It provides a repeatable point of comparison before optimization; it does **not** measure live Apps Script execution, Google Sheets/Drive latency, network time, quota behavior, concurrent writes, browser rendering or real operator workflows. Do not present these values as production SLOs or capacity guarantees.

## Workload and sampling

The deterministic fixture creates active `PAYMENT` vouchers and validates both the returned row count and the calculated active-payment total at these dataset sizes:

| Seeded voucher rows | Operations |
| ---: | --- |
| 100 | `bootstrap`, `recordedMovementReport` |
| 500 | `bootstrap`, `recordedMovementReport` |
| 1,000 | `bootstrap`, `recordedMovementReport` |

Each operation performs one warm-up followed by five measured samples. The JSON result records the Node.js version, platform, architecture, capture timestamp, individual sample timings, and min/median/max. Timings are diagnostic only: there are no hard latency thresholds because runner load and hardware affect elapsed time.

## Run locally

Use the repository's supported Node.js range (`>=20 <23`):

```bash
npm ci
npm run measure:performance-baseline
CV_PERFORMANCE_BASELINE_OUT=/tmp/cash-voucher-performance-baseline.json npm run measure:performance-baseline
```

The first command emits a single-line JSON result to stdout. The second also writes a formatted JSON file to the requested path. Only the in-memory `test/mock-gas.js` fixture is used; neither command calls the production Apps Script API.

## CI artifact and comparison

The CI quality workflow captures the same benchmark as `cash-voucher-performance-baseline-<run_id>` and uploads `cash-voucher-performance-baseline.json` for inspection. When comparing runs, compare the same workload, operation, Node version and similar runner environment. Prefer medians over a single timing, retain sample ranges, and look for a repeatable change across multiple runs before drawing conclusions.

Do not add hard performance gates until there is a repeated, stable benchmark and an owner-approved target. If a future performance concern needs a production capacity decision, collect separate measurements in an explicitly authorized test environment and include live Apps Script/Sheets latency, quota and contention evidence.

## Integrity assertions

Every sample still checks the operation result. `bootstrap` must return all seeded vouchers. `recordedMovementReport` must return the same count and item count and the deterministic active-payment total. A benchmark run fails if a business result is wrong, regardless of how fast the operation appears.
