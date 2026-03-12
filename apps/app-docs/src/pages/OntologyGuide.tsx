import { CodeBlock } from "../components/CodeBlock";

export function OntologyGuide() {
  return (
    <article className="doc-article">
      <h1>Ontology Guide</h1>
      <p className="doc-lead">
        The ontology is the foundation of every OpenFoundry deployment. It defines the
        types of objects, their properties, the actions that can be performed on them,
        and the links between them. This guide explains the ontology model and shows
        how to define one using the maker DSL.
      </p>

      <h2 id="what-is-an-ontology">What Is an Ontology?</h2>
      <p>
        In OpenFoundry, an ontology is a formal description of your data model. Instead
        of working with raw database tables and columns, you define your domain in terms
        of <strong>object types</strong>, <strong>properties</strong>,{" "}
        <strong>actions</strong>, <strong>links</strong>, and{" "}
        <strong>interfaces</strong>. The platform uses this definition to:
      </p>
      <ul>
        <li>Validate all writes against the declared schema</li>
        <li>Generate strongly-typed TypeScript SDKs for client applications</li>
        <li>Build query plans for the ObjectSet query engine</li>
        <li>Enforce access control through markings and permissions</li>
        <li>Power search indexing in the Compass service</li>
      </ul>

      <h2 id="core-concepts">Core Concepts</h2>

      <h3>Object types</h3>
      <p>
        An object type is the fundamental entity in the ontology. It declares a set of
        typed properties, a primary key, and a title property for display purposes.
        Each object type has a unique <code>apiName</code> used to reference it in
        API calls and generated code.
      </p>

      <h3>Property types</h3>
      <p>
        The ontology schema supports 21 property types. These cover primitives, temporal
        types, geospatial types, and platform-specific references:
      </p>
      <table className="doc-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>TypeScript</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>STRING</code></td><td>string</td><td>UTF-8 text</td></tr>
          <tr><td><code>BOOLEAN</code></td><td>boolean</td><td>True or false</td></tr>
          <tr><td><code>INTEGER</code></td><td>number</td><td>32-bit signed integer</td></tr>
          <tr><td><code>LONG</code></td><td>bigint</td><td>64-bit signed integer</td></tr>
          <tr><td><code>DOUBLE</code></td><td>number</td><td>64-bit floating point</td></tr>
          <tr><td><code>FLOAT</code></td><td>number</td><td>32-bit floating point</td></tr>
          <tr><td><code>DECIMAL</code></td><td>string</td><td>Arbitrary-precision decimal (stored as string)</td></tr>
          <tr><td><code>BYTE</code></td><td>number</td><td>8-bit signed integer</td></tr>
          <tr><td><code>SHORT</code></td><td>number</td><td>16-bit signed integer</td></tr>
          <tr><td><code>DATE</code></td><td>string</td><td>ISO 8601 date (YYYY-MM-DD)</td></tr>
          <tr><td><code>TIMESTAMP</code></td><td>string</td><td>ISO 8601 date-time with timezone</td></tr>
          <tr><td><code>ATTACHMENT</code></td><td>string</td><td>RID reference to an attachment</td></tr>
          <tr><td><code>GEOSHAPE</code></td><td>GeoJSON</td><td>Arbitrary GeoJSON geometry</td></tr>
          <tr><td><code>GEOHASH</code></td><td>string</td><td>Geohash-encoded location</td></tr>
          <tr><td><code>GEOPOINT</code></td><td>GeoJSON</td><td>GeoJSON Point (longitude, latitude)</td></tr>
          <tr><td><code>MARKING</code></td><td>string</td><td>CBAC marking reference</td></tr>
          <tr><td><code>VECTOR</code></td><td>number[]</td><td>Float vector for embeddings</td></tr>
          <tr><td><code>TIMESERIES</code></td><td>string</td><td>Reference to a time series</td></tr>
          <tr><td><code>STRUCT</code></td><td>object</td><td>Nested structured data</td></tr>
          <tr><td><code>MEDIA_REFERENCE</code></td><td>string</td><td>RID reference to a media file</td></tr>
          <tr><td><code>RID</code></td><td>string</td><td>Resource Identifier reference</td></tr>
        </tbody>
      </table>

      <h3>Action types</h3>
      <p>
        Actions represent operations that modify objects. Each action type declares
        its parameters, the object types it applies to, and validation rules. Actions
        are the primary mechanism for writes in the platform, providing an auditable
        and validatable mutation layer.
      </p>

      <h3>Link types</h3>
      <p>
        Links define relationships between object types. Each link type specifies a
        source and target object type, cardinality, and an API name. Links enable
        graph-style traversal in ObjectSet queries.
      </p>

      <h3>Interface types</h3>
      <p>
        Interfaces define a set of shared properties that multiple object types can
        implement. They enable polymorphic queries across object types that share a
        common shape.
      </p>

      <h3>Query types</h3>
      <p>
        Query types define reusable, parameterized queries that can be registered
        with the platform and invoked by name through the API.
      </p>

      <h2 id="defining-objects">Defining Object Types</h2>
      <p>
        Object types are defined using
        the <code>@openfoundry/ontology-schema</code> package's type system. Here
        is the core interface:
      </p>
      <CodeBlock language="typescript" title="ObjectTypeDefinition">{`
interface ObjectTypeDefinition {
  readonly apiName: string;
  readonly description: string;
  readonly primaryKeyApiName: string;
  readonly primaryKeyType: PropertyType;
  readonly titlePropertyApiName: string;
  readonly properties: Record<string, PropertyDef>;
  readonly status?: ObjectTypeStatus;   // ACTIVE | EXPERIMENTAL | DEPRECATED
  readonly interfaces?: string[];       // Interface apiNames this type implements
}

interface PropertyDef {
  readonly type: PropertyType;
  readonly description: string;
  readonly nullable?: boolean;          // Default: false
  readonly array?: boolean;             // Default: false
}
      `}</CodeBlock>

      <h2 id="maker-dsl">Using the Maker DSL</h2>
      <p>
        The <code>@openfoundry/ontology-maker</code> package provides a fluent
        TypeScript DSL for defining ontologies programmatically. It produces an
        intermediate representation (OntologyIr) that can be used for code generation
        and API registration.
      </p>

      <h3>Define an object type</h3>
      <CodeBlock language="typescript" title="Using defineObject">{`
import { defineObject } from "@openfoundry/ontology-maker";

const Employee = defineObject("Employee")
  .description("Represents an employee in the organization")
  .primaryKey("employeeId", "STRING")
  .titleProperty("fullName")
  .property("employeeId", "STRING", "Unique employee identifier")
  .property("fullName", "STRING", "Employee full name")
  .property("email", "STRING", "Corporate email address")
  .property("department", "STRING", "Department name")
  .property("startDate", "DATE", "Employment start date")
  .property("salary", "DOUBLE", "Annual salary")
  .property("isActive", "BOOLEAN", "Whether currently employed")
  .build();
      `}</CodeBlock>

      <h3>Define an action type</h3>
      <CodeBlock language="typescript" title="Using defineAction">{`
import { defineAction } from "@openfoundry/ontology-maker";

const PromoteEmployee = defineAction("PromoteEmployee")
  .description("Promote an employee to a new role with updated salary")
  .parameter("employeeId", "STRING", "The employee to promote")
  .parameter("newTitle", "STRING", "New job title")
  .parameter("newSalary", "DOUBLE", "New annual salary")
  .parameter("effectiveDate", "DATE", "When the promotion takes effect")
  .appliesTo("Employee")
  .build();
      `}</CodeBlock>

      <h3>Define a link type</h3>
      <CodeBlock language="typescript" title="Using defineLink">{`
import { defineLink } from "@openfoundry/ontology-maker";

const EmployeeReportsTo = defineLink("EmployeeReportsTo")
  .description("Manager relationship between employees")
  .from("Employee")
  .to("Employee")
  .cardinality("MANY_TO_ONE")
  .build();
      `}</CodeBlock>

      <h3>Define an interface</h3>
      <CodeBlock language="typescript" title="Using defineInterface">{`
import { defineInterface } from "@openfoundry/ontology-maker";

const Timestamped = defineInterface("Timestamped")
  .description("Interface for objects that track creation and modification times")
  .property("createdAt", "TIMESTAMP", "When the object was created")
  .property("updatedAt", "TIMESTAMP", "When the object was last modified")
  .build();
      `}</CodeBlock>

      <h3>Compose an ontology</h3>
      <CodeBlock language="typescript" title="Using defineOntology">{`
import { defineOntology } from "@openfoundry/ontology-maker";

const ontology = defineOntology("AcmeCorp")
  .description("Ontology for the Acme Corporation platform")
  .objectType(Employee)
  .objectType(Department)
  .objectType(Project)
  .actionType(PromoteEmployee)
  .actionType(CreateProject)
  .linkType(EmployeeReportsTo)
  .linkType(EmployeeBelongsToDepartment)
  .interfaceType(Timestamped)
  .build();
      `}</CodeBlock>

      <h2 id="code-generation">Code Generation Workflow</h2>
      <p>
        Once you have defined an ontology, you can generate a strongly-typed
        TypeScript SDK from it. The pipeline works as follows:
      </p>
      <ol>
        <li>
          <strong>Define</strong> your ontology using the maker DSL
          (<code>@openfoundry/ontology-maker</code>)
        </li>
        <li>
          <strong>Compile</strong> it to an intermediate representation
          (<code>@openfoundry/ontology-ir</code>)
        </li>
        <li>
          <strong>Generate</strong> TypeScript SDK code
          (<code>@openfoundry/ontology-generator</code>)
        </li>
        <li>
          <strong>Import</strong> the generated types in your application
        </li>
      </ol>

      <CodeBlock language="text" title="Code Generation Pipeline">{`
  ontology-maker          ontology-ir          ontology-generator
  (TypeScript DSL)  --->  (IR definition)  --->  (Generated SDK code)
       |                                              |
       v                                              v
  Human-authored                               Auto-generated
  fluent builder API                           typed client code
      `}</CodeBlock>

      <p>
        The Conjure pipeline follows a similar pattern
        for generating API client code from service definitions:
      </p>
      <CodeBlock language="text" title="Conjure Pipeline">{`
  conjure-compiler          conjure-ir          conjure-codegen
  (Service defs)  --->  (IR definition)  --->  (Generated TS client)
      `}</CodeBlock>

      <h3>Running code generation</h3>
      <CodeBlock language="bash">{`
# Generate API types from Conjure definitions
pnpm generate:api

# The generated code is placed in packages/api-types/
      `}</CodeBlock>

      <h2 id="registering">Registering with the Platform</h2>
      <p>
        After defining your ontology, register it with the running platform
        via the Ontology service API:
      </p>
      <CodeBlock language="typescript">{`
import { createClient } from "@openfoundry/client";

const client = createClient({
  baseUrl: "http://localhost:8080",
  tokenProvider: async () => "your-bearer-token",
});

// Register each object type
const response = await fetch("http://localhost:8080/api/ontology/v1/objectTypes", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer your-token",
  },
  body: JSON.stringify(Employee),
});
      `}</CodeBlock>
    </article>
  );
}
