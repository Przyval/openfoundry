#!/bin/bash
# ============================================================================
# seed-kelava-alerts.sh — Create 5 operational alert monitors for Kelava/Sanocare
#
# Requires: svc-sentinel running on port 8091 (or via gateway 8080)
# ============================================================================

set -euo pipefail

BASE="${GATEWAY_URL:-http://localhost:8080}"

# Bearer credentials for every request below. Reads OPENFOUNDRY_TOKEN or
# OPENFOUNDRY_CLIENT_ID/_CLIENT_SECRET from the environment or .env, and sends
# nothing when neither is set. See scripts/lib/auth.sh.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/auth.sh"
GREEN='\033[0;32m'
NC='\033[0m'

echo "Creating Kelava alert monitors..."

# 1. Technician Low Performance — completion rate < 50%
of_curl -s -X POST "${BASE}/api/v2/monitors" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Technician Low Performance",
    "description": "Alert when any technician has completion rate below 50%",
    "objectType": "KelavaKPI",
    "trigger": {
      "type": "SCHEDULE",
      "config": {
        "cron": "0 * * * *",
        "objectType": "KelavaKPI",
        "property": "completionRate",
        "operator": "lt",
        "threshold": 50
      }
    },
    "effects": [
      { "type": "NOTIFICATION", "config": { "severity": "WARNING", "title": "Technician Low Performance", "message": "Technician has completion rate below 50%" } }
    ]
  }' > /dev/null 2>&1
echo -e "${GREEN}  1/5 Technician Low Performance${NC}"

# 2. Critical Unresolved GPS Drift — drift > 5000m
of_curl -s -X POST "${BASE}/api/v2/monitors" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GPS Drift Alert",
    "description": "Alert when unresolved GPS drift exceeds 5km",
    "objectType": "KelavaFlag",
    "trigger": {
      "type": "SCHEDULE",
      "config": {
        "cron": "*/15 * * * *",
        "objectType": "KelavaFlag",
        "property": "driftMeters",
        "operator": "gt",
        "threshold": 5000
      }
    },
    "effects": [
      { "type": "NOTIFICATION", "config": { "severity": "CRITICAL", "title": "GPS Drift Detected", "message": "Technician GPS drift exceeds 5km — possible location spoofing" } }
    ]
  }' > /dev/null 2>&1
echo -e "${GREEN}  2/5 GPS Drift Alert${NC}"

# 3. Technician Over-Quota — completed > planned
of_curl -s -X POST "${BASE}/api/v2/monitors" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Technician Over-Quota",
    "description": "Alert when technician completes more than planned (possible data quality issue)",
    "objectType": "KelavaKPI",
    "trigger": {
      "type": "SCHEDULE",
      "config": {
        "cron": "0 8 * * *",
        "objectType": "KelavaKPI",
        "property": "completionRate",
        "operator": "gt",
        "threshold": 100
      }
    },
    "effects": [
      { "type": "NOTIFICATION", "config": { "severity": "INFO", "title": "Technician Over-Quota", "message": "Technician completed more visits than planned this month" } }
    ]
  }' > /dev/null 2>&1
echo -e "${GREEN}  3/5 Technician Over-Quota${NC}"

# 4. Low Active Days — technician with < 10 active days
of_curl -s -X POST "${BASE}/api/v2/monitors" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Low Active Days",
    "description": "Alert when technician has fewer than 10 active days this month",
    "objectType": "KelavaKPI",
    "trigger": {
      "type": "SCHEDULE",
      "config": {
        "cron": "0 9 * * 1",
        "objectType": "KelavaKPI",
        "property": "activeDays",
        "operator": "lt",
        "threshold": 10
      }
    },
    "effects": [
      { "type": "NOTIFICATION", "config": { "severity": "WARNING", "title": "Low Active Days", "message": "Technician had fewer than 10 active working days this month" } }
    ]
  }' > /dev/null 2>&1
echo -e "${GREEN}  4/5 Low Active Days${NC}"

# 5. High Flag Count — any technician with > 20 flags
of_curl -s -X POST "${BASE}/api/v2/monitors" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High Verification Flag Count",
    "description": "Alert when verification flags indicate quality issues",
    "objectType": "KelavaFlag",
    "trigger": {
      "type": "SCHEDULE",
      "config": {
        "cron": "0 8 * * *",
        "objectType": "KelavaFlag",
        "property": "photoCount",
        "operator": "lt",
        "threshold": 1
      }
    },
    "effects": [
      { "type": "NOTIFICATION", "config": { "severity": "WARNING", "title": "Missing Photo Evidence", "message": "Visit completed without photo documentation" } }
    ]
  }' > /dev/null 2>&1
echo -e "${GREEN}  5/5 Missing Photo Evidence${NC}"

echo ""
echo -e "${GREEN}Done — 5 Kelava alert monitors created.${NC}"
echo "Scheduler runs every 60s. Check notifications at http://localhost:3000/notifications"
