/**
 * Converters between OntologyDefinition (schema) and OntologyIr.
 */

import type {
  OntologyDefinition,
  ObjectTypeDefinition,
  ActionTypeDefinition,
  LinkTypeDefinition,
  InterfaceTypeDefinition,
  QueryTypeDefinition,
  PropertyDef,
  PropertyType,
  ActionParameter,
  QueryOutput,
  QueryParameter,
} from "@openfoundry/ontology-schema";

import type {
  OntologyIr,
  ObjectTypeIr,
  ActionTypeIr,
  LinkTypeIr,
  InterfaceTypeIr,
  QueryTypeIr,
  PropertyIr,
  PropertyTypeIr,
  ParameterIr,
  ModifiedEntity,
  QueryOutputIr,
} from "./ontology-ir.js";

// ---------------------------------------------------------------------------
// Schema -> IR conversion
// ---------------------------------------------------------------------------

function propertyDefToIr(apiName: string, def: PropertyDef): PropertyIr {
  return {
    apiName,
    type: def.type as PropertyTypeIr,
    nullable: def.nullable,
    array: def.multiplicity === "ARRAY" || def.multiplicity === "SET",
    description: def.description,
  };
}

function objectTypeToIr(def: ObjectTypeDefinition): ObjectTypeIr {
  const properties: Record<string, PropertyIr> = {};
  for (const [key, prop] of Object.entries(def.properties)) {
    properties[key] = propertyDefToIr(key, prop);
  }
  return {
    apiName: def.apiName,
    primaryKey: def.primaryKeyApiName,
    properties,
    implements: [...def.implements],
    titleProperty: def.titlePropertyApiName,
    status: def.status,
  };
}

function actionTypeToIr(def: ActionTypeDefinition): ActionTypeIr {
  const parameters: Record<string, ParameterIr> = {};
  for (const [key, param] of Object.entries(def.parameters)) {
    parameters[key] = {
      type: param.type as PropertyTypeIr,
      required: param.required,
      description: param.description,
    };
  }

  const modifiedEntities: ModifiedEntity[] = [];
  for (const [objType, entity] of Object.entries(def.modifiedEntities)) {
    if (entity.created) {
      modifiedEntities.push({ objectType: objType, modification: "CREATED" });
    }
    if (entity.modified) {
      modifiedEntities.push({ objectType: objType, modification: "MODIFIED" });
    }
  }

  return {
    apiName: def.apiName,
    parameters,
    modifiedEntities,
  };
}

function linkTypeToIr(def: LinkTypeDefinition): LinkTypeIr {
  return {
    apiName: def.apiName,
    objectTypeA: def.objectTypeApiName,
    objectTypeB: def.linkedObjectTypeApiName,
    cardinality: def.cardinality as "ONE" | "MANY",
  };
}

function interfaceTypeToIr(def: InterfaceTypeDefinition): InterfaceTypeIr {
  const properties: Record<string, PropertyIr> = {};
  for (const [key, prop] of Object.entries(def.properties)) {
    properties[key] = propertyDefToIr(key, prop);
  }
  return {
    apiName: def.apiName,
    properties,
    extendsInterfaces: [...def.extendsInterfaces],
  };
}

function queryOutputToIr(output: QueryOutput): QueryOutputIr {
  switch (output.type) {
    case "OBJECT_SET":
    case "OBJECT":
      return { objectType: output.objectTypeApiName ?? "" };
    case "ARRAY":
    case "SET":
      if (output.elementOutput) {
        return { list: queryOutputToIr(output.elementOutput) };
      }
      return { type: "STRING" };
    case "PRIMITIVE":
      return { type: (output.primitiveType ?? "STRING") as PropertyTypeIr };
    case "STRUCT":
      return { type: "STRUCT" };
    case "UNION":
      return { type: "STRING" };
    default:
      return { type: "STRING" };
  }
}

function queryTypeToIr(def: QueryTypeDefinition): QueryTypeIr {
  const parameters: Record<string, ParameterIr> = {};
  for (const [key, param] of Object.entries(def.parameters)) {
    parameters[key] = {
      type: param.type as PropertyTypeIr,
      required: param.required,
      description: param.description,
    };
  }
  return {
    apiName: def.apiName,
    version: def.version,
    parameters,
    output: queryOutputToIr(def.output),
  };
}

/**
 * Converts an OntologyDefinition (schema types) into an OntologyIr.
 */
export function ontologyToIr(ontology: OntologyDefinition): OntologyIr {
  const objectTypes: Record<string, ObjectTypeIr> = {};
  for (const [key, obj] of Object.entries(ontology.objectTypes)) {
    objectTypes[key] = objectTypeToIr(obj);
  }

  const actionTypes: Record<string, ActionTypeIr> = {};
  for (const [key, action] of Object.entries(ontology.actionTypes)) {
    actionTypes[key] = actionTypeToIr(action);
  }

  const linkTypes: Record<string, LinkTypeIr> = {};
  for (const [key, link] of Object.entries(ontology.linkTypes)) {
    linkTypes[key] = linkTypeToIr(link);
  }

  const interfaceTypes: Record<string, InterfaceTypeIr> = {};
  for (const [key, iface] of Object.entries(ontology.interfaceTypes)) {
    interfaceTypes[key] = interfaceTypeToIr(iface);
  }

  const queryTypes: Record<string, QueryTypeIr> = {};
  for (const [key, query] of Object.entries(ontology.queryTypes)) {
    queryTypes[key] = queryTypeToIr(query);
  }

  const now = new Date().toISOString();

  return {
    apiName: ontology.apiName,
    version: "1.0.0",
    objectTypes,
    actionTypes,
    linkTypes,
    interfaceTypes,
    queryTypes,
    metadata: {
      createdAt: now,
      updatedAt: now,
      description: ontology.description,
    },
  };
}

// ---------------------------------------------------------------------------
// IR -> Schema conversion
// ---------------------------------------------------------------------------

function irToPropertyDef(prop: PropertyIr): PropertyDef {
  return {
    type: prop.type as PropertyType,
    nullable: prop.nullable,
    multiplicity: prop.array ? "ARRAY" : "SINGLE",
    description: prop.description,
  };
}

function irToObjectType(ir: ObjectTypeIr): ObjectTypeDefinition {
  const properties: Record<string, PropertyDef> = {};
  for (const [key, prop] of Object.entries(ir.properties)) {
    properties[key] = irToPropertyDef(prop);
  }

  // Determine primary key type from the properties
  const pkProp = ir.properties[ir.primaryKey];
  const primaryKeyType: PropertyType = pkProp
    ? (pkProp.type as PropertyType)
    : ("STRING" as PropertyType);

  return {
    apiName: ir.apiName,
    description: `Object type: ${ir.apiName}`,
    primaryKeyApiName: ir.primaryKey,
    primaryKeyType,
    titlePropertyApiName: ir.titleProperty ?? ir.primaryKey,
    properties,
    implements: [...ir.implements],
    status: ir.status as "ACTIVE" | "EXPERIMENTAL" | "DEPRECATED",
  };
}

function irToActionType(ir: ActionTypeIr): ActionTypeDefinition {
  const parameters: Record<string, ActionParameter> = {};
  for (const [key, param] of Object.entries(ir.parameters)) {
    parameters[key] = {
      type: param.type as PropertyType,
      required: param.required,
      description: param.description,
    };
  }

  const modifiedEntities: Record<
    string,
    { created: boolean; modified: boolean }
  > = {};
  for (const entity of ir.modifiedEntities) {
    if (!modifiedEntities[entity.objectType]) {
      modifiedEntities[entity.objectType] = {
        created: false,
        modified: false,
      };
    }
    if (entity.modification === "CREATED") {
      modifiedEntities[entity.objectType] = {
        ...modifiedEntities[entity.objectType],
        created: true,
      };
    } else if (entity.modification === "MODIFIED") {
      modifiedEntities[entity.objectType] = {
        ...modifiedEntities[entity.objectType],
        modified: true,
      };
    }
  }

  return {
    apiName: ir.apiName,
    description: `Action type: ${ir.apiName}`,
    parameters,
    modifiedEntities,
    status: "ACTIVE",
  };
}

function irToLinkType(ir: LinkTypeIr): LinkTypeDefinition {
  return {
    apiName: ir.apiName,
    objectTypeApiName: ir.objectTypeA,
    linkedObjectTypeApiName: ir.objectTypeB,
    cardinality: ir.cardinality,
    foreignKeyPropertyApiName: `${ir.objectTypeB}Id`,
  };
}

function irToInterfaceType(ir: InterfaceTypeIr): InterfaceTypeDefinition {
  const properties: Record<string, PropertyDef> = {};
  for (const [key, prop] of Object.entries(ir.properties)) {
    properties[key] = irToPropertyDef(prop);
  }
  return {
    apiName: ir.apiName,
    description: `Interface type: ${ir.apiName}`,
    properties,
    extendsInterfaces: [...ir.extendsInterfaces],
  };
}

function irToQueryOutput(output: QueryOutputIr): QueryOutput {
  if ("objectType" in output) {
    return {
      type: "OBJECT_SET",
      objectTypeApiName: output.objectType,
    };
  }
  if ("list" in output) {
    return {
      type: "ARRAY",
      elementOutput: irToQueryOutput(output.list),
    };
  }
  return {
    type: "PRIMITIVE",
    primitiveType: output.type as PropertyType,
  };
}

function irToQueryType(ir: QueryTypeIr): QueryTypeDefinition {
  const parameters: Record<string, QueryParameter> = {};
  for (const [key, param] of Object.entries(ir.parameters)) {
    parameters[key] = {
      type: param.type as PropertyType,
      required: param.required,
      description: param.description,
    };
  }
  return {
    apiName: ir.apiName,
    version: ir.version,
    description: `Query type: ${ir.apiName}`,
    parameters,
    output: irToQueryOutput(ir.output),
  };
}

/**
 * Converts an OntologyIr back to an OntologyDefinition (schema types).
 */
export function irToOntology(ir: OntologyIr): OntologyDefinition {
  const objectTypes: Record<string, ObjectTypeDefinition> = {};
  for (const [key, obj] of Object.entries(ir.objectTypes)) {
    objectTypes[key] = irToObjectType(obj);
  }

  const actionTypes: Record<string, ActionTypeDefinition> = {};
  for (const [key, action] of Object.entries(ir.actionTypes)) {
    actionTypes[key] = irToActionType(action);
  }

  const linkTypes: Record<string, LinkTypeDefinition> = {};
  for (const [key, link] of Object.entries(ir.linkTypes)) {
    linkTypes[key] = irToLinkType(link);
  }

  const interfaceTypes: Record<string, InterfaceTypeDefinition> = {};
  for (const [key, iface] of Object.entries(ir.interfaceTypes)) {
    interfaceTypes[key] = irToInterfaceType(iface);
  }

  const queryTypes: Record<string, QueryTypeDefinition> = {};
  for (const [key, query] of Object.entries(ir.queryTypes)) {
    queryTypes[key] = irToQueryType(query);
  }

  return {
    rid: `ri.ontology.main.ontology.${ir.apiName}`,
    apiName: ir.apiName,
    displayName: ir.apiName,
    description: ir.metadata.description ?? "",
    objectTypes,
    actionTypes,
    linkTypes,
    interfaceTypes,
    queryTypes,
  };
}
