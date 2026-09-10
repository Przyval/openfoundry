import type { FastifyInstance } from "fastify";
import {
  type PageCursor,
  type PageToken,
  createPageResponse,
  decodePageToken,
  normalizePageRequest,
} from "@openfoundry/pagination";
import { requirePermission } from "@openfoundry/permissions";
import type { AuditStore } from "../../store/audit-store.js";

export async function auditRoutes(
  app: FastifyInstance,
  opts: { auditStore: AuditStore },
): Promise<void> {
  const { auditStore } = opts;

  // Read the audit trail (paginated, newest first).
  //
  // The Foundry API has no counterpart: its `/api/v2/audit/...` resource
  // serves audit *log files* for an enrollment, not a queryable event list.
  // This endpoint is OpenFoundry's own read view over the `audit_log` table.
  app.get<{
    Querystring: {
      action?: string;
      user?: string;
      dateFrom?: string;
      dateTo?: string;
      pageSize?: string;
      pageToken?: string;
    };
  }>("/admin/audit", {
    preHandler: requirePermission("admin:manage"),
  }, async (request) => {
    const { action, user, dateFrom, dateTo, pageSize, pageToken } = request.query;

    const req = normalizePageRequest({
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      pageToken: pageToken as PageToken | undefined,
    });
    const cursor: PageCursor = req.pageToken
      ? decodePageToken(req.pageToken)
      : { offset: 0 };

    // Ask for one extra row so `createPageResponse` can detect a next page.
    const entries = await auditStore.listEntries({
      action,
      user,
      dateFrom,
      dateTo,
      offset: cursor.offset,
      limit: req.pageSize + 1,
    });

    return createPageResponse(entries, cursor, req.pageSize);
  });
}
