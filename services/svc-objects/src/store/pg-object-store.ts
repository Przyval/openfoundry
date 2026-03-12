import type pg from "pg";

import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";
import type { Filter } from "@openfoundry/object-set";
import type { StoredObject, OrderByClause } from "./object-store.js";

// ---------------------------------------------------------------------------
// Row shape from the database
// ---------------------------------------------------------------------------

interface ObjectRow {
  rid: string;
  object_type_rid: string;
  primary_key: string;
  properties: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Filter to SQL translation
// ---------------------------------------------------------------------------

interface FilterSqlResult {
  where: string;
  values: unknown[];
}

/**
 * Translate an ObjectSet filter tree into a parameterised SQL WHERE clause
 * that queries the JSONB `properties` column.
 *
 * Returns the clause fragment and an array of bind values.  The caller is
 * responsible for adjusting `$N` placeholder numbering via `paramOffset`.
 */
export function filterToSql(
  filter: Filter,
  paramOffset = 0,
): FilterSqlResult {
  const values: unknown[] = [];
  let idx = paramOffset;

  function next(val: unknown): string {
    idx++;
    values.push(val);
    return `$${idx}`;
  }

  function prop(property: string): string {
    return `properties->>\'${property.replace(/'/g, "''")}'`;
  }

  function propJsonb(property: string): string {
    return `properties->\'${property.replace(/'/g, "''")}'`;
  }

  function walk(f: Filter): string {
    switch (f.type) {
      case "AND":
        return `(${f.filters.map(walk).join(" AND ")})`;

      case "OR":
        return `(${f.filters.map(walk).join(" OR ")})`;

      case "NOT":
        return `(NOT ${walk(f.filter)})`;

      case "EQUALS":
        return `(${prop(f.property)} = ${next(String(f.value))})`;

      case "CONTAINS":
        return `(${prop(f.property)} ILIKE ${next(`%${f.value}%`)})`;

      case "STARTS_WITH":
        return `(${prop(f.property)} ILIKE ${next(`${f.value}%`)})`;

      case "GT":
        return `((${prop(f.property)})::numeric > ${next(f.value)})`;

      case "GTE":
        return `((${prop(f.property)})::numeric >= ${next(f.value)})`;

      case "LT":
        return `((${prop(f.property)})::numeric < ${next(f.value)})`;

      case "LTE":
        return `((${prop(f.property)})::numeric <= ${next(f.value)})`;

      case "IS_NULL":
        return `(${propJsonb(f.property)} IS NULL OR ${prop(f.property)} IS NULL)`;

      case "HAS_PROPERTY":
        return `(${propJsonb(f.property)} IS NOT NULL AND ${prop(f.property)} IS NOT NULL)`;

      case "IN_SET": {
        const placeholders = f.values.map((v) => next(String(v)));
        return `(${prop(f.property)} IN (${placeholders.join(", ")}))`;
      }

      case "RANGE": {
        const parts: string[] = [];
        if (f.gt !== undefined) parts.push(`(${prop(f.property)})::numeric > ${next(f.gt)}`);
        if (f.gte !== undefined) parts.push(`(${prop(f.property)})::numeric >= ${next(f.gte)}`);
        if (f.lt !== undefined) parts.push(`(${prop(f.property)})::numeric < ${next(f.lt)}`);
        if (f.lte !== undefined) parts.push(`(${prop(f.property)})::numeric <= ${next(f.lte)}`);
        return parts.length > 0 ? `(${parts.join(" AND ")})` : "TRUE";
      }

      default:
        // Unsupported filter types are treated as always-true
        return "TRUE";
    }
  }

  const where = walk(filter);
  return { where, values };
}

// ---------------------------------------------------------------------------
// Row to domain
// ---------------------------------------------------------------------------

function rowToStoredObject(row: ObjectRow, objectType: string): StoredObject {
  return {
    rid: row.rid,
    objectType,
    primaryKey: row.primary_key,
    properties: row.properties,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// PgObjectStore
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed object store.
 *
 * Objects in the schema reference `object_type_rid` (the RID of the object
 * type row in `object_types`).  This store accepts the objectType's
 * `apiName` at the API level and resolves the RID internally, matching the
 * interface of the in-memory `ObjectStore`.
 */
export class PgObjectStore {
  constructor(private pool: pg.Pool) {}

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  async createObject(
    objectType: string,
    primaryKey: string,
    properties: Record<string, unknown>,
  ): Promise<StoredObject> {
    const objectTypeRid = await this.resolveObjectTypeRid(objectType);
    const rid = generateRid("phonograph2-objects", "object").toString();

    try {
      const { rows } = await this.pool.query<ObjectRow>({
        text: `INSERT INTO objects (rid, object_type_rid, primary_key, properties)
               VALUES ($1, $2, $3, $4)
               RETURNING *`,
        values: [rid, objectTypeRid, primaryKey, JSON.stringify(properties)],
      });
      return rowToStoredObject(rows[0], objectType);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict(
          `${objectType}:${primaryKey}`,
          "object with this primary key already exists",
        );
      }
      throw err;
    }
  }

  async getObject(objectType: string, primaryKey: string): Promise<StoredObject> {
    const objectTypeRid = await this.resolveObjectTypeRid(objectType);

    const { rows } = await this.pool.query<ObjectRow>({
      text: `SELECT * FROM objects
             WHERE object_type_rid = $1 AND primary_key = $2`,
      values: [objectTypeRid, primaryKey],
    });

    if (rows.length === 0) {
      throw notFound("Object", `${objectType}:${primaryKey}`);
    }
    return rowToStoredObject(rows[0], objectType);
  }

  async listObjects(
    objectType: string,
    pageSize = 100,
    offset = 0,
  ): Promise<{ items: StoredObject[]; total: number }> {
    const objectTypeRid = await this.resolveObjectTypeRid(objectType);

    const countResult = await this.pool.query<{ total: number }>({
      text: `SELECT COUNT(*)::int AS total FROM objects WHERE object_type_rid = $1`,
      values: [objectTypeRid],
    });

    const { rows } = await this.pool.query<ObjectRow>({
      text: `SELECT * FROM objects
             WHERE object_type_rid = $1
             ORDER BY created_at ASC
             LIMIT $2 OFFSET $3`,
      values: [objectTypeRid, pageSize, offset],
    });

    return {
      items: rows.map((r) => rowToStoredObject(r, objectType)),
      total: countResult.rows[0].total,
    };
  }

  async updateObject(
    objectType: string,
    primaryKey: string,
    properties: Record<string, unknown>,
  ): Promise<StoredObject> {
    const objectTypeRid = await this.resolveObjectTypeRid(objectType);

    const { rows } = await this.pool.query<ObjectRow>({
      text: `UPDATE objects
             SET properties = properties || $1::jsonb
             WHERE object_type_rid = $2 AND primary_key = $3
             RETURNING *`,
      values: [JSON.stringify(properties), objectTypeRid, primaryKey],
    });

    if (rows.length === 0) {
      throw notFound("Object", `${objectType}:${primaryKey}`);
    }
    return rowToStoredObject(rows[0], objectType);
  }

  async deleteObject(objectType: string, primaryKey: string): Promise<void> {
    const objectTypeRid = await this.resolveObjectTypeRid(objectType);

    const result = await this.pool.query({
      text: `DELETE FROM objects
             WHERE object_type_rid = $1 AND primary_key = $2`,
      values: [objectTypeRid, primaryKey],
    });

    if (result.rowCount === 0) {
      throw notFound("Object", `${objectType}:${primaryKey}`);
    }
  }

  async queryObjects(
    objectType: string,
    filter: Filter | undefined,
    pageSize = 100,
    offset = 0,
    orderBy?: OrderByClause[],
  ): Promise<{ items: StoredObject[]; total: number }> {
    const objectTypeRid = await this.resolveObjectTypeRid(objectType);

    let whereClause = "object_type_rid = $1";
    const values: unknown[] = [objectTypeRid];
    let paramIdx = 1;

    if (filter) {
      const filterResult = filterToSql(filter, paramIdx);
      whereClause += ` AND ${filterResult.where}`;
      values.push(...filterResult.values);
      paramIdx += filterResult.values.length;
    }

    // Count
    const countResult = await this.pool.query<{ total: number }>({
      text: `SELECT COUNT(*)::int AS total FROM objects WHERE ${whereClause}`,
      values,
    });

    // Build ORDER BY
    let orderClause = "ORDER BY created_at ASC";
    if (orderBy && orderBy.length > 0) {
      const orderParts = orderBy.map((o) => {
        const dir = o.direction === "desc" ? "DESC" : "ASC";
        // Order by JSONB property value
        return `properties->>'${o.field.replace(/'/g, "''")}' ${dir}`;
      });
      orderClause = `ORDER BY ${orderParts.join(", ")}`;
    }

    // Fetch page
    paramIdx++;
    values.push(pageSize);
    const limitParam = `$${paramIdx}`;

    paramIdx++;
    values.push(offset);
    const offsetParam = `$${paramIdx}`;

    const { rows } = await this.pool.query<ObjectRow>({
      text: `SELECT * FROM objects WHERE ${whereClause} ${orderClause} LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values,
    });

    return {
      items: rows.map((r) => rowToStoredObject(r, objectType)),
      total: countResult.rows[0].total,
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Resolve an object type apiName to its RID in the object_types table.
   */
  private async resolveObjectTypeRid(apiName: string): Promise<string> {
    const { rows } = await this.pool.query<{ rid: string }>({
      text: `SELECT rid FROM object_types WHERE api_name = $1 LIMIT 1`,
      values: [apiName],
    });
    if (rows.length === 0) {
      throw notFound("ObjectType", apiName);
    }
    return rows[0].rid;
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
