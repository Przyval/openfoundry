import { CodeBlock } from "../components/CodeBlock";

export function GettingStarted() {
  return (
    <article className="doc-article">
      <h1>Getting Started</h1>
      <p className="doc-lead">
        OpenFoundry is an open-source data platform with an ontology-first architecture.
        This guide will walk you through setting up a local development environment and
        making your first API call.
      </p>

      <h2 id="prerequisites">Prerequisites</h2>
      <p>Before you begin, make sure you have the following installed:</p>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Tool</th>
            <th>Minimum Version</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Node.js</td>
            <td>20.0.0+</td>
            <td>JavaScript runtime for all services and packages</td>
          </tr>
          <tr>
            <td>pnpm</td>
            <td>10.27.0+</td>
            <td>Package manager (configured via <code>packageManager</code> field)</td>
          </tr>
          <tr>
            <td>Docker &amp; Docker Compose</td>
            <td>24.0+</td>
            <td>Required for PostgreSQL, Redis, and Traefik in development</td>
          </tr>
          <tr>
            <td>Git</td>
            <td>2.40+</td>
            <td>Version control</td>
          </tr>
        </tbody>
      </table>

      <h2 id="quick-start">Quick Start</h2>

      <h3>1. Clone the repository</h3>
      <CodeBlock language="bash">{`
git clone https://github.com/openfoundry/openfoundry.git
cd openfoundry
      `}</CodeBlock>

      <h3>2. Install dependencies</h3>
      <CodeBlock language="bash">{`
pnpm install
      `}</CodeBlock>
      <p>
        This installs all dependencies across the monorepo. The workspace is managed by
        pnpm with Turborepo orchestrating the build pipeline.
      </p>

      <h3>3. Start infrastructure services</h3>
      <CodeBlock language="bash">{`
pnpm docker:up
      `}</CodeBlock>
      <p>
        This starts the development Docker Compose stack defined
        in <code>deploy/docker-compose.dev.yml</code>, which includes:
      </p>
      <ul>
        <li><strong>PostgreSQL 16</strong> with pgvector extension (port 5432)</li>
        <li><strong>Redis 7</strong> for caching, sessions, and pub/sub (port 6379)</li>
        <li><strong>Traefik v3</strong> as reverse proxy and API gateway (port 80, dashboard on 8080)</li>
      </ul>

      <h3>4. Run database migrations</h3>
      <CodeBlock language="bash">{`
pnpm db:migrate
      `}</CodeBlock>

      <h3>5. Start all services in development mode</h3>
      <CodeBlock language="bash">{`
pnpm dev
      `}</CodeBlock>
      <p>
        Turborepo will start all services and apps in watch mode. The API gateway
        will be available at <code>http://localhost:8080</code> and the console
        at <code>http://localhost:3000</code>.
      </p>

      <h2 id="first-api-call">Your First API Call</h2>
      <p>
        Once the platform is running, you can make your first API call. The gateway
        service routes requests to the appropriate backend service.
      </p>

      <h3>Check the health endpoint</h3>
      <CodeBlock language="bash">{`
curl http://localhost:8080/health
      `}</CodeBlock>
      <CodeBlock language="json" title="Response">{`
{
  "status": "healthy",
  "version": "0.1.0",
  "services": {
    "gateway": "healthy",
    "postgres": "healthy",
    "redis": "healthy"
  }
}
      `}</CodeBlock>

      <h3>Authenticate and get a token</h3>
      <CodeBlock language="bash">{`
curl -X POST http://localhost:8080/api/multipass/v1/tokens \\
  -H "Content-Type: application/json" \\
  -d '{"clientId": "dev-client", "clientSecret": "dev-secret"}'
      `}</CodeBlock>
      <CodeBlock language="json" title="Response">{`
{
  "accessToken": "eyJhbGciOiJFUzI1NiIs...",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
      `}</CodeBlock>

      <h3>List object types from the ontology</h3>
      <CodeBlock language="bash">{`
curl http://localhost:8080/api/ontology/v1/objectTypes \\
  -H "Authorization: Bearer <your-token>"
      `}</CodeBlock>
      <CodeBlock language="json" title="Response">{`
{
  "data": [],
  "nextPageToken": null
}
      `}</CodeBlock>
      <p>
        The response is empty because no ontology has been registered yet. See
        the <a href="/ontology-guide">Ontology Guide</a> to learn how to define
        object types and register them with the platform.
      </p>

      <h2 id="project-structure">Project Structure</h2>
      <CodeBlock language="text">{`
openfoundry/
  apps/
    app-console/       Console UI (Vite + React + Blueprint)
    app-docs/          Documentation portal (Vite + React)
    app-workshop/      Component workshop
  packages/
    api-types/         TypeScript types for all API endpoints
    auth-tokens/       JWT token creation and validation
    client/            HTTP client with layered fetch wrapping
    config/            Configuration loader
    conjure-codegen/   TypeScript client code generation from Conjure IR
    conjure-compiler/  Conjure definition compiler
    conjure-ir/        Conjure Intermediate Representation types
    errors/            Structured error types
    health/            Health check types and utilities
    logging/           Structured JSON logging with SafeArg/UnsafeArg
    markings/          Classification-based access control (CBAC)
    object-set/        ObjectSet query builder with typed operations
    ontology-generator/  TypeScript SDK code generation from OntologyIr
    ontology-ir/       Ontology intermediate representation
    ontology-maker/    TypeScript DSL for defining ontologies
    ontology-schema/   Core ontology type system
    pagination/        Pagination utilities
    permissions/       Role-based access control model
    rid/               Resource Identifier (RID) system
    sdk/               SDK packages (Node.js and React)
    test-utils/        Shared test utilities
    tracing/           Distributed tracing with Zipkin B3 propagation
    ui/                Shared UI components
    wire/              Wire protocol types
  services/
    svc-gateway/       API Gateway (Fastify)
    svc-multipass/     Authentication and token management
    svc-ontology/      Ontology CRUD and validation
    svc-objects/       Object storage and retrieval
    svc-actions/       Action execution engine
    svc-datasets/      Dataset management
    svc-compass/       Search and discovery
    svc-admin/         Administration and user management
    svc-functions/     Serverless function execution
    svc-webhooks/      Webhook delivery
    svc-media/         Media and file storage
    svc-sentinel/      Security monitoring and audit
  deploy/
    docker/            Dockerfile.service (multi-stage build)
    docker-compose.dev.yml   Development infrastructure
    helm/              Kubernetes Helm charts
  db/
    migrations/        SQL migration files
  scripts/
    migrate.js         Migration runner
    seed.js            Database seeder
      `}</CodeBlock>

      <h2 id="useful-commands">Useful Commands</h2>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>pnpm dev</code></td>
            <td>Start all services and apps in watch mode</td>
          </tr>
          <tr>
            <td><code>pnpm build</code></td>
            <td>Build all packages, services, and apps</td>
          </tr>
          <tr>
            <td><code>pnpm test</code></td>
            <td>Run all tests via Vitest</td>
          </tr>
          <tr>
            <td><code>pnpm lint</code></td>
            <td>Lint all packages</td>
          </tr>
          <tr>
            <td><code>pnpm typecheck</code></td>
            <td>Run TypeScript type checking</td>
          </tr>
          <tr>
            <td><code>pnpm format</code></td>
            <td>Format code with Prettier</td>
          </tr>
          <tr>
            <td><code>pnpm docker:up</code></td>
            <td>Start development infrastructure (Postgres, Redis, Traefik)</td>
          </tr>
          <tr>
            <td><code>pnpm docker:down</code></td>
            <td>Stop development infrastructure</td>
          </tr>
          <tr>
            <td><code>pnpm db:migrate</code></td>
            <td>Run database migrations</td>
          </tr>
          <tr>
            <td><code>pnpm db:seed</code></td>
            <td>Seed the database with sample data</td>
          </tr>
          <tr>
            <td><code>pnpm changeset</code></td>
            <td>Create a changeset for versioning</td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
