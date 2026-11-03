# Staging Frontend Release and Verification

## Purpose

This procedure closes the gap between a merged frontend and the static application actually served to staging. A merged PR updates source control only. It does not publish `dist/`, update cPanel/Cloudflare files, deploy Apps Script, or invalidate a browser's existing service-worker cache.

The approved workspace implementation is already in PRs #257 and #258. Do not recreate that design or add another visual-only PR to solve a missing static publication.

## Required staging release sequence

1. Confirm `client-main` is the intended integration SHA and that required source checks passed for that exact SHA.
2. Run the repository's **Client staging dist zip** workflow from `client-main`. It validates the protected staging Apps Script endpoint and deployment ID, builds the static client, generates `release-manifest.json`, produces per-file SHA-256 checksums, and uploads a staging ZIP artifact. The workflow does not publish to a host or update Apps Script.
3. Download the ZIP and checksum from the same workflow run. Verify the ZIP checksum before extraction.
4. Back up the current staging document root. Extract the artifact into a clean temporary directory, inspect `release-manifest.json`, `asset-manifest.json`, `config.js`, and `.htaccess`, then replace the contents of the **staging document root only** with the complete artifact. Do not merge old files into the new release. Preserve host-owned files only after reviewing them individually; never overwrite production.
5. Confirm the host applies `.htaccess` and `mod_headers` (Apache/cPanel) or the generated `_headers` policy (Cloudflare Pages). The artifact sets revalidation headers for the HTML shell, service worker, generated config/manifests, and frontend assets. The service worker maintains its own explicit offline cache.
6. Run the live verification below against the public staging URL before testing with an authenticated account.
7. Open a clean/incognito browser profile, sign in with staging Owner/Manager/Staff accounts, and verify the dashboard, navigation, charts, New Entry, Register, reports, and mobile navigation. Then reopen the existing PWA and apply its in-app update notice; do not clear IndexedDB or local storage because they can contain pending offline vouchers.

## Live verification

Use Node 22. The expected commit must be the exact commit packaged by the staging artifact workflow. The deployment ID is the public identity already embedded in the generated client config; do not print or share credentials.

```bash
export CV_STAGING_SITE_URL='https://<staging-host>/<optional-path>/'
export CV_EXPECTED_RELEASE_COMMIT='<40-character-client-main-sha>'
export CV_EXPECTED_STAGING_DEPLOYMENT_ID='<staging-deployment-id>'
npm run staging:verify-site
```

The verifier checks:

- The published release manifest is staging and matches the exact expected Git commit and Apps Script deployment.
- The generated frontend config is staging and points to the same deployment.
- The root URL serves the same `index.html` bytes as the verified asset.
- The new workspace stylesheet, dashboard module, active composition root and service-worker update code are present.
- Every file in `asset-manifest.json` matches its recorded byte count and SHA-256 digest.
- Mutable shell/config/manifest files use `no-cache, no-store`; public frontend assets use revalidation.
- The live host response includes `nosniff`, anti-framing, and a restrictive script/frame CSP.

A failure is a release blocker. Do not work around it by disabling the service worker, deleting IndexedDB, changing the API URL manually, or skipping integrity checks. Fix the host configuration or publish the exact artifact, then rerun.

## Release boundary and rollback

This verifier is read-only. It performs HTTPS GET requests only and does not authenticate, create vouchers, write Sheets/Drive, push Apps Script, or deploy an application version.

If verification fails after publication, restore the backed-up staging document root as one complete release, preserve browser offline data, and investigate the artifact/host mismatch. Keep production untouched. A passing static verification does not replace live IAM, role authorization, financial workflow, backup/restore, or real-device UAT.
