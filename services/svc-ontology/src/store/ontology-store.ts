import type {
  ObjectTypeDefinition,
  ActionTypeDefinition,
  LinkTypeDefinition,
  InterfaceTypeDefinition,
  QueryTypeDefinition,
} from "@openfoundry/ontology-schema";
import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Stored ontology shape
// ---------------------------------------------------------------------------

export interface SharedPropertyType {
  apiName: string;
  displayName: string;
  dataType: string;
  description: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

export interface StoredOntology {
  rid: string;
  apiName: string;
  displayName: string;
  description: string;
  version: number;
  objectTypes: Map<string, ObjectTypeDefinition>;
  actionTypes: Map<string, ActionTypeDefinition>;
  linkTypes: Map<string, LinkTypeDefinition>;
  interfaceTypes: Map<string, InterfaceTypeDefinition>;
  queryTypes: Map<string, QueryTypeDefinition>;
  sharedPropertyTypes: Map<string, SharedPropertyType>;
}

export interface CreateOntologyInput {
  apiName: string;
  displayName: string;
  description: string;
}

// ---------------------------------------------------------------------------
// OntologyStore — in-memory storage for ontology entities
// ---------------------------------------------------------------------------

export class OntologyStore {
  private readonly ontologies = new Map<string, StoredOntology>();

  // -----------------------------------------------------------------------
  // Ontology CRUD
  // -----------------------------------------------------------------------

  createOntology(input: CreateOntologyInput): StoredOntology {
    // Check for duplicate apiName
    for (const ont of this.ontologies.values()) {
      if (ont.apiName === input.apiName) {
        throw conflict("Ontology", `apiName "${input.apiName}" already exists`);
      }
    }

    const rid = generateRid("ontology", "ontology").toString();
    const ontology: StoredOntology = {
      rid,
      apiName: input.apiName,
      displayName: input.displayName,
      description: input.description,
      version: 1,
      objectTypes: new Map(),
      actionTypes: new Map(),
      linkTypes: new Map(),
      interfaceTypes: new Map(),
      queryTypes: new Map(),
      sharedPropertyTypes: new Map(),
    };

    this.ontologies.set(rid, ontology);
    return ontology;
  }

  getOntology(rid: string): StoredOntology {
    const ontology = this.ontologies.get(rid);
    if (!ontology) {
      throw notFound("Ontology", rid);
    }
    return ontology;
  }

  listOntologies(): StoredOntology[] {
    return Array.from(this.ontologies.values());
  }

  deleteOntology(rid: string): void {
    if (!this.ontologies.has(rid)) {
      throw notFound("Ontology", rid);
    }
    this.ontologies.delete(rid);
  }

  // -----------------------------------------------------------------------
  // Object type CRUD
  // -----------------------------------------------------------------------

  createObjectType(
    ontologyRid: string,
    def: ObjectTypeDefinition,
  ): ObjectTypeDefinition {
    const ontology = this.getOntology(ontologyRid);
    if (ontology.objectTypes.has(def.apiName)) {
      throw conflict(
        "ObjectType",
        `apiName "${def.apiName}" already exists in ontology ${ontologyRid}`,
      );
    }
    ontology.objectTypes.set(def.apiName, def);
    return def;
  }

  getObjectType(
    ontologyRid: string,
    apiName: string,
  ): ObjectTypeDefinition {
    const ontology = this.getOntology(ontologyRid);
    const objectType = ontology.objectTypes.get(apiName);
    if (!objectType) {
      throw notFound("ObjectType", apiName);
    }
    return objectType;
  }

  listObjectTypes(ontologyRid: string): ObjectTypeDefinition[] {
    const ontology = this.getOntology(ontologyRid);
    return Array.from(ontology.objectTypes.values());
  }

  updateObjectType(
    ontologyRid: string,
    apiName: string,
    def: ObjectTypeDefinition,
  ): ObjectTypeDefinition {
    const ontology = this.getOntology(ontologyRid);
    if (!ontology.objectTypes.has(apiName)) {
      throw notFound("ObjectType", apiName);
    }
    ontology.objectTypes.set(apiName, def);
    return def;
  }

  deleteObjectType(ontologyRid: string, apiName: string): void {
    const ontology = this.getOntology(ontologyRid);
    if (!ontology.objectTypes.has(apiName)) {
      throw notFound("ObjectType", apiName);
    }
    ontology.objectTypes.delete(apiName);
  }

  // -----------------------------------------------------------------------
  // Action type CRUD
  // -----------------------------------------------------------------------

  createActionType(
    ontologyRid: string,
    def: ActionTypeDefinition,
  ): ActionTypeDefinition {
    const ontology = this.getOntology(ontologyRid);
    if (ontology.actionTypes.has(def.apiName)) {
      throw conflict(
        "ActionType",
        `apiName "${def.apiName}" already exists in ontology ${ontologyRid}`,
      );
    }
    ontology.actionTypes.set(def.apiName, def);
    return def;
  }

  getActionType(
    ontologyRid: string,
    apiName: string,
  ): ActionTypeDefinition {
    const ontology = this.getOntology(ontologyRid);
    const actionType = ontology.actionTypes.get(apiName);
    if (!actionType) {
      throw notFound("ActionType", apiName);
    }
    return actionType;
  }

  listActionTypes(ontologyRid: string): ActionTypeDefinition[] {
    const ontology = this.getOntology(ontologyRid);
    return Array.from(ontology.actionTypes.values());
  }

  updateActionType(
    ontologyRid: string,
    apiName: string,
    def: ActionTypeDefinition,
  ): ActionTypeDefinition {
    const ontology = this.getOntology(ontologyRid);
    if (!ontology.actionTypes.has(apiName)) {
      throw notFound("ActionType", apiName);
    }
    ontology.actionTypes.set(apiName, def);
    return def;
  }

  deleteActionType(ontologyRid: string, apiName: string): void {
    const ontology = this.getOntology(ontologyRid);
    if (!ontology.actionTypes.has(apiName)) {
      throw notFound("ActionType", apiName);
    }
    ontology.actionTypes.delete(apiName);
  }

  // -----------------------------------------------------------------------
  // Link type CRUD
  // -----------------------------------------------------------------------

  createLinkType(
    ontologyRid: string,
    def: LinkTypeDefinition,
  ): LinkTypeDefinition {
    const ontology = this.getOntology(ontologyRid);
    if (ontology.linkTypes.has(def.apiName)) {
      throw conflict(
        "LinkType",
        `apiName "${def.apiName}" already exists in ontology ${ontologyRid}`,
      );
    }
    ontology.linkTypes.set(def.apiName, def);
    return def;
  }

  getLinkType(
    ontologyRid: string,
    apiName: string,
  ): LinkTypeDefinition {
    const ontology = this.getOntology(ontologyRid);
    const linkType = ontology.linkTypes.get(apiName);
    if (!linkType) {
      throw notFound("LinkType", apiName);
    }
    return linkType;
  }

  listLinkTypes(ontologyRid: string): LinkTypeDefinition[] {
    const ontology = this.getOntology(ontologyRid);
    return Array.from(ontology.linkTypes.values());
  }

  listLinkTypesForObjectType(
    ontologyRid: string,
    objectTypeApiName: string,
  ): LinkTypeDefinition[] {
    const ontology = this.getOntology(ontologyRid);
    // Verify the object type exists
    if (!ontology.objectTypes.has(objectTypeApiName)) {
      throw notFound("ObjectType", objectTypeApiName);
    }
    return Array.from(ontology.linkTypes.values()).filter(
      (lt) =>
        lt.objectTypeApiName === objectTypeApiName ||
        lt.linkedObjectTypeApiName === objectTypeApiName,
    );
  }

  deleteLinkType(ontologyRid: string, apiName: string): void {
    const ontology = this.getOntology(ontologyRid);
    if (!ontology.linkTypes.has(apiName)) {
      throw notFound("LinkType", apiName);
    }
    ontology.linkTypes.delete(apiName);
  }

  // -----------------------------------------------------------------------
  // Interface type CRUD
  // -----------------------------------------------------------------------

  createInterfaceType(
    ontologyRid: string,
    def: InterfaceTypeDefinition,
  ): InterfaceTypeDefinition {
    const ontology = this.getOntology(ontologyRid);
    if (ontology.interfaceTypes.has(def.apiName)) {
      throw conflict(
        "InterfaceType",
        `apiName "${def.apiName}" already exists in ontology ${ontologyRid}`,
      );
    }
    ontology.interfaceTypes.set(def.apiName, def);
    return def;
  }

  getInterfaceType(
    ontologyRid: string,
    apiName: string,
  ): InterfaceTypeDefinition {
    const ontology = this.getOntology(ontologyRid);
    const interfaceType = ontology.interfaceTypes.get(apiName);
    if (!interfaceType) {
      throw notFound("InterfaceType", apiName);
    }
    return interfaceType;
  }

  listInterfaceTypes(ontologyRid: string): InterfaceTypeDefinition[] {
    const ontology = this.getOntology(ontologyRid);
    return Array.from(ontology.interfaceTypes.values());
  }

  deleteInterfaceType(ontologyRid: string, apiName: string): void {
    const ontology = this.getOntology(ontologyRid);
    if (!ontology.interfaceTypes.has(apiName)) {
      throw notFound("InterfaceType", apiName);
    }
    ontology.interfaceTypes.delete(apiName);
  }

  // -----------------------------------------------------------------------
  // Query type CRUD
  // -----------------------------------------------------------------------

  createQueryType(
    ontologyRid: string,
    def: QueryTypeDefinition,
  ): QueryTypeDefinition {
    const ontology = this.getOntology(ontologyRid);
    if (ontology.queryTypes.has(def.apiName)) {
      throw conflict(
        "QueryType",
        `apiName "${def.apiName}" already exists in ontology ${ontologyRid}`,
      );
    }
    ontology.queryTypes.set(def.apiName, def);
    return def;
  }

  getQueryType(
    ontologyRid: string,
    apiName: string,
  ): QueryTypeDefinition {
    const ontology = this.getOntology(ontologyRid);
    const queryType = ontology.queryTypes.get(apiName);
    if (!queryType) {
      throw notFound("QueryType", apiName);
    }
    return queryType;
  }

  listQueryTypes(ontologyRid: string): QueryTypeDefinition[] {
    const ontology = this.getOntology(ontologyRid);
    return Array.from(ontology.queryTypes.values());
  }

  deleteQueryType(ontologyRid: string, apiName: string): void {
    const ontology = this.getOntology(ontologyRid);
    if (!ontology.queryTypes.has(apiName)) {
      throw notFound("QueryType", apiName);
    }
    ontology.queryTypes.delete(apiName);
  }

  // -----------------------------------------------------------------------
  // Shared property type CRUD
  // -----------------------------------------------------------------------

  createSharedPropertyType(
    ontologyRid: string,
    def: SharedPropertyType,
  ): SharedPropertyType {
    const ontology = this.getOntology(ontologyRid);
    if (ontology.sharedPropertyTypes.has(def.apiName)) {
      throw conflict(
        "SharedPropertyType",
        `apiName "${def.apiName}" already exists in ontology ${ontologyRid}`,
      );
    }
    ontology.sharedPropertyTypes.set(def.apiName, def);
    return def;
  }

  getSharedPropertyType(
    ontologyRid: string,
    apiName: string,
  ): SharedPropertyType {
    const ontology = this.getOntology(ontologyRid);
    const spt = ontology.sharedPropertyTypes.get(apiName);
    if (!spt) {
      throw notFound("SharedPropertyType", apiName);
    }
    return spt;
  }

  listSharedPropertyTypes(ontologyRid: string): SharedPropertyType[] {
    const ontology = this.getOntology(ontologyRid);
    return Array.from(ontology.sharedPropertyTypes.values());
  }

  deleteSharedPropertyType(ontologyRid: string, apiName: string): void {
    const ontology = this.getOntology(ontologyRid);
    if (!ontology.sharedPropertyTypes.has(apiName)) {
      throw notFound("SharedPropertyType", apiName);
    }
    ontology.sharedPropertyTypes.delete(apiName);
  }
}
