import type {
  Type,
  TypeDefinition,
  AliasDefinition,
  EnumDefinition,
  ObjectDefinition,
  UnionDefinition,
  FieldDefinition,
} from "@openfoundry/conjure-ir";
import type { GeneratedFile } from "./codegen.js";
import { toFileName } from "./naming.js";

/**
 * Converts a Conjure IR `Type` to its TypeScript type string representation.
 */
export function typeToTypeScript(type: Type): string {
  switch (type.type) {
    case "primitive":
      return primitiveToTypeScript(type.primitive);
    case "optional":
      return `${typeToTypeScript(type.optional.itemType)} | undefined`;
    case "list":
      return `Array<${typeToTypeScript(type.list.itemType)}>`;
    case "set":
      return `Set<${typeToTypeScript(type.set.itemType)}>`;
    case "map": {
      const keyTs = typeToTypeScript(type.map.keyType);
      const valueTs = typeToTypeScript(type.map.valueType);
      // Use Record for string-like keys, Map otherwise
      if (isStringLikeKey(type.map.keyType)) {
        return `Record<${keyTs}, ${valueTs}>`;
      }
      return `Map<${keyTs}, ${valueTs}>`;
    }
    case "reference":
      return type.reference.name;
    case "external":
      return typeToTypeScript(type.external.fallback);
  }
}

function primitiveToTypeScript(primitive: string): string {
  switch (primitive) {
    case "STRING":
      return "string";
    case "INTEGER":
    case "DOUBLE":
    case "SAFELONG":
      return "number";
    case "BOOLEAN":
      return "boolean";
    case "DATETIME":
    case "RID":
    case "BEARERTOKEN":
    case "UUID":
      return "string";
    case "BINARY":
      return "Uint8Array";
    case "ANY":
      return "unknown";
    default:
      return "unknown";
  }
}

function isStringLikeKey(type: Type): boolean {
  if (type.type === "primitive") {
    return ["STRING", "RID", "DATETIME", "BEARERTOKEN", "UUID"].includes(
      type.primitive,
    );
  }
  if (type.type === "reference") {
    // References could be enums or aliases to string — treat as string-like
    return true;
  }
  return false;
}

/**
 * Generates a TypeScript source file for a given type definition.
 */
export function generateTypeFile(typeDef: TypeDefinition): GeneratedFile {
  if ("alias" in typeDef) {
    return generateAlias(typeDef);
  }
  if ("values" in typeDef) {
    return generateEnum(typeDef);
  }
  if ("fields" in typeDef) {
    return generateObject(typeDef);
  }
  if ("union" in typeDef) {
    return generateUnion(typeDef);
  }
  throw new Error("Unknown type definition kind");
}

function generateAlias(def: AliasDefinition): GeneratedFile {
  const lines: string[] = [];

  if (def.docs) {
    lines.push(`/** ${def.docs} */`);
  }
  lines.push(`export type ${def.typeName.name} = ${typeToTypeScript(def.alias)};`);
  lines.push("");

  return {
    path: toFileName(def.typeName),
    content: lines.join("\n"),
  };
}

function generateEnum(def: EnumDefinition): GeneratedFile {
  const lines: string[] = [];
  const name = def.typeName.name;

  // String literal union type
  if (def.docs) {
    lines.push(`/** ${def.docs} */`);
  }
  const valueTypes = def.values.map((v) => `"${v.value}"`).join(" | ");
  lines.push(`export type ${name} = ${valueTypes};`);
  lines.push("");

  // Const object with all values
  lines.push(`/** All known values of {@link ${name}}. */`);
  lines.push(`export const ${name} = {`);
  for (const val of def.values) {
    if (val.docs) {
      lines.push(`  /** ${val.docs} */`);
    }
    if (val.deprecated) {
      lines.push(`  /** @deprecated ${val.deprecated.docs} */`);
    }
    lines.push(`  ${val.value}: "${val.value}" as const,`);
  }
  lines.push(`} as const;`);
  lines.push("");

  return {
    path: toFileName(def.typeName),
    content: lines.join("\n"),
  };
}

function generateObject(def: ObjectDefinition): GeneratedFile {
  const lines: string[] = [];
  const imports = collectFieldImports(def.fields);

  if (imports.length > 0) {
    for (const imp of imports) {
      lines.push(`import type { ${imp.name} } from "./${imp.file}";`);
    }
    lines.push("");
  }

  if (def.docs) {
    lines.push(`/** ${def.docs} */`);
  }
  lines.push(`export interface ${def.typeName.name} {`);

  for (const field of def.fields) {
    if (field.docs) {
      lines.push(`  /** ${field.docs} */`);
    }
    if (field.deprecated) {
      lines.push(`  /** @deprecated ${field.deprecated.docs} */`);
    }
    const optional = field.type.type === "optional" ? "?" : "";
    const tsType =
      field.type.type === "optional"
        ? typeToTypeScript(field.type.optional.itemType)
        : typeToTypeScript(field.type);
    lines.push(`  ${field.fieldName}${optional}: ${tsType};`);
  }

  lines.push(`}`);
  lines.push("");

  return {
    path: toFileName(def.typeName),
    content: lines.join("\n"),
  };
}

function generateUnion(def: UnionDefinition): GeneratedFile {
  const lines: string[] = [];
  const name = def.typeName.name;
  const imports = collectFieldImports(def.union);

  if (imports.length > 0) {
    for (const imp of imports) {
      lines.push(`import type { ${imp.name} } from "./${imp.file}";`);
    }
    lines.push("");
  }

  if (def.docs) {
    lines.push(`/** ${def.docs} */`);
  }

  // Generate individual member interfaces
  const memberNames: string[] = [];
  for (const member of def.union) {
    const memberTypeName = `${name}_${member.fieldName}`;
    memberNames.push(memberTypeName);

    if (member.docs) {
      lines.push(`/** ${member.docs} */`);
    }
    lines.push(`export interface ${memberTypeName} {`);
    lines.push(`  type: "${member.fieldName}";`);
    lines.push(`  ${member.fieldName}: ${typeToTypeScript(member.type)};`);
    lines.push(`}`);
    lines.push("");
  }

  // Union type
  lines.push(`export type ${name} = ${memberNames.join(" | ")};`);
  lines.push("");

  // Visitor interface
  lines.push(`export interface ${name}Visitor<T> {`);
  for (const member of def.union) {
    lines.push(
      `  ${member.fieldName}(value: ${typeToTypeScript(member.type)}): T;`,
    );
  }
  lines.push(`  unknown(type: string): T;`);
  lines.push(`}`);
  lines.push("");

  // Visit function
  lines.push(`export function visit${name}<T>(union: ${name}, visitor: ${name}Visitor<T>): T {`);
  lines.push(`  switch (union.type) {`);
  for (const member of def.union) {
    lines.push(`    case "${member.fieldName}":`);
    lines.push(`      return visitor.${member.fieldName}(union.${member.fieldName});`);
  }
  lines.push(`    default:`);
  lines.push(`      return visitor.unknown((union as { type: string }).type);`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push("");

  return {
    path: toFileName(def.typeName),
    content: lines.join("\n"),
  };
}

interface ImportInfo {
  name: string;
  file: string;
}

function collectFieldImports(fields: FieldDefinition[]): ImportInfo[] {
  const imports = new Map<string, ImportInfo>();
  for (const field of fields) {
    collectTypeImports(field.type, imports);
  }
  return Array.from(imports.values());
}

function collectTypeImports(
  type: Type,
  imports: Map<string, ImportInfo>,
): void {
  switch (type.type) {
    case "reference":
      if (!imports.has(type.reference.name)) {
        imports.set(type.reference.name, {
          name: type.reference.name,
          file: toFileName(type.reference).replace(/\.ts$/, ""),
        });
      }
      break;
    case "optional":
      collectTypeImports(type.optional.itemType, imports);
      break;
    case "list":
      collectTypeImports(type.list.itemType, imports);
      break;
    case "set":
      collectTypeImports(type.set.itemType, imports);
      break;
    case "map":
      collectTypeImports(type.map.keyType, imports);
      collectTypeImports(type.map.valueType, imports);
      break;
    case "external":
      collectTypeImports(type.external.fallback, imports);
      break;
  }
}
