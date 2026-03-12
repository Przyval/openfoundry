import type { ObjectTypeIr, PropertyIr, PropertyTypeIr } from "@openfoundry/ontology-ir";

/**
 * Maps an IR property type to its TypeScript type string.
 */
export function mapPropertyTypeToTs(type: PropertyTypeIr): string {
  switch (type) {
    case "STRING":
      return "string";
    case "BOOLEAN":
      return "boolean";
    case "INTEGER":
    case "DOUBLE":
    case "FLOAT":
    case "BYTE":
    case "SHORT":
      return "number";
    case "LONG":
      return "bigint";
    case "DECIMAL":
      return "string";
    case "DATE":
      return "string";
    case "TIMESTAMP":
      return "string";
    case "ATTACHMENT":
      return "string";
    case "GEOSHAPE":
      return "GeoJsonGeometry";
    case "GEOHASH":
      return "string";
    case "GEOPOINT":
      return "GeoPoint";
    case "MARKING":
      return "string";
    case "VECTOR":
      return "number[]";
    case "TIMESERIES":
      return "TimeseriesReference";
    case "STRUCT":
      return "Record<string, unknown>";
    case "MEDIA_REFERENCE":
      return "string";
    case "RID":
      return "string";
    default:
      return "unknown";
  }
}

function generatePropertyLine(
  name: string,
  prop: PropertyIr,
  isPrimaryKey: boolean,
): string {
  let tsType = mapPropertyTypeToTs(prop.type);
  if (prop.array) {
    tsType = `Array<${tsType}>`;
  }
  const optional = prop.nullable ? "?" : "";
  const readonlyMod = isPrimaryKey ? "readonly " : "readonly ";
  return `  ${readonlyMod}${name}${optional}: ${tsType};`;
}

/**
 * Generates a TypeScript interface for an object type.
 */
export function generateObjectInterface(objectType: ObjectTypeIr): string {
  const lines: string[] = [];
  const typeName = objectType.apiName;

  lines.push(`export interface ${typeName} {`);

  for (const [name, prop] of Object.entries(objectType.properties)) {
    const isPrimaryKey = name === objectType.primaryKey;
    const comment =
      isPrimaryKey && prop.description
        ? `  // primary key - ${prop.description}`
        : isPrimaryKey
          ? "  // primary key"
          : prop.description
            ? `  // ${prop.description}`
            : "";
    if (comment) {
      lines.push(comment);
    }
    lines.push(generatePropertyLine(name, prop, isPrimaryKey));
  }

  lines.push("}");

  return lines.join("\n");
}
