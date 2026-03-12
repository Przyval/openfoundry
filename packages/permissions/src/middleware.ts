import type {
  FastifyRequest,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";
import { permissionDenied } from "@openfoundry/errors";
import type { PgPermissionStore } from "./pg-permission-store.js";
import { resolvePermissionsForRoles } from "./roles.js";

// ---------------------------------------------------------------------------
// Augment FastifyRequest so permission middleware can read JWT claims
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyRequest {
    claims?: {
      sub: string;
      [key: string]: unknown;
    };
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * When true, requests without an X-User-Id header (and without JWT claims)
 * will be rejected with 403.  When false (the default) the middleware
 * gracefully skips the check, enabling backward compatibility and dev mode.
 */
let enforcePermissions =
  (process.env.ENFORCE_PERMISSIONS ?? "").toLowerCase() === "true";

/**
 * Programmatically override the enforcement flag (useful for tests).
 */
export function setEnforcePermissions(value: boolean): void {
  enforcePermissions = value;
}

// ---------------------------------------------------------------------------
// Factory options (PgPermissionStore variant)
// ---------------------------------------------------------------------------

export interface RequirePermissionOptions {
  /**
   * Extract the resource RID from the incoming request.
   * When provided, the middleware will check for a direct permission grant
   * on that specific resource in addition to the role-based check.
   */
  getResourceRid?: (request: FastifyRequest) => string;
}

// ---------------------------------------------------------------------------
// PgPermissionStore-based middleware factory (original)
// ---------------------------------------------------------------------------

/**
 * Creates a Fastify `preHandler` hook that enforces a permission check using
 * the PgPermissionStore.
 *
 * The returned handler:
 * 1. In development mode with no JWT claims present, logs a warning and skips
 *    all checks (allows seed scripts and direct API calls to work).
 * 2. Extracts the subject RID from `request.claims.sub`.
 * 3. Checks for the platform-admin role (always allowed).
 * 4. If `getResourceRid` is supplied, checks for a direct permission grant
 *    on the resource.
 * 5. Falls back to a role-based permission check.
 * 6. Throws a 403 `PermissionDenied` error if none of the checks pass.
 *
 * @param store      - The PgPermissionStore to query.
 * @param permission - The permission string to enforce (e.g. "READ", "manage-users").
 * @param options    - Optional configuration.
 */
export function requirePermission(
  store: PgPermissionStore,
  permission: string,
  options?: RequirePermissionOptions,
): preHandlerHookHandler;

// ---------------------------------------------------------------------------
// Header-based middleware factory (new lightweight variant)
// ---------------------------------------------------------------------------

/**
 * Creates a Fastify `preHandler` hook that enforces a domain-scoped
 * permission using the X-User-Id and X-User-Roles request headers.
 *
 * This variant does NOT require a PgPermissionStore and is suitable for
 * services that use the standard role definitions from `@openfoundry/permissions`.
 *
 * @param permission - The domain permission to enforce (e.g. "ontology:read").
 */
export function requirePermission(
  permission: string,
): preHandlerHookHandler;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function requirePermission(
  storeOrPermission: PgPermissionStore | string,
  permissionOrOptions?: string | RequirePermissionOptions,
  maybeOptions?: RequirePermissionOptions,
): preHandlerHookHandler {
  // Detect which overload was used
  if (typeof storeOrPermission === "string") {
    // Header-based overload: requirePermission(permission)
    return createHeaderBasedHook(storeOrPermission);
  }

  // PgPermissionStore overload: requirePermission(store, permission, options?)
  const store = storeOrPermission;
  const permission = permissionOrOptions as string;
  const options = maybeOptions;
  return createPgStoreHook(store, permission, options);
}

// ---------------------------------------------------------------------------
// Header-based hook
// ---------------------------------------------------------------------------

function createHeaderBasedHook(permission: string): preHandlerHookHandler {
  return async function headerPermissionHook(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const userId = request.headers["x-user-id"] as string | undefined;
    const userRoles = request.headers["x-user-roles"] as string | undefined;

    // Also check JWT claims (set by the gateway auth middleware)
    const hasClaims = !!request.claims;

    // If there is no identity information at all, decide based on enforcement
    if (!userId && !hasClaims) {
      if (!enforcePermissions) {
        // Silently skip — dev mode / backward compat
        return;
      }
      throw permissionDenied("platform", permission);
    }

    // If we have roles from the header, check them
    if (userRoles) {
      const granted = resolvePermissionsForRoles(userRoles);
      if (granted.has(permission)) {
        return;
      }
    }

    // If we have JWT claims but no header roles, skip in non-enforcing mode
    // (the PgPermissionStore variant handles JWT-based checks)
    if (hasClaims && !userRoles && !enforcePermissions) {
      return;
    }

    // No header identity but enforcement is off — skip
    if (!userId && !enforcePermissions) {
      return;
    }

    // Denied
    const subject = userId ?? request.claims?.sub ?? "unknown";
    throw permissionDenied(subject, permission);
  };
}

// ---------------------------------------------------------------------------
// PgPermissionStore hook (unchanged from original implementation)
// ---------------------------------------------------------------------------

function createPgStoreHook(
  store: PgPermissionStore,
  permission: string,
  options?: RequirePermissionOptions,
): preHandlerHookHandler {
  const getResourceRid = options?.getResourceRid;

  return async function permissionHook(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    // ------------------------------------------------------------------
    // Development bypass: when no auth claims are present, skip checks
    // ------------------------------------------------------------------
    if (!request.claims) {
      if (process.env.NODE_ENV === "development" || !process.env.NODE_ENV) {
        request.log.warn(
          { permission },
          "Skipping permission check — no auth claims present (development mode)",
        );
        return;
      }

      // Production with no claims should never happen (auth middleware would
      // have already rejected the request), but guard against misconfiguration.
      throw permissionDenied("unknown", permission);
    }

    const subjectRid = request.claims.sub;

    // ------------------------------------------------------------------
    // Platform-admin always allowed
    // ------------------------------------------------------------------
    const isAdmin = await store.isPlatformAdmin(subjectRid);
    if (isAdmin) {
      return;
    }

    // ------------------------------------------------------------------
    // Resource-specific grant check
    // ------------------------------------------------------------------
    if (getResourceRid) {
      const resourceRid = getResourceRid(request);
      const hasGrant = await store.hasPermission(
        subjectRid,
        resourceRid,
        permission,
      );
      if (hasGrant) {
        return;
      }
    }

    // ------------------------------------------------------------------
    // Role-based permission check
    // ------------------------------------------------------------------
    const hasRole = await store.hasRolePermission(subjectRid, permission);
    if (hasRole) {
      return;
    }

    // ------------------------------------------------------------------
    // Denied
    // ------------------------------------------------------------------
    const resourceDesc = getResourceRid
      ? getResourceRid(request)
      : "platform";
    throw permissionDenied(resourceDesc, permission);
  };
}
