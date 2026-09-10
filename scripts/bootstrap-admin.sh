#!/bin/bash
# ============================================================================
# bootstrap-admin.sh — Create the first admin user in production
#
# In production, dev users (admin/admin123) are disabled. This script creates
# the first admin user + organization via the signup endpoint.
#
# Usage:
#   bash scripts/bootstrap-admin.sh
#   bash scripts/bootstrap-admin.sh --username myuser --password mypass --org "My Company"
#
# Environment:
#   GATEWAY_URL — Gateway base URL (default: http://localhost:8080)
# ============================================================================

set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
USERNAME=""
PASSWORD=""
ORG_NAME=""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case $1 in
    --username) USERNAME="$2"; shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    --org)      ORG_NAME="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Interactive prompts if not provided
# ---------------------------------------------------------------------------
if [ -z "$USERNAME" ]; then
  read -rp "Admin username: " USERNAME
fi
if [ -z "$PASSWORD" ]; then
  read -rsp "Admin password (min 8 chars): " PASSWORD
  echo
fi
if [ -z "$ORG_NAME" ]; then
  read -rp "Organization name: " ORG_NAME
fi

if [ ${#PASSWORD} -lt 8 ]; then
  echo -e "${RED}Error: Password must be at least 8 characters${NC}"
  exit 1
fi

# ---------------------------------------------------------------------------
# Create admin via signup endpoint
# ---------------------------------------------------------------------------
echo -e "${YELLOW}Creating admin user '${USERNAME}' for org '${ORG_NAME}'...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${GATEWAY_URL}/api/v2/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"${USERNAME}\",
    \"password\": \"${PASSWORD}\",
    \"displayName\": \"${USERNAME}\",
    \"orgName\": \"${ORG_NAME}\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  ORG_RID=$(echo "$BODY" | grep -o '"orgRid":"[^"]*"' | cut -d'"' -f4)
  echo -e "${GREEN}✓ Admin user created successfully${NC}"
  echo ""
  echo "  Username: ${USERNAME}"
  echo "  Org RID:  ${ORG_RID}"
  echo "  Gateway:  ${GATEWAY_URL}"
  echo ""
  echo -e "${YELLOW}Next: seed industry data for this org:${NC}"
  echo "  ORG_RID=${ORG_RID} bash scripts/demo/seed-pest-control.sh"
  echo ""
  echo -e "${YELLOW}Then login at:${NC}"
  echo "  http://localhost:3000"
elif [ "$HTTP_CODE" = "409" ]; then
  echo -e "${RED}✗ Username '${USERNAME}' already exists${NC}"
  exit 1
else
  echo -e "${RED}✗ Signup failed (HTTP ${HTTP_CODE})${NC}"
  echo "$BODY"
  exit 1
fi
