import type { ErrorDefinition, Type } from "@openfoundry/conjure-ir";
import type { GeneratedFile } from "./codegen.js";
import { toFileName, toKebabCase } from "./naming.js";
import { typeToTypeScript } from "./type-generator.js";

/**
 * Generates a TypeScript error class for a Conjure ErrorDefinition.
 *
 * The generated class extends `Error` and includes typed `safeArgs` and
 * `unsafeArgs` properties matching the error definition's argument fields.
 */
export function generateErrorFile(error: ErrorDefinition): GeneratedFile {
  const lines: string[] = [];
  const className = error.errorName.name;
  const imports = collectErrorImports(error);

  if (imports.length > 0) {
    for (const imp of imports) {
      lines.push(
        `import type { ${imp} } from "./${toKebabCase(imp)}";`,
      );
    }
    lines.push("");
  }

  // SafeArgs interface
  if (error.safeArgs.length > 0) {
    lines.push(`export interface ${className}SafeArgs {`);
    for (const field of error.safeArgs) {
      if (field.docs) {
        lines.push(`  /** ${field.docs} */`);
      }
      lines.push(`  ${field.fieldName}: ${typeToTypeScript(field.type)};`);
    }
    lines.push(`}`);
    lines.push("");
  }

  // UnsafeArgs interface
  if (error.unsafeArgs.length > 0) {
    lines.push(`export interface ${className}UnsafeArgs {`);
    for (const field of error.unsafeArgs) {
      if (field.docs) {
        lines.push(`  /** ${field.docs} */`);
      }
      lines.push(`  ${field.fieldName}: ${typeToTypeScript(field.type)};`);
    }
    lines.push(`}`);
    lines.push("");
  }

  // Error class
  if (error.docs) {
    lines.push(`/** ${error.docs} */`);
  }
  lines.push(`export class ${className} extends Error {`);
  lines.push(`  readonly errorCode = "${error.code}";`);
  lines.push(`  readonly errorName = "${error.errorName.name}";`);
  lines.push(`  readonly namespace = "${error.namespace}";`);

  if (error.safeArgs.length > 0) {
    lines.push(`  readonly safeArgs: ${className}SafeArgs;`);
  }
  if (error.unsafeArgs.length > 0) {
    lines.push(`  readonly unsafeArgs: ${className}UnsafeArgs;`);
  }

  // Constructor
  const ctorParams: string[] = [`message: string`];
  if (error.safeArgs.length > 0) {
    ctorParams.push(`safeArgs: ${className}SafeArgs`);
  }
  if (error.unsafeArgs.length > 0) {
    ctorParams.push(`unsafeArgs: ${className}UnsafeArgs`);
  }

  lines.push("");
  lines.push(`  constructor(${ctorParams.join(", ")}) {`);
  lines.push(`    super(message);`);
  lines.push(`    this.name = "${className}";`);
  if (error.safeArgs.length > 0) {
    lines.push(`    this.safeArgs = safeArgs;`);
  }
  if (error.unsafeArgs.length > 0) {
    lines.push(`    this.unsafeArgs = unsafeArgs;`);
  }
  lines.push(`  }`);
  lines.push(`}`);
  lines.push("");

  return {
    path: toFileName(error.errorName),
    content: lines.join("\n"),
  };
}

function collectErrorImports(error: ErrorDefinition): string[] {
  const refs = new Set<string>();
  for (const field of [...error.safeArgs, ...error.unsafeArgs]) {
    collectTypeRefs(field.type, refs);
  }
  return Array.from(refs);
}

function collectTypeRefs(type: Type, refs: Set<string>): void {
  switch (type.type) {
    case "reference":
      refs.add(type.reference.name);
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
