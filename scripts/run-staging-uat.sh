#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."

PYTHON_BIN="${PYTHON_BIN:-python3}"
STAGING_WEB_PORT="${STAGING_WEB_PORT:-8766}"
STAGING_WEB_BASE="http://127.0.0.1:${STAGING_WEB_PORT}"
SERVER_PID=""
UAT_LOG_DIR=""
SERVER_LOG_FILE=""
UAT_LOG_FILE=""
KEEP_LOG_DIR_FOR_EVIDENCE=0

cleanup() {
  if [ -n "${SERVER_PID}" ]; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  if [ "${KEEP_LOG_DIR_FOR_EVIDENCE}" != "1" ] && [ -n "${UAT_LOG_DIR}" ]; then
    rm -rf -- "${UAT_LOG_DIR}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

node scripts/staging-preflight.js --mode=uat

"${PYTHON_BIN}" -c "import playwright" >/dev/null 2>&1 || {
  echo "Playwright is not installed for ${PYTHON_BIN}."
  echo "Install with: python3 -m pip install playwright && python3 -m playwright install chromium"
  exit 1
}

LOG_PARENT="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
if [ ! -d "${LOG_PARENT}" ] || [ -L "${LOG_PARENT}" ]; then
  echo "Staging evidence parent directory is not a trusted existing directory."
  exit 1
fi
UAT_LOG_DIR="$(mktemp -d "${LOG_PARENT%/}/cash-voucher-staging-uat.XXXXXX")"
chmod 700 "${UAT_LOG_DIR}"
SERVER_LOG_FILE="${UAT_LOG_DIR}/server.log"
UAT_LOG_FILE="${UAT_LOG_DIR}/uat.log"
(
  set -o noclobber
  : > "${SERVER_LOG_FILE}"
  : > "${UAT_LOG_FILE}"
)

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'uat_log_file=%s\n' "${UAT_LOG_FILE}" >> "${GITHUB_OUTPUT}"
  printf 'uat_log_dir=%s\n' "${UAT_LOG_DIR}" >> "${GITHUB_OUTPUT}"
  KEEP_LOG_DIR_FOR_EVIDENCE=1
  unset GITHUB_OUTPUT GITHUB_ENV GITHUB_PATH GITHUB_STEP_SUMMARY
fi

# Keep this child environment explicitly allowlisted. Production references are
# intentionally absent for owner-attested staging-only operation; passing unset
# production variables here both broke nounset shells and violated the isolation
# contract enforced by scripts/staging-preflight.js.
env -i \
  PATH="${PATH:-/usr/bin:/bin}" \
  HOME="${HOME:-}" \
  STAGING_WEB_PORT="${STAGING_WEB_PORT}" \
  CV_STAGING_SCRIPT_ID="${CV_STAGING_SCRIPT_ID}" \
  CV_STAGING_DEPLOYMENT_ID="${CV_STAGING_DEPLOYMENT_ID}" \
  CV_STAGING_API_URL="${CV_STAGING_API_URL}" \
  CV_STAGING_SPREADSHEET_ID="${CV_STAGING_SPREADSHEET_ID}" \
  CV_STAGING_RECEIPT_FOLDER_ID="${CV_STAGING_RECEIPT_FOLDER_ID}" \
  CV_STAGING_BACKUP_FOLDER_ID="${CV_STAGING_BACKUP_FOLDER_ID}" \
  CV_STAGING_ONLY_MODE="${CV_STAGING_ONLY_MODE:-}" \
  CV_STAGING_RESOURCE_ISOLATION_ATTESTATION="${CV_STAGING_RESOURCE_ISOLATION_ATTESTATION:-}" \
  node scripts/staging-web-server.js > "${SERVER_LOG_FILE}" 2>&1 &
SERVER_PID=$!

ready=0
for _ in {1..40}; do
  if curl -fsS "${STAGING_WEB_BASE}/__staging_health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.25
done

if [ "${ready}" -ne 1 ]; then
  printf '%s\n' 'STAGING TEST SERVER FAILED: server did not become ready; raw diagnostics withheld.' >> "${UAT_LOG_FILE}"
  echo "Staging test server did not become ready; raw diagnostics were withheld from workflow logs."
  exit 1
fi

set +e
env -u GITHUB_OUTPUT -u GITHUB_ENV -u GITHUB_PATH -u GITHUB_STEP_SUMMARY \
  E2E_BASE="${STAGING_WEB_BASE}" "${PYTHON_BIN}" test/uat_staging.py >> "${UAT_LOG_FILE}" 2>&1
uat_status=$?
set -e

if [ "${uat_status}" -eq 0 ]; then
  echo "Staging UAT completed; detailed transcript is withheld from workflow logs."
else
  echo "Staging UAT failed; detailed transcript is withheld from workflow logs for sanitized evidence assembly."
fi
exit "${uat_status}"
