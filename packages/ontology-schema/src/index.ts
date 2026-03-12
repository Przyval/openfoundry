// Property types and definitions
export {
  PropertyType,
  Multiplicity,
  type PropertyDef,
  type PropertyTypeMap,
  type GeoPoint,
  type GeoJsonGeometry,
  type TimeseriesReference,
  stringProperty,
  integerProperty,
  booleanProperty,
  timestampProperty,
  ridProperty,
  arrayProperty,
  vectorProperty,
} from "./property-types.js";

// Object types
export {
  ObjectTypeStatus,
  type ObjectTypeDefinition,
  type ObjectTypeValidationError,
  validateObjectType,
} from "./object-type.js";

// Action types
export {
  ActionTypeStatus,
  type ActionTypeDefinition,
  type ActionParameter,
  type ModifiedEntity,
  type ActionTypeValidationError,
  validateActionType,
} from "./action-type.js";

// Link types
export {
  LinkCardinality,
  type LinkTypeDefinition,
  type LinkTypeValidationError,
  validateLinkType,
} from "./link-type.js";

// Interface types
export {
  type InterfaceTypeDefinition,
  type InterfaceTypeValidationError,
  validateInterfaceType,
} from "./interface-type.js";

// Query types
export {
  QueryOutputType,
  type QueryTypeDefinition,
  type QueryParameter,
  type QueryOutput,
  type QueryTypeValidationError,
  validateQueryType,
} from "./query-type.js";

// Ontology
export {
  type OntologyDefinition,
  type OntologyValidationError,
  validateOntology,
} from "./ontology.js";
