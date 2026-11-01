import { notFound } from "@openfoundry/errors";
import {
  readOntologyScopedFile,
  writeOntologyScopedFile,
} from "./ontology-scoped-file.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredLink {
  sourceObjectType: string;
  sourcePrimaryKey: string;
  linkType: string;
  targetObjectType: string;
  targetPrimaryKey: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// LinkStore
// ---------------------------------------------------------------------------

/**
 * In-memory link storage.
 *
 * Links are kept per ontology, then by a composite key
 * `sourceObjectType:sourcePrimaryKey:linkType`. The ontology is part of the
 * address for the same reason it is for objects: two ontologies may each
 * declare an object type of the same name, and a link between one ontology's
 * objects says nothing about the other's.
 */
export class LinkStore {
  /** Map<ontologyRid, Map<compositeKey, StoredLink[]>> */
  private readonly links = new Map<string, Map<string, StoredLink[]>>();
  private readonly DATA_FILE: string | null;

  /**
   * @param dataFile Where the store persists between restarts. Pass `null` for
   *   a purely in-memory store, which is what tests need: the default file is
   *   shared by every instance in the process, so a store constructed after
   *   another one has written would otherwise start with that state.
   */
  constructor(dataFile: string | null = "/tmp/openfoundry-data/link-store.json") {
    this.DATA_FILE = dataFile;
    this.loadFromDisk();
  }

  // -----------------------------------------------------------------------
  // Persistence helpers
  // -----------------------------------------------------------------------

  private saveToDisk(): void {
    if (this.DATA_FILE === null) return;
    const plain: Record<string, Record<string, StoredLink[]>> = {};
    for (const [ontologyRid, byKey] of this.links) {
      plain[ontologyRid] = Object.fromEntries(byKey);
    }
    writeOntologyScopedFile(this.DATA_FILE, plain);
  }

  private loadFromDisk(): void {
    if (this.DATA_FILE === null) return;
    const plain = readOntologyScopedFile<Record<string, StoredLink[]>>(
      this.DATA_FILE,
      "link-store",
    );
    for (const [ontologyRid, byKey] of Object.entries(plain)) {
      this.links.set(ontologyRid, new Map(Object.entries(byKey)));
    }
  }

  private key(objectType: string, primaryKey: string, linkType: string): string {
    return `${objectType}:${primaryKey}:${linkType}`;
  }

  /** The links of one source object and link type in one ontology. */
  private find(
    ontologyRid: string,
    objectType: string,
    primaryKey: string,
    linkType: string,
  ): StoredLink[] | undefined {
    return this.links.get(ontologyRid)?.get(this.key(objectType, primaryKey, linkType));
  }

  createLink(
    ontologyRid: string,
    sourceObjectType: string,
    sourcePrimaryKey: string,
    linkType: string,
    targetObjectType: string,
    targetPrimaryKey: string,
  ): StoredLink {
    let byKey = this.links.get(ontologyRid);
    if (!byKey) {
      byKey = new Map();
      this.links.set(ontologyRid, byKey);
    }
    const k = this.key(sourceObjectType, sourcePrimaryKey, linkType);
    const existing = byKey.get(k) ?? [];

    // Check for duplicate
    const duplicate = existing.find(
      (l) =>
        l.targetObjectType === targetObjectType &&
        l.targetPrimaryKey === targetPrimaryKey,
    );
    if (duplicate) {
      return duplicate;
    }

    const link: StoredLink = {
      sourceObjectType,
      sourcePrimaryKey,
      linkType,
      targetObjectType,
      targetPrimaryKey,
      createdAt: new Date().toISOString(),
    };

    existing.push(link);
    byKey.set(k, existing);
    this.saveToDisk();
    return link;
  }

  getLinks(
    ontologyRid: string,
    objectType: string,
    primaryKey: string,
    linkType: string,
    pageSize = 100,
    pageToken?: string,
  ): { data: StoredLink[]; nextPageToken?: string; totalCount: number } {
    const all = this.find(ontologyRid, objectType, primaryKey, linkType) ?? [];
    const totalCount = all.length;

    let offset = 0;
    if (pageToken) {
      // Simple offset-based pagination for links
      offset = parseInt(pageToken, 10) || 0;
    }

    const slice = all.slice(offset, offset + pageSize + 1);
    const hasMore = slice.length > pageSize;
    const data = hasMore ? slice.slice(0, pageSize) : slice;

    return {
      data,
      totalCount,
      ...(hasMore ? { nextPageToken: String(offset + pageSize) } : {}),
    };
  }

  /**
   * Returns every link of a given type from a source object, unpaginated.
   *
   * The linked-objects endpoint resolves links into objects and orders them by
   * object property before cutting a page, so it needs the whole set rather
   * than {@link getLinks}' pre-paginated slice.
   */
  getAllLinks(
    ontologyRid: string,
    objectType: string,
    primaryKey: string,
    linkType: string,
  ): StoredLink[] {
    return this.find(ontologyRid, objectType, primaryKey, linkType) ?? [];
  }

  deleteLink(
    ontologyRid: string,
    objectType: string,
    primaryKey: string,
    linkType: string,
    targetPrimaryKey: string,
  ): void {
    const byKey = this.links.get(ontologyRid);
    const k = this.key(objectType, primaryKey, linkType);
    const existing = byKey?.get(k);
    if (!byKey || !existing) {
      throw notFound("Link", `${objectType}:${primaryKey}:${linkType}:${targetPrimaryKey}`);
    }

    const idx = existing.findIndex((l) => l.targetPrimaryKey === targetPrimaryKey);
    if (idx === -1) {
      throw notFound("Link", `${objectType}:${primaryKey}:${linkType}:${targetPrimaryKey}`);
    }

    existing.splice(idx, 1);
    if (existing.length === 0) {
      byKey.delete(k);
    }
    this.saveToDisk();
  }

  /**
   * Get all target primary keys for a given source and link type.
   * Useful for SEARCH_AROUND ObjectSet resolution.
   */
  getLinkedObjects(
    ontologyRid: string,
    objectType: string,
    primaryKey: string,
    linkType: string,
  ): Array<{ targetObjectType: string; targetPrimaryKey: string }> {
    const all = this.find(ontologyRid, objectType, primaryKey, linkType) ?? [];
    return all.map((l) => ({
      targetObjectType: l.targetObjectType,
      targetPrimaryKey: l.targetPrimaryKey,
    }));
  }
}
