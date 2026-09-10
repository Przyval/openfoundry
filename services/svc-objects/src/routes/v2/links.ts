import type { FastifyInstance } from "fastify";
import type { LinkStore } from "../../store/link-store.js";
import type {
  ObjectReadWriteStore,
  ObjectTypeSchemaSource,
  StoredObject,
} from "../../store/object-store.js";
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
  assertPropertiesExist,
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
  opts: {
    linkStore: LinkStore;
    objectStore: ObjectReadWriteStore;
    objectTypeSchema?: ObjectTypeSchemaSource;
  },
): Promise<void> {
  const { linkStore, objectStore, objectTypeSchema } = opts;

  /**
   * The object type a linked-objects listing returns, and the properties that
   * type declares.
   *
   * Both come from the declaration - the link type says what it points at, and
   * that object type says what its properties are - so the same request is
   * answered the same way whether the source object has no links or many.
   * `properties` is `undefined` when either declaration is missing, which
   * leaves the request unchecked rather than judged on absent evidence.
   */
  const declaredTarget = async (
    ontologyRid: string,
    objectType: string,
    linkType: string,
  ): Promise<{ objectType: string; properties?: ReadonlySet<string> }> => {
    const target = objectTypeSchema
      ? await objectTypeSchema.linkTargetObjectType(ontologyRid, objectType, linkType)
      : await objectStore.linkTargetObjectType?.(ontologyRid, objectType, linkType);
    if (target === undefined) return { objectType };

    const properties = objectTypeSchema
      ? await objectTypeSchema.propertyNames(ontologyRid, target)
      : await objectStore.propertyNames?.(ontologyRid, target);
    return { objectType: target, ...(properties ? { properties } : {}) };
  };

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
      const { ontologyRid, objectType, primaryKey, linkType } = request.params;
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

      const target = await declaredTarget(ontologyRid, objectType, linkType);
      assertPropertiesExist(target.objectType, target.properties, select);
      assertPropertiesExist(
        target.objectType,
        target.properties,
        orderBy?.map((term) => term.property),
      );

      const resolved = await Promise.all(
        links.map(async (link) => {
          try {
            return await objectStore.getObject(
              link.targetObjectType,
              link.targetPrimaryKey,
            );
          } catch {
            // Object may have been deleted after the link was created; skip it
            return null;
          }
        }),
      );
      let objects = resolved.filter((obj): obj is StoredObject => obj !== null);

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
