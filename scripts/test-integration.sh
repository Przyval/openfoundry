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

echo "=============================================="
echo "  OpenFoundry Integration Tests"
echo "=============================================="
echo ""
echo "  Gateway: $GATEWAY_URL"
echo ""

# Check that the gateway is reachable (try the ontologies endpoint as a smoke test)
echo "  Checking gateway availability..."
if curl -sf "${GATEWAY_URL}/api/v2/ontologies" > /dev/null 2>&1; then
  echo "  Gateway is ready."
elif curl -s -o /dev/null -w "%{http_code}" "${GATEWAY_URL}/" 2>/dev/null | grep -qE "^[2-4]"; then
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
