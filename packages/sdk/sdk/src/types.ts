import type { PropertyDef, PropertyType } from "@openfoundry/ontology-schema";
import type { ObjectSet, Filter, Aggregation } from "@openfoundry/object-set";

// ---------------------------------------------------------------------------
// Ontology types
// ---------------------------------------------------------------------------

/**
 * An ontology returned by the platform API.
 */
export interface Ontology {
  readonly rid: string;
  readonly apiName: string;
  readonly displayName: string;
  readonly description: string;
}

/**
 * An object type within an ontology.
 */
export interface ObjectType {
  readonly apiName: string;
  readonly description: string;
  readonly primaryKeyApiName: string;
  readonly primaryKeyType: PropertyType;
  readonly titlePropertyApiName: string;
  readonly properties: Record<string, PropertyDef>;
  readonly status: string;
  readonly rid?: string;
}

/**
 * An action type within an ontology.
 */
export interface ActionType {
  readonly apiName: string;
  readonly description: string;
  readonly parameters: Record<string, ActionParameterDefinition>;
  readonly status: string;
  readonly rid?: string;
}

/**
 * An action parameter definition as returned by the API.
 */
export interface ActionParameterDefinition {
  readonly description?: string;
  readonly type: PropertyType;
  readonly required: boolean;
  readonly objectTypeApiName?: string;
}

/**
 * A link type within an ontology.
 */
export interface LinkType {
  readonly apiName: string;
  readonly objectTypeApiName: string;
  readonly linkedObjectTypeApiName: string;
  readonly cardinality: string;
  readonly foreignKeyPropertyApiName: string;
}

/**
 * An interface type within an ontology.
 */
export interface InterfaceType {
  readonly apiName: string;
  readonly description: string;
  readonly properties: Record<string, PropertyDef>;
  readonly extendsInterfaces: readonly string[];
}

// ---------------------------------------------------------------------------
// Object types
// ---------------------------------------------------------------------------

/**
 * A concrete ontology object instance with dynamic properties.
 */
export interface OntologyObject {
  readonly __apiName: string;
  readonly __primaryKey: string | number;
  readonly __rid?: string;
  readonly [property: string]: unknown;
}

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

/**
 * Result of applying an action.
 */
export interface ActionResult {
  readonly edits?: ObjectEdits;
  readonly validation?: ValidationResult;
}

/**
 * Object edits that resulted from an action.
 */
export interface ObjectEdits {
  readonly type: string;
  readonly edits: readonly ObjectEdit[];
  readonly totalEditedObjectsCount: number;
}

/**
 * A single object edit within an action result.
 */
export interface ObjectEdit {
  readonly type: "addObject" | "modifyObject" | "addLink" | "removeLink";
  readonly objectType?: string;
  readonly primaryKey?: string | number;
}

/**
 * Result of action validation.
 */
export interface ValidationResult {
  readonly result: "VALID" | "INVALID";
  readonly submissionCriteria: readonly SubmissionCriterion[];
  readonly parameters: Record<string, ParameterEvaluation>;
}

/**
 * A criterion that must be satisfied for action submission.
 */
export interface SubmissionCriterion {
  readonly configuredFailureMessage: string;
  readonly result: "VALID" | "INVALID";
}

/**
 * Evaluation result for a single action parameter.
 */
export interface ParameterEvaluation {
  readonly result: "VALID" | "INVALID";
  readonly evaluatedConstraints: readonly EvaluatedConstraint[];
}

/**
 * Evaluation result for a single constraint on a parameter.
 */
export interface EvaluatedConstraint {
  readonly constraintType: string;
  readonly result: "VALID" | "INVALID";
}

/**
 * Result of a batch action apply.
 */
export interface BatchResult {
  readonly edits?: ObjectEdits;
}

// ---------------------------------------------------------------------------
// Aggregation types
// ---------------------------------------------------------------------------

/**
 * Response from an aggregation request.
 */
export interface AggregationResponse {
  readonly data: readonly AggregationGroup[];
  readonly excludedItems?: number;
}

/**
 * A single group in an aggregation response.
 */
export interface AggregationGroup {
  readonly group: Record<string, unknown>;
  readonly metrics: readonly AggregationMetricResult[];
}

/**
 * A single metric result in an aggregation group.
 */
export interface AggregationMetricResult {
  readonly name: string;
  readonly value: number | null;
}

// ---------------------------------------------------------------------------
// Dataset types
// ---------------------------------------------------------------------------

/**
 * A dataset resource.
 */
export interface Dataset {
  readonly rid: string;
  readonly name: string;
  readonly description?: string;
  readonly parentFolderRid: string;
}

/**
 * A branch within a dataset.
 */
export interface Branch {
  readonly branchId: string;
  readonly transactionRid?: string;
}

/**
 * A transaction within a dataset.
 */
export interface Transaction {
  readonly rid: string;
  readonly transactionType: "APPEND" | "UPDATE" | "SNAPSHOT" | "DELETE";
  readonly status: "OPEN" | "COMMITTED" | "ABORTED";
  readonly createdTime: string;
}

// ---------------------------------------------------------------------------
// Admin types
// ---------------------------------------------------------------------------

/**
 * A platform user.
 */
export interface User {
  readonly id: string;
  readonly username: string;
  readonly givenName?: string;
  readonly familyName?: string;
  readonly email?: string;
  readonly realm?: string;
  readonly attributes: Record<string, readonly string[]>;
}

/**
 * A platform group.
 */
export interface Group {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly attributes: Record<string, readonly string[]>;
}

// ---------------------------------------------------------------------------
// Request parameter types
// ---------------------------------------------------------------------------

/**
 * Common pagination parameters for list endpoints.
 */
export interface ListParams {
  readonly pageSize?: number;
  readonly pageToken?: string;
}

/**
 * Parameters for listing objects.
 */
export interface ListObjectsParams extends ListParams {
  readonly orderBy?: string;
  readonly properties?: readonly string[];
  readonly excludeRid?: boolean;
}

/**
 * Request body for loading an object set.
 */
export interface LoadObjectSetRequest {
  readonly objectSet: ObjectSet;
  readonly select?: readonly string[];
  readonly orderBy?: OrderByClause;
  readonly pageSize?: number;
  readonly pageToken?: string;
  readonly excludeRid?: boolean;
}

/**
 * An ordering clause for object queries.
 */
export interface OrderByClause {
  readonly fields: readonly OrderByField[];
}

/**
 * A single field in an order-by clause.
 */
export interface OrderByField {
  readonly fieldApiName: string;
  readonly direction: "asc" | "desc";
}

/**
 * Request body for aggregations.
 */
export interface AggregateObjectsRequest {
  readonly objectSet: ObjectSet;
  readonly groupBy: readonly GroupByClause[];
  readonly aggregation: readonly Aggregation[];
  readonly where?: Filter;
}

/**
 * A group-by clause in an aggregation request.
 */
export interface GroupByClause {
  readonly field: string;
  readonly type: "exact" | "ranges" | "fixedWidth" | "duration";
}

/**
 * Parameters for applying an action.
 */
export interface ApplyActionParams {
  readonly parameters: Record<string, unknown>;
}

/**
 * Parameters for batch action apply.
 */
export interface ApplyBatchParams {
  readonly requests: readonly ApplyActionParams[];
}

/**
 * Parameters for creating a dataset.
 */
export interface CreateDatasetRequest {
  readonly name: string;
  readonly parentFolderRid: string;
  readonly description?: string;
}

/**
 * Parameters for creating a user.
 */
export interface CreateUserRequest {
  readonly username: string;
  readonly givenName?: string;
  readonly familyName?: string;
  readonly email?: string;
  readonly realm?: string;
  readonly attributes?: Record<string, readonly string[]>;
}
