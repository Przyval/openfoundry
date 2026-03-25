# OpenFoundry

**A local-first Palantir Foundry emulator for development and testing.**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)

---

## What is OpenFoundry?

OpenFoundry is a fully functional, local emulator of the Palantir Foundry platform. It implements real Foundry-compatible API endpoints backed by in-memory storage, letting you develop, test, and demo Foundry-based applications without access to a live Foundry stack.

It runs 9 backend services + a Vite-powered frontend console, seeds a realistic pest control ontology with 47 objects, and starts with a single command.

> **Storage note:** All data is held in memory and persisted to `/tmp/openfoundry-data/`. Restarting services re-seeds from scratch unless data files exist.

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/openfoundry/openfoundry.git
cd openfoundry

# 2. Install dependencies
pnpm install

# 3. Start everything (backend services + seed data + frontend)
bash start.sh

# Console:  http://localhost:3000
# Gateway:  http://localhost:8080
# Login:    admin / admin123
```

That's it. No Docker, no PostgreSQL, no Redis required. Everything runs in-process with in-memory storage.

To re-seed data from scratch:

```bash
bash start.sh --reseed
```

---

## Working Features

| Category | What Works |
|----------|-----------|
| **Backend Services** | 9 services running (gateway, ontology, objects, actions, multipass, datasets, admin, functions, aip) |
| **Pest Control Ontology** | 47 objects across 7 types (PestControlOrder, TechnicianAssignment, Customer, etc.) |
| **SearchJsonQueryV2** | 13 filter operators (eq, gt, lt, gte, lte, isNull, contains, startsWith, and, or, not, prefix, anyTerm) |
| **ObjectSet loadObjects** | 7 ObjectSet types (base, filter, union, intersect, subtract, searchAround, staticSet) |
| **Aggregations** | 6 metrics (min, max, avg, sum, count, approximateDistinct) |
| **Authentication** | OAuth2 PKCE + client_credentials flows; JWT tokens |
| **Business Actions** | 4 action types with real side effects (create, modify, delete objects) |
| **Linked Objects** | 8 link types with linked object navigation via searchAround |
| **AIP Chat** | Multi-turn chat with smart mock LLM that understands the ontology |
| **Workshop** | Operational dashboard with live object counts and status |
| **Compass** | Resource tree browser (spaces, projects, folders) |
| **Pipeline Builder** | 5 pre-built pipelines with DAG visualization |
| **Datasets** | 5 seeded datasets with branch and file management |
| **Functions** | 3 seeded TypeScript functions with execute endpoint |

---

## Architecture

```
                          +------------------+
                          |   app-console    |  Vite frontend
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
   |multipass| |ontology| |objects | |actions | |datasets| |   admin  |
   |  :8084  | | :8081  | | :8082  | | :8083  | | :8085  | |  :8087   |
   +---------+ +--------+ +--------+ +--------+ +--------+ +----------+
                    |                                |
              +-----+------+                   +-----+------+
              | functions  |                   |    aip     |
              |   :8088    |                   |   :8092    |
              +------------+                   +------------+

   All services use in-memory storage (no external databases required)
```

---

## Running Services

| Service | Port | Description |
|---------|------|-------------|
| `svc-gateway` | 8080 | API gateway -- routes requests, handles auth |
| `svc-ontology` | 8081 | Ontology CRUD -- object types, link types, action types |
| `svc-objects` | 8082 | Object storage -- CRUD, ObjectSet queries, aggregations |
| `svc-actions` | 8083 | Action execution -- validation, side effects |
| `svc-multipass` | 8084 | Authentication -- users, groups, tokens, OAuth2 |
| `svc-datasets` | 8085 | Dataset management -- files, schemas, branches |
| `svc-admin` | 8087 | Platform admin -- configuration, user management |
| `svc-functions` | 8088 | Functions -- user-defined TypeScript functions |
| `svc-aip` | 8092 | AI Platform -- mock LLM chat, embeddings |

> Services not currently started by `start.sh`: svc-compass (:8086), svc-webhooks (:8089), svc-media (:8090), svc-sentinel (:8091). These exist in the codebase but are not wired into the startup script.

---

## API Compatibility

All endpoints are served through the gateway at `http://localhost:8080` and follow Palantir's `/api/v2` prefix convention.

### Ontologies

```
GET    /api/v2/ontologies                              List ontologies
GET    /api/v2/ontologies/:rid                         Get ontology
```

### Object Types

```
GET    /api/v2/ontologies/:rid/objectTypes             List object types
GET    /api/v2/ontologies/:rid/objectTypes/:apiName    Get object type
```

### Objects

```
GET    /api/v2/ontologies/:rid/objects/:type           List objects
GET    /api/v2/ontologies/:rid/objects/:type/:pk       Get object
POST   /api/v2/ontologies/:rid/objectSets/loadObjects  Query via ObjectSet
POST   /api/v2/ontologies/:rid/objectSets/aggregate    Aggregate objects
```

### Linked Objects

```
GET    /api/v2/ontologies/:rid/objects/:type/:pk/links/:linkType
                                                        List linked objects
```

### Actions

```
GET    /api/v2/ontologies/:rid/actionTypes             List action types
POST   /api/v2/ontologies/:rid/actions/:action/apply   Apply action
POST   /api/v2/ontologies/:rid/actions/:action/validate  Validate action
```

### Datasets

```
GET    /api/v2/datasets                                List datasets
GET    /api/v2/datasets/:rid                           Get dataset
GET    /api/v2/datasets/:rid/branches                  List branches
```

### Functions

```
GET    /api/v2/functions                               List functions
POST   /api/v2/functions/:apiName/execute              Execute function
```

### Compass (Resource Navigation)

```
GET    /api/v2/compass/resources                       List root resources
GET    /api/v2/compass/resources/:rid/children         List children
```

### AIP (AI Platform)

```
POST   /api/v2/aip/chat                               Multi-turn chat
GET    /api/v2/aip/agents                              List agents
```

### Authentication

```
POST   /api/v2/auth/token                              Get access token (OAuth2)
GET    /api/v2/auth/me                                 Get current user
POST   /multipass/api/oauth2/token                     OAuth2 token endpoint
GET    /multipass/api/oauth2/authorize                  OAuth2 PKCE authorize
```

---

## Login Credentials

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | Administrator |

---

## Project Structure

```
openfoundry/
+-- apps/
|   +-- app-console/          Vite frontend console
|   +-- app-docs/             Documentation site
|   +-- app-workshop/         Low-code page builder
+-- conjure/                  Conjure YAML service definitions
+-- db/                       Database schemas (not used at runtime)
+-- deploy/                   Docker and Helm deployment configs
+-- packages/                 Shared libraries (28 packages)
+-- scripts/                  Build, migration, and seed scripts
+-- services/                 Microservices (13 defined, 9 active)
+-- tests/                    Integration and end-to-end tests
+-- start.sh                  One-command startup script
+-- turbo.json                Turborepo pipeline config
+-- pnpm-workspace.yaml       pnpm workspace definition
```

---

## Screenshots

> Screenshots coming soon. Start the platform with `bash start.sh` and visit http://localhost:3000 to see the console.

---

## Development

### Commands

```bash
# Start everything
bash start.sh

# Build all packages and services
pnpm build

# Run unit tests
pnpm test

# Lint all packages
pnpm lint

# Type-check all packages
pnpm typecheck
```

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 10.27.0

No Docker or external databases required for local development.

---

## Contributing

We welcome contributions of all kinds.

1. **Fork** the repository and create a feature branch.
2. **Install** dependencies with `pnpm install`.
3. **Make your changes** -- add tests for new functionality.
4. **Run checks**: `pnpm build && pnpm test && pnpm lint && pnpm typecheck`.
5. **Submit a pull request** with a clear description of the change.

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
