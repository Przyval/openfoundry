import { CodeBlock } from "../components/CodeBlock";

export function DeploymentGuide() {
  return (
    <article className="doc-article">
      <h1>Deployment Guide</h1>
      <p className="doc-lead">
        This guide covers deploying OpenFoundry using Docker Compose for development
        and staging environments, and Kubernetes with Helm for production.
      </p>

      <h2 id="docker-compose">Docker Compose (Development)</h2>
      <p>
        The development Docker Compose stack is defined
        in <code>deploy/docker-compose.dev.yml</code>. It provides the infrastructure
        services needed to run OpenFoundry locally.
      </p>

      <h3>Starting the stack</h3>
      <CodeBlock language="bash">{`
# Start all infrastructure services
pnpm docker:up

# Or use docker compose directly
docker compose -f deploy/docker-compose.dev.yml up -d
      `}</CodeBlock>

      <h3>Infrastructure services</h3>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Image</th>
            <th>Port</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>PostgreSQL</td>
            <td><code>pgvector/pgvector:pg16</code></td>
            <td>5432</td>
            <td>Primary database with vector extension</td>
          </tr>
          <tr>
            <td>Redis</td>
            <td><code>redis:7-alpine</code></td>
            <td>6379</td>
            <td>Caching, sessions, pub/sub</td>
          </tr>
          <tr>
            <td>Traefik</td>
            <td><code>traefik:v3.2</code></td>
            <td>80, 443, 8080</td>
            <td>Reverse proxy, dashboard on port 8080</td>
          </tr>
        </tbody>
      </table>

      <h3>Default credentials (development only)</h3>
      <CodeBlock language="text">{`
PostgreSQL:
  Host:     localhost:5432
  User:     openfoundry
  Password: openfoundry_dev
  Database: openfoundry

Redis:
  Host:     localhost:6379
  No password (development mode)
      `}</CodeBlock>

      <h3>Stopping the stack</h3>
      <CodeBlock language="bash">{`
# Stop and remove containers (preserves volumes)
pnpm docker:down

# Stop and remove everything including volumes
docker compose -f deploy/docker-compose.dev.yml down -v
      `}</CodeBlock>

      <h2 id="docker-images">Building Docker Images</h2>
      <p>
        Each service is built using the multi-stage
        Dockerfile at <code>deploy/docker/Dockerfile.service</code>. The build process
        uses Turborepo's <code>turbo prune</code> to create minimal images that include
        only the target service and its dependencies.
      </p>

      <h3>Build stages</h3>
      <ol>
        <li>
          <strong>Pruner</strong> - Uses <code>turbo prune --scope=SERVICE --docker</code> to
          extract only the files needed for the target service
        </li>
        <li>
          <strong>Installer</strong> - Installs dependencies and runs <code>turbo build</code> for
          the service
        </li>
        <li>
          <strong>Production deps</strong> - Installs only production dependencies
        </li>
        <li>
          <strong>Runtime</strong> - Minimal Node.js 22 Alpine image with non-root user
        </li>
      </ol>

      <h3>Build a single service</h3>
      <CodeBlock language="bash">{`
docker build \\
  -f deploy/docker/Dockerfile.service \\
  --build-arg SERVICE=svc-gateway \\
  -t openfoundry/svc-gateway:latest .
      `}</CodeBlock>

      <h3>Build all services</h3>
      <CodeBlock language="bash">{`
SERVICES=(
  svc-gateway svc-multipass svc-ontology svc-objects
  svc-actions svc-datasets svc-compass svc-admin
  svc-functions svc-webhooks svc-media svc-sentinel
)

for svc in "\${SERVICES[@]}"; do
  docker build \\
    -f deploy/docker/Dockerfile.service \\
    --build-arg SERVICE="$svc" \\
    -t "openfoundry/$svc:latest" .
done
      `}</CodeBlock>

      <h3>Image features</h3>
      <ul>
        <li>Runs as non-root user (<code>openfoundry:1001</code>)</li>
        <li>Built-in health check endpoint at <code>/health</code></li>
        <li>Exposes port 3000 by default</li>
        <li>Production <code>NODE_ENV=production</code></li>
        <li>Uses <code>--frozen-lockfile</code> for reproducible builds</li>
      </ul>

      <h2 id="ci-cd">CI/CD Pipeline</h2>
      <p>
        The CI/CD pipeline is defined in <code>.github/workflows/</code> and consists
        of three workflow files:
      </p>

      <h3>ci.yml - PR checks</h3>
      <p>
        Runs on every pull request and push to <code>main</code>. Executes four
        parallel jobs: lint, typecheck, test, and build.
      </p>

      <h3>release.yml - Changesets publish</h3>
      <p>
        Runs on push to <code>main</code>. Uses the Changesets GitHub Action to
        automatically version and publish packages to npm when changesets are merged.
      </p>

      <h3>docker.yml - Docker image builds</h3>
      <p>
        Runs on push to <code>main</code> and version tags (<code>v*</code>). Builds
        Docker images for all 12 services in parallel using a matrix strategy, then
        pushes them to GitHub Container Registry (ghcr.io).
      </p>

      <h2 id="kubernetes">Kubernetes with Helm</h2>
      <p>
        For production deployments, OpenFoundry provides Helm charts
        in <code>deploy/helm/</code>. Each service is deployed as an independent
        Kubernetes Deployment with its own Service and optional Ingress.
      </p>

      <h3>Prerequisites</h3>
      <ul>
        <li>Kubernetes cluster (1.28+)</li>
        <li>Helm 3.12+</li>
        <li>kubectl configured for your cluster</li>
        <li>Container registry access (ghcr.io or your own registry)</li>
      </ul>

      <h3>Install the chart</h3>
      <CodeBlock language="bash">{`
helm install openfoundry deploy/helm/openfoundry \\
  --namespace openfoundry \\
  --create-namespace \\
  --values deploy/helm/openfoundry/values-production.yaml
      `}</CodeBlock>

      <h3>Key Helm values</h3>
      <CodeBlock language="yaml" title="values-production.yaml (example)">{`
global:
  image:
    registry: ghcr.io
    repository: openfoundry/openfoundry
    tag: "latest"
  postgresql:
    host: your-postgres-host.rds.amazonaws.com
    port: 5432
    database: openfoundry
    existingSecret: openfoundry-db-credentials
  redis:
    host: your-redis-host.cache.amazonaws.com
    port: 6379
    existingSecret: openfoundry-redis-credentials

gateway:
  replicas: 2
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: 1000m
      memory: 512Mi
  ingress:
    enabled: true
    host: api.openfoundry.your-domain.com
    tls: true
    certManager: true

multipass:
  replicas: 2

ontology:
  replicas: 2

objects:
  replicas: 3

actions:
  replicas: 2

datasets:
  replicas: 2

compass:
  replicas: 2

admin:
  replicas: 1

functions:
  replicas: 2

webhooks:
  replicas: 2

media:
  replicas: 2

sentinel:
  replicas: 1
      `}</CodeBlock>

      <h3>Upgrade a deployment</h3>
      <CodeBlock language="bash">{`
helm upgrade openfoundry deploy/helm/openfoundry \\
  --namespace openfoundry \\
  --values deploy/helm/openfoundry/values-production.yaml \\
  --set global.image.tag="abc123"
      `}</CodeBlock>

      <h2 id="environment-variables">Environment Variables</h2>
      <p>
        All services share a common set of environment variables loaded by
        the <code>@openfoundry/config</code> package. Service-specific variables
        are prefixed with the service name.
      </p>

      <h3>Common variables</h3>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Variable</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>NODE_ENV</code></td>
            <td>development</td>
            <td>Runtime environment (development, production, test)</td>
          </tr>
          <tr>
            <td><code>PORT</code></td>
            <td>3000</td>
            <td>HTTP port for the service</td>
          </tr>
          <tr>
            <td><code>LOG_LEVEL</code></td>
            <td>info</td>
            <td>Logging level (debug, info, warn, error)</td>
          </tr>
          <tr>
            <td><code>DATABASE_URL</code></td>
            <td>-</td>
            <td>PostgreSQL connection string</td>
          </tr>
          <tr>
            <td><code>REDIS_URL</code></td>
            <td>-</td>
            <td>Redis connection string</td>
          </tr>
          <tr>
            <td><code>JWT_SECRET</code></td>
            <td>-</td>
            <td>Secret key for JWT token signing (Multipass)</td>
          </tr>
          <tr>
            <td><code>GATEWAY_URL</code></td>
            <td>http://localhost:8080</td>
            <td>URL of the API gateway (for inter-service calls)</td>
          </tr>
        </tbody>
      </table>

      <h3>Service-specific variables</h3>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Variable</th>
            <th>Service</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>MULTIPASS_TOKEN_EXPIRY</code></td>
            <td>svc-multipass</td>
            <td>Token expiration time in seconds (default: 3600)</td>
          </tr>
          <tr>
            <td><code>COMPASS_EMBEDDING_MODEL</code></td>
            <td>svc-compass</td>
            <td>Model used for generating vector embeddings</td>
          </tr>
          <tr>
            <td><code>MEDIA_STORAGE_BACKEND</code></td>
            <td>svc-media</td>
            <td>Storage backend: "local" or "s3"</td>
          </tr>
          <tr>
            <td><code>MEDIA_S3_BUCKET</code></td>
            <td>svc-media</td>
            <td>S3 bucket name for media storage</td>
          </tr>
          <tr>
            <td><code>WEBHOOKS_MAX_RETRIES</code></td>
            <td>svc-webhooks</td>
            <td>Maximum delivery attempts for webhooks (default: 5)</td>
          </tr>
          <tr>
            <td><code>FUNCTIONS_TIMEOUT_MS</code></td>
            <td>svc-functions</td>
            <td>Execution timeout for serverless functions (default: 30000)</td>
          </tr>
          <tr>
            <td><code>SENTINEL_RETENTION_DAYS</code></td>
            <td>svc-sentinel</td>
            <td>Audit log retention period in days (default: 90)</td>
          </tr>
        </tbody>
      </table>

      <h2 id="database-migrations">Database Migrations</h2>
      <p>
        Database migrations are stored in <code>db/migrations/</code> and are run
        using the migration script:
      </p>
      <CodeBlock language="bash">{`
# Run all pending migrations
pnpm db:migrate

# Seed the database with sample data (development only)
pnpm db:seed
      `}</CodeBlock>
      <p>
        In the Docker Compose development stack, migrations in <code>db/migrations/</code> are
        automatically applied on first boot via
        the <code>docker-entrypoint-initdb.d</code> volume mount.
      </p>
      <p>
        For production Kubernetes deployments, run migrations as a Job before
        upgrading the Helm release:
      </p>
      <CodeBlock language="bash">{`
kubectl run openfoundry-migrate \\
  --namespace openfoundry \\
  --image ghcr.io/openfoundry/openfoundry/svc-admin:latest \\
  --restart=Never \\
  --env DATABASE_URL="$DATABASE_URL" \\
  -- node scripts/migrate.js
      `}</CodeBlock>

      <h2 id="monitoring">Monitoring and Observability</h2>
      <p>
        Every service exposes a <code>/health</code> endpoint for liveness and readiness
        probes. The health check module from <code>@openfoundry/health</code> reports
        the status of database and Redis connections.
      </p>
      <ul>
        <li>
          <strong>Structured logging</strong> via <code>@openfoundry/logging</code> outputs
          JSON logs with SafeArg/UnsafeArg classification for sensitive data handling
        </li>
        <li>
          <strong>Distributed tracing</strong> via <code>@openfoundry/tracing</code> propagates
          Zipkin B3-compatible trace headers across service calls
        </li>
        <li>
          <strong>Audit trail</strong> via <code>svc-sentinel</code> captures all
          write operations for compliance and security review
        </li>
      </ul>
    </article>
  );
}
