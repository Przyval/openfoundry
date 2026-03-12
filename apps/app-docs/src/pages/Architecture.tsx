import { CodeBlock } from "../components/CodeBlock";

export function Architecture() {
  return (
    <article className="doc-article">
      <h1>Architecture Overview</h1>
      <p className="doc-lead">
        OpenFoundry follows an ontology-first, service-oriented architecture. Every
        piece of data on the platform is modeled through a strongly-typed ontology
        layer, which drives code generation, API contracts, and the query engine.
      </p>

      <h2 id="system-diagram">System Diagram</h2>
      <CodeBlock language="text" title="High-Level Architecture">{`
                         +---------------------+
                         |     Clients          |
                         | (Console, SDK, CLI)  |
                         +----------+----------+
                                    |
                                    v
                         +----------+----------+
                         |    svc-gateway       |
                         |  (Fastify + Auth)    |
                         +----------+----------+
                                    |
            +-----------+-----------+-----------+-----------+
            |           |           |           |           |
            v           v           v           v           v
      +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
      | svc-      | | svc-      | | svc-      | | svc-      | | svc-      |
      | multipass | | ontology  | | objects   | | actions   | | datasets  |
      | (Auth)    | | (Schema)  | | (CRUD)    | | (Execute) | | (Data)    |
      +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
            |           |           |           |           |
            +-----------+-----------+-----------+-----------+
            |           |           |           |           |
            v           v           v           v           v
      +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
      | svc-      | | svc-      | | svc-      | | svc-      | | svc-      |
      | compass   | | admin     | | functions | | webhooks  | | media     |
      | (Search)  | | (Manage)  | | (Compute) | | (Events)  | | (Files)   |
      +-----------+ +-----------+ +-----------+ +-----------+ +-----------+
                                    |
                         +----------+----------+
                         |     svc-sentinel     |
                         |  (Audit & Security)  |
                         +----------+----------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
      +-----------+                                   +-----------+
      | PostgreSQL |                                  |   Redis    |
      | (pgvector) |                                  |  (Cache)   |
      +-----------+                                   +-----------+
      `}</CodeBlock>

      <h2 id="services">Services</h2>
      <p>
        Each service is an independent Node.js application built with Fastify. Services
        communicate via HTTP and are fronted by the API gateway.
      </p>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Port</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>svc-gateway</code></td>
            <td>8080</td>
            <td>
              API Gateway and main entry point. Routes requests to backend services,
              handles CORS, rate limiting, and request validation. Built on Fastify
              with Helmet for security headers.
            </td>
          </tr>
          <tr>
            <td><code>svc-multipass</code></td>
            <td>3010</td>
            <td>
              Authentication and token management. Issues JWT bearer tokens, manages
              OAuth2 client credentials, and validates token claims and scopes.
            </td>
          </tr>
          <tr>
            <td><code>svc-ontology</code></td>
            <td>3011</td>
            <td>
              Ontology CRUD and validation. Manages object type definitions, action
              types, link types, interface types, and query types. Validates schema
              changes against the ontology type system.
            </td>
          </tr>
          <tr>
            <td><code>svc-objects</code></td>
            <td>3012</td>
            <td>
              Object storage and retrieval. Handles CRUD operations on object instances,
              supports typed property access, and enforces ontology constraints on writes.
            </td>
          </tr>
          <tr>
            <td><code>svc-actions</code></td>
            <td>3013</td>
            <td>
              Action execution engine. Validates action parameters against their type
              definition, applies actions to objects, and records action audit logs.
            </td>
          </tr>
          <tr>
            <td><code>svc-datasets</code></td>
            <td>3014</td>
            <td>
              Dataset management. Organizes objects into datasets, manages dataset
              schemas, and handles bulk import/export operations.
            </td>
          </tr>
          <tr>
            <td><code>svc-compass</code></td>
            <td>3015</td>
            <td>
              Search and discovery. Provides full-text search across objects, supports
              ObjectSet queries with filters, and integrates pgvector for semantic search.
            </td>
          </tr>
          <tr>
            <td><code>svc-admin</code></td>
            <td>3016</td>
            <td>
              Administration and user management. Manages users, groups, roles, and
              platform-level settings. Controls enrollment and access policies.
            </td>
          </tr>
          <tr>
            <td><code>svc-functions</code></td>
            <td>3017</td>
            <td>
              Serverless function execution. Runs user-defined TypeScript functions
              in a sandboxed environment with access to the platform SDK.
            </td>
          </tr>
          <tr>
            <td><code>svc-webhooks</code></td>
            <td>3018</td>
            <td>
              Webhook delivery. Manages webhook subscriptions and delivers event
              notifications to external systems with retry logic.
            </td>
          </tr>
          <tr>
            <td><code>svc-media</code></td>
            <td>3019</td>
            <td>
              Media and file storage. Handles file uploads, manages attachments
              and media references on objects, and serves file downloads.
            </td>
          </tr>
          <tr>
            <td><code>svc-sentinel</code></td>
            <td>3020</td>
            <td>
              Security monitoring and audit. Collects audit logs from all services,
              enforces classification-based access control (CBAC) markings, and
              monitors for anomalous access patterns.
            </td>
          </tr>
        </tbody>
      </table>

      <h2 id="packages">Package Dependency Map</h2>
      <p>
        Shared packages live in the <code>packages/</code> directory. They are
        published to npm under the <code>@openfoundry</code> scope. Internal
        packages use <code>workspace:*</code> protocol for linking.
      </p>
      <CodeBlock language="text" title="Package Dependency Graph">{`
  Ontology Pipeline
  -----------------
  ontology-maker  -->  ontology-schema
                  -->  ontology-ir  -->  ontology-generator (codegen)
  conjure-ir  -->  conjure-codegen  -->  conjure-compiler

  Platform Core
  -------------
  rid                (no dependencies)
  errors         -->  rid
  auth-tokens    -->  jose (external)
  client         -->  errors, auth-tokens
  config             (no dependencies)
  health             (no dependencies)
  logging            (no dependencies)
  tracing            (no dependencies)
  pagination         (no dependencies)
  wire               (no dependencies)

  Access Control
  --------------
  permissions        (no dependencies)
  markings           (no dependencies)

  Query Layer
  -----------
  object-set         (no dependencies — pure type definitions)
  api-types          (no dependencies — pure type definitions)

  SDK Layer
  ---------
  sdk/           -->  client, api-types, object-set, ontology-schema

  UI Layer
  --------
  ui/            -->  react, react-dom
      `}</CodeBlock>

      <h2 id="data-flow">Data Flow</h2>
      <p>
        This section describes the lifecycle of a typical API request from client to
        database and back.
      </p>

      <h3>1. Request ingress</h3>
      <p>
        A client (console UI, SDK, or external HTTP call) sends a request
        to <code>svc-gateway</code>. The gateway validates the bearer token
        by calling <code>svc-multipass</code>, checks scopes against the
        requested endpoint, and forwards the request to the appropriate service.
      </p>

      <h3>2. Ontology validation</h3>
      <p>
        Write operations are validated against the ontology. For example, creating
        an object requires that the object type exists in <code>svc-ontology</code>,
        that all required properties are present, and that property values match
        their declared types (STRING, INTEGER, TIMESTAMP, etc.).
      </p>

      <h3>3. Object storage</h3>
      <p>
        The target service (e.g., <code>svc-objects</code>) persists the data in
        PostgreSQL. Each object is stored with a unique Resource Identifier (RID)
        generated by the <code>@openfoundry/rid</code> package, which encodes the
        service origin, resource type, and a unique locator.
      </p>

      <h3>4. Side effects</h3>
      <p>
        After a successful write, the service may trigger side effects:
      </p>
      <ul>
        <li>
          <strong>Search indexing</strong> - <code>svc-compass</code> updates its search
          index (including pgvector embeddings for semantic search).
        </li>
        <li>
          <strong>Webhook delivery</strong> - <code>svc-webhooks</code> dispatches event
          notifications to subscribed endpoints.
        </li>
        <li>
          <strong>Audit logging</strong> - <code>svc-sentinel</code> records the operation
          for compliance and security monitoring.
        </li>
        <li>
          <strong>Cache invalidation</strong> - Redis cache entries for affected objects
          are invalidated.
        </li>
      </ul>

      <h3>5. Response</h3>
      <p>
        The response flows back through the gateway to the client. Responses include
        structured error codes (from <code>@openfoundry/errors</code>) and pagination
        tokens for list endpoints.
      </p>

      <h2 id="technology-choices">Technology Choices</h2>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Layer</th>
            <th>Technology</th>
            <th>Rationale</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Runtime</td>
            <td>Node.js 22 (Alpine)</td>
            <td>Unified language across frontend and backend; fast startup for microservices</td>
          </tr>
          <tr>
            <td>HTTP Framework</td>
            <td>Fastify 5</td>
            <td>High-performance, schema-based validation, plugin ecosystem</td>
          </tr>
          <tr>
            <td>Database</td>
            <td>PostgreSQL 16 + pgvector</td>
            <td>ACID transactions, JSON support, vector similarity search</td>
          </tr>
          <tr>
            <td>Cache</td>
            <td>Redis 7</td>
            <td>In-memory caching, pub/sub for inter-service communication, session storage</td>
          </tr>
          <tr>
            <td>Build System</td>
            <td>Turborepo + pnpm</td>
            <td>Monorepo task orchestration with caching; efficient workspace dependency management</td>
          </tr>
          <tr>
            <td>Language</td>
            <td>TypeScript 5.5</td>
            <td>Type safety across the entire stack; ontology types flow from schema to SDK</td>
          </tr>
          <tr>
            <td>Testing</td>
            <td>Vitest</td>
            <td>Fast, ESM-native test runner with TypeScript support out of the box</td>
          </tr>
          <tr>
            <td>Containers</td>
            <td>Docker + Buildx</td>
            <td>Multi-stage builds with Turbo prune for minimal production images</td>
          </tr>
          <tr>
            <td>Orchestration</td>
            <td>Kubernetes + Helm</td>
            <td>Production deployment with templated charts per service</td>
          </tr>
          <tr>
            <td>Proxy</td>
            <td>Traefik v3</td>
            <td>Dynamic reverse proxy with Docker provider for local development</td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
