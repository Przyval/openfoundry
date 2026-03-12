/**
 * Types for the Object Service API.
 * Derived from conjure/object-service.yml.
 */
import type { Rid, PageToken, PropertyMap, OrderByClause } from "./common.js";

// ---------------------------------------------------------------------------
// Core object types
// ---------------------------------------------------------------------------

/** An instance of an object type in an ontology */
export interface OntologyObject {
  rid: Rid;
  objectType: string;
  primaryKey: string;
  properties: PropertyMap;
}

export interface ListObjectsResponse {
  data: OntologyObject[];
  nextPageToken?: PageToken;
}

export interface CreateObjectRequest {
  primaryKey: string;
  properties: PropertyMap;
}

export interface UpdateObjectRequest {
  properties: PropertyMap;
}

// ---------------------------------------------------------------------------
// ObjectSet types
// ---------------------------------------------------------------------------

export type ObjectSetType =
  | "BASE"
  | "FILTER"
  | "UNION"
  | "INTERSECT"
  | "SUBTRACT"
  | "STATIC"
  | "SEARCH_AROUND";

/**
 * Union type representing an object set query, discriminated by the `type` field.
 * Supported types: BASE, FILTER, UNION, INTERSECT, SUBTRACT, STATIC, SEARCH_AROUND.
 */
export interface ObjectSetDefinition {
  type: ObjectSetType;
  objectType?: string;
  objectSet?: ObjectSetDefinition;
  objectSets?: ObjectSetDefinition[];
  filter?: FilterDefinition;
  primaryKeys?: string[];
  link?: string;
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

/**
 * Filter to apply on object properties.
 * Supports eq, gt, gte, lt, lte, contains, isNull, and, or, not operators.
 */
export interface FilterDefinition {
  type: string;
  field?: string;
  value?: unknown;
  filters?: FilterDefinition[];
  filter?: FilterDefinition;
}

// OrderByClause is defined in common.ts and re-exported from index.ts

// ---------------------------------------------------------------------------
// Load objects
// ---------------------------------------------------------------------------

export interface LoadObjectsRequest {
  objectSet: ObjectSetDefinition;
  pageSize?: number;
  pageToken?: PageToken;
  orderBy?: OrderByClause[];
}

export interface LoadObjectsResponse {
  data: OntologyObject[];
  totalCount: number;
  nextPageToken?: PageToken;
}

// ---------------------------------------------------------------------------
// Aggregation types
// ---------------------------------------------------------------------------

export interface AggregationDefinition {
  type: string;
  field?: string;
  name?: string;
}

export interface GroupByDefinition {
  field: string;
  type: string;
}

export interface AggregationResult {
  name?: string;
  value: unknown;
}

export interface GroupedAggregationResult {
  group: Record<string, unknown>;
  metrics: AggregationResult[];
}

export interface AggregateRequest {
  objectSet: ObjectSetDefinition;
  aggregation: AggregationDefinition[];
  groupBy?: GroupByDefinition[];
}

export interface AggregateResponse {
  data: unknown;
}

// ---------------------------------------------------------------------------
// Link types
// ---------------------------------------------------------------------------

export interface LinkInstance {
  sourceObjectType: string;
  sourcePrimaryKey: string;
  linkType: string;
  targetObjectType: string;
  targetPrimaryKey: string;
}

export interface CreateLinkRequest {
  targetObjectType: string;
  targetPrimaryKey: string;
}

export interface ListLinksResponse {
  data: OntologyObject[];
  nextPageToken?: PageToken;
}
