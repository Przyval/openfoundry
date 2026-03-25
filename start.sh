#!/bin/bash
# start.sh — Start all OpenFoundry services + seed industry data

set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Parse flags
RESEED=false
INDUSTRY="pest-control"
for arg in "$@"; do
  case "$arg" in
    --reseed) RESEED=true ;;
    --industry) ;; # value handled below
    --industry=*) INDUSTRY="${arg#*=}" ;;
  esac
done
# Handle --industry <value> (space-separated)
ARGS=("$@")
for i in "${!ARGS[@]}"; do
  if [ "${ARGS[$i]}" = "--industry" ] && [ $((i+1)) -lt ${#ARGS[@]} ]; then
    INDUSTRY="${ARGS[$((i+1))]}"
  fi
done

# Validate industry
VALID_INDUSTRIES=("pest-control" "healthcare" "logistics" "manufacturing" "all")
INDUSTRY_VALID=false
for valid in "${VALID_INDUSTRIES[@]}"; do
  if [ "$INDUSTRY" = "$valid" ]; then
    INDUSTRY_VALID=true
    break
  fi
done
if [ "$INDUSTRY_VALID" = false ]; then
  echo "Error: Unknown industry '$INDUSTRY'"
  echo "Valid options: pest-control, healthcare, logistics, manufacturing, all"
  exit 1
fi

echo "╔══════════════════════════════════════╗"
echo "║      OpenFoundry — Starting Up       ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Industry: $INDUSTRY"

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

# --- Helper: detect if industry changed ---
LAST_INDUSTRY_FILE="/tmp/openfoundry-data/last-industry"
INDUSTRY_CHANGED=false
if [ -f "$LAST_INDUSTRY_FILE" ]; then
  LAST_INDUSTRY=$(cat "$LAST_INDUSTRY_FILE")
  if [ "$LAST_INDUSTRY" != "$INDUSTRY" ]; then
    INDUSTRY_CHANGED=true
    echo ""
    echo "→ Industry changed from '$LAST_INDUSTRY' to '$INDUSTRY', clearing data..."
  fi
fi

# --- Helper: seed a single industry ---
seed_industry() {
  local ind="$1"
  local script="$ROOT/scripts/seed-${ind}.sh"
  if [ ! -f "$script" ]; then
    echo "  ⚠ Seed script not found: $script (skipping)"
    return 1
  fi
  echo "→ Seeding ${ind} data..."
  bash "$script" 2>&1 | grep -E "ontology|types|Inserting|links|Done|Error|created|functions|pipelines|datasets" | head -30
  echo "  ✓ ${ind} seeded"
}

# --- Seed data ---
echo ""
if [ "$RESEED" = true ] || [ "$INDUSTRY_CHANGED" = true ]; then
  echo "→ Clearing persisted data..."
  rm -f /tmp/openfoundry-data/ontology-store.json
  rm -f /tmp/openfoundry-data/object-store.json
  rm -f /tmp/openfoundry-data/link-store.json
  if [ "$INDUSTRY" = "all" ]; then
    for ind in pest-control healthcare logistics manufacturing; do
      seed_industry "$ind"
    done
  else
    seed_industry "$INDUSTRY"
  fi
  # Record which industry was loaded
  mkdir -p /tmp/openfoundry-data
  echo "$INDUSTRY" > "$LAST_INDUSTRY_FILE"
elif [ -f /tmp/openfoundry-data/ontology-store.json ] && [ -s /tmp/openfoundry-data/ontology-store.json ]; then
  echo "→ Data persisted from previous run, skipping seed"
  echo "  (use --reseed to force re-seed, or --industry to switch)"
else
  echo "→ No existing data found, seeding..."
  if [ "$INDUSTRY" = "all" ]; then
    for ind in pest-control healthcare logistics manufacturing; do
      seed_industry "$ind"
    done
  else
    seed_industry "$INDUSTRY"
  fi
  mkdir -p /tmp/openfoundry-data
  echo "$INDUSTRY" > "$LAST_INDUSTRY_FILE"
fi

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
echo "║  Industry: $(printf '%-25s' "$INDUSTRY")║"
echo "║  Login: admin / admin123             ║"
echo "╚══════════════════════════════════════╝"
