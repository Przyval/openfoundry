#!/bin/bash
# ============================================================================
# sync-kelava-incremental.sh — Incremental sync: only new/updated records
#
# Pulls only records created/updated since last sync. Designed to run every
# 15 minutes via cron to keep OpenFoundry data fresh.
#
# Usage:
#   bash scripts/sync-kelava-incremental.sh
#   bash scripts/sync-kelava-incremental.sh --install-cron
#
# Prerequisites:
#   SSH tunnel active: ssh -f -N -L 5433:${TUNNEL_DB_HOST}:5432 root@${TUNNEL_JUMP_HOST}
# ============================================================================

set -euo pipefail

# Load from .env if present
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$ROOT_DIR/.env" ] && set -a && source "$ROOT_DIR/.env" && set +a

# Bearer credentials for every request below. Reads OPENFOUNDRY_TOKEN or
# OPENFOUNDRY_CLIENT_ID/_CLIENT_SECRET from the environment or .env, and sends
# nothing when neither is set. See scripts/lib/auth.sh.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/auth.sh"

KELAVA_HOST="${KELAVA_HOST:-localhost}"
KELAVA_PORT="${KELAVA_PORT:-5433}"
KELAVA_DB="${KELAVA_DB:-sanocare}"
KELAVA_USER="${KELAVA_USER:-snc_read}"
KELAVA_PASS="${KELAVA_PASS:?ERROR: KELAVA_PASS not set. Add to .env or export KELAVA_PASS}"

# SSH tunnel endpoints for the Sanocare/Kelava Postgres.
# Real addresses are operational infrastructure: they live in .env (gitignored),
# never in this repo. See .env.example for the keys to fill in.
TUNNEL_DB_HOST="${TUNNEL_DB_HOST:-<kelava-db-host>}"
TUNNEL_JUMP_HOST="${TUNNEL_JUMP_HOST:-<kelava-jump-host>}"
OBJECTS_SVC="${OBJECTS_SVC:-http://localhost:8082}"

# SSH tunnel health check — fail fast, no silent hang
if ! nc -z -w3 "${KELAVA_HOST}" "${KELAVA_PORT}" 2>/dev/null; then
  echo "[$(date)] ERROR: Kelava DB unreachable at ${KELAVA_HOST}:${KELAVA_PORT} — SSH tunnel down?"
  echo "[$(date)] Restart tunnel: ssh -f -N -L 5433:${TUNNEL_DB_HOST}:5432 root@${TUNNEL_JUMP_HOST}"
  exit 1
fi
ONTOLOGY_SVC="${ONTOLOGY_SVC:-http://localhost:8081}"

STATE_DIR="${HOME}/.openfoundry"
STATE_FILE="${STATE_DIR}/kelava-sync-state"
GREEN='\033[0;32m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Install cron
# ---------------------------------------------------------------------------
if [ "${1:-}" = "--install-cron" ]; then
  SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/sync-kelava-incremental.sh"
  CRON_LINE="*/15 * * * * bash ${SCRIPT_PATH} >> /var/log/kelava-sync.log 2>&1"
  if crontab -l 2>/dev/null | grep -qF "kelava-sync"; then
    echo "Cron already installed"
  else
    (crontab -l 2>/dev/null; echo "# kelava-sync — every 15 min"; echo "$CRON_LINE") | crontab -
    echo -e "${GREEN}✓ Cron installed — sync every 15 minutes${NC}"
  fi
  exit 0
fi

# ---------------------------------------------------------------------------
# Load last sync timestamp
# ---------------------------------------------------------------------------
mkdir -p "${STATE_DIR}"
if [ -f "$STATE_FILE" ]; then
  LAST_SYNC=$(cat "$STATE_FILE")
else
  LAST_SYNC="2026-03-26 00:00:00"
fi
NOW=$(date -u +"%Y-%m-%d %H:%M:%S")

run_sql() {
  PGPASSWORD="${KELAVA_PASS}" psql -h "${KELAVA_HOST}" -p "${KELAVA_PORT}" -U "${KELAVA_USER}" -d "${KELAVA_DB}" -t -A -c "$1" 2>/dev/null
}

# Find ontology RID
ONT_RID=$(of_curl -s "${ONTOLOGY_SVC}/api/v2/ontologies" 2>/dev/null | python3 -c "
import sys,json
for o in json.load(sys.stdin).get('data',[]):
  if o.get('apiName')=='sanocare-kelava': print(o['rid']); break
" 2>/dev/null)

if [ -z "$ONT_RID" ]; then
  echo "[$(date)] ERROR: sanocare-kelava ontology not found. Run full sync first."
  exit 1
fi

FAIL=0
echo "[$(date)] Incremental sync since ${LAST_SYNC}..."

# ---------------------------------------------------------------------------
# Sync new road plans
# ---------------------------------------------------------------------------
RP_COUNT=0
while IFS='|' read -r id vd status title type cid uid cancel remarks nora; do
  [ -z "$id" ] && continue
  title=$(echo "$title" | tr -d '"')
  remarks=$(echo "$remarks" | tr -d '"' | head -c 200)
  sc=$(of_curl -s -o /dev/null -w "%{http_code}" -X POST "${OBJECTS_SVC}/api/v2/ontologies/${ONT_RID}/objects/KelavaRoadPlan" \
    -H "Content-Type: application/json" \
    -d "{\"primaryKey\":\"RP-${id}\",\"upsert\":true,\"properties\":{\"roadPlanId\":\"RP-${id}\",\"visitDate\":\"${vd}\",\"status\":\"${status}\",\"title\":\"${title}\",\"type\":\"${type}\",\"customerId\":\"CUST-${cid}\",\"userId\":\"TECH-${uid}\",\"isCancelled\":\"${cancel}\",\"remarks\":\"${remarks}\",\"noRa\":\"${nora}\"}}")
  [ "$sc" -lt 200 ] || [ "$sc" -ge 300 ] && FAIL=$((FAIL + 1))
  RP_COUNT=$((RP_COUNT + 1))
done < <(run_sql "SELECT id,COALESCE(visit_date::text,''),COALESCE(status,''),COALESCE(title,''),COALESCE(type,''),COALESCE(id_customer::text,''),COALESCE(id_user::text,''),COALESCE(is_cancel::text,'false'),COALESCE(remarks,''),COALESCE(no_ra,'') FROM t_road_plan WHERE created_date > '${LAST_SYNC}'")

# ---------------------------------------------------------------------------
# Sync new visits
# ---------------------------------------------------------------------------
V_COUNT=0
while IFS='|' read -r id uid rpid cid ci co lat lng rd remarks; do
  [ -z "$id" ] && continue
  remarks=$(echo "$remarks" | tr -d '"' | head -c 200)
  sc=$(of_curl -s -o /dev/null -w "%{http_code}" -X POST "${OBJECTS_SVC}/api/v2/ontologies/${ONT_RID}/objects/KelavaVisit" \
    -H "Content-Type: application/json" \
    -d "{\"primaryKey\":\"VIS-${id}\",\"upsert\":true,\"properties\":{\"visitId\":\"VIS-${id}\",\"userId\":\"TECH-${uid}\",\"roadPlanId\":\"RP-${rpid}\",\"customerId\":\"CUST-${cid}\",\"checkIn\":\"${ci}\",\"checkOut\":\"${co}\",\"latitude\":\"${lat}\",\"longitude\":\"${lng}\",\"realizationDate\":\"${rd}\",\"remarks\":\"${remarks}\"}}")
  [ "$sc" -lt 200 ] || [ "$sc" -ge 300 ] && FAIL=$((FAIL + 1))
  V_COUNT=$((V_COUNT + 1))
done < <(run_sql "SELECT id,COALESCE(id_user::text,'0'),COALESCE(id_road_plan::text,'0'),COALESCE(id_customer::text,'0'),COALESCE(check_in::text,''),COALESCE(check_out::text,''),COALESCE(latitude::text,''),COALESCE(longitude::text,''),COALESCE(realization_date::text,''),COALESCE(replace(remarks,E'\"',''),'') FROM t_visit WHERE created_date > '${LAST_SYNC}'")

# ---------------------------------------------------------------------------
# Save state
# ---------------------------------------------------------------------------
echo "$NOW" > "$STATE_FILE"

echo "[$(date)] Done: ${RP_COUNT} new road plans, ${V_COUNT} new visits (since ${LAST_SYNC})${FAIL:+ — ${FAIL} failed}"

# Heartbeat to alert health endpoint
of_curl -s -X POST "http://localhost:8080/status/alerts/heartbeat" > /dev/null 2>&1 || true
