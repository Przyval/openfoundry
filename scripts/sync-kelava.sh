#!/bin/bash
# ============================================================================
# sync-kelava.sh — Full sync: Kelava ERP → OpenFoundry
#
# Syncs ALL operational data from Sanocare's live Postgres into OpenFoundry's
# ontology: customers, technicians (with segments), road plans, visits, KPIs,
# schedules, verification flags, service areas, and link types.
#
# Prerequisites:
#   SSH tunnel: ssh -f -N -L 5433:${TUNNEL_DB_HOST}:5432 root@${TUNNEL_JUMP_HOST}
#   OpenFoundry: bash start.sh
#
# Usage:
#   bash scripts/sync-kelava.sh              # Full sync
#   bash scripts/sync-kelava.sh --recent     # Last 30 days only
# ============================================================================

set -euo pipefail

# Load from .env if present
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$ROOT_DIR/.env" ] && set -a && source "$ROOT_DIR/.env" && set +a

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

# ---------------------------------------------------------------------------
# SSH Tunnel health check — fail fast if tunnel is down
# ---------------------------------------------------------------------------
check_tunnel() {
  if ! nc -z -w3 "${KELAVA_HOST}" "${KELAVA_PORT}" 2>/dev/null; then
    echo -e "${RED}ERROR: Cannot reach Kelava DB at ${KELAVA_HOST}:${KELAVA_PORT}${NC}"
    echo ""
    echo "The SSH tunnel is down. Restart it with:"
    echo "  ssh -f -N -L 5433:${TUNNEL_DB_HOST}:5432 root@${TUNNEL_JUMP_HOST}"
    echo ""
    echo "To verify once restarted:"
    echo "  nc -z localhost 5433 && echo OK"
    exit 1
  fi
}
check_tunnel

ONTOLOGY_SVC="${ONTOLOGY_SVC:-http://localhost:8081}"
OBJECTS_SVC="${OBJECTS_SVC:-http://localhost:8082}"

RECENT_ONLY=false
[ "${1:-}" = "--recent" ] && RECENT_ONLY=true

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

SYNC_OK=0
SYNC_FAIL=0

run_sql() {
  PGPASSWORD="${KELAVA_PASS}" psql -h "${KELAVA_HOST}" -p "${KELAVA_PORT}" -U "${KELAVA_USER}" -d "${KELAVA_DB}" -t -A -c "$1" 2>/dev/null
}

# JSON-escape a string
esc() { echo "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/	/ /g' | tr -d '\n\r'; }

# Upsert a single object — tracks success/failure
upsert_object() {
  local obj_type="$1" json="$2"
  local status_code
  status_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "${OBJECTS_SVC}/api/v2/ontologies/${ONT_RID}/objects/${obj_type}" \
    -H "Content-Type: application/json" \
    -d "${json}" 2>/dev/null)
  if [ "$status_code" -ge 200 ] && [ "$status_code" -lt 300 ]; then
    SYNC_OK=$((SYNC_OK + 1))
  else
    SYNC_FAIL=$((SYNC_FAIL + 1))
  fi
}

echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Kelava ERP → OpenFoundry Full Sync                          ║${NC}"
echo -e "${CYAN}║  Database: sanocare @ ${KELAVA_HOST}:${KELAVA_PORT}                       ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 1: Create or find ontology
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${GREEN}[1/9] Ontology...${NC}"

# Try to find existing ontology first
ONT_RID=$(curl -s "${ONTOLOGY_SVC}/api/v2/ontologies" 2>/dev/null \
  | python3 -c "import sys,json
for o in json.load(sys.stdin).get('data',[]):
  if o.get('apiName')=='sanocare-kelava': print(o['rid']); break" 2>/dev/null)

# Create if not found
if [ -z "$ONT_RID" ]; then
  ONT_RID=$(curl -s -X POST "${ONTOLOGY_SVC}/api/v2/ontologies" \
    -H "Content-Type: application/json" \
    -d '{"apiName":"sanocare-kelava","displayName":"Sanocare Kelava — Live ERP","description":"Live operational data synced from Kelava ERP (Sanocare pest control)."}' 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('rid',''))" 2>/dev/null)
fi
echo "  RID: ${ONT_RID}"

# ═══════════════════════════════════════════════════════════════════════════
# STEP 2: Create object types (idempotent — duplicates ignored)
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${GREEN}[2/9] Object types...${NC}"

ct() {
  curl -s -X POST "${ONTOLOGY_SVC}/api/v2/ontologies/${ONT_RID}/objectTypes" \
    -H "Content-Type: application/json" -d "$1" > /dev/null 2>&1
  echo -e "  ${YELLOW}✓ $2${NC}"
}

ct '{"apiName":"KelavaCustomer","displayName":"Customer","primaryKeyApiName":"customerId","primaryKeyType":"STRING","titlePropertyApiName":"name","properties":{"customerId":{"type":"STRING"},"name":{"type":"STRING"},"address":{"type":"STRING","nullable":true},"phone":{"type":"STRING","nullable":true},"contactPerson":{"type":"STRING","nullable":true},"status":{"type":"STRING","nullable":true},"city":{"type":"STRING","nullable":true},"creditLimit":{"type":"DOUBLE","nullable":true}},"implements":[],"status":"ACTIVE"}' "Customer"

ct '{"apiName":"KelavaTechnician","displayName":"Technician","primaryKeyApiName":"technicianId","primaryKeyType":"STRING","titlePropertyApiName":"fullname","properties":{"technicianId":{"type":"STRING"},"fullname":{"type":"STRING"},"email":{"type":"STRING","nullable":true},"phone":{"type":"STRING","nullable":true},"outletId":{"type":"STRING","nullable":true},"segment":{"type":"STRING","nullable":true},"shiftType":{"type":"STRING","nullable":true},"weeklyHoursTarget":{"type":"DOUBLE","nullable":true}},"implements":[],"status":"ACTIVE"}' "Technician (with segments)"

ct '{"apiName":"KelavaRoadPlan","displayName":"Road Plan","primaryKeyApiName":"roadPlanId","primaryKeyType":"STRING","titlePropertyApiName":"title","properties":{"roadPlanId":{"type":"STRING"},"visitDate":{"type":"STRING","nullable":true},"status":{"type":"STRING","nullable":true},"title":{"type":"STRING","nullable":true},"type":{"type":"STRING","nullable":true},"customerId":{"type":"STRING","nullable":true},"userId":{"type":"STRING","nullable":true},"isCancelled":{"type":"STRING","nullable":true},"remarks":{"type":"STRING","nullable":true},"noRa":{"type":"STRING","nullable":true}},"implements":[],"status":"ACTIVE"}' "Road Plan"

ct '{"apiName":"KelavaVisit","displayName":"Visit","primaryKeyApiName":"visitId","primaryKeyType":"STRING","titlePropertyApiName":"visitId","properties":{"visitId":{"type":"STRING"},"userId":{"type":"STRING","nullable":true},"roadPlanId":{"type":"STRING","nullable":true},"customerId":{"type":"STRING","nullable":true},"checkIn":{"type":"STRING","nullable":true},"checkOut":{"type":"STRING","nullable":true},"latitude":{"type":"STRING","nullable":true},"longitude":{"type":"STRING","nullable":true},"realizationDate":{"type":"STRING","nullable":true},"remarks":{"type":"STRING","nullable":true}},"implements":[],"status":"ACTIVE"}' "Visit"

ct '{"apiName":"KelavaKPI","displayName":"KPI Monthly","primaryKeyApiName":"kpiId","primaryKeyType":"STRING","titlePropertyApiName":"kpiId","properties":{"kpiId":{"type":"STRING"},"technicianId":{"type":"STRING","nullable":true},"yearMonth":{"type":"STRING","nullable":true},"totalPlanned":{"type":"INTEGER","nullable":true},"totalCompleted":{"type":"INTEGER","nullable":true},"completionRate":{"type":"DOUBLE","nullable":true},"grade":{"type":"STRING","nullable":true},"avgDurationMin":{"type":"DOUBLE","nullable":true},"activeDays":{"type":"INTEGER","nullable":true},"onTimeRate":{"type":"DOUBLE","nullable":true}},"implements":[],"status":"ACTIVE"}' "KPI Monthly"

ct '{"apiName":"KelavaSchedule","displayName":"Schedule Template","primaryKeyApiName":"scheduleId","primaryKeyType":"STRING","titlePropertyApiName":"scheduleId","properties":{"scheduleId":{"type":"STRING"},"customerId":{"type":"STRING","nullable":true},"technicianId":{"type":"STRING","nullable":true},"dayOfWeek":{"type":"INTEGER","nullable":true},"visitType":{"type":"STRING","nullable":true},"frequency":{"type":"STRING","nullable":true},"shift":{"type":"STRING","nullable":true},"durationEstimate":{"type":"INTEGER","nullable":true},"isActive":{"type":"STRING","nullable":true}},"implements":[],"status":"ACTIVE"}' "Schedule Template"

ct '{"apiName":"KelavaFlag","displayName":"Verification Flag","primaryKeyApiName":"flagId","primaryKeyType":"STRING","titlePropertyApiName":"flagType","properties":{"flagId":{"type":"STRING"},"visitId":{"type":"STRING","nullable":true},"roadPlanId":{"type":"STRING","nullable":true},"technicianId":{"type":"STRING","nullable":true},"customerId":{"type":"STRING","nullable":true},"flagType":{"type":"STRING","nullable":true},"severity":{"type":"STRING","nullable":true},"detail":{"type":"STRING","nullable":true},"driftMeters":{"type":"DOUBLE","nullable":true},"photoCount":{"type":"INTEGER","nullable":true},"resolved":{"type":"STRING","nullable":true}},"implements":[],"status":"ACTIVE"}' "Verification Flag"

ct '{"apiName":"KelavaServiceArea","displayName":"Service Area","primaryKeyApiName":"areaId","primaryKeyType":"STRING","titlePropertyApiName":"area","properties":{"areaId":{"type":"STRING"},"roadPlanId":{"type":"STRING","nullable":true},"area":{"type":"STRING","nullable":true},"treatmentText":{"type":"STRING","nullable":true},"treatment":{"type":"INTEGER","nullable":true}},"implements":[],"status":"ACTIVE"}' "Service Area"

# ═══════════════════════════════════════════════════════════════════════════
# STEP 3: Create link types
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${GREEN}[3/9] Link types...${NC}"

cl() {
  curl -s -X POST "${ONTOLOGY_SVC}/api/v2/ontologies/${ONT_RID}/linkTypes" \
    -H "Content-Type: application/json" -d "$1" > /dev/null 2>&1
  echo -e "  ${YELLOW}✓ $2${NC}"
}

cl '{"apiName":"CustomerHasRoadPlan","objectTypeApiName":"KelavaCustomer","linkedObjectTypeApiName":"KelavaRoadPlan","cardinality":"MANY"}' "Customer → Road Plans"
cl '{"apiName":"TechnicianAssignedRoadPlan","objectTypeApiName":"KelavaTechnician","linkedObjectTypeApiName":"KelavaRoadPlan","cardinality":"MANY"}' "Technician → Road Plans"
cl '{"apiName":"RoadPlanHasVisit","objectTypeApiName":"KelavaRoadPlan","linkedObjectTypeApiName":"KelavaVisit","cardinality":"MANY"}' "Road Plan → Visits"
cl '{"apiName":"RoadPlanHasArea","objectTypeApiName":"KelavaRoadPlan","linkedObjectTypeApiName":"KelavaServiceArea","cardinality":"MANY"}' "Road Plan → Service Areas"
cl '{"apiName":"TechnicianHasKPI","objectTypeApiName":"KelavaTechnician","linkedObjectTypeApiName":"KelavaKPI","cardinality":"MANY"}' "Technician → KPIs"
cl '{"apiName":"TechnicianHasSchedule","objectTypeApiName":"KelavaTechnician","linkedObjectTypeApiName":"KelavaSchedule","cardinality":"MANY"}' "Technician → Schedules"
cl '{"apiName":"CustomerHasSchedule","objectTypeApiName":"KelavaCustomer","linkedObjectTypeApiName":"KelavaSchedule","cardinality":"MANY"}' "Customer → Schedules"
cl '{"apiName":"VisitHasFlag","objectTypeApiName":"KelavaVisit","linkedObjectTypeApiName":"KelavaFlag","cardinality":"MANY"}' "Visit → Flags"

# ═══════════════════════════════════════════════════════════════════════════
# STEP 4: Sync customers
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${GREEN}[4/9] Customers...${NC}"
CUST_COUNT=0
while IFS='|' read -r id name address phone1 cp status city cl_; do
  [ -z "$id" ] && continue
  upsert_object "KelavaCustomer" "{\"primaryKey\":\"CUST-${id}\",\"upsert\":true,\"properties\":{\"customerId\":\"CUST-${id}\",\"name\":\"$(esc "$name")\",\"address\":\"$(esc "$address")\",\"phone\":\"${phone1}\",\"contactPerson\":\"$(esc "$cp")\",\"status\":\"${status}\",\"city\":\"${city}\",\"creditLimit\":${cl_:-0}}}"
  CUST_COUNT=$((CUST_COUNT + 1))
done < <(run_sql "SELECT id,name,COALESCE(address,''),COALESCE(phone1,''),COALESCE(contact_person_name,''),COALESCE(status,''),COALESCE(new_city,''),COALESCE(credit_limit,0) FROM m_customer WHERE is_deleted IS NOT TRUE")
echo -e "  ${YELLOW}✓ ${CUST_COUNT} customers${NC}"

# ═══════════════════════════════════════════════════════════════════════════
# STEP 5: Sync technicians (enriched with segments)
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${GREEN}[5/9] Technicians (with segments)...${NC}"
TECH_COUNT=0
while IFS='|' read -r id fullname email phone outlet seg shift hrs; do
  [ -z "$id" ] && continue
  upsert_object "KelavaTechnician" "{\"primaryKey\":\"TECH-${id}\",\"upsert\":true,\"properties\":{\"technicianId\":\"TECH-${id}\",\"fullname\":\"$(esc "$fullname")\",\"email\":\"${email}\",\"phone\":\"${phone}\",\"outletId\":\"${outlet}\",\"segment\":\"${seg}\",\"shiftType\":\"${shift}\",\"weeklyHoursTarget\":${hrs:-0}}}"
  TECH_COUNT=$((TECH_COUNT + 1))
done < <(run_sql "SELECT p.id, p.fullname, COALESCE(p.email,''), COALESCE(p.phone,''), COALESCE(p.id_outlet::text,''), COALESCE(ts.segment,''), COALESCE(ts.shift_type,''), COALESCE(ts.weekly_hours_target,0) FROM p_user p LEFT JOIN technician_segments ts ON ts.technician_id=p.id AND ts.is_active=true WHERE p.is_deleted=false")
echo -e "  ${YELLOW}✓ ${TECH_COUNT} technicians${NC}"

# ═══════════════════════════════════════════════════════════════════════════
# STEP 6: Sync road plans
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${GREEN}[6/9] Road plans...${NC}"
RP_FILTER=""
$RECENT_ONLY && RP_FILTER="AND visit_date >= NOW() - INTERVAL '30 days'"
RP_COUNT=0
while IFS='|' read -r id vd status title type cid uid cancel remarks nora; do
  [ -z "$id" ] && continue
  upsert_object "KelavaRoadPlan" "{\"primaryKey\":\"RP-${id}\",\"upsert\":true,\"properties\":{\"roadPlanId\":\"RP-${id}\",\"visitDate\":\"${vd}\",\"status\":\"${status}\",\"title\":\"$(esc "$title")\",\"type\":\"${type}\",\"customerId\":\"CUST-${cid}\",\"userId\":\"TECH-${uid}\",\"isCancelled\":\"${cancel}\",\"remarks\":\"$(esc "$remarks")\",\"noRa\":\"${nora}\"}}"
  RP_COUNT=$((RP_COUNT + 1))
done < <(run_sql "SELECT id,COALESCE(visit_date::text,''),COALESCE(status,''),COALESCE(title,''),COALESCE(type,''),COALESCE(id_customer::text,''),COALESCE(id_user::text,''),COALESCE(is_cancel::text,'false'),COALESCE(remarks,''),COALESCE(no_ra,'') FROM t_road_plan WHERE true ${RP_FILTER} ORDER BY visit_date DESC LIMIT 2000")
echo -e "  ${YELLOW}✓ ${RP_COUNT} road plans${NC}"

# ═══════════════════════════════════════════════════════════════════════════
# STEP 7: Sync visits (last 2000)
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${GREEN}[7/9] Visits...${NC}"
V_FILTER=""
$RECENT_ONLY && V_FILTER="AND created_date >= NOW() - INTERVAL '30 days'"
V_COUNT=0
while IFS='|' read -r id uid rpid cid ci co lat lng rd remarks; do
  [ -z "$id" ] && continue
  upsert_object "KelavaVisit" "{\"primaryKey\":\"VIS-${id}\",\"upsert\":true,\"properties\":{\"visitId\":\"VIS-${id}\",\"userId\":\"TECH-${uid}\",\"roadPlanId\":\"RP-${rpid}\",\"customerId\":\"CUST-${cid}\",\"checkIn\":\"${ci}\",\"checkOut\":\"${co}\",\"latitude\":\"${lat}\",\"longitude\":\"${lng}\",\"realizationDate\":\"${rd}\",\"remarks\":\"$(esc "$remarks")\"}}"
  V_COUNT=$((V_COUNT + 1))
done < <(run_sql "SELECT id,COALESCE(id_user::text,''),COALESCE(id_road_plan::text,''),COALESCE(id_customer::text,''),COALESCE(check_in::text,''),COALESCE(check_out::text,''),COALESCE(latitude::text,''),COALESCE(longitude::text,''),COALESCE(realization_date::text,''),COALESCE(remarks,'') FROM t_visit WHERE true ${V_FILTER} ORDER BY created_date DESC LIMIT 2000")
echo -e "  ${YELLOW}✓ ${V_COUNT} visits${NC}"

# ═══════════════════════════════════════════════════════════════════════════
# STEP 8: Sync KPIs, schedules, flags, areas
# ═══════════════════════════════════════════════════════════════════════════
echo -e "${GREEN}[8/9] KPIs, schedules, flags, areas...${NC}"

# KPIs (all 801)
KPI_COUNT=0
while IFS='|' read -r id tid ym tp tc cr grade adm ad otr; do
  [ -z "$id" ] && continue
  upsert_object "KelavaKPI" "{\"primaryKey\":\"KPI-${id}\",\"upsert\":true,\"properties\":{\"kpiId\":\"KPI-${id}\",\"technicianId\":\"TECH-${tid}\",\"yearMonth\":\"${ym}\",\"totalPlanned\":${tp:-0},\"totalCompleted\":${tc:-0},\"completionRate\":${cr:-0},\"grade\":\"${grade}\",\"avgDurationMin\":${adm:-0},\"activeDays\":${ad:-0},\"onTimeRate\":${otr:-0}}}"
  KPI_COUNT=$((KPI_COUNT + 1))
done < <(run_sql "SELECT id,technician_id,year_month,COALESCE(total_planned,0),COALESCE(total_completed,0),COALESCE(completion_rate,0),COALESCE(grade,''),COALESCE(avg_duration_min,0),COALESCE(active_days,0),COALESCE(on_time_rate,0) FROM kpi_monthly_archive")
echo -e "  ${YELLOW}✓ ${KPI_COUNT} KPIs${NC}"

# Schedules (all 282)
SCH_COUNT=0
while IFS='|' read -r id cid tid dow vt freq shift dur active; do
  [ -z "$id" ] && continue
  upsert_object "KelavaSchedule" "{\"primaryKey\":\"SCH-${id}\",\"upsert\":true,\"properties\":{\"scheduleId\":\"SCH-${id}\",\"customerId\":\"CUST-${cid}\",\"technicianId\":\"TECH-${tid}\",\"dayOfWeek\":${dow:-0},\"visitType\":\"${vt}\",\"frequency\":\"${freq}\",\"shift\":\"${shift}\",\"durationEstimate\":${dur:-0},\"isActive\":\"${active}\"}}"
  SCH_COUNT=$((SCH_COUNT + 1))
done < <(run_sql "SELECT id,COALESCE(customer_id::text,''),COALESCE(technician_id::text,''),COALESCE(day_of_week,0),COALESCE(visit_type,''),COALESCE(frequency,''),COALESCE(shift,''),COALESCE(duration_estimate,0),COALESCE(is_active::text,'true') FROM schedule_templates")
echo -e "  ${YELLOW}✓ ${SCH_COUNT} schedules${NC}"

# Verification flags (all 1449)
FLAG_COUNT=0
while IFS='|' read -r id vid rpid tid cid ft sev detail drift pc resolved; do
  [ -z "$id" ] && continue
  upsert_object "KelavaFlag" "{\"primaryKey\":\"FLG-${id}\",\"upsert\":true,\"properties\":{\"flagId\":\"FLG-${id}\",\"visitId\":\"VIS-${vid}\",\"roadPlanId\":\"RP-${rpid}\",\"technicianId\":\"TECH-${tid}\",\"customerId\":\"CUST-${cid}\",\"flagType\":\"${ft}\",\"severity\":\"${sev}\",\"detail\":\"$(esc "$detail")\",\"driftMeters\":${drift:-0},\"photoCount\":${pc:-0},\"resolved\":\"${resolved}\"}}"
  FLAG_COUNT=$((FLAG_COUNT + 1))
done < <(run_sql "SELECT id,COALESCE(visit_id::text,''),COALESCE(road_plan_id::text,''),COALESCE(technician_id::text,''),COALESCE(customer_id::text,''),COALESCE(flag_type,''),COALESCE(severity,''),COALESCE(detail,''),COALESCE(drift_meters,0),COALESCE(photo_count,0),COALESCE(resolved::text,'false') FROM verification_flags")
echo -e "  ${YELLOW}✓ ${FLAG_COUNT} flags${NC}"

# Service areas (last 2000)
AREA_COUNT=0
while IFS='|' read -r id rpid area tt treat; do
  [ -z "$id" ] && continue
  upsert_object "KelavaServiceArea" "{\"primaryKey\":\"AREA-${id}\",\"upsert\":true,\"properties\":{\"areaId\":\"AREA-${id}\",\"roadPlanId\":\"RP-${rpid}\",\"area\":\"$(esc "$area")\",\"treatmentText\":\"$(esc "$tt")\",\"treatment\":${treat:-0}}}"
  AREA_COUNT=$((AREA_COUNT + 1))
done < <(run_sql "SELECT id,id_road_plan,COALESCE(area,''),COALESCE(treatment_text,''),COALESCE(treatment,0) FROM t_road_plan_area ORDER BY id DESC LIMIT 2000")
echo -e "  ${YELLOW}✓ ${AREA_COUNT} service areas${NC}"

# ═══════════════════════════════════════════════════════════════════════════
# STEP 9: Summary
# ═══════════════════════════════════════════════════════════════════════════
TOTAL=$((CUST_COUNT + TECH_COUNT + RP_COUNT + V_COUNT + KPI_COUNT + SCH_COUNT + FLAG_COUNT + AREA_COUNT))

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  SYNC COMPLETE — ${TOTAL} objects synced                          ║${NC}"
echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════╣${NC}"
printf "${CYAN}║${NC}  %-25s %6s                              ${CYAN}║${NC}\n" "Customers" "${CUST_COUNT}"
printf "${CYAN}║${NC}  %-25s %6s                              ${CYAN}║${NC}\n" "Technicians" "${TECH_COUNT}"
printf "${CYAN}║${NC}  %-25s %6s                              ${CYAN}║${NC}\n" "Road Plans" "${RP_COUNT}"
printf "${CYAN}║${NC}  %-25s %6s                              ${CYAN}║${NC}\n" "Visits" "${V_COUNT}"
printf "${CYAN}║${NC}  %-25s %6s                              ${CYAN}║${NC}\n" "KPI Monthly" "${KPI_COUNT}"
printf "${CYAN}║${NC}  %-25s %6s                              ${CYAN}║${NC}\n" "Schedules" "${SCH_COUNT}"
printf "${CYAN}║${NC}  %-25s %6s                              ${CYAN}║${NC}\n" "Verification Flags" "${FLAG_COUNT}"
printf "${CYAN}║${NC}  %-25s %6s                              ${CYAN}║${NC}\n" "Service Areas" "${AREA_COUNT}"
echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  8 link types created (Customer↔RoadPlan↔Visit↔Flag, etc.)   ║${NC}"
echo -e "${CYAN}║  Open: http://localhost:3000 → Sanocare Kelava — Live ERP     ║${NC}"
if [ "$SYNC_FAIL" -gt 0 ]; then
echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}  ${RED}⚠ ${SYNC_FAIL} objects failed to sync${NC}                            ${CYAN}║${NC}"
fi
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
[ "$SYNC_FAIL" -gt 0 ] && echo -e "${RED}WARNING: ${SYNC_FAIL} API calls failed. Check service logs.${NC}"
