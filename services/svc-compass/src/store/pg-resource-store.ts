import type pg from "pg";
import { generateRid } from "@openfoundry/rid";
import { notFound, conflict, invalidArgument } from "@openfoundry/errors";
import type {
  Resource,
  ResourceType,
  CreateResourceInput,
  UpdateResourceInput,
} from "./resource-store.js";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface ResourceRow {
  rid: string;
  type: string;
  name: string;
  path: string;
  parent_rid: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  markings: string[] | null;
}

// ---------------------------------------------------------------------------
// Row to domain
// ---------------------------------------------------------------------------

function rowToResource(row: ResourceRow): Resource {
  return {
    rid: row.rid,
    type: row.type as ResourceType,
    name: row.name,
    path: row.path,
    parentRid: row.parent_rid ?? undefined,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? undefined,
    markings: row.markings ?? undefined,
  };
}

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

// ---------------------------------------------------------------------------
// PgResourceStore
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed resource store for Compass.
 */
export class PgResourceStore {
  constructor(private pool: pg.Pool) {}

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private async buildPath(name: string, parentRid?: string): Promise<string> {
    if (!parentRid) {
      return `/${name}`;
    }
    const { rows } = await this.pool.query<ResourceRow>({
      text: `SELECT * FROM compass_resources WHERE rid = $1`,
      values: [parentRid],
    });
    if (rows.length === 0) {
      throw notFound("Resource", parentRid);
    }
    return `${rows[0].path}/${name}`;
  }

  private async updateChildPaths(rid: string, newPath: string): Promise<void> {
    const { rows: children } = await this.pool.query<ResourceRow>({
      text: `SELECT * FROM compass_resources WHERE parent_rid = $1`,
      values: [rid],
    });

    for (const child of children) {
      const childNewPath = `${newPath}/${child.name}`;
      await this.pool.query({
        text: `UPDATE compass_resources SET path = $1, updated_at = NOW() WHERE rid = $2`,
        values: [childNewPath, child.rid],
      });
      await this.updateChildPaths(child.rid, childNewPath);
    }
  }

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  async createResource(input: CreateResourceInput): Promise<Resource> {
    const rid = generateRid("compass", input.type.toLowerCase()).toString();
    const path = await this.buildPath(input.name, input.parentRid);

    try {
      const { rows } = await this.pool.query<ResourceRow>({
        text: `INSERT INTO compass_resources (rid, type, name, path, parent_rid, description, created_by, markings)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING *`,
        values: [
          rid,
          input.type,
          input.name,
          path,
          input.parentRid ?? null,
          input.description ?? null,
          input.createdBy ?? null,
          input.markings ?? null,
        ],
      });

      return rowToResource(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict(
          "Resource",
          `name "${input.name}" already exists under parent ${input.parentRid ?? "root"}`,
        );
      }
      throw err;
    }
  }

  async getResource(rid: string): Promise<Resource> {
    const { rows } = await this.pool.query<ResourceRow>({
      text: `SELECT * FROM compass_resources WHERE rid = $1`,
      values: [rid],
    });

    if (rows.length === 0) {
      throw notFound("Resource", rid);
    }
    return rowToResource(rows[0]);
  }

  async getResourceByPath(path: string): Promise<Resource> {
    const { rows } = await this.pool.query<ResourceRow>({
      text: `SELECT * FROM compass_resources WHERE path = $1`,
      values: [path],
    });

    if (rows.length === 0) {
      throw notFound("Resource", path);
    }
    return rowToResource(rows[0]);
  }

  async listChildren(parentRid: string): Promise<Resource[]> {
    // Verify parent exists
    await this.getResource(parentRid);

    const { rows } = await this.pool.query<ResourceRow>({
      text: `SELECT * FROM compass_resources WHERE parent_rid = $1 ORDER BY name ASC`,
      values: [parentRid],
    });

    return rows.map(rowToResource);
  }

  async listRootResources(): Promise<Resource[]> {
    const { rows } = await this.pool.query<ResourceRow>({
      text: `SELECT * FROM compass_resources WHERE parent_rid IS NULL ORDER BY name ASC`,
    });

    return rows.map(rowToResource);
  }

  async moveResource(rid: string, newParentRid: string): Promise<Resource> {
    const resource = await this.getResource(rid);

    if (newParentRid) {
      await this.getResource(newParentRid);
    }

    if (newParentRid === rid) {
      throw invalidArgument("parentRid", "cannot move a resource to itself");
    }

    const newPath = await this.buildPath(resource.name, newParentRid || undefined);

    const { rows } = await this.pool.query<ResourceRow>({
      text: `UPDATE compass_resources
             SET parent_rid = $1, path = $2, updated_at = NOW()
             WHERE rid = $3
             RETURNING *`,
      values: [newParentRid || null, newPath, rid],
    });

    await this.updateChildPaths(rid, newPath);

    return rowToResource(rows[0]);
  }

  async renameResource(rid: string, newName: string): Promise<Resource> {
    const resource = await this.getResource(rid);
    const newPath = await this.buildPath(newName, resource.parentRid);

    try {
      const { rows } = await this.pool.query<ResourceRow>({
        text: `UPDATE compass_resources
               SET name = $1, path = $2, updated_at = NOW()
               WHERE rid = $3
               RETURNING *`,
        values: [newName, newPath, rid],
      });

      await this.updateChildPaths(rid, newPath);

      return rowToResource(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict(
          "Resource",
          `name "${newName}" already exists under parent ${resource.parentRid ?? "root"}`,
        );
      }
      throw err;
    }
  }

  async updateResource(rid: string, input: UpdateResourceInput): Promise<Resource> {
    const resource = await this.getResource(rid);

    if (input.name !== undefined && input.name !== resource.name) {
      return this.renameResource(rid, input.name);
    }

    if (input.parentRid !== undefined && input.parentRid !== resource.parentRid) {
      return this.moveResource(rid, input.parentRid);
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 0;

    if (input.description !== undefined) {
      idx++;
      sets.push(`description = $${idx}`);
      values.push(input.description);
    }
    if (input.markings !== undefined) {
      idx++;
      sets.push(`markings = $${idx}`);
      values.push(input.markings);
    }

    if (sets.length === 0) {
      return resource;
    }

    idx++;
    sets.push(`updated_at = NOW()`);

    values.push(rid);

    const { rows } = await this.pool.query<ResourceRow>({
      text: `UPDATE compass_resources SET ${sets.join(", ")} WHERE rid = $${idx} RETURNING *`,
      values,
    });

    return rowToResource(rows[0]);
  }

  async deleteResource(rid: string): Promise<void> {
    // Recursively delete children first
    const { rows: children } = await this.pool.query<ResourceRow>({
      text: `SELECT rid FROM compass_resources WHERE parent_rid = $1`,
      values: [rid],
    });
    for (const child of children) {
      await this.deleteResource(child.rid);
    }

    const result = await this.pool.query({
      text: `DELETE FROM compass_resources WHERE rid = $1`,
      values: [rid],
    });

    if (result.rowCount === 0) {
      throw notFound("Resource", rid);
    }
  }

  async searchResources(query: string): Promise<Resource[]> {
    const pattern = `%${query}%`;
    const { rows } = await this.pool.query<ResourceRow>({
      text: `SELECT * FROM compass_resources
             WHERE name ILIKE $1 OR description ILIKE $1
             ORDER BY name ASC`,
      values: [pattern],
    });

    return rows.map(rowToResource);
  }
}
