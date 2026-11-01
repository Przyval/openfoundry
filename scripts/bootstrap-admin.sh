#!/bin/bash
# ============================================================================
# bootstrap-admin.sh - Create the first administrator of a deployment
#
# In production the development accounts (admin/admin123, ...) do not exist,
# so nobody can sign in until an account is created. This creates one with
# the ADMIN role directly in the `users` table, through svc-multipass's
# account CLI (services/svc-multipass/src/cli/users.ts). It needs the database
# credentials - which is the point: no HTTP endpoint can create an admin.
#
# The password is prompted for (twice, unechoed), or read from
# OPENFOUNDRY_USER_PASSWORD when that is set. It is never an argument.
#
# Usage:
#   DATABASE_URL=postgresql://... bash scripts/bootstrap-admin.sh --username <name>
#   bash scripts/bootstrap-admin.sh --username <name> --display-name "Full Name"
#
# Against the Docker deployment in deploy/, run the same CLI inside the
# svc-multipass container instead, where DATABASE_URL is already set:
#   docker compose -f deploy/docker-compose.yml exec svc-multipass \
#     node services/svc-multipass/dist/cli/users.js create --username <name> --roles ADMIN
#
# Environment:
#   DATABASE_URL - the deployment's database (also read from .env)
# ============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | tail -1 | cut -d= -f2- || true)"
  export DATABASE_URL
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL is not set. Accounts are stored in the database." >&2
  exit 1
fi

USERNAME=""
DISPLAY_NAME=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --username)     USERNAME="$2"; shift 2 ;;
    --display-name) DISPLAY_NAME="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$USERNAME" ]; then
  read -rp "Admin username: " USERNAME
fi

ARGS=(create --username "$USERNAME" --roles ADMIN)
if [ -n "$DISPLAY_NAME" ]; then
  ARGS+=(--display-name "$DISPLAY_NAME")
fi

cd "$ROOT"
pnpm --silent --filter @openfoundry/svc-multipass exec tsx src/cli/users.ts "${ARGS[@]}"

echo ""
echo "Sign in at the console with \"Login with OAuth\"."
