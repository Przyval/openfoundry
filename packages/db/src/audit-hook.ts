import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { AuditLogger } from "./audit-logger.js";

// ---------------------------------------------------------------------------
// HTTP method -> audit action mapping
// ---------------------------------------------------------------------------

const METHOD_ACTION_MAP: Record<string, string> = {
  GET: "READ",
  POST: "CREATE",
  PUT: "UPDATE",
  PATCH: "UPDATE",
  DELETE: "DELETE",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RequestClaims {
  sub?: string;
  [key: string]: unknown;
}

/**
 * Extract resource information from the request URL.
 *
 * Convention: URLs follow the pattern `/<version>/<resourceType>/<rid>/...`
 * e.g. `/api/v2/ontologies/ri.ontology.abc/objectTypes`
 *
 * We treat the second segment as the resource type and the third as the RID
 * when it looks like a RID (starts with "ri.").
 */
function extractResource(url: string): { resourceType?: string; resourceRid?: string } {
  const path = url.split("?")[0]; // strip query string
  const segments = path.split("/").filter(Boolean);

  // Skip version prefix (e.g. "api", "v2")
  let idx = 0;
  while (idx < segments.length && /^(api|v\d+)$/i.test(segments[idx])) {
    idx++;
  }

  const resourceType = segments[idx] ?? undefined;
  const resourceRid =
    segments[idx + 1] && segments[idx + 1].startsWith("ri.")
      ? segments[idx + 1]
      : undefined;

  return { resourceType, resourceRid };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

async function auditHookPlugin(
  fastify: FastifyInstance,
  opts: { auditLogger: AuditLogger },
): Promise<void> {
  const { auditLogger } = opts;

  fastify.addHook(
    "onResponse",
    (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
      const action = METHOD_ACTION_MAP[request.method] ?? request.method;
      const claims = (request as unknown as { claims?: RequestClaims }).claims;
      const userRid = claims?.sub ?? undefined;
      const { resourceType, resourceRid } = extractResource(request.url);

      // Fire-and-forget — AuditLogger handles its own errors.
      auditLogger.log({
        action,
        userRid,
        resourceType,
        resourceRid,
        details: {
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
        },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      done();
    },
  );
}

export const auditHook = fp(auditHookPlugin, {
  name: "audit-hook",
  fastify: ">=5.x",
});
