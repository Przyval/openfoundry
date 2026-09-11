#!/bin/bash
# test-integration.sh — Run integration tests against running OpenFoundry services
#
# Usage:
#   bash scripts/test-integration.sh
#
# Prerequisites:
#   Services must be running (bash start.sh)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GATEWAY_URL="${OPENFOUNDRY_HOST:-http://localhost:8080}"

# Bearer credentials for the availability probe below, and - through the same
# OPENFOUNDRY_* environment keys - for the suites vitest runs afterwards.
# Reads OPENFOUNDRY_TOKEN or OPENFOUNDRY_CLIENT_ID/_CLIENT_SECRET from the
# environment or .env, and sends nothing when neither is set.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/auth.sh"

echo "=============================================="
echo "  OpenFoundry Integration Tests"
echo "=============================================="
echo ""
echo "  Gateway: $GATEWAY_URL"
echo ""

# Check that the gateway is reachable (try the ontologies endpoint as a smoke test)
echo "  Checking gateway availability..."
if of_curl -sf "${GATEWAY_URL}/api/v2/ontologies" > /dev/null 2>&1; then
  echo "  Gateway is ready."
elif of_curl -s -o /dev/null -w "%{http_code}" "${GATEWAY_URL}/" 2>/dev/null | grep -qE "^[2-4]"; then
  echo "  Gateway is reachable."
else
  echo "  ERROR: Cannot reach gateway at ${GATEWAY_URL}"
  echo "  Make sure services are running: bash start.sh"
  exit 1
fi

echo ""
echo "Running integration tests (services must be running)..."
echo ""

npx vitest run tests/integration/ --reporter=verbose
