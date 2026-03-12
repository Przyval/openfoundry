// IR types
export {
  type OntologyIr,
  type ObjectTypeIr,
  type ActionTypeIr,
  type LinkTypeIr,
  type InterfaceTypeIr,
  type QueryTypeIr,
  type PropertyIr,
  type PropertyTypeIr,
  type ParameterIr,
  type ModifiedEntity,
  type QueryOutputIr,
  type OntologyMetadata,
  PROPERTY_TYPE_IR_VALUES,
} from "./ontology-ir.js";

// Converter
export { ontologyToIr, irToOntology } from "./ir-converter.js";

// Serializer
export {
  serializeOntologyIr,
  deserializeOntologyIr,
  validateOntologyIr,
} from "./ir-serializer.js";
