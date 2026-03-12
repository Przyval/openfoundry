# OpenFoundry

**An open-source data platform with ontology-first architecture.**

[![Build](https://img.shields.io/github/actions/workflow/status/openfoundry/openfoundry/ci.yml?branch=main)](https://github.com/openfoundry/openfoundry/actions)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)

---

## What is OpenFoundry?

OpenFoundry is an open-source data platform inspired by Palantir Foundry. It provides ontology-driven data modeling, object storage, action execution, dataset management, and a full suite of APIs -- all built as composable microservices in a TypeScript monorepo.

Define your data model as an **ontology** (object types, link types, action types), store and query **objects** through a powerful ObjectSet API, trigger **actions** with validation and side effects, manage **datasets** and **functions**, and observe everything through a unified **console**.

---

## Architecture

```
                          +------------------+
                          |   app-console    |  Next.js frontend
                          |     :3000        |
                          +--------+---------+
                                   |
                          +--------+---------+
                          |   svc-gateway    |  API gateway / routing
                          |     :8080        |
                          +--------+---------+
                                   |
         +----------+---------+----+----+---------+----------+
         |          |         |         |         |          |
   +-----+--+ +----+---+ +---+----+ +--+-----+ +-+------+ +-+--------+
   |multipass| |ontology| |objects | |actions | |datasets| | compass  |
   |  :8084  | | :8081  | | :8082  | | :8083  | | :8085  | |  :8086   |
   +---------+ +--------+ +--------+ +--------+ +--------+ +----------+
         |          |         |         |         |          |
   +-----+--+ +----+---+ +---+----+ +--+-----+ +-+------+
   | admin  | |functions| |webhooks| | media  | |sentinel|
   | :8087  | |  :8088  | | :8089  | | :8090  | | :8091  |
   +---------+ +--------+ +--------+ +--------+ +--------+
                                   |
                    +--------------+--------------+
                    |                             |
              +-----+------+            +---------+--+
              | PostgreSQL |            |   Redis    |
              |   :5432    |            |   :6379    |
              +------------+            +------------+
```

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/openfoundry/openfoundry.git
cd openfoundry

# 2. Install dependencies
pnpm install

# 3. Start infrastructure (PostgreSQL, Redis, MinIO)
pnpm docker:up

# 4. Build all packages and run migrations
pnpm build
pnpm db:migrate

# 5. Start all services in development mode
pnpm dev
# Console:  http://localhost:3000
# Gateway:  http://localhost:8080
```

---

## Project Structure

```
openfoundry/
+-- apps/
|   +-- app-console/          Next.js admin console
|   +-- app-docs/             Documentation site
|   +-- app-workshop/         Low-code page builder
+-- conjure/                  Conjure YAML service definitions
|   +-- ir/                   Compiled intermediate representation
+-- db/                       Database migrations and schemas
+-- deploy/
|   +-- docker/               Dockerfiles for each service
|   +-- docker-compose.dev.yml
|   +-- helm/openfoundry/     Helm chart for Kubernetes
+-- packages/                 Shared libraries (28 packages)
+-- scripts/                  Build and migration scripts
+-- services/                 Microservices (13 services)
+-- tests/                    Integration and end-to-end tests
+-- turbo.json                Turborepo pipeline config
+-- pnpm-workspace.yaml       pnpm workspace definition
```

---

## Packages

| Package | Description |
|---------|-------------|
| `@openfoundry/api-types` | Generated TypeScript types from Conjure definitions |
| `@openfoundry/auth-tokens` | JWT token creation, verification, and middleware |
| `@openfoundry/client` | TypeScript SDK client for the OpenFoundry API |
| `@openfoundry/config` | Centralized configuration loading (env, files, defaults) |
| `@openfoundry/conjure-codegen` | Generates TypeScript from Conjure IR |
| `@openfoundry/conjure-compiler` | Compiles Conjure YAML to intermediate representation |
| `@openfoundry/conjure-ir` | Conjure IR type definitions and utilities |
| `@openfoundry/db` | Database client, connection pooling, query builders |
| `@openfoundry/errors` | Structured error types following Conjure error conventions |
| `@openfoundry/health` | Health check endpoint handlers (liveness + readiness) |
| `@openfoundry/logging` | Structured JSON logger (pino-based) |
| `@openfoundry/markings` | Row-level security markings and ABAC policy engine |
| `@openfoundry/object-set` | ObjectSet query engine (filter, search, aggregate, group) |
| `@openfoundry/ontology-generator` | Generates ontology SDKs from ontology definitions |
| `@openfoundry/ontology-ir` | Ontology intermediate representation types |
| `@openfoundry/ontology-maker` | Builder API for constructing ontologies programmatically |
| `@openfoundry/ontology-schema` | JSON Schema validation for ontology definitions |
| `@openfoundry/pagination` | Cursor-based and offset pagination utilities |
| `@openfoundry/permissions` | Permission checking and role-based access control |
| `@openfoundry/rid` | Resource identifier (RID) generation and parsing |
| `@openfoundry/sdk` | High-level SDK combining client, auth, and ontology |
| `@openfoundry/test-utils` | Shared test fixtures, mocks, and helpers |
| `@openfoundry/tracing` | OpenTelemetry distributed tracing integration |
| `@openfoundry/pipeline` | Data pipeline DAG engine with transforms |
| `@openfoundry/redis` | Redis client wrapper and cache utilities |
| `@openfoundry/search` | Full-text search engine (PostgreSQL tsvector) |
| `@openfoundry/ui` | Shared React component library |
| `@openfoundry/wire` | Wire protocol serialization/deserialization |

---

## Services

| Service | Port | Description |
|---------|------|-------------|
| `svc-gateway` | 8080 | API gateway -- routes requests, handles auth, rate limiting |
| `svc-ontology` | 8081 | Ontology CRUD -- object types, link types, action types, interfaces |
| `svc-objects` | 8082 | Object storage -- CRUD, ObjectSet queries, aggregations |
| `svc-actions` | 8083 | Action execution -- validation, side effects, webhooks |
| `svc-multipass` | 8084 | Authentication -- users, groups, tokens, OAuth/SAML |
| `svc-datasets` | 8085 | Dataset management -- file uploads, schemas, transactions |
| `svc-compass` | 8086 | Resource discovery -- search, browse, lineage, tags |
| `svc-admin` | 8087 | Platform admin -- configuration, enrollment, audit logs |
| `svc-functions` | 8088 | Serverless functions -- user-defined TypeScript functions |
| `svc-webhooks` | 8089 | Webhook management -- subscriptions, delivery, retries |
| `svc-media` | 8090 | Media/attachment storage -- upload, download, thumbnails |
| `svc-sentinel` | 8091 | Monitoring -- object change triggers, threshold alerts, notifications |
| `svc-aip` | 8092 | AI Platform -- LLM integration (OpenAI/Anthropic/Ollama), embeddings, semantic search |

---

## Development

### Commands

```bash
# Build all packages and services
pnpm build

# Start all services in watch mode
pnpm dev

# Run unit tests
pnpm test

# Run integration / e2e tests
pnpm test:integration

# Lint all packages
pnpm lint

# Type-check all packages
pnpm typecheck

# Format code with Prettier
pnpm format

# Database migrations
pnpm db:migrate
pnpm db:seed

# Generate API types from Conjure definitions
pnpm generate:api

# Docker infrastructure
pnpm docker:up
pnpm docker:down
```

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 10.27.0
- **Docker** and **Docker Compose** (for PostgreSQL, Redis, MinIO)

---

## API Overview

All API endpoints are served through the gateway at `http://localhost:8080` and follow the `/api/v2` prefix convention.

### Ontologies

```
GET    /api/v2/ontologies                     List ontologies
POST   /api/v2/ontologies                     Create ontology
GET    /api/v2/ontologies/:rid                Get ontology
DELETE /api/v2/ontologies/:rid                Delete ontology
```

### Object Types

```
GET    /api/v2/ontologies/:rid/objectTypes              List object types
POST   /api/v2/ontologies/:rid/objectTypes              Create object type
GET    /api/v2/ontologies/:rid/objectTypes/:apiName     Get object type
PUT    /api/v2/ontologies/:rid/objectTypes/:apiName     Update object type
DELETE /api/v2/ontologies/:rid/objectTypes/:apiName     Delete object type
```

### Objects

```
GET    /api/v2/ontologies/:rid/objects/:type            List objects
POST   /api/v2/ontologies/:rid/objects/:type            Create object
GET    /api/v2/ontologies/:rid/objects/:type/:pk        Get object
PUT    /api/v2/ontologies/:rid/objects/:type/:pk        Update object
DELETE /api/v2/ontologies/:rid/objects/:type/:pk        Delete object
POST   /api/v2/ontologies/:rid/objectSets/loadObjects   Query via ObjectSet
POST   /api/v2/ontologies/:rid/objectSets/aggregate     Aggregate objects
```

### Actions

```
GET    /api/v2/ontologies/:rid/actionTypes              List action types
POST   /api/v2/ontologies/:rid/actions/:action/apply    Apply action
POST   /api/v2/ontologies/:rid/actions/:action/validate Validate action
```

### Datasets

```
GET    /api/v2/datasets                              List datasets
POST   /api/v2/datasets                              Create dataset
GET    /api/v2/datasets/:rid                          Get dataset
DELETE /api/v2/datasets/:rid                          Delete dataset
GET    /api/v2/datasets/:rid/branches                 List branches
POST   /api/v2/datasets/:rid/branches                 Create branch
PUT    /api/v2/datasets/:rid/files/:path              Upload file
GET    /api/v2/datasets/:rid/files/:path              Download file
```

### Compass (Resource Navigation)

```
GET    /api/v2/compass/resources                      List root resources
POST   /api/v2/compass/resources                      Create resource (SPACE/PROJECT/FOLDER)
GET    /api/v2/compass/resources/:rid/children         List children
GET    /api/v2/compass/resources/:rid/path             Get breadcrumb path
POST   /api/v2/compass/resources/:rid/move             Move resource
GET    /api/v2/compass/search?q=...                    Search resources
```

### Functions

```
GET    /api/v2/functions                               List functions
POST   /api/v2/functions                               Register function
POST   /api/v2/functions/:apiName/execute              Execute function
```

### Monitors (Sentinel)

```
GET    /api/v2/monitors                                List monitors
POST   /api/v2/monitors                                Create monitor
POST   /api/v2/monitors/:rid/trigger                   Manually trigger
GET    /api/v2/notifications                           List notifications
PUT    /api/v2/notifications/:rid/read                 Mark as read
```

### AIP (AI Platform)

```
POST   /api/v2/aip/query                               Natural language query
POST   /api/v2/aip/chat                                Multi-turn chat
POST   /api/v2/aip/embeddings                          Generate embeddings
POST   /api/v2/aip/semantic-search                     Semantic vector search
```

### Authentication

```
POST   /api/v2/auth/token                    Get access token
GET    /api/v2/auth/me                        Get current user
POST   /api/v2/auth/groups                    Create group
GET    /api/v2/auth/groups                    List groups
```

---

## Deployment

### Docker Compose (Development)

```bash
# Start all infrastructure services
pnpm docker:up

# Stop and remove volumes
pnpm docker:down
```

### Docker Compose (Production)

```bash
# Copy and configure production environment
cp deploy/.env.production deploy/.env
# Edit deploy/.env with real secrets (replace all CHANGEME values)

# Start the full platform
./scripts/start-production.sh

# Or manually:
docker compose -f deploy/docker-compose.yml up -d
```

### Helm (Production)

```bash
# Install the chart
helm install openfoundry deploy/helm/openfoundry \
  --namespace openfoundry \
  --create-namespace

# Upgrade with custom values
helm upgrade openfoundry deploy/helm/openfoundry \
  --namespace openfoundry \
  -f my-values.yaml

# Uninstall
helm uninstall openfoundry --namespace openfoundry
```

Key Helm values:

| Value | Default | Description |
|-------|---------|-------------|
| `global.image.registry` | `ghcr.io` | Container image registry |
| `global.image.tag` | `latest` | Image tag for all services |
| `gateway.replicas` | `2` | Gateway replica count |
| `gateway.ingress.enabled` | `true` | Enable gateway ingress |
| `gateway.ingress.host` | `openfoundry.local` | Gateway hostname |
| `console.ingress.host` | `console.openfoundry.local` | Console hostname |
| `postgresql.enabled` | `true` | Deploy PostgreSQL subchart |
| `redis.enabled` | `true` | Deploy Redis subchart |

---

## Contributing

We welcome contributions of all kinds.

1. **Fork** the repository and create a feature branch.
2. **Install** dependencies with `pnpm install`.
3. **Make your changes** -- add tests for new functionality.
4. **Run checks**: `pnpm build && pnpm test && pnpm lint && pnpm typecheck`.
5. **Submit a pull request** with a clear description of the change.

Please follow the existing code style and commit message conventions. All pull requests require passing CI and at least one review.

---

## License

Licensed under the [Apache License 2.0](LICENSE).

```
Copyright 2024 OpenFoundry Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
