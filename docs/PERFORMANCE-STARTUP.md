# Authenticated startup performance investigation

## Source reports

The desktop and mobile reports supplied on 2 November 2026 were generated with Lighthouse 13.5.0 against the staging URL. They are diagnostic captures, not clean-profile baselines.

| Metric                   | Desktop | Moto G Power mobile |
| ------------------------ | ------: | ------------------: |
| First Contentful Paint   |  1.87 s |              2.46 s |
| Largest Contentful Paint | 23.68 s |             19.17 s |
| Total Blocking Time      |   31 ms |            1,238 ms |
| Cumulative Layout Shift  |       0 |                   0 |
| Speed Index              | 16.78 s |             18.04 s |

The mobile performance score was 0.38. The mobile capture used a Moto G Power emulation profile (412 × 823, Android 11 user agent) and reports `disableStorageReset: true`; do not treat it as an anonymous first-visit measurement.

Both reports contain a Chrome-extension warning. The unused-JavaScript opportunity attributes its estimated 78 KiB to `chrome-extension://...` resources, not to the Cash Voucher origin. Re-run without extensions before acting on that audit. The CSS render-blocking estimates are secondary to the much larger LCP render delay.

## Root cause found in the source

The captured LCP element is the onboarding attention paragraph:

```css
div#view > section.onboarding-page > section.onboarding-attention > p
```

Its text begins “Login and role restrictions — pending evidence.” Lighthouse attributes approximately 23.23 seconds (desktop) and 18.72 seconds (mobile) to element render delay, while time to first byte is about 456 ms in both runs.

The authenticated startup path previously serialized:

1. `bootstrap` to load the signed-in workspace;
2. `onboardingState` in `navigation.start` to decide whether an owner must remain in onboarding;
3. another `onboardingState` initiated by `onboarding.render()` because the onboarding feature had no initial state.

It also awaited the authenticated offline-queue banner's IndexedDB read before `navigation.start()` returned and the global boot overlay was dismissed. `main.init()` already performed a separate non-blocking pass before authentication so legacy queue migration errors could be shown on the login screen; that recovery path must remain.

## Phase 7 change

- Authenticated bootstrap now includes the server-verified onboarding state for users with the `settings` permission only.
- Onboarding identity/readiness failures are returned as a sanitized onboarding-specific diagnostic; they do not prevent standard workspace bootstrap from succeeding.
- The onboarding feature receives that state and renders it without a second API read. A one-request fallback remains for older staged backends that do not yet include the new bootstrap field.
- The pre-authentication offline-queue diagnostic remains fire-and-forget so legacy storage failures are visible on the login screen. The account-scoped banner refresh starts after route rendering and does not block the startup promise.
- Existing server-side onboarding financial-write gates, owner-only evidence confirmation, environment identity validation and production/staging separation are unchanged.

## Validation required after merge and deployment

1. CI backend and frontend tests must pass, including an E2E assertion that owner startup receives onboarding state with one bootstrap request and no additional `onboardingState` request on the new backend.
2. Deploy the reviewed source to staging through the separately authorized release process; this PR does not publish via Clasp.
3. Capture new desktop and Moto G Power Lighthouse runs from a clean browser profile with extensions disabled, storage reset enabled, DevTools foregrounded, and identical throttling/device settings.
4. Compare LCP breakdown, the final LCP element, request waterfall, FCP/LCP/TBT/CLS and Speed Index. Do not claim improvement from the local mock-server smoke alone.
5. Confirm the onboarding page still shows the same server-calculated stages, evidence and financial-write policy.

No production deployment, Apps Script push, sheet write/migration, staging financial transaction or owner evidence mutation is part of this change.
