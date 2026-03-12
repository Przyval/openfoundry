import type { FastifyInstance } from "fastify";
import type { UserStore } from "../../store/user-store.js";
import type { GroupStore } from "../../store/group-store.js";
import { requirePermission } from "@openfoundry/permissions";

/**
 * GET /admin/stats
 *
 * Returns aggregate counts and recent activity for the admin dashboard.
 * When running with the in-memory stores we derive counts from those;
 * a future iteration can query PG tables directly.
 */
export async function statsRoutes(
  app: FastifyInstance,
  opts: { userStore: UserStore; groupStore: GroupStore },
): Promise<void> {
  const { userStore, groupStore } = opts;

  app.get("/admin/stats", {
    preHandler: requirePermission("admin:manage"),
  }, async (_request) => {
    // Derive counts from in-memory stores (works for both in-mem and PG since
    // the PgUserStore/PgGroupStore implement the same interface).
    const users = userStore.listUsers();
    const groups = groupStore.listGroups();

    // Build a simple recent-activity list from user/group creation timestamps
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

    // Sort descending by timestamp and take the 10 most recent
    recentActivity.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return {
      counts: {
        ontologies: 0,
        objectTypes: 0,
        objects: 0,
        users: users.length,
        groups: groups.length,
        datasets: 0,
        functions: 0,
        actions: 0,
      },
      recentActivity: recentActivity.slice(0, 10),
    };
  });
}
