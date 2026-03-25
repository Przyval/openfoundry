#!/bin/bash
# start.sh — Start all OpenFoundry services + seed pest control data

set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "╔══════════════════════════════════════╗"
echo "║      OpenFoundry — Starting Up       ║"
echo "╚══════════════════════════════════════╝"

# Kill existing processes by port (reliable)
echo ""
echo "→ Stopping existing services..."
for port in 8080 8081 8082 8083 8084 8085 8086 8087 8088 8092 3000; do
  pids=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null
    echo "  killed port $port"
  fi
done
sleep 3

# Verify all ports free
for port in 8080 8081 8082 8083 8084 8085 8087 8088 8092 3000; do
  if lsof -ti :$port &>/dev/null; then
    echo "  force-killing port $port..."
    lsof -ti :$port | xargs kill -9 2>/dev/null
  fi
done
sleep 1

# Start backend services using pnpm (resolves workspace deps correctly)
echo "→ Starting backend services..."
SERVICES=(svc-ontology svc-objects svc-multipass svc-admin svc-actions svc-datasets svc-functions svc-aip svc-gateway)
for svc in "${SERVICES[@]}"; do
  > "/tmp/${svc}.log"
  pnpm --filter "@openfoundry/${svc}" run dev >> "/tmp/${svc}.log" 2>&1 &
  echo "  $svc starting..."
done

echo "→ Waiting for services to boot..."
sleep 12

# Check services
echo ""
echo "→ Service status:"
PORTS=(8080 8081 8082 8083 8084 8085 8087 8088 8092)
NAMES=(gateway ontology objects actions multipass datasets admin functions aip)
ALL_OK=true
for i in "${!PORTS[@]}"; do
  port="${PORTS[$i]}"
  name="${NAMES[$i]}"
  pid=$(lsof -i :$port -sTCP:LISTEN -t 2>/dev/null | head -1)
  if [ -n "$pid" ]; then
    printf "  ✓ svc-%-12s :%-5s (PID %s)\n" "$name" "$port" "$pid"
  else
    printf "  ✗ svc-%-12s :%-5s FAILED — check /tmp/svc-%s.log\n" "$name" "$port" "$name"
    ALL_OK=false
  fi
done

if [ "$ALL_OK" = false ]; then
  echo ""
  echo "⚠  Some services failed. Checking logs..."
  for svc in "${SERVICES[@]}"; do
    err=$(grep -i "error\|ERR_\|Cannot find" "/tmp/${svc}.log" 2>/dev/null | head -2)
    if [ -n "$err" ]; then
      echo "  $svc: $err"
    fi
  done
fi

# Seed data
echo ""
echo "→ Seeding pest control data..."
bash "$ROOT/scripts/seed-pest-control.sh" 2>&1 | grep -E "ontology|types|Inserting|links|Done|Error" | head -20

# Start frontend
echo ""
echo "→ Starting frontend..."
> /tmp/vite.log
(cd "$ROOT/apps/app-console" && pnpm exec vite --port 3000 >> "/tmp/vite.log" 2>&1) &
sleep 5
pid=$(lsof -i :3000 -sTCP:LISTEN -t 2>/dev/null | head -1)
if [ -n "$pid" ]; then
  echo "  ✓ Frontend   :3000  (PID $pid)"
else
  echo "  ✗ Frontend   :3000  FAILED — check /tmp/vite.log"
fi

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  OpenFoundry ready!                  ║"
echo "║                                      ║"
echo "║  Console:  http://localhost:3000     ║"
echo "║  Gateway:  http://localhost:8080     ║"
echo "║                                      ║"
echo "║  Login: admin / admin123             ║"
echo "╚══════════════════════════════════════╝"
