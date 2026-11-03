import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";
import { internal, permissionDenied } from "@openfoundry/errors";
import { denialError, evaluate, evaluateEach } from "./authorizer.js";
import { ROOT_RESOURCE, type AuthorizationStore } from "./authorization-store.js";
import { identityFromHeaders, type Identity } from "./identity.js";
import type { Operation } from "./roles.js";

declare module "fastify" {
  interface FastifyRequest {
    /** The verified caller the gateway asserted; undefined for an anonymous request. */
    identity?: Identity;
  }
  interface FastifyInstance {
    authorization: AuthorizationStore;
    /** Resolves a path identifier that aliases a resource (an API name) to its RID. */
    resourceAlias: ResourceAlias;
  }
}

/**
 * When true, a request with no identity is refused with 403. When false (the
 * default) it passes, which is what the unauthenticated demo relies on: the
 * gateway only asserts an identity when it verifies tokens.
 */
let enforcePermissions =
  (process.env.ENFORCE_PERMISSIONS ?? "").toLowerCase() === "true";

/** Override the enforcement flag (useful for tests). */
export function setEnforcePermissions(value: boolean): void {
  enforcePermissions = value;
}

/**
 * Give a service its authorization store and read the caller's identity.
 *
 * Call it directly on the root instance - `await registerAuthorization(app, ...)`
 * - for the reason `authPlugin` is: a hook added inside `app.register` guards
 * only its own child context.
 */
export function registerAuthorization(
  app: FastifyInstance,
  options: { store: AuthorizationStore; alias?: ResourceAlias },
): void {
  app.decorate("authorization", options.store);
  app.decorate("resourceAlias", options.alias ?? (() => undefined));
  app.decorateRequest("identity", undefined);
  app.addHook("onRequest", async (request) => {
    request.identity = identityFromHeaders(request.headers);
  });
}

// ---------------------------------------------------------------------------
// Which resource a route is about
// ---------------------------------------------------------------------------

/**
 * Where to look for roles: the resource first, then each container up to the
 * platform root. Roles and policies held at any of them apply.
 */
export type ResourceAlias = (
  identifier: string,
) => string | undefined | Promise<string | undefined>;

export type ResourceChain = (
  request: FastifyRequest,
) => readonly string[] | Promise<readonly string[]>;

export interface RequirePermissionOptions {
  /** Defaults to the resource named by the route's `ontologyRid`, `datasetRid` or `pipelineRid`. */
  resource?: ResourceChain;
  /**
   * Let a platform administrator through without holding the resource's
   * Organizations and Markings. Only for the route that changes those
   * controls, so a resource a Marking locked everybody out of can be recovered.
   */
  platformAdminOverridesControls?: boolean;
}

/**
 * The resource a route's path parameters name, inside the platform root.
 *
 * Some routes accept an alias where a RID goes (an ontology's API name). The
 * service says how to resolve one, and the alias and the RID both count: a
 * Marking on the RID must bind a caller who reaches the resource by its name.
 */
export async function defaultResourceChain(request: FastifyRequest): Promise<readonly string[]> {
  const params = (request.params ?? {}) as Record<string, string | undefined>;
  const id = params.ontologyRid ?? params.datasetRid ?? params.pipelineRid;
  if (!id) return [ROOT_RESOURCE];
  const rid = await request.server.resourceAlias(id);
  return rid && rid !== id ? [id, rid, ROOT_RESOURCE] : [id, ROOT_RESOURCE];
}

/**
 * Guard a route with a Foundry permission check: the caller's Organization and
 * Markings, then the role they hold on the resource or a container of it.
 */
export function requirePermission(
  operation: Operation,
  options: RequirePermissionOptions = {},
): preHandlerHookHandler {
  const chainOf = options.resource ?? defaultResourceChain;
  return async function permissionHook(request) {
    const identity = request.identity;
    if (!identity) {
      if (!enforcePermissions) return;
      throw permissionDenied("platform", operation);
    }
    if (options.platformAdminOverridesControls && identity.platformAdmin) return;
    if (!request.server.authorization) {
      throw internal("Authorization store is not registered on this service");
    }
    const chain = await chainOf(request);
    const denial = await evaluate(request.server.authorization, identity, operation, chain);
    if (denial) {
      request.log.info({ userId: identity.userId, operation, resource: chain[0], denial }, "permission denied");
      throw denialError(chain, operation);
    }
  };
}

/**
 * Guard a listing route: any identified caller may ask, and the handler cuts
 * the result down with `filterDiscoverable`. No role on the platform root is
 * needed to list, or a caller holding a role on one resource could never see it.
 */
export const requireCaller: preHandlerHookHandler = async function callerHook(request) {
  if (!request.identity && enforcePermissions) throw permissionDenied("platform", "list");
};

// ---------------------------------------------------------------------------
// Resources a caller creates and lists
// ---------------------------------------------------------------------------

/**
 * Make the caller Owner of a resource they just created, as Foundry does for
 * a new Project. Without it nobody but an administrator could ever use it.
 */
export async function grantCreatorOwner(request: FastifyRequest, resourceRid: string): Promise<void> {
  const identity = request.identity;
  if (!identity) return;
  await request.server.authorization.addGrant({
    resourceRid,
    principalType: "user",
    principalId: identity.userId,
    roleId: "owner",
    grantedBy: identity.userId,
    grantedAt: new Date().toISOString(),
  });
}

/**
 * Keep only the resources the caller may at least discover. A resource a
 * caller cannot see should not appear in a listing at all.
 */
export async function filterDiscoverable<T>(
  request: FastifyRequest,
  items: readonly T[],
  ridOf: (item: T) => string,
): Promise<T[]> {
  const identity = request.identity;
  if (!identity) return [...items];
  const allowed = await evaluateEach(
    request.server.authorization,
    identity,
    "resource:discover",
    items.map((item) => [ridOf(item)]),
  );
  return items.filter((_, i) => allowed[i]);
}
