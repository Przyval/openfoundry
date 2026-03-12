import { CodeBlock } from "../components/CodeBlock";

export function ApiReference() {
  return (
    <article className="doc-article">
      <h1>API Reference</h1>
      <p className="doc-lead">
        All API endpoints are accessed through the gateway
        at <code>http://localhost:8080</code> in development. Every request
        (except health checks and token creation) requires a
        valid <code>Authorization: Bearer</code> header.
      </p>

      <h2 id="authentication">Authentication</h2>
      <p>
        OpenFoundry uses JWT bearer tokens issued by the Multipass service. Tokens
        carry claims that encode the caller's identity, scopes, and organization
        membership.
      </p>

      <h3>Obtain a token</h3>
      <CodeBlock language="bash">{`
curl -X POST http://localhost:8080/api/multipass/v1/tokens \\
  -H "Content-Type: application/json" \\
  -d '{
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret"
  }'
      `}</CodeBlock>
      <CodeBlock language="json" title="Response">{`
{
  "accessToken": "eyJhbGciOiJFUzI1NiIs...",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
      `}</CodeBlock>
      <p>
        Include the token in subsequent requests:
      </p>
      <CodeBlock language="bash">{`
curl http://localhost:8080/api/ontology/v1/objectTypes \\
  -H "Authorization: Bearer eyJhbGciOiJFUzI1NiIs..."
      `}</CodeBlock>

      <h3>Token scopes</h3>
      <p>
        Scopes control which API operations a token is authorized to perform.
        Request specific scopes when creating a token:
      </p>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Scope</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>ontology:read</code></td><td>Read ontology definitions</td></tr>
          <tr><td><code>ontology:write</code></td><td>Create and modify ontology definitions</td></tr>
          <tr><td><code>objects:read</code></td><td>Read object instances</td></tr>
          <tr><td><code>objects:write</code></td><td>Create, update, and delete objects</td></tr>
          <tr><td><code>actions:execute</code></td><td>Execute actions</td></tr>
          <tr><td><code>datasets:read</code></td><td>Read datasets</td></tr>
          <tr><td><code>datasets:write</code></td><td>Create and modify datasets</td></tr>
          <tr><td><code>admin:read</code></td><td>Read administration data</td></tr>
          <tr><td><code>admin:write</code></td><td>Modify administration settings</td></tr>
          <tr><td><code>media:read</code></td><td>Download media files</td></tr>
          <tr><td><code>media:write</code></td><td>Upload media files</td></tr>
          <tr><td><code>functions:execute</code></td><td>Execute serverless functions</td></tr>
        </tbody>
      </table>

      <hr />

      <h2 id="multipass">Multipass (Authentication)</h2>
      <p>Base path: <code>/api/multipass/v1</code></p>

      <h3>POST /tokens</h3>
      <p>Create a new bearer token using client credentials.</p>
      <CodeBlock language="json" title="Request Body">{`
{
  "clientId": "string",
  "clientSecret": "string",
  "scopes": ["ontology:read", "objects:read"]
}
      `}</CodeBlock>
      <CodeBlock language="json" title="Response 200">{`
{
  "accessToken": "string",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
      `}</CodeBlock>

      <h3>POST /tokens/revoke</h3>
      <p>Revoke an existing token.</p>
      <CodeBlock language="json" title="Request Body">{`
{
  "token": "string"
}
      `}</CodeBlock>

      <h3>GET /tokens/introspect</h3>
      <p>Introspect a token to get its claims and validity.</p>
      <CodeBlock language="json" title="Response 200">{`
{
  "active": true,
  "sub": "user-rid",
  "scopes": ["ontology:read"],
  "exp": 1700000000,
  "iat": 1699996400
}
      `}</CodeBlock>

      <hr />

      <h2 id="ontology">Ontology Service</h2>
      <p>Base path: <code>/api/ontology/v1</code></p>

      <h3>GET /objectTypes</h3>
      <p>List all registered object types. Supports pagination.</p>
      <CodeBlock language="json" title="Response 200">{`
{
  "data": [
    {
      "apiName": "Employee",
      "description": "Represents an employee in the organization",
      "primaryKeyApiName": "employeeId",
      "primaryKeyType": "STRING",
      "titlePropertyApiName": "fullName",
      "status": "ACTIVE",
      "properties": {
        "employeeId": { "type": "STRING", "description": "Unique employee ID" },
        "fullName": { "type": "STRING", "description": "Full name" },
        "startDate": { "type": "DATE", "description": "Employment start date" },
        "salary": { "type": "DOUBLE", "description": "Annual salary" }
      }
    }
  ],
  "nextPageToken": "eyJvZmZzZXQiOjEwfQ=="
}
      `}</CodeBlock>

      <h3>GET /objectTypes/:apiName</h3>
      <p>Get a single object type by its API name.</p>

      <h3>POST /objectTypes</h3>
      <p>Register a new object type. Requires <code>ontology:write</code> scope.</p>
      <CodeBlock language="json" title="Request Body">{`
{
  "apiName": "Employee",
  "description": "Represents an employee",
  "primaryKeyApiName": "employeeId",
  "primaryKeyType": "STRING",
  "titlePropertyApiName": "fullName",
  "properties": {
    "employeeId": { "type": "STRING", "description": "Unique employee ID" },
    "fullName": { "type": "STRING", "description": "Full name" },
    "startDate": { "type": "DATE", "description": "Start date" }
  }
}
      `}</CodeBlock>

      <h3>PUT /objectTypes/:apiName</h3>
      <p>Update an existing object type definition.</p>

      <h3>DELETE /objectTypes/:apiName</h3>
      <p>Delete an object type. Fails if objects of this type exist.</p>

      <h3>GET /actionTypes</h3>
      <p>List all action type definitions.</p>

      <h3>POST /actionTypes</h3>
      <p>Register a new action type.</p>

      <h3>GET /linkTypes</h3>
      <p>List all link type definitions.</p>

      <h3>POST /linkTypes</h3>
      <p>Register a new link type between object types.</p>

      <h3>GET /interfaceTypes</h3>
      <p>List all interface type definitions.</p>

      <h3>GET /queryTypes</h3>
      <p>List all registered query types.</p>

      <hr />

      <h2 id="objects">Objects Service</h2>
      <p>Base path: <code>/api/objects/v1</code></p>

      <h3>GET /objects/:objectType</h3>
      <p>List objects of a given type. Supports pagination and field selection.</p>
      <CodeBlock language="text" title="Query Parameters">{`
pageSize     (number)   Number of results per page (default: 100, max: 1000)
pageToken    (string)   Pagination cursor from a previous response
orderBy      (string)   Property to sort by (e.g. "createdAt:desc")
select       (string[]) Comma-separated list of properties to return
      `}</CodeBlock>
      <CodeBlock language="json" title="Response 200">{`
{
  "data": [
    {
      "rid": "ri.objects.main.object.employee-001",
      "objectType": "Employee",
      "properties": {
        "employeeId": "E-001",
        "fullName": "Ada Lovelace",
        "startDate": "1843-01-01"
      }
    }
  ],
  "nextPageToken": null
}
      `}</CodeBlock>

      <h3>GET /objects/:objectType/:primaryKey</h3>
      <p>Get a single object by its type and primary key.</p>

      <h3>POST /objects/:objectType</h3>
      <p>Create a new object. Properties are validated against the ontology.</p>
      <CodeBlock language="json" title="Request Body">{`
{
  "properties": {
    "employeeId": "E-002",
    "fullName": "Grace Hopper",
    "startDate": "1944-07-01",
    "salary": 150000
  }
}
      `}</CodeBlock>

      <h3>PATCH /objects/:objectType/:primaryKey</h3>
      <p>Update specific properties on an existing object.</p>

      <h3>DELETE /objects/:objectType/:primaryKey</h3>
      <p>Delete an object by type and primary key.</p>

      <h3>POST /objects/search</h3>
      <p>Search objects using ObjectSet queries.</p>
      <CodeBlock language="json" title="Request Body">{`
{
  "objectSet": {
    "type": "filter",
    "objectSet": { "type": "base", "objectType": "Employee" },
    "filter": {
      "type": "gt",
      "field": "salary",
      "value": 100000
    }
  },
  "select": ["employeeId", "fullName", "salary"],
  "orderBy": { "field": "salary", "direction": "desc" },
  "pageSize": 50
}
      `}</CodeBlock>

      <hr />

      <h2 id="actions">Actions Service</h2>
      <p>Base path: <code>/api/actions/v1</code></p>

      <h3>POST /actions/:actionType/apply</h3>
      <p>Apply an action. Parameters are validated against the action type definition.</p>
      <CodeBlock language="json" title="Request Body">{`
{
  "parameters": {
    "employeeId": "E-001",
    "newSalary": 175000,
    "effectiveDate": "2025-01-01"
  }
}
      `}</CodeBlock>
      <CodeBlock language="json" title="Response 200">{`
{
  "actionRid": "ri.actions.main.action.abc123",
  "status": "COMPLETED",
  "modifiedObjects": [
    "ri.objects.main.object.employee-001"
  ]
}
      `}</CodeBlock>

      <h3>POST /actions/:actionType/validate</h3>
      <p>Validate action parameters without executing the action.</p>

      <hr />

      <h2 id="datasets">Datasets Service</h2>
      <p>Base path: <code>/api/datasets/v1</code></p>

      <h3>GET /datasets</h3>
      <p>List all datasets.</p>

      <h3>POST /datasets</h3>
      <p>Create a new dataset.</p>

      <h3>GET /datasets/:datasetRid</h3>
      <p>Get dataset details including schema and row count.</p>

      <h3>POST /datasets/:datasetRid/import</h3>
      <p>Bulk import data into a dataset.</p>

      <h3>GET /datasets/:datasetRid/export</h3>
      <p>Export dataset contents.</p>

      <hr />

      <h2 id="compass">Compass (Search)</h2>
      <p>Base path: <code>/api/compass/v1</code></p>

      <h3>POST /search</h3>
      <p>Full-text search across all object types.</p>
      <CodeBlock language="json" title="Request Body">{`
{
  "query": "quarterly revenue report",
  "objectTypes": ["Document", "Report"],
  "pageSize": 20
}
      `}</CodeBlock>

      <h3>POST /search/semantic</h3>
      <p>Vector similarity search using pgvector embeddings.</p>
      <CodeBlock language="json" title="Request Body">{`
{
  "query": "machine learning model performance",
  "objectTypes": ["Document"],
  "threshold": 0.75,
  "pageSize": 10
}
      `}</CodeBlock>

      <hr />

      <h2 id="functions">Functions Service</h2>
      <p>Base path: <code>/api/functions/v1</code></p>

      <h3>POST /functions/:functionRid/execute</h3>
      <p>Execute a registered serverless function.</p>
      <CodeBlock language="json" title="Request Body">{`
{
  "parameters": {
    "input": "value"
  }
}
      `}</CodeBlock>

      <h3>GET /functions</h3>
      <p>List all registered functions.</p>

      <h3>POST /functions</h3>
      <p>Register a new function.</p>

      <hr />

      <h2 id="media">Media Service</h2>
      <p>Base path: <code>/api/media/v1</code></p>

      <h3>POST /media/upload</h3>
      <p>Upload a file. Use <code>multipart/form-data</code> encoding.</p>

      <h3>GET /media/:mediaRid</h3>
      <p>Download a file by its media RID.</p>

      <h3>DELETE /media/:mediaRid</h3>
      <p>Delete a media attachment.</p>

      <hr />

      <h2 id="webhooks">Webhooks Service</h2>
      <p>Base path: <code>/api/webhooks/v1</code></p>

      <h3>GET /webhooks</h3>
      <p>List all webhook subscriptions.</p>

      <h3>POST /webhooks</h3>
      <p>Create a webhook subscription.</p>
      <CodeBlock language="json" title="Request Body">{`
{
  "url": "https://example.com/webhook",
  "events": ["object.created", "object.updated"],
  "objectTypes": ["Employee"],
  "secret": "webhook-signing-secret"
}
      `}</CodeBlock>

      <h3>DELETE /webhooks/:webhookId</h3>
      <p>Delete a webhook subscription.</p>

      <hr />

      <h2 id="admin">Admin Service</h2>
      <p>Base path: <code>/api/admin/v1</code></p>

      <h3>GET /users</h3>
      <p>List all users. Requires <code>admin:read</code> scope.</p>

      <h3>POST /users</h3>
      <p>Create a new user. Requires <code>admin:write</code> scope.</p>

      <h3>GET /groups</h3>
      <p>List all groups.</p>

      <h3>POST /groups</h3>
      <p>Create a new group.</p>

      <h3>GET /roles</h3>
      <p>List available roles and their permissions.</p>

      <hr />

      <h2 id="common">Common Patterns</h2>

      <h3>Error responses</h3>
      <p>
        All error responses follow a consistent structure using error codes
        from the <code>@openfoundry/errors</code> package:
      </p>
      <CodeBlock language="json" title="Error Response">{`
{
  "errorCode": "INVALID_ARGUMENT",
  "errorName": "ObjectType:PropertyTypeMismatch",
  "message": "Property 'salary' expected type DOUBLE but received STRING",
  "parameters": {
    "property": "salary",
    "expectedType": "DOUBLE",
    "receivedType": "STRING"
  }
}
      `}</CodeBlock>

      <h3>Pagination</h3>
      <p>
        List endpoints return paginated results. Use <code>pageToken</code> from
        the response to fetch the next page:
      </p>
      <CodeBlock language="bash">{`
# First page
curl "http://localhost:8080/api/objects/v1/objects/Employee?pageSize=10"

# Next page
curl "http://localhost:8080/api/objects/v1/objects/Employee?pageSize=10&pageToken=eyJvZmZzZXQiOjEwfQ=="
      `}</CodeBlock>

      <h3>Resource Identifiers (RIDs)</h3>
      <p>
        Every resource in OpenFoundry has a unique RID in the
        format <code>ri.&lt;service&gt;.&lt;instance&gt;.&lt;type&gt;.&lt;locator&gt;</code>.
        For example: <code>ri.objects.main.object.employee-001</code>.
      </p>

      <h3>Health check</h3>
      <CodeBlock language="bash">{`
curl http://localhost:8080/health
      `}</CodeBlock>
      <p>Returns <code>200 OK</code> when the gateway and its dependencies are healthy.</p>
    </article>
  );
}
