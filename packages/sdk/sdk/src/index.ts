// Main client
export { FoundryClient, createFoundryClient } from "./foundry-client.js";
export type { FoundryClientOptions } from "./foundry-client.js";

// API namespaces
export type { OntologiesApi } from "./api/ontologies.js";
export type { ObjectsApi } from "./api/objects.js";
export type { ActionsApi } from "./api/actions.js";
export type { DatasetsApi } from "./api/datasets.js";
export type { AdminApi } from "./api/admin.js";

// SDK response types
export type {
  // Ontology metadata
  Ontology,
  ObjectType,
  ActionType,
  LinkType,
  InterfaceType,
  ActionParameterDefinition,

  // Objects
  OntologyObject,

  // Actions
  ActionResult,
  ValidationResult,
  BatchResult,
  ObjectEdits,
  ObjectEdit,
  SubmissionCriterion,
  ParameterEvaluation,
  EvaluatedConstraint,

  // Aggregations
  AggregationResponse,
  AggregationGroup,
  AggregationMetricResult,

  // Datasets
  Dataset,
  Branch,
  Transaction,

  // Admin
  User,
  Group,

  // Request params
  ListParams,
  ListObjectsParams,
  LoadObjectSetRequest,
  AggregateObjectsRequest,
  GroupByClause,
  OrderByClause,
  OrderByField,
  ApplyActionParams,
  ApplyBatchParams,
  CreateDatasetRequest,
  CreateUserRequest,
} from "./types.js";

// Re-export commonly used types from dependencies for convenience
export type { PageResponse } from "@openfoundry/pagination";
export type { Client, TokenProvider } from "@openfoundry/client";
