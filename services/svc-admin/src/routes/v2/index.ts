import type { FastifyInstance } from "fastify";
import type { UserStore } from "../../store/user-store.js";
import type { GroupStore } from "../../store/group-store.js";
import type { PgPermissionStore } from "@openfoundry/permissions";
import { userRoutes } from "./users.js";
import { groupRoutes } from "./groups.js";
import { statsRoutes } from "./stats.js";
import { permissionRoutes } from "./permissions.js";

export async function v2Routes(
  app: FastifyInstance,
  opts: {
    userStore: UserStore;
    groupStore: GroupStore;
    permissionStore?: PgPermissionStore;
  },
): Promise<void> {
  const routeOpts = {
    userStore: opts.userStore,
    groupStore: opts.groupStore,
  };

  await app.register(userRoutes, routeOpts);
  await app.register(groupRoutes, routeOpts);
  await app.register(statsRoutes, routeOpts);

  // Permission routes require a PgPermissionStore (only available with a database)
  if (opts.permissionStore) {
    await app.register(permissionRoutes, {
      permissionStore: opts.permissionStore,
    });
  }
}
