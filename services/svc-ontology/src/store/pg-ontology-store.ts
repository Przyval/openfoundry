import type pg from "pg";
import { sql, jsonbSet } from "@openfoundry/db";
import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";
import type {
  ObjectTypeDefinition,
  ActionTypeDefinition,
  LinkTypeDefinition,
  InterfaceTypeDefinition,
  QueryTypeDefinition,
} from "@openfoundry/ontology-schema";
import type { StoredOntology, CreateOntologyInput, SharedPropertyType } from "./ontology-store.js";

// ---------------------------------------------------------------------------
// Row types returned from the database
// ---------------------------------------------------------------------------

interface OntologyRow {
  rid: string;
  api_name: string;
  display_name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface ObjectTypeRow {
  rid: string;
  ontology_rid: string;
  api_name: string;
  display_name: string;
  description: string;
  primary_key_api_name: string;
  primary_key_type: string;
  title_property_api_name: string;
  properties: Record<string, unknown>;
  implements: string[];
  status: string;
}

interface ActionTypeRow {
  rid: string;
  ontology_rid: string;
  api_name: string;
  description: string;
  parameters: Record<string, unknown>;
  modified_entities: Record<string, unknown>;
  status: string;
}

interface LinkTypeRow {
  rid: string;
  ontology_rid: string;
  api_name: string;
  object_type_api_name: string;
  linked_object_type_api_name: string;
  cardinality: string;
  foreign_key_property: string;
  description: string;
}

interface InterfaceTypeRow {
  rid: string;
  ontology_rid: string;
  api_name: string;
  description: string;
  properties: Record<string, unknown>;
  extends_interfaces: string[];
}

interface QueryTypeRow {
  rid: string;
  ontology_rid: string;
  api_name: string;
  version: string;
  description: string;
  parameters: Record<string, unknown>;
  output: Record<string, unknown>;
}

interface SharedPropertyTypeRow {
  rid: string;
  ontology_rid: string;
  api_name: string;
  display_name: string;
  data_type: string;
  description: string;
  validation: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Row to domain conversions
// ---------------------------------------------------------------------------

function rowToObjectType(row: ObjectTypeRow): ObjectTypeDefinition {
  return {
    apiName: row.api_name,
    description: row.description ?? "",
    primaryKeyApiName: row.primary_key_api_name,
    primaryKeyType: row.primary_key_type as ObjectTypeDefinition["primaryKeyType"],
    titlePropertyApiName: row.title_property_api_name ?? "",
    properties: row.properties as ObjectTypeDefinition["properties"],
    implements: row.implements ?? [],
    status: row.status as ObjectTypeDefinition["status"],
  };
}

function rowToActionType(row: ActionTypeRow): ActionTypeDefinition {
  return {
    apiName: row.api_name,
    description: row.description ?? "",
    parameters: row.parameters as ActionTypeDefinition["parameters"],
    modifiedEntities: row.modified_entities as ActionTypeDefinition["modifiedEntities"],
    status: row.status as ActionTypeDefinition["status"],
  };
}

function rowToLinkType(row: LinkTypeRow): LinkTypeDefinition {
  return {
    apiName: row.api_name,
    objectTypeApiName: row.object_type_api_name,
    linkedObjectTypeApiName: row.linked_object_type_api_name,
    cardinality: row.cardinality as LinkTypeDefinition["cardinality"],
    foreignKeyPropertyApiName: row.foreign_key_property ?? "",
  };
}

function rowToInterfaceType(row: InterfaceTypeRow): InterfaceTypeDefinition {
  return {
    apiName: row.api_name,
    description: row.description ?? "",
    properties: row.properties as InterfaceTypeDefinition["properties"],
    extendsInterfaces: row.extends_interfaces ?? [],
  };
}

function rowToQueryType(row: QueryTypeRow): QueryTypeDefinition {
  return {
    apiName: row.api_name,
    version: row.version ?? "1",
    description: row.description ?? "",
    parameters: row.parameters as QueryTypeDefinition["parameters"],
    output: row.output as unknown as QueryTypeDefinition["output"],
  };
}

function rowToSharedPropertyType(row: SharedPropertyTypeRow): SharedPropertyType {
  return {
    apiName: row.api_name,
    displayName: row.display_name ?? "",
    dataType: row.data_type,
    description: row.description ?? "",
    validation: row.validation as SharedPropertyType["validation"],
  };
}

// ---------------------------------------------------------------------------
// PgOntologyStore
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed ontology store.  Uses parameterised queries exclusively.
 */
export class PgOntologyStore {
  constructor(private pool: pg.Pool) {}

  // -----------------------------------------------------------------------
  // Ontology CRUD
  // -----------------------------------------------------------------------

  async createOntology(input: CreateOntologyInput): Promise<StoredOntology> {
    const rid = generateRid("ontology", "ontology").toString();

    const q = sql()
      .insertInto("ontologies", {
        rid,
        api_name: input.apiName,
        display_name: input.displayName,
        description: input.description,
      })
      .returning();

    try {
      const { rows } = await this.pool.query<OntologyRow>(q.build());
      return this.hydrateOntology(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict("Ontology", `apiName "${input.apiName}" already exists`);
      }
      throw err;
    }
  }

  async getOntology(rid: string): Promise<StoredOntology> {
    const q = sql()
      .select("*")
      .from("ontologies")
      .where("rid = ?", rid);

    const { rows } = await this.pool.query<OntologyRow>(q.build());
    if (rows.length === 0) {
      throw notFound("Ontology", rid);
    }
    return this.hydrateOntology(rows[0]);
  }

  async listOntologies(
    pageSize = 100,
    offset = 0,
  ): Promise<{ items: StoredOntology[]; total: number }> {
    const countQ = sql().select("COUNT(*)::int AS total").from("ontologies");
    const { rows: countRows } = await this.pool.query<{ total: number }>(countQ.build());
    const total = countRows[0].total;

    const q = sql()
      .select("*")
      .from("ontologies")
      .orderBy("created_at", "ASC")
      .limit(pageSize)
      .offset(offset);

    const { rows } = await this.pool.query<OntologyRow>(q.build());
    const items = await Promise.all(rows.map((r) => this.hydrateOntology(r)));
    return { items, total };
  }

  async deleteOntology(rid: string): Promise<void> {
    const q = sql()
      .deleteFrom("ontologies")
      .where("rid = ?", rid);

    const result = await this.pool.query(q.build());
    if (result.rowCount === 0) {
      throw notFound("Ontology", rid);
    }
  }

  // -----------------------------------------------------------------------
  // Object type CRUD
  // -----------------------------------------------------------------------

  async createObjectType(
    ontologyRid: string,
    def: ObjectTypeDefinition,
  ): Promise<ObjectTypeDefinition> {
    // Verify ontology exists
    await this.ensureOntologyExists(ontologyRid);

    const rid = generateRid("ontology", "object-type").toString();
    const q = sql()
      .insertInto("object_types", {
        rid,
        ontology_rid: ontologyRid,
        api_name: def.apiName,
        display_name: def.apiName,
        description: def.description,
        primary_key_api_name: def.primaryKeyApiName,
        primary_key_type: def.primaryKeyType,
        title_property_api_name: def.titlePropertyApiName,
        properties: jsonbSet(def.properties as unknown as Record<string, unknown>),
        implements: def.implements as unknown as string[],
        status: def.status,
      })
      .returning();

    try {
      const { rows } = await this.pool.query<ObjectTypeRow>(q.build());
      return rowToObjectType(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict(
          "ObjectType",
          `apiName "${def.apiName}" already exists in ontology ${ontologyRid}`,
        );
      }
      throw err;
    }
  }

  async getObjectType(
    ontologyRid: string,
    apiName: string,
  ): Promise<ObjectTypeDefinition> {
    const q = sql()
      .select("*")
      .from("object_types")
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName);

    const { rows } = await this.pool.query<ObjectTypeRow>(q.build());
    if (rows.length === 0) {
      throw notFound("ObjectType", apiName);
    }
    return rowToObjectType(rows[0]);
  }

  async listObjectTypes(
    ontologyRid: string,
    pageSize = 100,
    offset = 0,
  ): Promise<{ items: ObjectTypeDefinition[]; total: number }> {
    const countQ = sql()
      .select("COUNT(*)::int AS total")
      .from("object_types")
      .where("ontology_rid = ?", ontologyRid);
    const { rows: countRows } = await this.pool.query<{ total: number }>(countQ.build());
    const total = countRows[0].total;

    const q = sql()
      .select("*")
      .from("object_types")
      .where("ontology_rid = ?", ontologyRid)
      .orderBy("api_name", "ASC")
      .limit(pageSize)
      .offset(offset);

    const { rows } = await this.pool.query<ObjectTypeRow>(q.build());
    return { items: rows.map(rowToObjectType), total };
  }

  async updateObjectType(
    ontologyRid: string,
    apiName: string,
    def: Partial<ObjectTypeDefinition>,
  ): Promise<ObjectTypeDefinition> {
    const data: Record<string, unknown> = {};
    if (def.description !== undefined) data.description = def.description;
    if (def.primaryKeyApiName !== undefined) data.primary_key_api_name = def.primaryKeyApiName;
    if (def.primaryKeyType !== undefined) data.primary_key_type = def.primaryKeyType;
    if (def.titlePropertyApiName !== undefined) data.title_property_api_name = def.titlePropertyApiName;
    if (def.properties !== undefined) data.properties = jsonbSet(def.properties as unknown as Record<string, unknown>);
    if (def.implements !== undefined) data.implements = def.implements as unknown as string[];
    if (def.status !== undefined) data.status = def.status;

    if (Object.keys(data).length === 0) {
      return this.getObjectType(ontologyRid, apiName);
    }

    const q = sql()
      .update("object_types", data)
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName)
      .returning();

    const { rows } = await this.pool.query<ObjectTypeRow>(q.build());
    if (rows.length === 0) {
      throw notFound("ObjectType", apiName);
    }
    return rowToObjectType(rows[0]);
  }

  async deleteObjectType(ontologyRid: string, apiName: string): Promise<void> {
    const q = sql()
      .deleteFrom("object_types")
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName);

    const result = await this.pool.query(q.build());
    if (result.rowCount === 0) {
      throw notFound("ObjectType", apiName);
    }
  }

  // -----------------------------------------------------------------------
  // Action type CRUD
  // -----------------------------------------------------------------------

  async createActionType(
    ontologyRid: string,
    def: ActionTypeDefinition,
  ): Promise<ActionTypeDefinition> {
    await this.ensureOntologyExists(ontologyRid);

    const rid = generateRid("ontology", "action-type").toString();
    const q = sql()
      .insertInto("action_types", {
        rid,
        ontology_rid: ontologyRid,
        api_name: def.apiName,
        description: def.description,
        parameters: jsonbSet(def.parameters as unknown as Record<string, unknown>),
        modified_entities: jsonbSet(def.modifiedEntities as unknown as Record<string, unknown>),
        status: def.status,
      })
      .returning();

    try {
      const { rows } = await this.pool.query<ActionTypeRow>(q.build());
      return rowToActionType(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict(
          "ActionType",
          `apiName "${def.apiName}" already exists in ontology ${ontologyRid}`,
        );
      }
      throw err;
    }
  }

  async getActionType(
    ontologyRid: string,
    apiName: string,
  ): Promise<ActionTypeDefinition> {
    const q = sql()
      .select("*")
      .from("action_types")
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName);

    const { rows } = await this.pool.query<ActionTypeRow>(q.build());
    if (rows.length === 0) {
      throw notFound("ActionType", apiName);
    }
    return rowToActionType(rows[0]);
  }

  async listActionTypes(
    ontologyRid: string,
    pageSize = 100,
    offset = 0,
  ): Promise<{ items: ActionTypeDefinition[]; total: number }> {
    const countQ = sql()
      .select("COUNT(*)::int AS total")
      .from("action_types")
      .where("ontology_rid = ?", ontologyRid);
    const { rows: countRows } = await this.pool.query<{ total: number }>(countQ.build());

    const q = sql()
      .select("*")
      .from("action_types")
      .where("ontology_rid = ?", ontologyRid)
      .orderBy("api_name", "ASC")
      .limit(pageSize)
      .offset(offset);

    const { rows } = await this.pool.query<ActionTypeRow>(q.build());
    return { items: rows.map(rowToActionType), total: countRows[0].total };
  }

  async updateActionType(
    ontologyRid: string,
    apiName: string,
    def: ActionTypeDefinition,
  ): Promise<ActionTypeDefinition> {
    const q = sql()
      .update("action_types", {
        description: def.description,
        parameters: jsonbSet(def.parameters as unknown as Record<string, unknown>),
        modified_entities: jsonbSet(def.modifiedEntities as unknown as Record<string, unknown>),
        status: def.status,
      })
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName)
      .returning();

    const { rows } = await this.pool.query<ActionTypeRow>(q.build());
    if (rows.length === 0) {
      throw notFound("ActionType", apiName);
    }
    return rowToActionType(rows[0]);
  }

  async deleteActionType(ontologyRid: string, apiName: string): Promise<void> {
    const q = sql()
      .deleteFrom("action_types")
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName);

    const result = await this.pool.query(q.build());
    if (result.rowCount === 0) {
      throw notFound("ActionType", apiName);
    }
  }

  // -----------------------------------------------------------------------
  // Link type CRUD
  // -----------------------------------------------------------------------

  async createLinkType(
    ontologyRid: string,
    def: LinkTypeDefinition,
  ): Promise<LinkTypeDefinition> {
    await this.ensureOntologyExists(ontologyRid);

    const rid = generateRid("ontology", "link-type").toString();
    const q = sql()
      .insertInto("link_types", {
        rid,
        ontology_rid: ontologyRid,
        api_name: def.apiName,
        object_type_api_name: def.objectTypeApiName,
        linked_object_type_api_name: def.linkedObjectTypeApiName,
        cardinality: def.cardinality,
        foreign_key_property: def.foreignKeyPropertyApiName,
      })
      .returning();

    try {
      const { rows } = await this.pool.query<LinkTypeRow>(q.build());
      return rowToLinkType(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict(
          "LinkType",
          `apiName "${def.apiName}" already exists in ontology ${ontologyRid}`,
        );
      }
      throw err;
    }
  }

  async getLinkType(
    ontologyRid: string,
    apiName: string,
  ): Promise<LinkTypeDefinition> {
    const q = sql()
      .select("*")
      .from("link_types")
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName);

    const { rows } = await this.pool.query<LinkTypeRow>(q.build());
    if (rows.length === 0) {
      throw notFound("LinkType", apiName);
    }
    return rowToLinkType(rows[0]);
  }

  async listLinkTypes(
    ontologyRid: string,
    pageSize = 100,
    offset = 0,
  ): Promise<{ items: LinkTypeDefinition[]; total: number }> {
    const countQ = sql()
      .select("COUNT(*)::int AS total")
      .from("link_types")
      .where("ontology_rid = ?", ontologyRid);
    const { rows: countRows } = await this.pool.query<{ total: number }>(countQ.build());

    const q = sql()
      .select("*")
      .from("link_types")
      .where("ontology_rid = ?", ontologyRid)
      .orderBy("api_name", "ASC")
      .limit(pageSize)
      .offset(offset);

    const { rows } = await this.pool.query<LinkTypeRow>(q.build());
    return { items: rows.map(rowToLinkType), total: countRows[0].total };
  }

  async listLinkTypesForObjectType(
    ontologyRid: string,
    objectTypeApiName: string,
  ): Promise<LinkTypeDefinition[]> {
    // Verify ontology exists
    await this.ensureOntologyExists(ontologyRid);

    const { rows } = await this.pool.query<LinkTypeRow>({
      text: `SELECT * FROM link_types
             WHERE ontology_rid = $1
               AND (object_type_api_name = $2 OR linked_object_type_api_name = $2)
             ORDER BY api_name ASC`,
      values: [ontologyRid, objectTypeApiName],
    });

    return rows.map(rowToLinkType);
  }

  async deleteLinkType(ontologyRid: string, apiName: string): Promise<void> {
    const q = sql()
      .deleteFrom("link_types")
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName);

    const result = await this.pool.query(q.build());
    if (result.rowCount === 0) {
      throw notFound("LinkType", apiName);
    }
  }

  // -----------------------------------------------------------------------
  // Interface type CRUD
  // -----------------------------------------------------------------------

  async createInterfaceType(
    ontologyRid: string,
    def: InterfaceTypeDefinition,
  ): Promise<InterfaceTypeDefinition> {
    await this.ensureOntologyExists(ontologyRid);

    const rid = generateRid("ontology", "interface-type").toString();
    const q = sql()
      .insertInto("interface_types", {
        rid,
        ontology_rid: ontologyRid,
        api_name: def.apiName,
        description: def.description,
        properties: jsonbSet(def.properties as unknown as Record<string, unknown>),
        extends_interfaces: def.extendsInterfaces as unknown as string[],
      })
      .returning();

    try {
      const { rows } = await this.pool.query<InterfaceTypeRow>(q.build());
      return rowToInterfaceType(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict(
          "InterfaceType",
          `apiName "${def.apiName}" already exists in ontology ${ontologyRid}`,
        );
      }
      throw err;
    }
  }

  async getInterfaceType(
    ontologyRid: string,
    apiName: string,
  ): Promise<InterfaceTypeDefinition> {
    const q = sql()
      .select("*")
      .from("interface_types")
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName);

    const { rows } = await this.pool.query<InterfaceTypeRow>(q.build());
    if (rows.length === 0) {
      throw notFound("InterfaceType", apiName);
    }
    return rowToInterfaceType(rows[0]);
  }

  async listInterfaceTypes(
    ontologyRid: string,
    pageSize = 100,
    offset = 0,
  ): Promise<{ items: InterfaceTypeDefinition[]; total: number }> {
    const countQ = sql()
      .select("COUNT(*)::int AS total")
      .from("interface_types")
      .where("ontology_rid = ?", ontologyRid);
    const { rows: countRows } = await this.pool.query<{ total: number }>(countQ.build());

    const q = sql()
      .select("*")
      .from("interface_types")
      .where("ontology_rid = ?", ontologyRid)
      .orderBy("api_name", "ASC")
      .limit(pageSize)
      .offset(offset);

    const { rows } = await this.pool.query<InterfaceTypeRow>(q.build());
    return { items: rows.map(rowToInterfaceType), total: countRows[0].total };
  }

  async deleteInterfaceType(ontologyRid: string, apiName: string): Promise<void> {
    const q = sql()
      .deleteFrom("interface_types")
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName);

    const result = await this.pool.query(q.build());
    if (result.rowCount === 0) {
      throw notFound("InterfaceType", apiName);
    }
  }

  // -----------------------------------------------------------------------
  // Query type CRUD
  // -----------------------------------------------------------------------

  async createQueryType(
    ontologyRid: string,
    def: QueryTypeDefinition,
  ): Promise<QueryTypeDefinition> {
    await this.ensureOntologyExists(ontologyRid);

    const rid = generateRid("ontology", "query-type").toString();
    const q = sql()
      .insertInto("query_types", {
        rid,
        ontology_rid: ontologyRid,
        api_name: def.apiName,
        version: def.version,
        description: def.description,
        parameters: jsonbSet(def.parameters as unknown as Record<string, unknown>),
        output: jsonbSet(def.output as unknown as Record<string, unknown>),
      })
      .returning();

    try {
      const { rows } = await this.pool.query<QueryTypeRow>(q.build());
      return rowToQueryType(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict(
          "QueryType",
          `apiName "${def.apiName}" already exists in ontology ${ontologyRid}`,
        );
      }
      throw err;
    }
  }

  async getQueryType(
    ontologyRid: string,
    apiName: string,
  ): Promise<QueryTypeDefinition> {
    const q = sql()
      .select("*")
      .from("query_types")
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName);

    const { rows } = await this.pool.query<QueryTypeRow>(q.build());
    if (rows.length === 0) {
      throw notFound("QueryType", apiName);
    }
    return rowToQueryType(rows[0]);
  }

  async listQueryTypes(
    ontologyRid: string,
    pageSize = 100,
    offset = 0,
  ): Promise<{ items: QueryTypeDefinition[]; total: number }> {
    const countQ = sql()
      .select("COUNT(*)::int AS total")
      .from("query_types")
      .where("ontology_rid = ?", ontologyRid);
    const { rows: countRows } = await this.pool.query<{ total: number }>(countQ.build());

    const q = sql()
      .select("*")
      .from("query_types")
      .where("ontology_rid = ?", ontologyRid)
      .orderBy("api_name", "ASC")
      .limit(pageSize)
      .offset(offset);

    const { rows } = await this.pool.query<QueryTypeRow>(q.build());
    return { items: rows.map(rowToQueryType), total: countRows[0].total };
  }

  async deleteQueryType(ontologyRid: string, apiName: string): Promise<void> {
    const q = sql()
      .deleteFrom("query_types")
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName);

    const result = await this.pool.query(q.build());
    if (result.rowCount === 0) {
      throw notFound("QueryType", apiName);
    }
  }

  // -----------------------------------------------------------------------
  // Shared property type CRUD
  // -----------------------------------------------------------------------

  async createSharedPropertyType(
    ontologyRid: string,
    def: SharedPropertyType,
  ): Promise<SharedPropertyType> {
    await this.ensureOntologyExists(ontologyRid);

    const rid = generateRid("ontology", "shared-property-type").toString();
    const q = sql()
      .insertInto("shared_property_types", {
        rid,
        ontology_rid: ontologyRid,
        api_name: def.apiName,
        display_name: def.displayName,
        data_type: def.dataType,
        description: def.description,
        validation: jsonbSet((def.validation ?? {}) as unknown as Record<string, unknown>),
      })
      .returning();

    try {
      const { rows } = await this.pool.query<SharedPropertyTypeRow>(q.build());
      return rowToSharedPropertyType(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict(
          "SharedPropertyType",
          `apiName "${def.apiName}" already exists in ontology ${ontologyRid}`,
        );
      }
      throw err;
    }
  }

  async getSharedPropertyType(
    ontologyRid: string,
    apiName: string,
  ): Promise<SharedPropertyType> {
    const q = sql()
      .select("*")
      .from("shared_property_types")
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName);

    const { rows } = await this.pool.query<SharedPropertyTypeRow>(q.build());
    if (rows.length === 0) {
      throw notFound("SharedPropertyType", apiName);
    }
    return rowToSharedPropertyType(rows[0]);
  }

  async listSharedPropertyTypes(
    ontologyRid: string,
    pageSize = 100,
    offset = 0,
  ): Promise<{ items: SharedPropertyType[]; total: number }> {
    const countQ = sql()
      .select("COUNT(*)::int AS total")
      .from("shared_property_types")
      .where("ontology_rid = ?", ontologyRid);
    const { rows: countRows } = await this.pool.query<{ total: number }>(countQ.build());

    const q = sql()
      .select("*")
      .from("shared_property_types")
      .where("ontology_rid = ?", ontologyRid)
      .orderBy("api_name", "ASC")
      .limit(pageSize)
      .offset(offset);

    const { rows } = await this.pool.query<SharedPropertyTypeRow>(q.build());
    return { items: rows.map(rowToSharedPropertyType), total: countRows[0].total };
  }

  async deleteSharedPropertyType(ontologyRid: string, apiName: string): Promise<void> {
    const q = sql()
      .deleteFrom("shared_property_types")
      .where("ontology_rid = ? AND api_name = ?", ontologyRid, apiName);

    const result = await this.pool.query(q.build());
    if (result.rowCount === 0) {
      throw notFound("SharedPropertyType", apiName);
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Build a full `StoredOntology` by fetching the ontology row and all its
   * child entity types.
   */
  private async hydrateOntology(row: OntologyRow): Promise<StoredOntology> {
    const rid = row.rid;

    const [objectTypes, actionTypes, linkTypes, interfaceTypes, queryTypes, sharedPropertyTypes] =
      await Promise.all([
        this.pool.query<ObjectTypeRow>({
          text: "SELECT * FROM object_types WHERE ontology_rid = $1",
          values: [rid],
        }),
        this.pool.query<ActionTypeRow>({
          text: "SELECT * FROM action_types WHERE ontology_rid = $1",
          values: [rid],
        }),
        this.pool.query<LinkTypeRow>({
          text: "SELECT * FROM link_types WHERE ontology_rid = $1",
          values: [rid],
        }),
        this.pool.query<InterfaceTypeRow>({
          text: "SELECT * FROM interface_types WHERE ontology_rid = $1",
          values: [rid],
        }),
        this.pool.query<QueryTypeRow>({
          text: "SELECT * FROM query_types WHERE ontology_rid = $1",
          values: [rid],
        }),
        this.pool.query<SharedPropertyTypeRow>({
          text: "SELECT * FROM shared_property_types WHERE ontology_rid = $1",
          values: [rid],
        }),
      ]);

    return {
      rid,
      apiName: row.api_name,
      displayName: row.display_name ?? "",
      description: row.description ?? "",
      version: 1,
      objectTypes: new Map(
        objectTypes.rows.map((r) => [r.api_name, rowToObjectType(r)]),
      ),
      actionTypes: new Map(
        actionTypes.rows.map((r) => [r.api_name, rowToActionType(r)]),
      ),
      linkTypes: new Map(
        linkTypes.rows.map((r) => [r.api_name, rowToLinkType(r)]),
      ),
      interfaceTypes: new Map(
        interfaceTypes.rows.map((r) => [r.api_name, rowToInterfaceType(r)]),
      ),
      queryTypes: new Map(
        queryTypes.rows.map((r) => [r.api_name, rowToQueryType(r)]),
      ),
      sharedPropertyTypes: new Map(
        sharedPropertyTypes.rows.map((r) => [r.api_name, rowToSharedPropertyType(r)]),
      ),
    };
  }

  private async ensureOntologyExists(rid: string): Promise<void> {
    const q = sql()
      .select("rid")
      .from("ontologies")
      .where("rid = ?", rid);

    const { rows } = await this.pool.query(q.build());
    if (rows.length === 0) {
      throw notFound("Ontology", rid);
    }
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}
