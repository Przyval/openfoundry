import { createHash, timingSafeEqual } from "node:crypto";
import type { RoleId } from "@openfoundry/permissions";
import { canonicalRoles } from "./user-store.js";

/**
 * The OAuth clients svc-multipass will deal with.
 *
 * The registry is closed: a client exists only if it is seeded here for
 * development or declared by the operator in OAUTH_CLIENTS. /authorize never
 * registers one on the fly, and a redirect_uri must match one the client
 * declared, exactly - otherwise anyone could name their own client and their
 * own redirect target and collect a code for whoever logs in.
 */

export interface OAuthClient {
  readonly clientId: string;
  /** Present exactly for confidential clients. */
  readonly clientSecret?: string;
  readonly clientName: string;
  readonly redirectUris: readonly string[];
  readonly grantTypes: readonly string[];
  readonly scopes: readonly string[];
  readonly isPublic: boolean;
  /**
   * Platform roles of the client itself, carried by its client_credentials
   * tokens. A token issued on a user's login carries that user's roles, never
   * the client's.
   */
  readonly roles?: readonly string[];
  /**
   * Roles the client holds on the platform root, from the legacy EDITOR and
   * VIEWER in its declaration. The server grants them at startup.
   */
  readonly rootRoles?: readonly RoleId[];
  /** The legacy role names declared, for the deprecation warning. */
  readonly legacyRoles?: readonly string[];
}

export const GRANT_TYPES = ["authorization_code", "client_credentials", "refresh_token"] as const;

const DEFAULT_SCOPES = ["api:read", "api:write"];

/**
 * Development clients. Their credentials are published in this repository,
 * so they are seeded only when NODE_ENV is not "production"; see
 * `createClientStore`.
 */
export const DEV_CLIENTS: readonly OAuthClient[] = [
  {
    clientId: "openfoundry-dev",
    clientName: "OpenFoundry Dev Client",
    isPublic: true,
    redirectUris: ["http://localhost:3000/callback"],
    grantTypes: ["authorization_code", "refresh_token"],
    scopes: DEFAULT_SCOPES,
  },
  {
    // The console's "Login with OAuth" button, served by `start.sh` on :3000.
    clientId: "openfoundry-console",
    clientName: "OpenFoundry Console",
    isPublic: true,
    redirectUris: ["http://localhost:3000/login"],
    grantTypes: ["authorization_code", "refresh_token"],
    scopes: DEFAULT_SCOPES,
  },
  {
    clientId: "admin",
    clientSecret: "admin123",
    clientName: "Admin Service Client",
    isPublic: false,
    redirectUris: [],
    grantTypes: ["client_credentials"],
    scopes: DEFAULT_SCOPES,
    roles: ["ADMIN"],
  },
  {
    clientId: "developer",
    clientSecret: "dev123",
    clientName: "Developer Service Client",
    isPublic: false,
    redirectUris: [],
    grantTypes: ["client_credentials"],
    scopes: DEFAULT_SCOPES,
    roles: [],
  },
];

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export class ClientStore {
  private readonly clients = new Map<string, OAuthClient>();

  constructor(clients: readonly OAuthClient[] = []) {
    for (const client of clients) this.registerClient(client);
  }

  getClient(clientId: string): OAuthClient | undefined {
    return this.clients.get(clientId);
  }

  /** Add or replace a client. Used at startup and by tests, never by a route. */
  registerClient(client: OAuthClient): void {
    this.clients.set(client.clientId, client);
  }

  /**
   * Validate a client's secret. Public clients always pass (they have no
   * secret). The comparison is over fixed-length digests, so it takes the
   * same time whatever the secret's length or first differing byte.
   */
  validateClientSecret(clientId: string, secret: string | undefined): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    if (client.isPublic) return true;

    if (!client.clientSecret || !secret) return false;

    return timingSafeEqual(digest(client.clientSecret), digest(secret));
  }
}

/**
 * The store the server runs with: the development clients outside production,
 * then every client the operator declared, which wins on a clash of ids.
 */
export function createClientStore(options: {
  nodeEnv: string;
  declared: readonly OAuthClient[];
}): ClientStore {
  const store = new ClientStore(options.nodeEnv === "production" ? [] : DEV_CLIENTS);
  for (const client of options.declared) store.registerClient(client);
  return store;
}

// ---------------------------------------------------------------------------
// OAUTH_CLIENTS
// ---------------------------------------------------------------------------

/**
 * Parse OAUTH_CLIENTS, a JSON array of client declarations:
 *
 *   [{ "clientId": "openfoundry-console",
 *      "redirectUris": ["https://console.example.com/login"] },
 *    { "clientId": "sync-job", "clientSecret": "<secret>", "roles": ["SERVICE_ACCOUNT"] }]
 *
 * A declaration with a `clientSecret` is confidential and defaults to the
 * client_credentials grant; one without is public and defaults to
 * authorization_code + refresh_token. `clientName`, `grantTypes` and `scopes`
 * may be given explicitly.
 *
 * Anything malformed throws, so a mistyped declaration stops the service at
 * startup instead of leaving a client that quietly cannot log anyone in.
 */
export function parseDeclaredClients(raw: string): OAuthClient[] {
  if (raw.trim() === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`OAUTH_CLIENTS is not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("OAUTH_CLIENTS must be a JSON array of client declarations");
  }

  const seen = new Set<string>();
  return parsed.map((entry: unknown, index: number) => {
    const client = parseDeclaration(entry, index);
    if (seen.has(client.clientId)) {
      throw new Error(`OAUTH_CLIENTS declares client "${client.clientId}" twice`);
    }
    seen.add(client.clientId);
    return client;
  });
}

function parseDeclaration(entry: unknown, index: number): OAuthClient {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new Error(`OAUTH_CLIENTS[${index}] must be an object`);
  }
  const e = entry as Record<string, unknown>;

  const clientId = e.clientId;
  if (typeof clientId !== "string" || clientId === "" || /\s/.test(clientId)) {
    throw new Error(`OAUTH_CLIENTS[${index}].clientId must be a non-empty string without whitespace`);
  }
  const fail = (message: string): never => {
    throw new Error(`OAUTH_CLIENTS client "${clientId}": ${message}`);
  };

  const clientSecret = optionalString(e.clientSecret, "clientSecret", fail);
  if (clientSecret === "") fail("clientSecret must not be empty; omit it for a public client");
  const isPublic = clientSecret === undefined;

  const grantTypes =
    optionalStringArray(e.grantTypes, "grantTypes", fail) ??
    (isPublic ? ["authorization_code", "refresh_token"] : ["client_credentials"]);
  for (const grant of grantTypes) {
    if (!(GRANT_TYPES as readonly string[]).includes(grant)) {
      fail(`unsupported grant type "${grant}" (supported: ${GRANT_TYPES.join(", ")})`);
    }
  }
  if (isPublic && grantTypes.includes("client_credentials")) {
    fail("client_credentials needs a clientSecret");
  }

  const redirectUris = optionalStringArray(e.redirectUris, "redirectUris", fail) ?? [];
  for (const uri of redirectUris) {
    if (!isValidRedirectUri(uri)) {
      fail(`redirect URI "${uri}" must be an absolute http(s) URL without a fragment`);
    }
  }
  if (grantTypes.includes("authorization_code") && redirectUris.length === 0) {
    fail("the authorization_code grant needs at least one redirect URI");
  }

  const roles = optionalStringArray(e.roles, "roles", fail);
  if (roles && roles.length > 0 && !grantTypes.includes("client_credentials")) {
    fail(
      "roles apply only to a client_credentials client; a login carries the " +
        "roles of the user who logged in",
    );
  }
  let canonical: ReturnType<typeof canonicalRoles> | undefined;
  try {
    canonical = roles ? canonicalRoles(roles) : undefined;
  } catch (err) {
    fail((err as Error).message);
  }

  return {
    clientId,
    ...(clientSecret !== undefined ? { clientSecret } : {}),
    clientName: optionalString(e.clientName, "clientName", fail) ?? clientId,
    isPublic,
    redirectUris,
    grantTypes,
    scopes: optionalStringArray(e.scopes, "scopes", fail) ?? DEFAULT_SCOPES,
    ...(canonical && canonical.platformRoles.length > 0 ? { roles: canonical.platformRoles } : {}),
    ...(canonical && canonical.rootRoles.length > 0
      ? { rootRoles: canonical.rootRoles, legacyRoles: canonical.legacy }
      : {}),
  };
}

function optionalString(
  value: unknown,
  field: string,
  fail: (message: string) => never,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail(`${field} must be a string`);
  return value as string;
}

function optionalStringArray(
  value: unknown,
  field: string,
  fail: (message: string) => never,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    fail(`${field} must be an array of strings`);
  }
  return value as string[];
}

function isValidRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  return (url.protocol === "https:" || url.protocol === "http:") && url.hash === "" && !uri.includes("#");
}
