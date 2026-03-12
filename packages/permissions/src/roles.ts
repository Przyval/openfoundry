/**
 * Standard role definitions for the OpenFoundry platform.
 *
 * Each role maps to a set of domain-scoped permissions (e.g. "ontology:read",
 * "objects:write"). The permission middleware uses these definitions to decide
 * whether a request is allowed.
 */

// ---------------------------------------------------------------------------
// Permission constants
// ---------------------------------------------------------------------------

/**
 * All domain-scoped permissions recognised by the platform.
 */
export const PERMISSIONS = {
  // Ontology service
  ONTOLOGY_READ: "ontology:read",
  ONTOLOGY_WRITE: "ontology:write",
  ONTOLOGY_DELETE: "ontology:delete",

  // Objects service
  OBJECTS_READ: "objects:read",
  OBJECTS_WRITE: "objects:write",
  OBJECTS_DELETE: "objects:delete",

  // Datasets service
  DATASETS_READ: "datasets:read",
  DATASETS_WRITE: "datasets:write",
  DATASETS_DELETE: "datasets:delete",

  // Actions service
  ACTIONS_READ: "actions:read",
  ACTIONS_EXECUTE: "actions:execute",

  // Admin service
  ADMIN_MANAGE: "admin:manage",
} as const;

export type DomainPermission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ---------------------------------------------------------------------------
// Role definitions
// ---------------------------------------------------------------------------

export interface StandardRole {
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
}

/** All domain-scoped permissions as a flat array. */
const ALL_PERMISSIONS: readonly string[] = Object.values(PERMISSIONS);

/**
 * ADMIN — full access to every operation.
 */
export const ADMIN: StandardRole = {
  name: "ADMIN",
  description: "Full access to all platform operations",
  permissions: ALL_PERMISSIONS,
};

/**
 * EDITOR — read + write (create, update, delete) on ontologies, objects, and
 * datasets.  Cannot manage admin resources.
 */
export const EDITOR: StandardRole = {
  name: "EDITOR",
  description: "Read and write access to ontologies, objects, and datasets",
  permissions: [
    PERMISSIONS.ONTOLOGY_READ,
    PERMISSIONS.ONTOLOGY_WRITE,
    PERMISSIONS.ONTOLOGY_DELETE,
    PERMISSIONS.OBJECTS_READ,
    PERMISSIONS.OBJECTS_WRITE,
    PERMISSIONS.OBJECTS_DELETE,
    PERMISSIONS.DATASETS_READ,
    PERMISSIONS.DATASETS_WRITE,
    PERMISSIONS.DATASETS_DELETE,
    PERMISSIONS.ACTIONS_READ,
    PERMISSIONS.ACTIONS_EXECUTE,
  ],
};

/**
 * VIEWER — read-only access to ontologies, objects, datasets, and actions.
 */
export const VIEWER: StandardRole = {
  name: "VIEWER",
  description: "Read-only access to platform resources",
  permissions: [
    PERMISSIONS.ONTOLOGY_READ,
    PERMISSIONS.OBJECTS_READ,
    PERMISSIONS.DATASETS_READ,
    PERMISSIONS.ACTIONS_READ,
  ],
};

/**
 * SERVICE_ACCOUNT — full access, intended for service-to-service calls.
 */
export const SERVICE_ACCOUNT: StandardRole = {
  name: "SERVICE_ACCOUNT",
  description: "Full access for service-to-service communication",
  permissions: ALL_PERMISSIONS,
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Map of role name (case-insensitive key) to its definition.
 */
const ROLE_MAP: ReadonlyMap<string, StandardRole> = new Map(
  [ADMIN, EDITOR, VIEWER, SERVICE_ACCOUNT].map((r) => [
    r.name.toUpperCase(),
    r,
  ]),
);

/**
 * Resolve a role name to its definition.
 * Returns `undefined` for unknown roles.
 */
export function resolveRole(name: string): StandardRole | undefined {
  return ROLE_MAP.get(name.toUpperCase());
}

/**
 * Given one or more role names (comma-separated string or array), return the
 * union of all permissions granted by those roles.  Unknown role names are
 * silently ignored.
 */
export function resolvePermissionsForRoles(roles: string | string[]): Set<string> {
  const names = typeof roles === "string"
    ? roles.split(",").map((s) => s.trim())
    : roles;

  const perms = new Set<string>();
  for (const name of names) {
    const role = resolveRole(name);
    if (role) {
      for (const p of role.permissions) {
        perms.add(p);
      }
    }
  }
  return perms;
}
