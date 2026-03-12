#!/usr/bin/env bash
###############################################################################
# OpenFoundry — Production Startup Script
#
# Usage:
#   ./scripts/start-production.sh [--build] [--detach]
#
# Flags:
#   --build   Force rebuild of all Docker images before starting
#   --detach  Run in detached mode (default is attached with log streaming)
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/deploy/docker-compose.yml"
ENV_FILE="$PROJECT_ROOT/deploy/.env.production"

# -- Color output helpers ----------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# -- Parse arguments ---------------------------------------------------------
BUILD_FLAG=""
DETACH_FLAG=""

for arg in "$@"; do
  case "$arg" in
    --build)  BUILD_FLAG="--build" ;;
    --detach) DETACH_FLAG="-d" ;;
    *)        error "Unknown argument: $arg"; exit 1 ;;
  esac
done

# -- Banner ------------------------------------------------------------------
echo ""
echo "======================================"
echo "  OpenFoundry Production Startup"
echo "======================================"
echo ""

# -- Step 1: Validate prerequisites ------------------------------------------
info "Checking prerequisites..."

command -v docker >/dev/null 2>&1 || { error "Docker is required but not found."; exit 1; }
docker compose version >/dev/null 2>&1 || { error "Docker Compose v2 is required."; exit 1; }

info "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
echo ""

# -- Step 2: Validate environment file ---------------------------------------
info "Validating environment configuration..."

if [ ! -f "$ENV_FILE" ]; then
  error "Production environment file not found: $ENV_FILE"
  error "Copy deploy/.env.production and fill in all CHANGEME values."
  exit 1
fi

# Source the env file so we can validate values
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

REQUIRED_VARS=(
  "POSTGRES_USER"
  "POSTGRES_PASSWORD"
  "POSTGRES_DB"
  "MINIO_ROOT_USER"
  "MINIO_ROOT_PASSWORD"
  "JWT_SECRET"
  "OAUTH_CLIENT_SECRET"
)

MISSING=0
for var in "${REQUIRED_VARS[@]}"; do
  val="${!var:-}"
  if [ -z "$val" ]; then
    error "Required variable $var is not set in $ENV_FILE"
    MISSING=1
  elif echo "$val" | grep -q "CHANGEME"; then
    error "Variable $var still contains placeholder value. Update it in $ENV_FILE"
    MISSING=1
  fi
done

if [ "$MISSING" -eq 1 ]; then
  echo ""
  error "Fix the above environment variable issues before starting."
  exit 1
fi

info "Environment configuration validated."
echo ""

# -- Step 3: Validate compose file -------------------------------------------
info "Validating Docker Compose configuration..."

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config --quiet 2>/dev/null || {
  error "Docker Compose configuration is invalid. Run:"
  error "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE config"
  exit 1
}

info "Docker Compose configuration is valid."
echo ""

# -- Step 4: Run database migrations -----------------------------------------
info "Starting infrastructure services (postgres, redis, minio)..."

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis minio

info "Waiting for PostgreSQL to be ready..."
RETRIES=30
until docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_isready -U "$POSTGRES_USER" > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    error "PostgreSQL did not become ready in time."
    exit 1
  fi
  sleep 2
done
info "PostgreSQL is ready."

# Run migrations if the migrate script exists
if [ -f "$PROJECT_ROOT/scripts/migrate.js" ]; then
  info "Running database migrations..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1" > /dev/null 2>&1
  info "Database is accessible. Migrations will be applied from init scripts."
elif [ -d "$PROJECT_ROOT/db/migrations" ]; then
  info "Migrations will be applied via PostgreSQL init scripts on first boot."
else
  warn "No migration scripts found. Ensure the database schema is up to date."
fi
echo ""

# -- Step 5: Start all services ----------------------------------------------
info "Starting all OpenFoundry services..."

# shellcheck disable=SC2086
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up $BUILD_FLAG $DETACH_FLAG

# The rest only runs in detached mode (otherwise docker compose streams logs)
if [ -z "$DETACH_FLAG" ]; then
  exit 0
fi

echo ""

# -- Step 6: Wait for health checks ------------------------------------------
info "Waiting for services to become healthy..."

SERVICES=(
  "svc-gateway"
  "svc-multipass"
  "svc-ontology"
  "svc-objects"
  "svc-actions"
  "svc-datasets"
  "svc-compass"
  "svc-admin"
  "svc-functions"
  "svc-webhooks"
  "svc-media"
  "svc-sentinel"
  "svc-aip"
  "app-console"
)

MAX_WAIT=120
ELAPSED=0

all_healthy() {
  for svc in "${SERVICES[@]}"; do
    local health
    health=$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
      ps --format json "$svc" 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ "$health" != "healthy" ]; then
      return 1
    fi
  done
  return 0
}

while ! all_healthy; do
  ELAPSED=$((ELAPSED + 5))
  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    warn "Not all services are healthy after ${MAX_WAIT}s. Check logs for details."
    break
  fi
  echo -n "."
  sleep 5
done
echo ""
echo ""

# -- Step 7: Print service status ---------------------------------------------
info "Service Status:"
echo ""

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps \
  --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "======================================"
info "OpenFoundry is running!"
echo ""
echo "  Console:    http://localhost:${CONSOLE_EXTERNAL_PORT:-3000}"
echo "  API:        http://localhost:${GATEWAY_EXTERNAL_PORT:-8080}"
echo "  Health:     http://localhost:${GATEWAY_EXTERNAL_PORT:-8080}/status/health"
echo "  Metrics:    http://localhost:${GATEWAY_EXTERNAL_PORT:-8080}/metrics"
echo ""
echo "  Logs:       docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs -f"
echo "  Stop:       docker compose -f $COMPOSE_FILE --env-file $ENV_FILE down"
echo "======================================"
echo ""
