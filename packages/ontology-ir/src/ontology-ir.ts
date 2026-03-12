/**
 * Ontology IR (Intermediate Representation) types.
 *
 * These types represent the compiled form of an ontology definition,
 * suitable for serialization, deployment, and code generation.
 */

// ---------------------------------------------------------------------------
// Property type IR — mirrors ontology-schema PropertyType values
// ---------------------------------------------------------------------------

export type PropertyTypeIr =
  | "STRING"
  | "BOOLEAN"
  | "INTEGER"
  | "LONG"
  | "DOUBLE"
  | "FLOAT"
  | "DECIMAL"
  | "BYTE"
  | "SHORT"
  | "DATE"
  | "TIMESTAMP"
  | "ATTACHMENT"
  | "GEOSHAPE"
  | "GEOHASH"
  | "GEOPOINT"
  | "MARKING"
  | "VECTOR"
  | "TIMESERIES"
  | "STRUCT"
  | "MEDIA_REFERENCE"
  | "RID";

/** All valid PropertyTypeIr values. */
export const PROPERTY_TYPE_IR_VALUES: readonly PropertyTypeIr[] = [
  "STRING",
  "BOOLEAN",
  "INTEGER",
  "LONG",
  "DOUBLE",
  "FLOAT",
  "DECIMAL",
  "BYTE",
  "SHORT",
  "DATE",
  "TIMESTAMP",
  "ATTACHMENT",
  "GEOSHAPE",
  "GEOHASH",
  "GEOPOINT",
  "MARKING",
  "VECTOR",
  "TIMESERIES",
  "STRUCT",
  "MEDIA_REFERENCE",
  "RID",
];

// ---------------------------------------------------------------------------
// Property IR
// ---------------------------------------------------------------------------

export interface PropertyIr {
  readonly apiName: string;
  readonly type: PropertyTypeIr;
  readonly nullable: boolean;
  readonly array: boolean;
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Object type IR
// ---------------------------------------------------------------------------

export interface ObjectTypeIr {
  readonly apiName: string;
  readonly primaryKey: string;
  readonly properties: Record<string, PropertyIr>;
  readonly implements: readonly string[];
  readonly titleProperty?: string;
  readonly status: string;
}

// ---------------------------------------------------------------------------
// Action type IR
// ---------------------------------------------------------------------------

export interface ParameterIr {
  readonly type: PropertyTypeIr;
  readonly required: boolean;
  readonly description?: string;
}

export interface ModifiedEntity {
  readonly objectType: string;
  readonly modification: "CREATED" | "MODIFIED" | "DELETED";
}

export interface ActionTypeIr {
  readonly apiName: string;
  readonly parameters: Record<string, ParameterIr>;
  readonly modifiedEntities: readonly ModifiedEntity[];
}

// ---------------------------------------------------------------------------
// Link type IR
// ---------------------------------------------------------------------------

export interface LinkTypeIr {
  readonly apiName: string;
  readonly objectTypeA: string;
  readonly objectTypeB: string;
  readonly cardinality: "ONE" | "MANY";
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Interface type IR
// ---------------------------------------------------------------------------

export interface InterfaceTypeIr {
  readonly apiName: string;
  readonly properties: Record<string, PropertyIr>;
  readonly extendsInterfaces: readonly string[];
}

// ---------------------------------------------------------------------------
// Query type IR
// ---------------------------------------------------------------------------

export type QueryOutputIr =
  | { readonly type: PropertyTypeIr }
  | { readonly objectType: string }
  | { readonly list: QueryOutputIr };

export interface QueryTypeIr {
  readonly apiName: string;
  readonly version: string;
  readonly parameters: Record<string, ParameterIr>;
  readonly output: QueryOutputIr;
}

// ---------------------------------------------------------------------------
// Ontology metadata
// ---------------------------------------------------------------------------

export interface OntologyMetadata {
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Full ontology IR
// ---------------------------------------------------------------------------

export interface OntologyIr {
  readonly apiName: string;
  readonly version: string;
  readonly objectTypes: Record<string, ObjectTypeIr>;
  readonly actionTypes: Record<string, ActionTypeIr>;
  readonly linkTypes: Record<string, LinkTypeIr>;
  readonly interfaceTypes: Record<string, InterfaceTypeIr>;
  readonly queryTypes: Record<string, QueryTypeIr>;
  readonly metadata: OntologyMetadata;
}
