import { CodeBlock } from "../components/CodeBlock";

export function SdkGuide() {
  return (
    <article className="doc-article">
      <h1>SDK Guide</h1>
      <p className="doc-lead">
        The OpenFoundry SDK provides a type-safe client for interacting with the
        platform from TypeScript applications. It wraps the HTTP API with strongly-typed
        methods, automatic pagination, and React hooks for frontend integration.
      </p>

      <h2 id="installation">Installation</h2>
      <CodeBlock language="bash">{`
# Install the client and core types
pnpm add @openfoundry/client @openfoundry/api-types

# For React applications, also install the SDK hooks
pnpm add @openfoundry/sdk
      `}</CodeBlock>

      <h2 id="client-setup">Client Setup</h2>
      <p>
        The <code>@openfoundry/client</code> package provides a layered fetch
        architecture. You create a client with a base URL and a token provider
        function that returns a valid bearer token.
      </p>
      <CodeBlock language="typescript" title="Creating a client">{`
import { createClient } from "@openfoundry/client";

const client = createClient({
  baseUrl: "https://your-instance.openfoundry.io",
  tokenProvider: async () => {
    // Return a valid bearer token
    // This could come from localStorage, a refresh flow, etc.
    return getAccessToken();
  },
});
      `}</CodeBlock>

      <h3>Client options</h3>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Option</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>baseUrl</code></td>
            <td>string</td>
            <td>Base URL of the OpenFoundry gateway</td>
          </tr>
          <tr>
            <td><code>tokenProvider</code></td>
            <td>() =&gt; Promise&lt;string&gt;</td>
            <td>Async function that returns a valid bearer token</td>
          </tr>
          <tr>
            <td><code>fetch</code></td>
            <td>FetchFn</td>
            <td>Optional custom fetch implementation (defaults to global fetch)</td>
          </tr>
        </tbody>
      </table>

      <h3>Layered fetch architecture</h3>
      <p>
        The client composes multiple fetch wrappers in a layered architecture:
      </p>
      <CodeBlock language="text" title="Fetch Layer Stack">{`
  Application code
       |
       v
  createClient()
       |
       v
  createFetchHeaderMutator()   -- Injects Authorization header
       |
       v
  createRetryingFetch()        -- Retries on transient failures (429, 503)
       |
       v
  createFetchOrThrow()         -- Converts non-2xx responses to ApiError
       |
       v
  foundryPlatformFetch()       -- Adds platform headers (trace ID, user agent)
       |
       v
  globalThis.fetch             -- Native HTTP request
      `}</CodeBlock>

      <h2 id="crud-operations">CRUD Operations</h2>

      <h3>List objects</h3>
      <CodeBlock language="typescript">{`
// Fetch a page of Employee objects
const response = await fetch(
  \`\${client.baseUrl}/api/objects/v1/objects/Employee?pageSize=50\`,
  {
    headers: {
      Authorization: \`Bearer \${await client.tokenProvider()}\`,
    },
  },
);

const { data, nextPageToken } = await response.json();
// data: Array<{ rid: string, objectType: string, properties: Record<string, unknown> }>
      `}</CodeBlock>

      <h3>Get a single object</h3>
      <CodeBlock language="typescript">{`
const response = await fetch(
  \`\${client.baseUrl}/api/objects/v1/objects/Employee/E-001\`,
  {
    headers: {
      Authorization: \`Bearer \${await client.tokenProvider()}\`,
    },
  },
);

const employee = await response.json();
// { rid: "ri.objects.main.object.employee-001", objectType: "Employee", properties: { ... } }
      `}</CodeBlock>

      <h3>Create an object</h3>
      <CodeBlock language="typescript">{`
const response = await fetch(
  \`\${client.baseUrl}/api/objects/v1/objects/Employee\`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${await client.tokenProvider()}\`,
    },
    body: JSON.stringify({
      properties: {
        employeeId: "E-003",
        fullName: "Alan Turing",
        email: "turing@acme.corp",
        department: "Research",
        startDate: "1936-05-28",
        salary: 200000,
        isActive: true,
      },
    }),
  },
);

const created = await response.json();
      `}</CodeBlock>

      <h3>Update an object</h3>
      <CodeBlock language="typescript">{`
const response = await fetch(
  \`\${client.baseUrl}/api/objects/v1/objects/Employee/E-003\`,
  {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${await client.tokenProvider()}\`,
    },
    body: JSON.stringify({
      properties: {
        salary: 225000,
        department: "Advanced Research",
      },
    }),
  },
);
      `}</CodeBlock>

      <h3>Delete an object</h3>
      <CodeBlock language="typescript">{`
await fetch(
  \`\${client.baseUrl}/api/objects/v1/objects/Employee/E-003\`,
  {
    method: "DELETE",
    headers: {
      Authorization: \`Bearer \${await client.tokenProvider()}\`,
    },
  },
);
      `}</CodeBlock>

      <h2 id="object-sets">ObjectSet Queries</h2>
      <p>
        The <code>@openfoundry/object-set</code> package defines a rich query
        model for filtering, combining, and traversing objects. ObjectSet queries
        are sent to the search endpoint and support the following set operations:
      </p>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Operation</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>base</code></td><td>All objects of a given type</td></tr>
          <tr><td><code>filter</code></td><td>Apply a filter predicate to an object set</td></tr>
          <tr><td><code>union</code></td><td>Combine two object sets (OR)</td></tr>
          <tr><td><code>intersect</code></td><td>Intersect two object sets (AND)</td></tr>
          <tr><td><code>subtract</code></td><td>Subtract one set from another</td></tr>
          <tr><td><code>searchAround</code></td><td>Traverse a link to related objects</td></tr>
          <tr><td><code>static</code></td><td>An explicit set of object RIDs</td></tr>
          <tr><td><code>near</code></td><td>Geospatial proximity search</td></tr>
          <tr><td><code>within</code></td><td>Geospatial bounding box search</td></tr>
          <tr><td><code>naturalLanguage</code></td><td>Natural language query (semantic search)</td></tr>
        </tbody>
      </table>

      <h3>Filter types</h3>
      <CodeBlock language="typescript" title="Available filter operations">{`
// Comparison filters
{ type: "eq", field: "department", value: "Engineering" }
{ type: "gt", field: "salary", value: 100000 }
{ type: "gte", field: "salary", value: 100000 }
{ type: "lt", field: "salary", value: 200000 }
{ type: "lte", field: "salary", value: 200000 }

// String filters
{ type: "contains", field: "fullName", value: "Ada" }
{ type: "startsWith", field: "email", value: "ada" }

// Logical combinators
{ type: "and", filters: [filter1, filter2] }
{ type: "or", filters: [filter1, filter2] }
{ type: "not", filter: innerFilter }

// Null check
{ type: "isNull", field: "department" }
      `}</CodeBlock>

      <h3>Example: compound query</h3>
      <CodeBlock language="typescript">{`
const query = {
  objectSet: {
    type: "filter",
    objectSet: { type: "base", objectType: "Employee" },
    filter: {
      type: "and",
      filters: [
        { type: "eq", field: "department", value: "Engineering" },
        { type: "gt", field: "salary", value: 120000 },
        { type: "eq", field: "isActive", value: true },
      ],
    },
  },
  select: ["employeeId", "fullName", "salary", "department"],
  orderBy: { field: "salary", direction: "desc" },
  pageSize: 25,
};

const response = await fetch(
  \`\${client.baseUrl}/api/objects/v1/objects/search\`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${await client.tokenProvider()}\`,
    },
    body: JSON.stringify(query),
  },
);
      `}</CodeBlock>

      <h2 id="actions">Executing Actions</h2>
      <CodeBlock language="typescript">{`
const response = await fetch(
  \`\${client.baseUrl}/api/actions/v1/actions/PromoteEmployee/apply\`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${await client.tokenProvider()}\`,
    },
    body: JSON.stringify({
      parameters: {
        employeeId: "E-001",
        newTitle: "Senior Engineer",
        newSalary: 175000,
        effectiveDate: "2025-04-01",
      },
    }),
  },
);

const result = await response.json();
// { actionRid: "ri.actions.main.action.xyz", status: "COMPLETED", modifiedObjects: [...] }
      `}</CodeBlock>

      <h2 id="error-handling">Error Handling</h2>
      <p>
        The client uses the <code>@openfoundry/errors</code> package for structured
        error handling. API errors include a machine-readable error code, a
        human-readable message, and safe parameters for debugging.
      </p>
      <CodeBlock language="typescript">{`
import { createFetchOrThrow } from "@openfoundry/client";

const fetchOrThrow = createFetchOrThrow(globalThis.fetch);

try {
  const response = await fetchOrThrow("/api/objects/v1/objects/Employee", {
    method: "POST",
    body: JSON.stringify({ properties: { salary: "not-a-number" } }),
  });
} catch (error) {
  // ApiError {
  //   errorCode: "INVALID_ARGUMENT",
  //   errorName: "ObjectType:PropertyTypeMismatch",
  //   message: "Property 'salary' expected type DOUBLE but received STRING",
  //   statusCode: 400,
  //   parameters: { property: "salary", expectedType: "DOUBLE", receivedType: "STRING" }
  // }
  console.error(error.errorCode, error.message);
}
      `}</CodeBlock>

      <h2 id="react-hooks">React Hooks</h2>
      <p>
        For React applications, the SDK provides hooks that integrate with
        React's component lifecycle. These hooks handle loading states,
        error states, and automatic refetching.
      </p>

      <h3>Provider setup</h3>
      <CodeBlock language="typescript" title="src/main.tsx">{`
import { FoundryProvider } from "@openfoundry/sdk/react";
import { createClient } from "@openfoundry/client";

const client = createClient({
  baseUrl: "http://localhost:8080",
  tokenProvider: async () => getAccessToken(),
});

function App() {
  return (
    <FoundryProvider client={client}>
      <YourApp />
    </FoundryProvider>
  );
}
      `}</CodeBlock>

      <h3>useObjects hook</h3>
      <CodeBlock language="typescript">{`
import { useObjects } from "@openfoundry/sdk/react";

function EmployeeList() {
  const { data, loading, error, fetchMore } = useObjects("Employee", {
    pageSize: 25,
    orderBy: { field: "fullName", direction: "asc" },
    filter: { type: "eq", field: "isActive", value: true },
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <ul>
        {data.map((employee) => (
          <li key={employee.rid}>
            {employee.properties.fullName} - {employee.properties.department}
          </li>
        ))}
      </ul>
      <button onClick={fetchMore}>Load more</button>
    </div>
  );
}
      `}</CodeBlock>

      <h3>useObject hook</h3>
      <CodeBlock language="typescript">{`
import { useObject } from "@openfoundry/sdk/react";

function EmployeeDetail({ employeeId }: { employeeId: string }) {
  const { data, loading, error } = useObject("Employee", employeeId);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>{data.properties.fullName}</h2>
      <p>Department: {data.properties.department}</p>
      <p>Started: {data.properties.startDate}</p>
    </div>
  );
}
      `}</CodeBlock>

      <h3>useAction hook</h3>
      <CodeBlock language="typescript">{`
import { useAction } from "@openfoundry/sdk/react";

function PromoteButton({ employeeId }: { employeeId: string }) {
  const { execute, loading, error } = useAction("PromoteEmployee");

  const handlePromote = async () => {
    await execute({
      employeeId,
      newTitle: "Senior Engineer",
      newSalary: 175000,
      effectiveDate: new Date().toISOString().split("T")[0],
    });
  };

  return (
    <button onClick={handlePromote} disabled={loading}>
      {loading ? "Promoting..." : "Promote"}
    </button>
  );
}
      `}</CodeBlock>

      <h2 id="typescript-types">TypeScript Type Safety</h2>
      <p>
        When you use the ontology code generation pipeline, the SDK provides
        full type safety for your domain objects. Generated types flow from
        the ontology definition through to the React hooks:
      </p>
      <CodeBlock language="typescript" title="Generated types (auto-generated)">{`
// This file is auto-generated by @openfoundry/ontology-generator
// Do not edit manually.

export interface Employee {
  employeeId: string;
  fullName: string;
  email: string;
  department: string;
  startDate: string;
  salary: number;
  isActive: boolean;
}

export interface PromoteEmployeeParams {
  employeeId: string;
  newTitle: string;
  newSalary: number;
  effectiveDate: string;
}
      `}</CodeBlock>
      <CodeBlock language="typescript" title="Using generated types">{`
import type { Employee } from "./generated/ontology";
import { useObjects } from "@openfoundry/sdk/react";

// The hook is fully typed — properties are autocompleted
const { data } = useObjects<Employee>("Employee", {
  filter: { type: "eq", field: "department", value: "Engineering" },
});

// data[0].properties.fullName  -- string (autocompleted)
// data[0].properties.salary    -- number (autocompleted)
      `}</CodeBlock>
    </article>
  );
}
