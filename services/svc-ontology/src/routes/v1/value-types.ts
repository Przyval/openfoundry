/**
 * The v1 `ValueType` names.
 *
 * v1 describes a property's type with a Pascal-case type expression -
 * `String`, `Array<Integer>`, `Struct<{ a: String }>` - where the OpenFoundry
 * ontology schema uses a `PropertyType` tag (`STRING`) and a separate
 * multiplicity. v2 replaced the whole thing with the structured
 * `ObjectPropertyType`, which is why this translation exists only under v1.
 *
 * The table in `foundry_sdk/v1/ontologies/models.py` enumerates the primitives,
 * `Array<T>`, `Struct<...>` and `TimeSeries<T>`. It does not name the
 * geospatial, vector or media types; those keep their documented Foundry
 * spellings here rather than being dropped, since a client that cannot read the
 * name still learns the property exists.
 */

import type { PropertyDef } from "@openfoundry/ontology-schema";

/** The single-valued v1 name of each ontology property type. */
const VALUE_TYPE_BY_PROPERTY_TYPE: Record<string, string> = {
  STRING: "String",
  BOOLEAN: "Boolean",
  INTEGER: "Integer",
  LONG: "Long",
  DOUBLE: "Double",
  FLOAT: "Float",
  DECIMAL: "Decimal",
  BYTE: "Byte",
  SHORT: "Short",
  DATE: "LocalDate",
  TIMESTAMP: "Timestamp",
  ATTACHMENT: "Attachment",
  MARKING: "Marking",
  GEOSHAPE: "GeoShape",
  GEOHASH: "GeoHash",
  GEOPOINT: "GeoPoint",
  VECTOR: "Vector",
  MEDIA_REFERENCE: "MediaReference",
  // v1 has no resource-identifier value type; a RID travels as its string form.
  RID: "String",
};

/** `TimeSeries<T>`, whose parameter is the type of the series values. */
function timeseriesValueType(def: PropertyDef): string {
  return def.timeseriesValueType === "STRING"
    ? "TimeSeries<String>"
    : "TimeSeries<Double>";
}

/**
 * `Struct<{ field: Type, ... }>`.
 *
 * A struct with no declared fields is rendered as `Struct<{}>` rather than a
 * bare `Struct`, which is not a v1 value type.
 */
function structValueType(def: PropertyDef): string {
  const fields = Object.entries(def.structFields ?? {})
    .map(([name, field]) => `${name}: ${singularValueType(field)}`)
    .join(", ");
  return `Struct<{${fields ? ` ${fields} ` : ""}}>`;
}

function singularValueType(def: PropertyDef): string {
  if (def.type === "TIMESERIES") return timeseriesValueType(def);
  if (def.type === "STRUCT") return structValueType(def);
  return VALUE_TYPE_BY_PROPERTY_TYPE[def.type] ?? def.type;
}

/**
 * The v1 `ValueType` of a property definition.
 *
 * A repeated property - `ARRAY` or `SET` multiplicity - is `Array<T>`; v1 has
 * no distinct set type.
 */
export function toV1ValueType(def: PropertyDef): string {
  const singular = singularValueType(def);
  return def.multiplicity === "SINGLE" ? singular : `Array<${singular}>`;
}
