import type { FastifyInstance } from "fastify";
import type { UserStore } from "../../store/user-store.js";
import type { GroupStore } from "../../store/group-store.js";
import { requirePermission } from "@openfoundry/permissions";

// ---------------------------------------------------------------------------
// Helper: fetch a JSON endpoint and extract a count (best-effort)
// ---------------------------------------------------------------------------

async function fetchCount(url: string): Promise<number> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return 0;
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.totalCount === "number") return body.totalCount;
    if (typeof body.count === "number") return body.count;
    if (Array.isArray(body.data)) return body.data.length;
    if (Array.isArray(body)) return body.length;
    return 0;
  } catch {
    return 0;
  }
}

// Service base URLs
const ONTOLOGY = process.env.ONTOLOGY_SERVICE_URL ?? "http://localhost:8081";
const OBJECTS = process.env.OBJECTS_SERVICE_URL ?? "http://localhost:8082";
const DATASETS = process.env.DATASETS_SERVICE_URL ?? "http://localhost:8085";
const FUNCTIONS = process.env.FUNCTIONS_SERVICE_URL ?? "http://localhost:8088";
const ACTIONS = process.env.ACTIONS_SERVICE_URL ?? "http://localhost:8083";

/**
 * GET /admin/stats — live counts from sibling services.
 */
export async function statsRoutes(
  app: FastifyInstance,
  opts: { userStore: UserStore; groupStore: GroupStore },
): Promise<void> {
  const { userStore, groupStore } = opts;

  app.get("/admin/stats", {
    preHandler: requirePermission("admin:manage"),
  }, async (_request) => {
    const users = userStore.listUsers();
    const groups = groupStore.listGroups();

    // 1. Get ontologies list to know RIDs
    let ontologiesCount = 0;
    let totalObjectTypes = 0;
    let totalObjects = 0;

    try {
      const ontRes = await fetch(`${ONTOLOGY}/api/v2/ontologies`, {
        signal: AbortSignal.timeout(3000),
      });
      if (ontRes.ok) {
        const ontBody = (await ontRes.json()) as { data?: Array<{ rid: string }> };
        const ontologies = ontBody.data ?? [];
        ontologiesCount = ontologies.length;

        // For each ontology, count object types and objects
        const otPromises = ontologies.map(async (ont) => {
          const otRes = await fetch(
            `${ONTOLOGY}/api/v2/ontologies/${ont.rid}/objectTypes`,
            { signal: AbortSignal.timeout(3000) },
          );
          if (!otRes.ok) return { types: 0, objects: 0 };
          const otBody = (await otRes.json()) as {
            data?: Array<{ apiName: string }>;
          };
          const objectTypes = otBody.data ?? [];

          // Count objects per type
          let objCount = 0;
          for (const ot of objectTypes) {
            try {
              const objRes = await fetch(
                `${OBJECTS}/api/v2/ontologies/${ont.rid}/objects/${ot.apiName}?pageSize=1`,
                { signal: AbortSignal.timeout(2000) },
              );
              if (objRes.ok) {
                const objBody = (await objRes.json()) as { totalCount?: number; data?: unknown[] };
                objCount += objBody.totalCount ?? objBody.data?.length ?? 0;
              }
            } catch { /* skip */ }
          }

          return { types: objectTypes.length, objects: objCount };
        });

        const results = await Promise.all(otPromises);
        totalObjectTypes = results.reduce((s, r) => s + r.types, 0);
        totalObjects = results.reduce((s, r) => s + r.objects, 0);
      }
    } catch { /* ontology service unavailable */ }

    // Fetch remaining counts in parallel
    const [datasets, functions, actions] = await Promise.all([
      fetchCount(`${DATASETS}/api/v2/datasets`),
      fetchCount(`${FUNCTIONS}/api/v2/functions`),
      fetchCount(`${ACTIONS}/api/v2/actions`),
    ]);

    // Recent activity
    const recentActivity: Array<{
      timestamp: string;
      user: string;
      action: string;
      resourceType: string;
      resourceRid: string;
    }> = [];

    for (const u of users) {
      recentActivity.push({
        timestamp: u.createdAt,
        user: "system",
        action: "CREATE",
        resourceType: "User",
        resourceRid: u.rid,
      });
    }
    for (const g of groups) {
      recentActivity.push({
        timestamp: g.createdAt,
        user: "system",
        action: "CREATE",
        resourceType: "Group",
        resourceRid: g.rid,
      });
    }

    recentActivity.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return {
      counts: {
        ontologies: ontologiesCount,
        objectTypes: totalObjectTypes,
        objects: totalObjects,
        users: users.length,
        groups: groups.length,
        datasets,
        functions,
        actions,
      },
      recentActivity: recentActivity.slice(0, 10),
    };
  });
}
