import type pg from "pg";

import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";
import type { Filter } from "@openfoundry/object-set";
import {
  decodePageToken,
  encodePageToken,
  type PageToken,
} from "@openfoundry/pagination";
import type {
  ListOptions,
  ListResult,
  StoredObject,
  OrderByClause,
} from "./object-store.js";

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
  constructor(
    private pool: pg.Pool,
    private orgRid?: string,
  ) {}

  // Wrap fn in an explicit transaction with SET LOCAL so the tenant context
  // is guaranteed to reset at COMMIT/ROLLBACK and never leaks to the next
  // request on a pooled connection.
  private async withTenant<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (this.orgRid) {
        await client.query("SET LOCAL app.current_org_rid = $1", [this.orgRid]);
      }
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch { /* ignore rollback error */ }
      throw err;
    } finally {
      client.release();
    }
  }

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
    const orgRid = this.orgRid ?? null;

    try {
      return await this.withTenant(async (client) => {
        const { rows } = await client.query<ObjectRow>({
          text: `INSERT INTO objects (rid, object_type_rid, primary_key, properties, org_rid)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
          values: [rid, objectTypeRid, primaryKey, JSON.stringify(properties), orgRid],
        });
        return rowToStoredObject(rows[0], objectType);
      });
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

  async upsertObject(
    objectType: string,
    primaryKey: string,
    properties: Record<string, unknown>,
  ): Promise<StoredObject> {
    const objectTypeRid = await this.resolveObjectTypeRid(objectType);
    const rid = generateRid("phonograph2-objects", "object").toString();
    const orgRid = this.orgRid ?? null;

    return this.withTenant(async (client) => {
      const { rows } = await client.query<ObjectRow>({
        text: `INSERT INTO objects (rid, object_type_rid, primary_key, properties, org_rid)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (object_type_rid, primary_key)
               DO UPDATE SET properties = $4::jsonb, updated_at = NOW()
               RETURNING *`,
        values: [rid, objectTypeRid, primaryKey, JSON.stringify(properties), orgRid],
      });
      return rowToStoredObject(rows[0], objectType);
    });
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

  /**
   * Returns one page of a type, matching `ObjectStore.listObjects`.
   *
   * Sharing the signature is what lets a listing that needs no whole-collection
   * view stay on `LIMIT`/`OFFSET` against either backend instead of reading the
   * entire object type on every page.
   */
  async listObjects(
    objectType: string,
    options: ListOptions = {},
  ): Promise<ListResult> {
    const objectTypeRid = await this.resolveObjectTypeRid(objectType);
    const pageSize = options.pageSize ?? 100;
    const offset = options.pageToken
      ? decodePageToken(options.pageToken as PageToken).offset
      : 0;

    const countResult = await this.pool.query<{ total: number }>({
      text: `SELECT COUNT(*)::int AS total FROM objects WHERE object_type_rid = $1`,
      values: [objectTypeRid],
    });

    const { rows } = await this.pool.query<ObjectRow>({
      text: `SELECT * FROM objects
             WHERE object_type_rid = $1
             ORDER BY created_at ASC, primary_key ASC
             LIMIT $2 OFFSET $3`,
      values: [objectTypeRid, pageSize, offset],
    });

    const totalCount = countResult.rows[0].total;
    const result: ListResult = {
      data: rows.map((r) => rowToStoredObject(r, objectType)),
      totalCount,
    };
    if (offset + rows.length < totalCount) {
      result.nextPageToken = encodePageToken({ offset: offset + pageSize });
    }
    return result;
  }

  /**
   * Reads the property names declared on an object type.
   *
   * `object_types.properties` is the authoritative declaration; a property it
   * lists is real whether or not any row has populated it. Returns `undefined`
   * when the type is unknown or declares nothing, so callers make no claim
   * about a property name they have no declaration for.
   */
  async propertyNames(objectType: string): Promise<ReadonlySet<string> | undefined> {
    const { rows } = await this.pool.query<{ properties: Record<string, unknown> | null }>({
      text: `SELECT properties FROM object_types WHERE api_name = $1 LIMIT 1`,
      values: [objectType],
    });

    const declared = rows[0]?.properties;
    if (!declared || typeof declared !== "object") return undefined;
    const names = Object.keys(declared);
    return names.length > 0 ? new Set(names) : undefined;
  }

  /**
   * Returns every object of a type, matching `ObjectStore.allObjects`.
   *
   * The read endpoints resolve `orderBy`, `snapshot` and `totalCount` over the
   * whole collection, so they need the same unpaginated view from either
   * backend. Ordering is by insertion time with the primary key as a
   * tiebreaker, because `created_at` alone collides for rows written in the
   * same instant and would leave paging offsets unstable.
   */
  async allObjects(objectType: string): Promise<StoredObject[]> {
    const objectTypeRid = await this.resolveObjectTypeRid(objectType);

    const { rows } = await this.pool.query<ObjectRow>({
      text: `SELECT * FROM objects
             WHERE object_type_rid = $1
             ORDER BY created_at ASC, primary_key ASC`,
      values: [objectTypeRid],
    });

    return rows.map((r) => rowToStoredObject(r, objectType));
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
