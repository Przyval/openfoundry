#!/bin/bash
# =============================================================================
# docker-entrypoint.sh — Start all OpenFoundry services inside Docker
# Adapted from start.sh for container use (no lsof, bind to 0.0.0.0)
# =============================================================================

set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "========================================"
echo "    OpenFoundry — Starting Up (Docker)"
echo "========================================"

# Parse flags
RESEED=false
for arg in "$@"; do
  case "$arg" in
    --reseed) RESEED=true ;;
  esac
done

# Start backend services using pnpm
echo ""
echo "-> Starting backend services..."
SERVICES=(svc-ontology svc-objects svc-multipass svc-admin svc-actions svc-datasets svc-functions svc-aip svc-gateway)
for svc in "${SERVICES[@]}"; do
  > "/tmp/${svc}.log"
  pnpm --filter "@openfoundry/${svc}" run dev >> "/tmp/${svc}.log" 2>&1 &
  echo "   $svc starting..."
done

echo "-> Waiting for services to boot..."
sleep 15

# Check services by attempting HTTP connections
echo ""
echo "-> Service status:"
PORTS=(8080 8081 8082 8083 8084 8085 8087 8088 8092)
NAMES=(gateway ontology objects actions multipass datasets admin functions aip)
ALL_OK=true
for i in "${!PORTS[@]}"; do
  port="${PORTS[$i]}"
  name="${NAMES[$i]}"
  if curl -sf "http://localhost:${port}/" >/dev/null 2>&1 || curl -sf "http://localhost:${port}/health" >/dev/null 2>&1; then
    printf "  + svc-%-12s :%s\n" "$name" "$port"
  else
    # Service might be up but not responding to / or /health — check if port is listening
    if timeout 2 bash -c "echo > /dev/tcp/localhost/$port" 2>/dev/null; then
      printf "  + svc-%-12s :%s\n" "$name" "$port"
    else
      printf "  - svc-%-12s :%s  FAILED — check /tmp/svc-%s.log\n" "$name" "$port" "$name"
      ALL_OK=false
    fi
  fi
done

if [ "$ALL_OK" = false ]; then
  echo ""
  echo "** Some services failed. Checking logs..."
  for svc in "${SERVICES[@]}"; do
    err=$(grep -i "error\|ERR_\|Cannot find" "/tmp/${svc}.log" 2>/dev/null | head -2)
    if [ -n "$err" ]; then
      echo "   $svc: $err"
    fi
  done
fi

# Seed data
echo ""
if [ "$RESEED" = true ]; then
  echo "-> --reseed flag set, clearing persisted data..."
  rm -f /tmp/openfoundry-data/ontology-store.json
  rm -f /tmp/openfoundry-data/object-store.json
  rm -f /tmp/openfoundry-data/link-store.json
  echo "-> Seeding pest control data..."
  bash "$ROOT/scripts/seed-pest-control.sh" 2>&1 | grep -E "ontology|types|Inserting|links|Done|Error" | head -20
elif [ -f /tmp/openfoundry-data/ontology-store.json ] && [ -s /tmp/openfoundry-data/ontology-store.json ]; then
  echo "-> Data persisted from previous run, skipping seed"
else
  echo "-> Seeding pest control data..."
  bash "$ROOT/scripts/seed-pest-control.sh" 2>&1 | grep -E "ontology|types|Inserting|links|Done|Error" | head -20
fi

# Start frontend — bind to 0.0.0.0 so it's accessible from outside the container
echo ""
echo "-> Starting frontend..."
> /tmp/vite.log
(cd "$ROOT/apps/app-console" && pnpm exec vite --host 0.0.0.0 --port 3000 >> "/tmp/vite.log" 2>&1) &
sleep 5

echo ""
echo "========================================"
echo "  OpenFoundry ready!"
echo ""
echo "  Console:  http://localhost:3000"
echo "  Gateway:  http://localhost:8080"
echo ""
echo "  Login: admin / admin123"
echo "========================================"

# Keep the container running — wait for all background processes
# If any child exits, keep the rest alive
wait
