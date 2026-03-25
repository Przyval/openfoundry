# =============================================================================
# OpenFoundry — Single-container Docker build
# All 9 backend services + Vite frontend in one container for easy demo usage
# =============================================================================

# ---------- Stage 1: Install dependencies ----------
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
RUN apk add --no-cache bash curl

WORKDIR /app

# Copy the full source tree (filtered by .dockerignore which strips node_modules)
COPY . .

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# ---------- Stage 2: Runtime (slim) ----------
FROM node:20-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
RUN apk add --no-cache bash curl

WORKDIR /app

# Copy everything from deps (source + installed node_modules)
COPY --from=deps /app ./

# Create persistent data directory
RUN mkdir -p /tmp/openfoundry-data

# Expose ports: Frontend (3000) + Gateway (8080)
EXPOSE 3000 8080

RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
