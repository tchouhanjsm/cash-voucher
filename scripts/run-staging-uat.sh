#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PYTHON_BIN="${PYTHON_BIN:-python3}"
STAGING_WEB_PORT="${STAGING_WEB_PORT:-8766}"
STAGING_WEB_BASE="http://127.0.0.1:${STAGING_WEB_PORT}"
SERVER_PID=""
UAT_LOG_FILE="${CV_STAGING_UAT_LOG_FILE:-/tmp/cash-voucher-staging-uat.log}"
mkdir -p "$(dirname "${UAT_LOG_FILE}")"
: > "${UAT_LOG_FILE}"

cleanup() {
  if [ -n "${SERVER_PID}" ]; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

node scripts/staging-preflight.js --mode=uat

"${PYTHON_BIN}" -c "import playwright" >/dev/null 2>&1 || {
  echo "Playwright is not installed for ${PYTHON_BIN}."
  echo "Install with: python3 -m pip install playwright && python3 -m playwright install chromium"
  exit 1
}

STAGING_WEB_PORT="${STAGING_WEB_PORT}" node scripts/staging-web-server.js > /tmp/cash-voucher-staging-server.log 2>&1 &
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
  echo "Staging test server did not become ready."
  cat /tmp/cash-voucher-staging-server.log
  exit 1
fi

E2E_BASE="${STAGING_WEB_BASE}" "${PYTHON_BIN}" test/uat_staging.py 2>&1 | tee "${UAT_LOG_FILE}"
