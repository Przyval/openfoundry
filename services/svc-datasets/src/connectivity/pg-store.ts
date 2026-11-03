import type pg from "pg";
import {
  fileImportNotFound,
  resourceNameAlreadyExists,
  tableImportNotFound,
  virtualTableAlreadyExists,
} from "./errors.js";
import type { SecretBox } from "./secrets.js";
import type { ConnectivityStore } from "./store.js";
import type {
  ConnectionRecord,
  ImportKind,
  ImportRecord,
  Json,
  SecretWrite,
  VirtualTableRecord,
} from "./types.js";

/**
 * The Postgres connectivity store, over the tables in
 * `db/migrations/016_connectivity.sql` (mirrored in `scripts/migrate.sql`).
 *
 * Every statement runs in a transaction so a connection and its secrets land
 * together. With an `orgRid` the transaction sets `app.org_rid`, which the
 * tenant row-level-security policies and the `org_rid` column default read.
 */
const CONNECTION_COLUMNS =
  "rid, parent_folder_rid, display_name, export_settings, worker, configuration, created_time";

const CONNECTION_NAME_CONSTRAINT = "connectivity_connections_folder_name_key";
const VIRTUAL_TABLE_NAME_CONSTRAINT = "connectivity_virtual_tables_parent_name_key";

interface ConnectionRow {
  rid: string;
  parent_folder_rid: string;
  display_name: string;
  export_settings: ConnectionRecord["exportSettings"];
  worker: Json;
  configuration: Json;
  created_time: Date;
}

interface ImportRow {
  rid: string;
  kind: ImportKind;
  connection_rid: string;
  data: Json;
}

export class PgConnectivityStore implements ConnectivityStore {
  constructor(
    private readonly pool: pg.Pool,
    private readonly box: SecretBox,
    private readonly orgRid?: string,
  ) {}

  private async tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (this.orgRid) {
        await client.query("SELECT set_config('app.org_rid', $1, true)", [this.orgRid]);
      }
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async createConnection(
    record: ConnectionRecord,
    secrets: SecretWrite[],
  ): Promise<ConnectionRecord> {
    // Seal before opening a transaction: a missing key fails without touching the database.
    const sealed = secrets.map((s) => ({ name: s.name, sealed: this.box.seal(s.value) }));
    try {
      return await this.tx(async (client) => {
        const { rows } = await client.query<ConnectionRow>(
          `INSERT INTO connectivity_connections
             (rid, parent_folder_rid, display_name, export_settings, worker, configuration, created_time)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING ${CONNECTION_COLUMNS}`,
          [
            record.rid,
            record.parentFolderRid,
            record.displayName,
            JSON.stringify(record.exportSettings),
            JSON.stringify(record.worker),
            JSON.stringify(record.configuration),
            record.createdTime,
          ],
        );
        for (const secret of sealed) {
          await client.query(
            "INSERT INTO connectivity_secrets (connection_rid, name, sealed) VALUES ($1, $2, $3)",
            [record.rid, secret.name, secret.sealed],
          );
        }
        return toConnection(rows[0] as ConnectionRow);
      });
    } catch (err) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === "23505" && pgErr.constraint === CONNECTION_NAME_CONSTRAINT) {
        throw resourceNameAlreadyExists(record.parentFolderRid, record.displayName);
      }
      throw err;
    }
  }

  async getConnection(rid: string): Promise<ConnectionRecord | undefined> {
    const rows = await this.tx(async (client) => {
      const result = await client.query<ConnectionRow>(
        `SELECT ${CONNECTION_COLUMNS} FROM connectivity_connections WHERE rid = $1`,
        [rid],
      );
      return result.rows;
    });
    return rows[0] ? toConnection(rows[0]) : undefined;
  }

  async setExportSettings(
    rid: string,
    settings: ConnectionRecord["exportSettings"],
  ): Promise<void> {
    await this.tx((client) =>
      client.query("UPDATE connectivity_connections SET export_settings = $2 WHERE rid = $1", [
        rid,
        JSON.stringify(settings),
      ]),
    );
  }

  async secretNames(rid: string): Promise<string[]> {
    return this.tx(async (client) => {
      const { rows } = await client.query<{ name: string }>(
        "SELECT name FROM connectivity_secrets WHERE connection_rid = $1 ORDER BY name",
        [rid],
      );
      return rows.map((r) => r.name);
    });
  }

  async updateSecrets(rid: string, secrets: SecretWrite[]): Promise<void> {
    const sealed = secrets.map((s) => ({ name: s.name, sealed: this.box.seal(s.value) }));
    await this.tx(async (client) => {
      for (const secret of sealed) {
        await client.query(
          "UPDATE connectivity_secrets SET sealed = $3 WHERE connection_rid = $1 AND name = $2",
          [rid, secret.name, secret.sealed],
        );
      }
    });
  }

  async createImport(record: ImportRecord): Promise<ImportRecord> {
    return this.tx(async (client) => {
      const { rows } = await client.query<ImportRow>(
        `INSERT INTO connectivity_imports (rid, kind, connection_rid, data)
         VALUES ($1, $2, $3, $4)
         RETURNING rid, kind, connection_rid, data`,
        [record.rid, record.kind, record.connectionRid, JSON.stringify(record.data)],
      );
      return toImport(rows[0] as ImportRow);
    });
  }

  async getImport(
    kind: ImportKind,
    connectionRid: string,
    rid: string,
  ): Promise<ImportRecord | undefined> {
    const rows = await this.tx(async (client) => {
      const result = await client.query<ImportRow>(
        `SELECT rid, kind, connection_rid, data FROM connectivity_imports
         WHERE rid = $1 AND kind = $2 AND connection_rid = $3`,
        [rid, kind, connectionRid],
      );
      return result.rows;
    });
    return rows[0] ? toImport(rows[0]) : undefined;
  }

  async listImports(
    kind: ImportKind,
    connectionRid: string,
    offset: number,
    limit: number,
  ): Promise<ImportRecord[]> {
    const rows = await this.tx(async (client) => {
      const result = await client.query<ImportRow>(
        `SELECT rid, kind, connection_rid, data FROM connectivity_imports
         WHERE kind = $1 AND connection_rid = $2
         ORDER BY seq OFFSET $3 LIMIT $4`,
        [kind, connectionRid, offset, limit],
      );
      return result.rows;
    });
    return rows.map(toImport);
  }

  async replaceImport(record: ImportRecord): Promise<ImportRecord> {
    const rows = await this.tx(async (client) => {
      const result = await client.query<ImportRow>(
        `UPDATE connectivity_imports SET data = $4
         WHERE rid = $1 AND kind = $2 AND connection_rid = $3
         RETURNING rid, kind, connection_rid, data`,
        [record.rid, record.kind, record.connectionRid, JSON.stringify(record.data)],
      );
      return result.rows;
    });
    if (!rows[0]) {
      throw (record.kind === "file" ? fileImportNotFound : tableImportNotFound)(
        record.connectionRid,
        record.rid,
      );
    }
    return toImport(rows[0]);
  }

  async deleteImport(kind: ImportKind, connectionRid: string, rid: string): Promise<void> {
    await this.tx((client) =>
      client.query(
        "DELETE FROM connectivity_imports WHERE rid = $1 AND kind = $2 AND connection_rid = $3",
        [rid, kind, connectionRid],
      ),
    );
  }

  async createVirtualTable(record: VirtualTableRecord): Promise<VirtualTableRecord> {
    try {
      await this.tx((client) =>
        client.query(
          `INSERT INTO connectivity_virtual_tables
             (rid, connection_rid, name, parent_rid, config, markings)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            record.rid,
            record.connectionRid,
            record.name,
            record.parentRid,
            JSON.stringify(record.config),
            record.markings === undefined ? null : JSON.stringify(record.markings),
          ],
        ),
      );
    } catch (err) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === "23505" && pgErr.constraint === VIRTUAL_TABLE_NAME_CONSTRAINT) {
        throw virtualTableAlreadyExists(record.parentRid, record.name);
      }
      throw err;
    }
    return structuredClone(record);
  }
}

function toConnection(row: ConnectionRow): ConnectionRecord {
  return {
    rid: row.rid,
    parentFolderRid: row.parent_folder_rid,
    displayName: row.display_name,
    exportSettings: row.export_settings,
    worker: row.worker,
    configuration: row.configuration,
    createdTime: new Date(row.created_time).toISOString(),
  };
}

function toImport(row: ImportRow): ImportRecord {
  return { rid: row.rid, kind: row.kind, connectionRid: row.connection_rid, data: row.data };
}
