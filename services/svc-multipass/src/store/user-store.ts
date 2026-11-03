import {
  ROOT_RESOURCE,
  canonicalPlatformRole,
  type AuthorizationStore,
  type RoleId,
} from "@openfoundry/permissions";
import { hashPassword, verifyPassword } from "../passwords.js";

/**
 * The people svc-multipass can authenticate.
 *
 * A user is a username, a password hash and the platform roles their tokens
 * carry. With DATABASE_URL set the records live in the `users` table
 * (./pg-user-store.ts); outside production the published development accounts
 * below are layered in front of it, in memory only, so they are never written
 * into a database that a production deployment might later reuse.
 */

export interface UserRecord {
  /** Canonical username, as stored. This is the token's `sub`. */
  readonly username: string;
  readonly displayName: string;
  /** scrypt hash (see ../passwords.ts), or null for a user with no password. */
  readonly passwordHash: string | null;
  /** Platform role names, canonical upper case (ADMIN, SERVICE_ACCOUNT). */
  readonly roles: readonly string[];
  /** The user's organization, or null for none. */
  readonly orgRid: string | null;
  /** Groups the user is a member of; a role granted to one is the user's too. */
  readonly groups: readonly string[];
  /** Markings the user may access; a resource carrying any other is closed to them. */
  readonly markings: readonly string[];
  readonly active: boolean;
}

/** Read access to user records, which is all the routes need. */
export interface UserDirectory {
  findByUsername(username: string): Promise<UserRecord | undefined>;
}

// ---------------------------------------------------------------------------
// Validation shared by every writer
// ---------------------------------------------------------------------------

/**
 * Letters, digits and `._@-`, starting with a letter or digit. A colon is
 * excluded on purpose: `service:<clientId>` is the subject of a
 * client_credentials token, and no user may be able to take that name.
 */
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,63}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

/**
 * Role names from before the permission model. Each meant access to every
 * resource, which is now a role held on the platform root.
 */
const LEGACY_ROOT_ROLES: Readonly<Record<string, RoleId>> = { EDITOR: "editor", VIEWER: "viewer" };

export interface RoleNames {
  /** Platform roles, canonical upper case (ADMIN, SERVICE_ACCOUNT). */
  readonly platformRoles: string[];
  /** Roles to grant on the platform root, from legacy names (EDITOR, VIEWER). */
  readonly rootRoles: RoleId[];
  /** The legacy names given, canonical upper case, for a deprecation warning. */
  readonly legacy: string[];
}

/**
 * Sort role names into the platform roles the permission model recognises
 * (`PLATFORM_ROLES` in `@openfoundry/permissions`) and the legacy EDITOR and
 * VIEWER, which the caller turns into a role on the platform root. Any other
 * name is rejected: a role nothing recognises silently grants nothing.
 *
 * @throws Error naming the first unknown role.
 */
export function canonicalRoles(roles: readonly string[]): RoleNames {
  const out: RoleNames = { platformRoles: [], rootRoles: [], legacy: [] };
  for (const raw of roles) {
    const name = raw.trim();
    if (name === "") continue;
    const role = canonicalPlatformRole(name);
    const legacy = LEGACY_ROOT_ROLES[name.toUpperCase()];
    if (role) {
      if (!out.platformRoles.includes(role)) out.platformRoles.push(role);
    } else if (legacy) {
      if (!out.rootRoles.includes(legacy)) out.rootRoles.push(legacy);
      if (!out.legacy.includes(name.toUpperCase())) out.legacy.push(name.toUpperCase());
    } else {
      throw new Error(`unknown role "${name}"`);
    }
  }
  return out;
}

export function legacyRolesWarning(source: string, legacy: readonly string[]): string {
  return (
    `${source}: role ${legacy.join(", ")} is deprecated and was granted as ` +
    `${legacy.map((r) => r.toLowerCase()).join(", ")} on the platform root ` +
    `(ri.platform.main.root.root); grant roles on resources instead`
  );
}

/**
 * The `grantedBy` of a root grant made from a legacy role name. It is what
 * lets the mapping take back what it granted, and nothing an operator granted.
 */
export const LEGACY_ROLE_GRANT_SOURCE = "legacy-role-mapping";

/**
 * Make the legacy-role grants on the platform root of every principal `owns`
 * selects match `desired`: grant what is missing, revoke what the mapping
 * granted earlier and is no longer declared. A principal absent from
 * `desired` loses every such grant.
 */
export async function syncLegacyRootGrants(
  store: AuthorizationStore,
  owns: (principalId: string) => boolean,
  desired: ReadonlyMap<string, readonly RoleId[]>,
): Promise<void> {
  const mapped = (await store.listGrants(ROOT_RESOURCE)).filter(
    (g) => g.principalType === "user" && g.grantedBy === LEGACY_ROLE_GRANT_SOURCE && owns(g.principalId),
  );
  for (const g of mapped) {
    if (!desired.get(g.principalId)?.includes(g.roleId)) {
      await store.removeGrant(ROOT_RESOURCE, g, g.roleId);
    }
  }
  const grantedAt = new Date().toISOString();
  for (const [principalId, roles] of desired) {
    for (const roleId of roles) {
      await store.addGrant({
        resourceRid: ROOT_RESOURCE,
        principalType: "user",
        principalId,
        roleId,
        grantedBy: LEGACY_ROLE_GRANT_SOURCE,
        grantedAt,
      });
    }
  }
}

/**
 * Group and Marking ids travel in a space-separated token claim and a
 * comma-separated header, so neither may contain whitespace or a comma.
 *
 * @throws Error naming the first malformed id.
 */
export function canonicalIds(kind: string, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (id === "") continue;
    if (/[\s,]/.test(id)) throw new Error(`${kind} id "${id}" must not contain whitespace or a comma`);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * What a user's token says about them beyond their name. Read from the record
 * each time a token is minted, so a change reaches the next sign-in or refresh.
 */
export function userTokenClaims(user: UserRecord): {
  org: string;
  roles?: string;
  groups?: string;
  markings?: string;
} {
  return {
    org: user.orgRid ?? DEFAULT_ORG,
    ...(user.roles.length > 0 ? { roles: user.roles.join(" ") } : {}),
    ...(user.groups.length > 0 ? { groups: user.groups.join(" ") } : {}),
    ...(user.markings.length > 0 ? { markings: user.markings.join(" ") } : {}),
  };
}

/** The `org` claim of a subject that belongs to no organization. */
export const DEFAULT_ORG = "default-org";

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

let dummyHash: Promise<string> | undefined;

/**
 * Verify a username and password. Returns the user only when the account
 * exists, is active, has a password, and the password matches.
 *
 * An unknown user still costs one scrypt derivation, so response time does
 * not tell a caller which usernames exist.
 */
export async function authenticate(
  directory: UserDirectory,
  username: string,
  password: string,
): Promise<UserRecord | undefined> {
  const user = isValidUsername(username)
    ? await directory.findByUsername(username)
    : undefined;

  if (!user || !user.passwordHash) {
    dummyHash ??= hashPassword("openfoundry-timing-equaliser");
    await verifyPassword(password, await dummyHash);
    return undefined;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !user.active) return undefined;
  return user;
}

// ---------------------------------------------------------------------------
// In-memory directory and the development accounts
// ---------------------------------------------------------------------------

/** A directory held in memory. Lookups ignore case, as the CITEXT column does. */
export class InMemoryUserDirectory implements UserDirectory {
  private readonly users = new Map<string, UserRecord>();

  constructor(users: readonly UserRecord[] = []) {
    for (const user of users) this.add(user);
  }

  add(user: UserRecord): void {
    this.users.set(user.username.toLowerCase(), user);
  }

  async findByUsername(username: string): Promise<UserRecord | undefined> {
    return this.users.get(username.toLowerCase());
  }
}

/**
 * Asks each directory in turn and answers with the first that knows the name.
 */
export class LayeredUserDirectory implements UserDirectory {
  constructor(private readonly layers: readonly UserDirectory[]) {}

  async findByUsername(username: string): Promise<UserRecord | undefined> {
    for (const layer of this.layers) {
      const user = await layer.findByUsername(username);
      if (user) return user;
    }
    return undefined;
  }
}

/**
 * Development accounts, published in this public repository. They exist only
 * when NODE_ENV is not "production"; see `createUserDirectory`.
 */
export const DEV_USERS: ReadonlyArray<{
  username: string;
  password: string;
  roles: string[];
  displayName: string;
}> = [
  { username: "admin", password: "admin123", roles: ["ADMIN"], displayName: "Admin User" },
  { username: "developer", password: "dev123", roles: [], displayName: "Dev User" },
  { username: "analyst", password: "analyst123", roles: [], displayName: "Analyst User" },
];

export async function devUserDirectory(): Promise<InMemoryUserDirectory> {
  const records = await Promise.all(
    DEV_USERS.map(async (u) => ({
      username: u.username,
      displayName: u.displayName,
      passwordHash: await hashPassword(u.password),
      roles: u.roles,
      orgRid: null,
      groups: [],
      markings: [],
      active: true,
    })),
  );
  return new InMemoryUserDirectory(records);
}

/**
 * The directory the server authenticates against:
 *
 * - production: the persistent directory only, or an empty one when there is
 *   no database - in which case nobody can log in, which is the truth.
 * - otherwise: the development accounts, in front of the persistent directory
 *   when there is one.
 */
export async function createUserDirectory(options: {
  nodeEnv: string;
  persistent?: UserDirectory;
}): Promise<UserDirectory> {
  const layers: UserDirectory[] = [];
  if (options.nodeEnv !== "production") layers.push(await devUserDirectory());
  if (options.persistent) layers.push(options.persistent);
  if (layers.length === 1) return layers[0]!;
  return new LayeredUserDirectory(layers);
}
