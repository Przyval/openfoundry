/**
 * Roles, as Foundry defines them.
 *
 * Foundry grants a *role on a resource*, and the role is inherited by
 * everything the resource contains. The default roles are Owner, Editor,
 * Viewer and Discoverer, most to least powerful; each can hand out its own
 * level or lower. Roles are platform-defined and read-only over the API - an
 * operator picks one for a principal, never writes a new one.
 *
 * See docs/foundry-fidelity.md for the sources.
 */

export const ROLE_IDS = ["owner", "editor", "viewer", "discoverer"] as const;

export type RoleId = (typeof ROLE_IDS)[number];

/** Higher outranks lower. */
const ROLE_RANK: Readonly<Record<RoleId, number>> = {
  discoverer: 1,
  viewer: 2,
  editor: 3,
  owner: 4,
};

export interface RoleDefinition {
  readonly id: RoleId;
  readonly displayName: string;
  readonly description: string;
}

export const ROLES: readonly RoleDefinition[] = [
  {
    id: "owner",
    displayName: "Owner",
    description: "Full control of the resource, including who holds a role on it",
  },
  {
    id: "editor",
    displayName: "Editor",
    description: "Read and change the resource and everything it contains",
  },
  {
    id: "viewer",
    displayName: "Viewer",
    description: "Read the resource and everything it contains",
  },
  {
    id: "discoverer",
    displayName: "Discoverer",
    description: "See that the resource exists, without reading its contents",
  },
];

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === "string" && (ROLE_IDS as readonly string[]).includes(value);
}

/** True when `held` is at least as powerful as `required`. */
export function roleSatisfies(held: RoleId, required: RoleId): boolean {
  return ROLE_RANK[held] >= ROLE_RANK[required];
}

/** The roles a holder of `role` may hand to others: its own and every lower one. */
export function assignableRoles(role: RoleId): RoleId[] {
  return ROLE_IDS.filter((r) => ROLE_RANK[r] <= ROLE_RANK[role]);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * The lowest role that may perform each operation a route guards.
 *
 * An operation names a kind of request, not a place: *where* it is checked -
 * which resource's roles count - comes from the route (see `middleware.ts`).
 * `admin:manage` is the exception: it is a platform operation and needs Owner
 * on the platform root.
 */
export const OPERATION_ROLES = {
  "ontology:read": "viewer",
  "ontology:write": "editor",
  "ontology:delete": "editor",
  "objects:read": "viewer",
  "objects:write": "editor",
  "objects:delete": "editor",
  "datasets:read": "viewer",
  "datasets:write": "editor",
  "datasets:delete": "editor",
  "actions:read": "viewer",
  "actions:execute": "editor",
  "resource:discover": "discoverer",
  "resource:manage-roles": "owner",
  "admin:manage": "owner",
} as const satisfies Record<string, RoleId>;

export type Operation = keyof typeof OPERATION_ROLES;

// ---------------------------------------------------------------------------
// Platform roles
// ---------------------------------------------------------------------------

/**
 * Roles a sign-in carries in its token, as distinct from roles on a resource.
 * A platform administrator administers the platform: it holds Owner on the
 * platform root and so, through inheritance, on every resource. It does not
 * see past Organizations or Markings - those are mandatory.
 */
export const PLATFORM_ROLES = ["ADMIN", "SERVICE_ACCOUNT"] as const;

export function canonicalPlatformRole(name: string): string | undefined {
  const upper = name.trim().toUpperCase();
  return (PLATFORM_ROLES as readonly string[]).includes(upper) ? upper : undefined;
}

export function hasPlatformAdminRole(roles: readonly string[]): boolean {
  return roles.some((r) => canonicalPlatformRole(r) !== undefined);
}
