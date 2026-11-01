import { invalidModelApi } from "./errors.js";
import type {
  ModelApi,
  ModelApiColumn,
  ModelApiDataType,
  ModelApiIo,
  UnsupportedType,
} from "./types.js";

/**
 * Validate a caller's `ModelApi` and rebuild it from the fields Foundry
 * declares, so what is stored and served back is exactly the documented shape.
 *
 * Every failure is Foundry's `InvalidModelApi`. Its `errorType` is one of:
 *
 *  - `MALFORMED`      - a value has the wrong JSON type, or a required field is missing
 *  - `UNKNOWN_TYPE`   - a `type` discriminator names no declared variant
 *  - `EMPTY_NAME`     - an input, output or column is named with an empty string
 *  - `DUPLICATE_NAME` - two inputs, two outputs, or two columns of one table share a name
 *  - `TOO_DEEP`       - array and map types are nested beyond any plausible model API
 */
export function parseModelApi(raw: unknown): ModelApi {
  const api = object(raw, "modelApi");
  return {
    inputs: ioList(api.inputs, "modelApi.inputs"),
    outputs: ioList(api.outputs, "modelApi.outputs"),
  };
}

/** Array and map types nest; nothing real nests this deep, and a bound keeps recursion finite. */
const MAX_TYPE_DEPTH = 32;

const PRIMITIVE_TYPES = new Set([
  "date",
  "boolean",
  "string",
  "double",
  "integer",
  "float",
  "long",
  "timestamp",
  "any",
]);

function ioList(raw: unknown, path: string): ModelApiIo[] {
  const items = array(raw, path);
  const result = items.map((item, i) => io(item, `${path}[${i}]`));
  assertUniqueNames(
    result.flatMap((entry) => (entry.type === "unsupported" ? [] : [entry.name])),
    path,
  );
  return result;
}

function io(raw: unknown, path: string): ModelApiIo {
  const value = object(raw, path);
  switch (value.type) {
    case "parameter":
      return {
        type: "parameter",
        name: name(value.name, `${path}.name`),
        ...optionalBoolean(value.required, `${path}.required`),
        dataType: dataType(value.dataType, `${path}.dataType`, 0),
      };
    case "tabular": {
      const columns = array(value.columns, `${path}.columns`).map((column, i) =>
        tabularColumn(column, `${path}.columns[${i}]`),
      );
      assertUniqueNames(
        columns.map((column) => column.name),
        `${path}.columns`,
      );
      const format = value.format;
      if (format !== undefined && format !== "PANDAS" && format !== "SPARK") {
        throw invalidModelApi(
          "MALFORMED",
          `${path}.format must be "PANDAS" or "SPARK", got ${JSON.stringify(format)}`,
        );
      }
      return {
        type: "tabular",
        name: name(value.name, `${path}.name`),
        ...optionalBoolean(value.required, `${path}.required`),
        columns,
        ...(format === undefined ? {} : { format }),
      };
    }
    case "unsupported":
      return unsupported(value, path);
    default:
      throw unknownType(value.type, path, ["parameter", "tabular", "unsupported"]);
  }
}

function tabularColumn(raw: unknown, path: string): ModelApiColumn {
  const value = object(raw, path);
  return {
    name: name(value.name, `${path}.name`),
    ...optionalBoolean(value.required, `${path}.required`),
    dataType: dataType(value.dataType, `${path}.dataType`, 0),
  };
}

function dataType(raw: unknown, path: string, depth: number): ModelApiDataType {
  if (depth > MAX_TYPE_DEPTH) {
    throw invalidModelApi("TOO_DEEP", `${path} nests more than ${MAX_TYPE_DEPTH} types deep`);
  }
  const value = object(raw, path);
  const type = value.type;
  if (typeof type === "string" && PRIMITIVE_TYPES.has(type)) {
    return { type } as ModelApiDataType;
  }
  switch (type) {
    case "array":
      return {
        type: "array",
        itemType: dataType(value.itemType, `${path}.itemType`, depth + 1),
      };
    case "map":
      return {
        type: "map",
        keyType: dataType(value.keyType, `${path}.keyType`, depth + 1),
        valueType: dataType(value.valueType, `${path}.valueType`, depth + 1),
      };
    case "unsupported":
      return unsupported(value, path);
    default:
      throw unknownType(type, path, [...PRIMITIVE_TYPES, "array", "map", "unsupported"]);
  }
}

function unsupported(value: Record<string, unknown>, path: string): UnsupportedType {
  const unsupportedType = value.unsupportedType;
  if (typeof unsupportedType !== "string") {
    throw invalidModelApi("MALFORMED", `${path}.unsupportedType must be a string`);
  }
  const params = object(value.params, `${path}.params`);
  for (const [key, param] of Object.entries(params)) {
    if (typeof param !== "string") {
      throw invalidModelApi("MALFORMED", `${path}.params.${key} must be a string`);
    }
  }
  return {
    type: "unsupported",
    unsupportedType,
    params: { ...(params as Record<string, string>) },
  };
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function object(raw: unknown, path: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw invalidModelApi("MALFORMED", `${path} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function array(raw: unknown, path: string): unknown[] {
  if (!Array.isArray(raw)) {
    throw invalidModelApi("MALFORMED", `${path} must be an array`);
  }
  return raw;
}

function name(raw: unknown, path: string): string {
  if (typeof raw !== "string") {
    throw invalidModelApi("MALFORMED", `${path} must be a string`);
  }
  if (raw === "") {
    throw invalidModelApi("EMPTY_NAME", `${path} must not be empty`);
  }
  return raw;
}

function optionalBoolean(raw: unknown, path: string): { required?: boolean } {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "boolean") {
    throw invalidModelApi("MALFORMED", `${path} must be a boolean`);
  }
  return { required: raw };
}

function assertUniqueNames(names: string[], path: string): void {
  const seen = new Set<string>();
  for (const entry of names) {
    if (seen.has(entry)) {
      throw invalidModelApi("DUPLICATE_NAME", `${path} declares "${entry}" more than once`);
    }
    seen.add(entry);
  }
}

function unknownType(type: unknown, path: string, allowed: string[]) {
  return invalidModelApi(
    "UNKNOWN_TYPE",
    `${path}.type must be one of ${allowed.map((t) => `"${t}"`).join(", ")}, got ${JSON.stringify(type)}`,
  );
}
