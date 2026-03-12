/**
 * Types for the Ontology Service API.
 * Derived from conjure/ontology-service.yml.
 */
import type { Rid, PageToken } from "./common.js";

// ---------------------------------------------------------------------------
// Core ontology types
// ---------------------------------------------------------------------------

export interface OntologyV2 {
  rid: Rid;
  apiName: string;
  displayName: string;
  description: string;
  version: string;
}

export interface CreateOntologyRequest {
  apiName: string;
  displayName: string;
  description: string;
}

export interface ListOntologiesResponse {
  data: OntologyV2[];
  nextPageToken?: PageToken;
}

// ---------------------------------------------------------------------------
// Property & parameter definitions
// ---------------------------------------------------------------------------

export interface PropertyDefinition {
  apiName: string;
  displayName: string;
  description?: string;
  dataType: string;
  primaryKey?: boolean;
}

export interface ParameterDefinition {
  apiName: string;
  displayName: string;
  description?: string;
  dataType: string;
  required?: boolean;
}

// ---------------------------------------------------------------------------
// Object types
// ---------------------------------------------------------------------------

export interface ObjectTypeV2 {
  apiName: string;
  displayName: string;
  description?: string;
  primaryKey: string;
  properties: Record<string, PropertyDefinition>;
  rid?: Rid;
  titleProperty?: string;
  status?: string;
  implementsInterfaces?: string[];
}

export interface ListObjectTypesResponse {
  data: ObjectTypeV2[];
  nextPageToken?: PageToken;
}

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export interface ActionTypeV2 {
  apiName: string;
  displayName: string;
  description?: string;
  parameters: Record<string, ParameterDefinition>;
  rid?: Rid;
  status?: string;
}

export interface ListActionTypesResponse {
  data: ActionTypeV2[];
  nextPageToken?: PageToken;
}

// ---------------------------------------------------------------------------
// Link types
// ---------------------------------------------------------------------------

export interface LinkTypeV2 {
  apiName: string;
  displayName: string;
  description?: string;
  sourceObjectType: string;
  targetObjectType: string;
  cardinality?: string;
  rid?: Rid;
  status?: string;
}

export interface ListLinkTypesResponse {
  data: LinkTypeV2[];
  nextPageToken?: PageToken;
}

// ---------------------------------------------------------------------------
// Interface types
// ---------------------------------------------------------------------------

export interface InterfaceTypeV2 {
  apiName: string;
  displayName: string;
  description?: string;
  properties?: Record<string, PropertyDefinition>;
  extendsInterfaces?: string[];
  rid?: Rid;
}

export interface ListInterfaceTypesResponse {
  data: InterfaceTypeV2[];
  nextPageToken?: PageToken;
}
