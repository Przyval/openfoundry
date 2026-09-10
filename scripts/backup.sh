#!/bin/bash
# ============================================================================
# backup.sh — Automated daily Postgres backup
#
# Usage:
#   bash scripts/backup.sh                    # One-time backup
#   bash scripts/backup.sh --install-cron     # Install daily cron job
#
# Environment:
#   DATABASE_URL  — Postgres connection string (required)
#   BACKUP_DIR    — Where to store backups (default: /tmp/openfoundry-backups)
#   BACKUP_RETAIN — Days to keep backups (default: 7)
#
# Output: {BACKUP_DIR}/openfoundry-{YYYY-MM-DD-HHMMSS}.sql.gz
# ============================================================================

set -euo pipefail

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/openfoundry-backups}"
BACKUP_RETAIN="${BACKUP_RETAIN:-7}"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Install cron job
# ---------------------------------------------------------------------------
if [ "${1:-}" = "--install-cron" ]; then
  SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/backup.sh"
  CRON_LINE="0 2 * * * DATABASE_URL='${DATABASE_URL}' BACKUP_DIR='${BACKUP_DIR}' bash ${SCRIPT_PATH} >> /var/log/openfoundry-backup.log 2>&1"

  # Check if already installed
  if crontab -l 2>/dev/null | grep -qF "openfoundry-backup"; then
    echo -e "${GREEN}Cron job already installed${NC}"
  else
    (crontab -l 2>/dev/null; echo "# openfoundry-backup — daily at 02:00"; echo "${CRON_LINE}") | crontab -
    echo -e "${GREEN}✓ Cron job installed — daily backup at 02:00${NC}"
  fi
  echo "  Backup dir: ${BACKUP_DIR}"
  echo "  Retain: ${BACKUP_RETAIN} days"
  exit 0
fi

# ---------------------------------------------------------------------------
# Run backup
# ---------------------------------------------------------------------------
mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/openfoundry-${TIMESTAMP}.sql.gz"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting backup..."

# pg_dump with custom format, compressed
if pg_dump "${DATABASE_URL}" --no-owner --no-acl | gzip > "${BACKUP_FILE}"; then
  SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  echo -e "${GREEN}✓ Backup complete: ${BACKUP_FILE} (${SIZE})${NC}"
else
  echo -e "${RED}✗ Backup FAILED${NC}"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# ---------------------------------------------------------------------------
# Cleanup old backups
# ---------------------------------------------------------------------------
DELETED=$(find "${BACKUP_DIR}" -name "openfoundry-*.sql.gz" -mtime +"${BACKUP_RETAIN}" -delete -print | wc -l | tr -d ' ')
if [ "${DELETED}" -gt 0 ]; then
  echo "  Cleaned up ${DELETED} backup(s) older than ${BACKUP_RETAIN} days"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL=$(find "${BACKUP_DIR}" -name "openfoundry-*.sql.gz" | wc -l | tr -d ' ')
echo "  Total backups: ${TOTAL} (retaining ${BACKUP_RETAIN} days)"
