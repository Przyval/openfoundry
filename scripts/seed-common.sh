#!/bin/bash
# ============================================================================
# seed-common.sh — Shared functions for all industry seed scripts
#
# Usage: source this file from industry-specific seed scripts.
#   source "$(dirname "$0")/seed-common.sh"
#
# Required env vars (set defaults if not provided):
#   ONTOLOGY_SVC  — ontology service URL (default: http://localhost:8081)
#   OBJECTS_SVC   — objects service URL  (default: http://localhost:8082)
#   ACTIONS_SVC   — actions service URL  (default: http://localhost:8083)
#   ORG_RID       — organization RID for tenant isolation (default: org:default)
# ============================================================================

ONTOLOGY_SVC="${ONTOLOGY_SVC:-http://localhost:8081}"
OBJECTS_SVC="${OBJECTS_SVC:-http://localhost:8082}"
ACTIONS_SVC="${ACTIONS_SVC:-http://localhost:8083}"
ORG_RID="${ORG_RID:-org:default}"

# Bearer credentials for every request below. Reads OPENFOUNDRY_TOKEN or
# OPENFOUNDRY_CLIENT_ID/_CLIENT_SECRET from the environment or .env, and sends
# nothing when neither is set. See scripts/lib/auth.sh.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/auth.sh"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Ontology operations
# ---------------------------------------------------------------------------

create_ontology() {
  local api_name="$1"
  local display_name="$2"
  local description="$3"

  echo -e "${GREEN}Creating ontology: ${display_name}${NC}"
  of_curl -s -X POST "${ONTOLOGY_SVC}/api/v2/ontologies" \
    -H "Content-Type: application/json" \
    -d "{
      \"apiName\": \"${api_name}\",
      \"displayName\": \"${display_name}\",
      \"description\": \"${description}\",
      \"orgRid\": \"${ORG_RID}\"
    }" | grep -o '"rid":"[^"]*"' | head -1
}

create_object_type() {
  local ontology_rid="$1"
  local api_name="$2"
  local display_name="$3"
  local pk_name="$4"
  local properties_json="$5"

  echo -e "  ${YELLOW}Creating object type: ${display_name}${NC}"
  of_curl -s -X POST "${ONTOLOGY_SVC}/api/v2/ontologies/${ontology_rid}/objectTypes" \
    -H "Content-Type: application/json" \
    -d "{
      \"apiName\": \"${api_name}\",
      \"displayName\": \"${display_name}\",
      \"primaryKeyApiName\": \"${pk_name}\",
      \"primaryKeyType\": \"STRING\",
      \"titlePropertyApiName\": \"${pk_name}\",
      \"properties\": ${properties_json},
      \"implements\": [],
      \"status\": \"ACTIVE\"
    }" > /dev/null
}

create_link_type() {
  local ontology_rid="$1"
  local api_name="$2"
  local from_type="$3"
  local to_type="$4"
  local cardinality="${5:-MANY}"

  echo -e "  ${YELLOW}Creating link type: ${api_name}${NC}"
  of_curl -s -X POST "${ONTOLOGY_SVC}/api/v2/ontologies/${ontology_rid}/linkTypes" \
    -H "Content-Type: application/json" \
    -d "{
      \"apiName\": \"${api_name}\",
      \"objectTypeApiName\": \"${from_type}\",
      \"linkedObjectTypeApiName\": \"${to_type}\",
      \"cardinality\": \"${cardinality}\"
    }" > /dev/null
}

create_action_type() {
  local ontology_rid="$1"
  local api_name="$2"
  local description="$3"
  local parameters_json="$4"
  local modified_json="${5:-{}}"

  echo -e "  ${YELLOW}Creating action type: ${api_name}${NC}"
  of_curl -s -X POST "${ONTOLOGY_SVC}/api/v2/ontologies/${ontology_rid}/actionTypes" \
    -H "Content-Type: application/json" \
    -d "{
      \"apiName\": \"${api_name}\",
      \"description\": \"${description}\",
      \"parameters\": ${parameters_json},
      \"modifiedEntities\": ${modified_json},
      \"status\": \"ACTIVE\"
    }" > /dev/null
}

# ---------------------------------------------------------------------------
# Object operations
# ---------------------------------------------------------------------------

insert_object() {
  local ontology_rid="$1"
  local object_type="$2"
  local primary_key="$3"
  local properties_json="$4"

  of_curl -s -X POST "${OBJECTS_SVC}/api/v2/ontologies/${ontology_rid}/objects/${object_type}" \
    -H "Content-Type: application/json" \
    -d "{
      \"primaryKey\": \"${primary_key}\",
      \"properties\": ${properties_json}
    }" > /dev/null
}

# ---------------------------------------------------------------------------
# Status helpers
# ---------------------------------------------------------------------------

seed_complete() {
  local industry="$1"
  local count="$2"
  echo ""
  echo -e "${GREEN}✓ ${industry} seed complete — ${count} objects inserted for org ${ORG_RID}${NC}"
}
