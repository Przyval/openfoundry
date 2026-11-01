import type pg from "pg";
import { resourceNameAlreadyExists } from "./errors.js";
import type { ModelStore } from "./model-store.js";
import type {
  DillModelFiles,
  ModelApi,
  ModelResourceRecord,
  ModelResourceType,
  ModelVersionRecord,
  ModelVersionSource,
} from "./types.js";

/**
 * The Postgres model store, over the tables in `db/migrations/012_models.sql`
 * (mirrored in `scripts/migrate.sql`).
 *
 * The column lists are exported so `tests/models-pg-schema.test.ts` can assert
 * both schema sources declare every column named here - a store naming a
 * column no schema has fails only at runtime, with `42703`.
 */
export const RESOURCE_COLUMNS = [
  "rid",
  "resource_type",
  "display_name",
  "parent_folder_rid",
  "created_time",
] as const;

export const VERSION_COLUMNS = [
  "rid",
  "model_rid",
  "branch",
  "model_api",
  "conda_requirements",
  "backing_repositories",
  "model_files",
  "source",
  "created_time",
] as const;

/** The unique constraint that makes a display name single-use per folder. */
export const RESOURCE_NAME_CONSTRAINT = "ml_resources_folder_name_key";

interface ResourceRow {
  rid: string;
  resource_type: ModelResourceType;
  display_name: string;
  parent_folder_rid: string;
  created_time: Date;
}

interface VersionRow {
  rid: string;
  model_rid: string;
  branch: string;
  model_api: ModelApi;
  conda_requirements: string[];
  backing_repositories: string[];
  model_files: DillModelFiles;
  source: ModelVersionSource;
  created_time: Date;
}

/** The subset of `pg.Pool` this store calls, so a test can record its SQL. */
export type Queryable = Pick<pg.Pool, "query">;

const RESOURCE_SELECT = `SELECT ${RESOURCE_COLUMNS.join(", ")} FROM ml_resources`;
const VERSION_SELECT = `SELECT ${VERSION_COLUMNS.join(", ")} FROM ml_model_versions`;

export class PgModelStore implements ModelStore {
  constructor(private readonly pool: Queryable) {}

  async createResource(record: ModelResourceRecord): Promise<ModelResourceRecord> {
    try {
      const { rows } = await this.pool.query<ResourceRow>({
        text: `INSERT INTO ml_resources (${RESOURCE_COLUMNS.join(", ")})
               VALUES ($1, $2, $3, $4, $5)
               RETURNING ${RESOURCE_COLUMNS.join(", ")}`,
        values: [
          record.rid,
          record.resourceType,
          record.displayName,
          record.parentFolderRid,
          record.createdTime,
        ],
      });
      return toResource(rows[0] as ResourceRow);
    } catch (err) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === "23505" && pgErr.constraint === RESOURCE_NAME_CONSTRAINT) {
        throw resourceNameAlreadyExists(record.parentFolderRid, record.displayName);
      }
      throw err;
    }
  }

  async getResource(
    rid: string,
    resourceType: ModelResourceType,
  ): Promise<ModelResourceRecord | undefined> {
    const { rows } = await this.pool.query<ResourceRow>({
      text: `${RESOURCE_SELECT} WHERE rid = $1 AND resource_type = $2`,
      values: [rid, resourceType],
    });
    return rows[0] ? toResource(rows[0]) : undefined;
  }

  async createVersion(record: ModelVersionRecord): Promise<ModelVersionRecord> {
    const { rows } = await this.pool.query<VersionRow>({
      text: `INSERT INTO ml_model_versions (${VERSION_COLUMNS.join(", ")})
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING ${VERSION_COLUMNS.join(", ")}`,
      values: [
        record.rid,
        record.modelRid,
        record.branch,
        JSON.stringify(record.modelApi),
        JSON.stringify(record.condaRequirements),
        JSON.stringify(record.backingRepositories),
        JSON.stringify(record.modelFiles),
        JSON.stringify(record.source),
        record.createdTime,
      ],
    });
    return toVersion(rows[0] as VersionRow);
  }

  async getVersion(versionRid: string): Promise<ModelVersionRecord | undefined> {
    const { rows } = await this.pool.query<VersionRow>({
      text: `${VERSION_SELECT} WHERE rid = $1`,
      values: [versionRid],
    });
    return rows[0] ? toVersion(rows[0]) : undefined;
  }

  async listVersions(
    modelRid: string,
    branch: string,
    offset: number,
    limit: number,
  ): Promise<ModelVersionRecord[]> {
    const { rows } = await this.pool.query<VersionRow>({
      text: `${VERSION_SELECT}
             WHERE model_rid = $1 AND branch = $2
             ORDER BY seq
             OFFSET $3 LIMIT $4`,
      values: [modelRid, branch, offset, limit],
    });
    return rows.map(toVersion);
  }
}

function toResource(row: ResourceRow): ModelResourceRecord {
  return {
    rid: row.rid,
    resourceType: row.resource_type,
    displayName: row.display_name,
    parentFolderRid: row.parent_folder_rid,
    createdTime: new Date(row.created_time).toISOString(),
  };
}

function toVersion(row: VersionRow): ModelVersionRecord {
  return {
    rid: row.rid,
    modelRid: row.model_rid,
    branch: row.branch,
    modelApi: row.model_api,
    condaRequirements: row.conda_requirements,
    backingRepositories: row.backing_repositories,
    modelFiles: row.model_files,
    source: row.source,
    createdTime: new Date(row.created_time).toISOString(),
  };
}
