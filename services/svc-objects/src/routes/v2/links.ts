import type { FastifyInstance } from "fastify";
import type { LinkStore } from "../../store/link-store.js";
import type { ObjectStore } from "../../store/object-store.js";
import type { StoredObject } from "../../store/object-store.js";
import {
  encodePageToken,
  decodePageToken,
  type PageCursor,
  type PageToken,
} from "@openfoundry/pagination";
import { requirePermission } from "@openfoundry/permissions";
import { rejectUnsupportedOntologyScoping } from "@openfoundry/errors";
import {
  applyExcludeRid,
  applyOrderBy,
  applySelect,
  applySnapshot,
  parseBooleanParam,
  parseListParam,
  parseOrderBy,
  resolveSnapshotSize,
} from "./query-params.js";

// ---------------------------------------------------------------------------
// Route parameter / body types
// ---------------------------------------------------------------------------

interface LinkParams {
  ontologyRid: string;
  objectType: string;
  primaryKey: string;
  linkType: string;
}

interface DeleteLinkParams extends LinkParams {
  targetPrimaryKey: string;
}

interface CreateLinkBody {
  targetObjectType: string;
  targetPrimaryKey: string;
}

/**
 * Reads the offset out of a linked-objects page token.
 *
 * Listings without snapshot consistency keep emitting the bare numeric token
 * this endpoint has always used; a snapshot listing needs somewhere to carry
 * its frozen size, so it emits the shared base64url cursor instead. Both are
 * accepted here so a token minted before or after that distinction still pages.
 */
function decodeLinkPageToken(pageToken: string | undefined): PageCursor {
  if (!pageToken) return { offset: 0 };
  if (/^\d+$/.test(pageToken)) return { offset: parseInt(pageToken, 10) };
  return decodePageToken(pageToken as PageToken);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function linkRoutes(
  app: FastifyInstance,
  opts: { linkStore: LinkStore; objectStore: ObjectStore },
): Promise<void> {
  const { linkStore, objectStore } = opts;

  // Get linked objects (paginated)
  // Returns the actual linked objects (not just link metadata) as @osdk/client expects.
  app.get<{
    Params: LinkParams;
    Querystring: {
      pageSize?: number;
      pageToken?: string;
      select?: string | string[];
      orderBy?: string;
      excludeRid?: string;
      snapshot?: string;
      branch?: string;
    };
  }>(
    "/ontologies/:ontologyRid/objects/:objectType/:primaryKey/links/:linkType",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      rejectUnsupportedOntologyScoping(request.query);
      const { objectType, primaryKey, linkType } = request.params;
      const query = request.query;

      const select = parseListParam(query.select);
      const orderBy = parseOrderBy(query.orderBy);
      const excludeRid = parseBooleanParam("excludeRid", query.excludeRid);
      const snapshot = parseBooleanParam("snapshot", query.snapshot);

      const pageSize = query.pageSize ? Number(query.pageSize) : 100;
      const cursor = decodeLinkPageToken(query.pageToken);

      // Links are resolved into objects before the page is cut. Ordering by a
      // property of the linked object is only meaningful over the whole set,
      // and cutting the page first would also under-fill it whenever a link
      // points at an object that has since been deleted.
      const allLinks = linkStore.getAllLinks(objectType, primaryKey, linkType);
      const snapshotSize = resolveSnapshotSize(
        snapshot,
        cursor.snapshotSize,
        allLinks.length,
      );
      const links = applySnapshot(allLinks, snapshotSize);

      let objects = links
        .map((link) => {
          try {
            return objectStore.getObject(link.targetObjectType, link.targetPrimaryKey);
          } catch {
            // Object may have been deleted after the link was created; skip it
            return null;
          }
        })
        .filter((obj): obj is StoredObject => obj !== null);

      if (orderBy) {
        objects = applyOrderBy(objects, orderBy);
      }
      const totalCount = objects.length;

      const slice = objects.slice(cursor.offset, cursor.offset + pageSize + 1);
      const hasMore = slice.length > pageSize;
      const page = hasMore ? slice.slice(0, pageSize) : slice;

      const data = applyExcludeRid(applySelect(page, select), excludeRid);

      const nextOffset = cursor.offset + pageSize;
      return {
        data,
        totalCount,
        ...(hasMore
          ? {
              nextPageToken:
                snapshotSize !== undefined
                  ? encodePageToken({ offset: nextOffset, snapshotSize })
                  : String(nextOffset),
            }
          : {}),
      };
    },
  );

  // Create link
  app.post<{ Params: LinkParams; Body: CreateLinkBody }>(
    "/ontologies/:ontologyRid/objects/:objectType/:primaryKey/links/:linkType",
    {
      preHandler: requirePermission("objects:write"),
    },
    async (request, reply) => {
      const { objectType, primaryKey, linkType } = request.params;
      const { targetObjectType, targetPrimaryKey } = request.body;
      const link = linkStore.createLink(
        objectType,
        primaryKey,
        linkType,
        targetObjectType,
        targetPrimaryKey,
      );
      return reply.status(201).send(link);
    },
  );

  // Delete link
  app.delete<{ Params: DeleteLinkParams }>(
    "/ontologies/:ontologyRid/objects/:objectType/:primaryKey/links/:linkType/:targetPrimaryKey",
    {
      preHandler: requirePermission("objects:delete"),
    },
    async (request, reply) => {
      const { objectType, primaryKey, linkType, targetPrimaryKey } = request.params;
      linkStore.deleteLink(objectType, primaryKey, linkType, targetPrimaryKey);
      return reply.status(204).send();
    },
  );
}
