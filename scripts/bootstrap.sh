#!/usr/bin/env bash
set -euo pipefail

echo "🚀 OpenFoundry Bootstrap"
echo "========================"
echo ""

# 1. Check prerequisites
echo "Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm is required. Install: npm install -g pnpm"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required"; exit 1; }

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "❌ Node.js 20+ required (found: $(node -v))"
  exit 1
fi

echo "✓ Node.js $(node -v)"
echo "✓ pnpm $(pnpm -v)"
echo "✓ Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
echo ""

# 2. Install dependencies
echo "Installing dependencies..."
pnpm install
echo "✓ Dependencies installed"
echo ""

# 3. Build all packages
echo "Building packages..."
pnpm run build
echo "✓ Build complete"
echo ""

# 4. Start Docker services
echo "Starting Docker services (PostgreSQL, Redis, Traefik)..."
docker compose -f deploy/docker-compose.dev.yml up -d
echo "✓ Docker services started"
echo ""

# 5. Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker compose -f deploy/docker-compose.dev.yml exec -T postgres pg_isready -U openfoundry > /dev/null 2>&1; then
    break
  fi
  sleep 1
done
echo "✓ PostgreSQL ready"
echo ""

# 6. Run migrations
echo "Running database migrations..."
node scripts/migrate.js
echo "✓ Migrations complete"
echo ""

# 7. Run tests
echo "Running tests..."
pnpm run test
echo "✓ All tests passed"
echo ""

echo "========================"
echo "✅ OpenFoundry is ready!"
echo ""
echo "Start all services:    pnpm run dev"
echo "Open the console:      http://localhost:3000"
echo "API gateway:           http://localhost:8080"
echo "Seed sample data:      npx tsx scripts/seed-dev-data.ts"
echo ""
