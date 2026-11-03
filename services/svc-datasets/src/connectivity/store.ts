import {
  resourceNameAlreadyExists,
  virtualTableAlreadyExists,
  fileImportNotFound,
  tableImportNotFound,
} from "./errors.js";
import type { SecretBox } from "./secrets.js";
import type {
  ConnectionRecord,
  ImportKind,
  ImportRecord,
  SecretWrite,
  VirtualTableRecord,
} from "./types.js";

/**
 * Persistence for Connections, their imports and their virtual tables.
 *
 * Every method is async in both implementations, so a route cannot pass its
 * in-memory tests while serving a pending promise against Postgres. Listings
 * come back in insertion order, never ordered by a timestamp.
 */
export interface ConnectivityStore {
  /**
   * Store a connection and its secrets (sealed by the store).
   *
   * @throws ResourceNameAlreadyExists when the folder already holds a
   *   connection with this display name.
   */
  createConnection(record: ConnectionRecord, secrets: SecretWrite[]): Promise<ConnectionRecord>;
  getConnection(rid: string): Promise<ConnectionRecord | undefined>;
  setExportSettings(
    rid: string,
    settings: ConnectionRecord["exportSettings"],
  ): Promise<void>;
  /** The names of the secrets a connection holds. */
  secretNames(rid: string): Promise<string[]>;
  /** Replace the value of secrets that already exist; the caller checked the names. */
  updateSecrets(rid: string, secrets: SecretWrite[]): Promise<void>;

  createImport(record: ImportRecord): Promise<ImportRecord>;
  getImport(kind: ImportKind, connectionRid: string, rid: string): Promise<ImportRecord | undefined>;
  listImports(
    kind: ImportKind,
    connectionRid: string,
    offset: number,
    limit: number,
  ): Promise<ImportRecord[]>;
  replaceImport(record: ImportRecord): Promise<ImportRecord>;
  deleteImport(kind: ImportKind, connectionRid: string, rid: string): Promise<void>;

  /** @throws VirtualTableAlreadyExists when the parent already holds this name. */
  createVirtualTable(record: VirtualTableRecord): Promise<VirtualTableRecord>;
}

/** The in-memory store, used when no `DATABASE_URL` is configured. */
export class MemoryConnectivityStore implements ConnectivityStore {
  private readonly connections = new Map<string, ConnectionRecord>();
  private readonly secrets = new Map<string, Map<string, string>>();
  private readonly imports = new Map<string, ImportRecord>();
  private readonly virtualTables: VirtualTableRecord[] = [];

  constructor(private readonly box: SecretBox) {}

  async createConnection(
    record: ConnectionRecord,
    secrets: SecretWrite[],
  ): Promise<ConnectionRecord> {
    for (const existing of this.connections.values()) {
      if (
        existing.parentFolderRid === record.parentFolderRid &&
        existing.displayName === record.displayName
      ) {
        throw resourceNameAlreadyExists(record.parentFolderRid, record.displayName);
      }
    }
    const sealed = new Map(secrets.map((s) => [s.name, this.box.seal(s.value)]));
    this.connections.set(record.rid, structuredClone(record));
    this.secrets.set(record.rid, sealed);
    return structuredClone(record);
  }

  async getConnection(rid: string): Promise<ConnectionRecord | undefined> {
    const record = this.connections.get(rid);
    return record ? structuredClone(record) : undefined;
  }

  async setExportSettings(rid: string, settings: ConnectionRecord["exportSettings"]): Promise<void> {
    const record = this.connections.get(rid);
    if (record) record.exportSettings = { ...settings };
  }

  async secretNames(rid: string): Promise<string[]> {
    return [...(this.secrets.get(rid)?.keys() ?? [])];
  }

  async updateSecrets(rid: string, secrets: SecretWrite[]): Promise<void> {
    const held = this.secrets.get(rid);
    if (!held) return;
    for (const secret of secrets) held.set(secret.name, this.box.seal(secret.value));
  }

  async createImport(record: ImportRecord): Promise<ImportRecord> {
    this.imports.set(record.rid, structuredClone(record));
    return structuredClone(record);
  }

  async getImport(
    kind: ImportKind,
    connectionRid: string,
    rid: string,
  ): Promise<ImportRecord | undefined> {
    const record = this.imports.get(rid);
    return record && record.kind === kind && record.connectionRid === connectionRid
      ? structuredClone(record)
      : undefined;
  }

  async listImports(
    kind: ImportKind,
    connectionRid: string,
    offset: number,
    limit: number,
  ): Promise<ImportRecord[]> {
    return [...this.imports.values()]
      .filter((r) => r.kind === kind && r.connectionRid === connectionRid)
      .slice(offset, offset + limit)
      .map((r) => structuredClone(r));
  }

  async replaceImport(record: ImportRecord): Promise<ImportRecord> {
    if (!(await this.getImport(record.kind, record.connectionRid, record.rid))) {
      throw (record.kind === "file" ? fileImportNotFound : tableImportNotFound)(
        record.connectionRid,
        record.rid,
      );
    }
    this.imports.set(record.rid, structuredClone(record));
    return structuredClone(record);
  }

  async deleteImport(kind: ImportKind, connectionRid: string, rid: string): Promise<void> {
    if (await this.getImport(kind, connectionRid, rid)) this.imports.delete(rid);
  }

  async createVirtualTable(record: VirtualTableRecord): Promise<VirtualTableRecord> {
    if (this.virtualTables.some((t) => t.parentRid === record.parentRid && t.name === record.name)) {
      throw virtualTableAlreadyExists(record.parentRid, record.name);
    }
    this.virtualTables.push(structuredClone(record));
    return structuredClone(record);
  }
}
