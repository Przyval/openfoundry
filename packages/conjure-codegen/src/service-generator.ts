import type {
  ServiceDefinition,
  EndpointDefinition,
  TypeDefinition,
  Type,
} from "@openfoundry/conjure-ir";
import type { GeneratedFile } from "./codegen.js";
import { toFileName, toCamelCase, toKebabCase } from "./naming.js";
import { typeToTypeScript } from "./type-generator.js";

/**
 * Generates a TypeScript service client file from a ServiceDefinition.
 *
 * The generated class has a method for each endpoint, with typed parameters
 * and return types. It delegates HTTP calls to a `ConjureClient` interface.
 */
export function generateServiceFile(
  service: ServiceDefinition,
  _allTypes: TypeDefinition[],
): GeneratedFile {
  const lines: string[] = [];
  const className = service.serviceName.name;
  const referencedTypes = collectServiceImports(service);

  // Import referenced types
  if (referencedTypes.length > 0) {
    for (const ref of referencedTypes) {
      lines.push(
        `import type { ${ref.name} } from "./${toKebabCase(ref.name)}";`,
      );
    }
    lines.push("");
  }

  // ConjureClient interface
  lines.push(`export interface ConjureClient {`);
  lines.push(`  fetch<T>(method: string, path: string, options?: {`);
  lines.push(`    body?: unknown;`);
  lines.push(`    query?: Record<string, unknown>;`);
  lines.push(`    headers?: Record<string, string>;`);
  lines.push(`  }): Promise<T>;`);
  lines.push(`}`);
  lines.push("");

  // Service class
  if (service.docs) {
    lines.push(`/** ${service.docs} */`);
  }
  lines.push(`export class ${className} {`);
  lines.push(`  private readonly client: ConjureClient;`);
  lines.push("");
  lines.push(`  constructor(client: ConjureClient) {`);
  lines.push(`    this.client = client;`);
  lines.push(`  }`);

  for (const endpoint of service.endpoints) {
    lines.push("");
    generateEndpointMethod(endpoint, lines);
  }

  lines.push(`}`);
  lines.push("");

  return {
    path: toFileName(service.serviceName),
    content: lines.join("\n"),
  };
}

function generateEndpointMethod(
  endpoint: EndpointDefinition,
  lines: string[],
): void {
  const methodName = toCamelCase(endpoint.endpointName);
  const returnType = endpoint.returns
    ? typeToTypeScript(endpoint.returns)
    : "void";

  // Separate arguments by param type
  const pathArgs = endpoint.args.filter((a) => a.paramType.type === "path");
  const queryArgs = endpoint.args.filter((a) => a.paramType.type === "query");
  const headerArgs = endpoint.args.filter((a) => a.paramType.type === "header");
  const bodyArgs = endpoint.args.filter((a) => a.paramType.type === "body");

  // Build parameter list
  const params: string[] = [];

  for (const arg of pathArgs) {
    params.push(`${toCamelCase(arg.argName)}: ${typeToTypeScript(arg.type)}`);
  }

  if (bodyArgs.length > 0) {
    const bodyArg = bodyArgs[0];
    params.push(`${toCamelCase(bodyArg.argName)}: ${typeToTypeScript(bodyArg.type)}`);
  }

  if (queryArgs.length > 0 || headerArgs.length > 0) {
    const optionalFields: string[] = [];
    for (const arg of queryArgs) {
      const paramId =
        arg.paramType.type === "query" ? arg.paramType.query.paramId : arg.argName;
      optionalFields.push(`${paramId}?: ${typeToTypeScript(arg.type)}`);
    }
    for (const arg of headerArgs) {
      const paramId =
        arg.paramType.type === "header"
          ? arg.paramType.header.paramId
          : arg.argName;
      optionalFields.push(`${paramId}?: ${typeToTypeScript(arg.type)}`);
    }
    params.push(`options?: { ${optionalFields.join("; ")} }`);
  }

  // JSDoc
  if (endpoint.docs) {
    lines.push(`  /** ${endpoint.docs} */`);
  }
  if (endpoint.deprecated) {
    lines.push(`  /** @deprecated ${endpoint.deprecated.docs} */`);
  }

  lines.push(
    `  async ${methodName}(${params.join(", ")}): Promise<${returnType}> {`,
  );

  // Build path with interpolation
  let pathTemplate = endpoint.httpPath;
  for (const arg of pathArgs) {
    pathTemplate = pathTemplate.replace(
      `{${arg.argName}}`,
      `\${${toCamelCase(arg.argName)}}`,
    );
  }

  // Build fetch options
  const fetchOptions: string[] = [];

  if (bodyArgs.length > 0) {
    fetchOptions.push(`body: ${toCamelCase(bodyArgs[0].argName)}`);
  }

  if (queryArgs.length > 0) {
    const queryEntries = queryArgs.map((a) => {
      const paramId =
        a.paramType.type === "query" ? a.paramType.query.paramId : a.argName;
      return `${paramId}: options?.${paramId}`;
    });
    fetchOptions.push(`query: { ${queryEntries.join(", ")} }`);
  }

  if (headerArgs.length > 0) {
    const headerEntries = headerArgs.map((a) => {
      const paramId =
        a.paramType.type === "header"
          ? a.paramType.header.paramId
          : a.argName;
      return `"${paramId}": options?.${paramId}`;
    });
    fetchOptions.push(`headers: { ${headerEntries.join(", ")} }`);
  }

  const optionsStr =
    fetchOptions.length > 0 ? `, { ${fetchOptions.join(", ")} }` : "";

  if (pathTemplate.includes("${")) {
    lines.push(
      `    return this.client.fetch<${returnType}>("${endpoint.httpMethod}", \`${pathTemplate}\`${optionsStr});`,
    );
  } else {
    lines.push(
      `    return this.client.fetch<${returnType}>("${endpoint.httpMethod}", "${pathTemplate}"${optionsStr});`,
    );
  }

  lines.push(`  }`);
}

interface TypeRef {
  name: string;
}

function collectServiceImports(service: ServiceDefinition): TypeRef[] {
  const refs = new Map<string, TypeRef>();

  for (const endpoint of service.endpoints) {
    if (endpoint.returns) {
      collectTypeRefs(endpoint.returns, refs);
    }
    for (const arg of endpoint.args) {
      collectTypeRefs(arg.type, refs);
    }
  }

  return Array.from(refs.values());
}

function collectTypeRefs(type: Type, refs: Map<string, TypeRef>): void {
  switch (type.type) {
    case "reference":
      if (!refs.has(type.reference.name)) {
        refs.set(type.reference.name, { name: type.reference.name });
      }
      break;
    case "optional":
      collectTypeRefs(type.optional.itemType, refs);
      break;
    case "list":
      collectTypeRefs(type.list.itemType, refs);
      break;
    case "set":
      collectTypeRefs(type.set.itemType, refs);
      break;
    case "map":
      collectTypeRefs(type.map.keyType, refs);
      collectTypeRefs(type.map.valueType, refs);
      break;
    case "external":
      collectTypeRefs(type.external.fallback, refs);
      break;
  }
}
