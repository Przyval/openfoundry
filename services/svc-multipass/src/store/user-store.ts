import { canonicalPlatformRole } from "@openfoundry/permissions";
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
 * Canonicalise role names against the platform roles the permission model
 * recognises (`PLATFORM_ROLES` in `@openfoundry/permissions`), rejecting any it
 * would not. A role nothing recognises is a role that silently grants nothing.
 * Access to a resource is a role granted on it (owner, editor, viewer or
 * discoverer), never a platform role.
 *
 * @throws Error naming the first unknown role.
 */
export function canonicalRoles(roles: readonly string[]): string[] {
  const canonical: string[] = [];
  for (const raw of roles) {
    const name = raw.trim();
    if (name === "") continue;
    const role = canonicalPlatformRole(name);
    if (!role) {
      throw new Error(`unknown role "${name}"`);
    }
    if (!canonical.includes(role)) canonical.push(role);
  }
  return canonical;
}

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
