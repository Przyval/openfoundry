import { resourceNameAlreadyExists } from "./errors.js";
import type {
  ModelResourceRecord,
  ModelResourceType,
  ModelVersionRecord,
} from "./types.js";

/**
 * Persistence for Models, Model Studios and Model Versions.
 *
 * Every method is async in both implementations, so a route cannot pass its
 * in-memory tests while serving a pending promise against Postgres.
 *
 * Listings are ordered by insertion position, never by `createdTime`: two
 * versions created inside one millisecond share a timestamp.
 */
export interface ModelStore {
  /**
   * Store a Model or Model Studio.
   *
   * @throws ResourceNameAlreadyExists when another Model or Model Studio in the
   *   same folder already has this display name.
   */
  createResource(record: ModelResourceRecord): Promise<ModelResourceRecord>;

  /** The resource with this RID, if it exists and is of the given type. */
  getResource(
    rid: string,
    resourceType: ModelResourceType,
  ): Promise<ModelResourceRecord | undefined>;

  createVersion(record: ModelVersionRecord): Promise<ModelVersionRecord>;

  /** A version by its own RID, whichever model it belongs to. */
  getVersion(versionRid: string): Promise<ModelVersionRecord | undefined>;

  /**
   * One model's versions on one branch, oldest first, starting `offset` versions
   * in. Versions are never deleted or reordered, so an offset taken from an
   * earlier page still points at the same version.
   */
  listVersions(
    modelRid: string,
    branch: string,
    offset: number,
    limit: number,
  ): Promise<ModelVersionRecord[]>;
}

/** The in-memory store, used when no `DATABASE_URL` is configured. */
export class MemoryModelStore implements ModelStore {
  private readonly resources = new Map<string, ModelResourceRecord>();
  private readonly versions: ModelVersionRecord[] = [];

  async createResource(record: ModelResourceRecord): Promise<ModelResourceRecord> {
    for (const existing of this.resources.values()) {
      if (
        existing.parentFolderRid === record.parentFolderRid &&
        existing.displayName === record.displayName
      ) {
        throw resourceNameAlreadyExists(record.parentFolderRid, record.displayName);
      }
    }
    const stored = { ...record };
    this.resources.set(stored.rid, stored);
    return { ...stored };
  }

  async getResource(
    rid: string,
    resourceType: ModelResourceType,
  ): Promise<ModelResourceRecord | undefined> {
    const record = this.resources.get(rid);
    return record && record.resourceType === resourceType ? { ...record } : undefined;
  }

  async createVersion(record: ModelVersionRecord): Promise<ModelVersionRecord> {
    const stored = structuredClone(record);
    this.versions.push(stored);
    return structuredClone(stored);
  }

  async getVersion(versionRid: string): Promise<ModelVersionRecord | undefined> {
    const record = this.versions.find((version) => version.rid === versionRid);
    return record ? structuredClone(record) : undefined;
  }

  async listVersions(
    modelRid: string,
    branch: string,
    offset: number,
    limit: number,
  ): Promise<ModelVersionRecord[]> {
    return this.versions
      .filter((version) => version.modelRid === modelRid && version.branch === branch)
      .slice(offset, offset + limit)
      .map((version) => structuredClone(version));
  }
}
