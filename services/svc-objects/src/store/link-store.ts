import { notFound } from "@openfoundry/errors";

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
 * Links are stored by a composite key: sourceObjectType:sourcePrimaryKey:linkType.
 */
export class LinkStore {
  /** Map<compositeKey, StoredLink[]> */
  private readonly links = new Map<string, StoredLink[]>();

  private key(objectType: string, primaryKey: string, linkType: string): string {
    return `${objectType}:${primaryKey}:${linkType}`;
  }

  createLink(
    sourceObjectType: string,
    sourcePrimaryKey: string,
    linkType: string,
    targetObjectType: string,
    targetPrimaryKey: string,
  ): StoredLink {
    const k = this.key(sourceObjectType, sourcePrimaryKey, linkType);
    const existing = this.links.get(k) ?? [];

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
    this.links.set(k, existing);
    return link;
  }

  getLinks(
    objectType: string,
    primaryKey: string,
    linkType: string,
    pageSize = 100,
    pageToken?: string,
  ): { data: StoredLink[]; nextPageToken?: string; totalCount: number } {
    const k = this.key(objectType, primaryKey, linkType);
    const all = this.links.get(k) ?? [];
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

  deleteLink(
    objectType: string,
    primaryKey: string,
    linkType: string,
    targetPrimaryKey: string,
  ): void {
    const k = this.key(objectType, primaryKey, linkType);
    const existing = this.links.get(k);
    if (!existing) {
      throw notFound("Link", `${objectType}:${primaryKey}:${linkType}:${targetPrimaryKey}`);
    }

    const idx = existing.findIndex((l) => l.targetPrimaryKey === targetPrimaryKey);
    if (idx === -1) {
      throw notFound("Link", `${objectType}:${primaryKey}:${linkType}:${targetPrimaryKey}`);
    }

    existing.splice(idx, 1);
    if (existing.length === 0) {
      this.links.delete(k);
    }
  }

  /**
   * Get all target primary keys for a given source and link type.
   * Useful for SEARCH_AROUND ObjectSet resolution.
   */
  getLinkedObjects(
    objectType: string,
    primaryKey: string,
    linkType: string,
  ): Array<{ targetObjectType: string; targetPrimaryKey: string }> {
    const k = this.key(objectType, primaryKey, linkType);
    const all = this.links.get(k) ?? [];
    return all.map((l) => ({
      targetObjectType: l.targetObjectType,
      targetPrimaryKey: l.targetPrimaryKey,
    }));
  }
}
