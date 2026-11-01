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
 * Both tables are tenant-scoped by row-level security. A store built with an
 * `orgRid` runs every statement in a transaction that sets `app.org_rid`, so
 * it reads and writes only that organization's rows; the column itself is
 * filled from the same setting by the schema. Without one, statements run
 * with no tenant context, which only a role that bypasses row-level security
 * can use.
 */
const RESOURCE_COLUMNS = [
  "rid",
  "resource_type",
  "display_name",
  "parent_folder_rid",
  "created_time",
] as const;

const VERSION_COLUMNS = [
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
const RESOURCE_NAME_CONSTRAINT = "ml_resources_folder_name_key";

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

const RESOURCE_SELECT = `SELECT ${RESOURCE_COLUMNS.join(", ")} FROM ml_resources`;
const VERSION_SELECT = `SELECT ${VERSION_COLUMNS.join(", ")} FROM ml_model_versions`;

export class PgModelStore implements ModelStore {
  constructor(
    private readonly pool: pg.Pool,
    private readonly orgRid?: string,
  ) {}

  private async query<R extends pg.QueryResultRow>(
    config: pg.QueryConfig,
  ): Promise<pg.QueryResult<R>> {
    if (!this.orgRid) return this.pool.query<R>(config);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.org_rid', $1, true)", [this.orgRid]);
      const result = await client.query<R>(config);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async createResource(record: ModelResourceRecord): Promise<ModelResourceRecord> {
    try {
      const { rows } = await this.query<ResourceRow>({
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
    const { rows } = await this.query<ResourceRow>({
      text: `${RESOURCE_SELECT} WHERE rid = $1 AND resource_type = $2`,
      values: [rid, resourceType],
    });
    return rows[0] ? toResource(rows[0]) : undefined;
  }

  async createVersion(record: ModelVersionRecord): Promise<ModelVersionRecord> {
    const { rows } = await this.query<VersionRow>({
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
    const { rows } = await this.query<VersionRow>({
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
    const { rows } = await this.query<VersionRow>({
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
