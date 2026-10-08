#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

PYTHON_BIN="${PYTHON_BIN:-python3}"
E2E_BASE="${E2E_BASE:-http://127.0.0.1:8765}"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

"$PYTHON_BIN" -c "import playwright" >/dev/null 2>&1 || {
  echo "Playwright is not installed for $PYTHON_BIN."
  echo "Install it with: python3 -m pip install playwright && python3 -m playwright install chromium"
  exit 1
}

node test/server.js > /tmp/cash-voucher-e2e-server.log 2>&1 &
SERVER_PID=$!

for _ in {1..20}; do
  if curl -fsS "$E2E_BASE/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! curl -fsS "$E2E_BASE/" >/dev/null 2>&1; then
  echo "E2E server did not become ready."
  cat /tmp/cash-voucher-e2e-server.log
  exit 1
fi

"$PYTHON_BIN" test/e2e.py
