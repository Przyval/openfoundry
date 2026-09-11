/**
 * JWT claims structure for OpenFoundry tokens, modelled after Palantir's
 * JWT claim set.
 *
 * All UUIDs are represented as strings in their canonical
 * `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` form.
 */
export interface OpenFoundryClaims {
  /** Subject — the authenticated user's UUID. */
  readonly sub: string;

  /** Session ID — UUID of the current session. */
  readonly sid: string;

  /** JWT ID — unique identifier for this specific token. */
  readonly jti: string;

  /** Organization — UUID of the organization the user belongs to. */
  readonly org: string;

  /** Service name — the service that issued or is targeted by the token. */
  readonly svc: string;

  /** Issuer — the entity that issued the token. */
  readonly iss: string;

  /** Audience — the intended recipient(s) of the token. */
  readonly aud: string | readonly string[];

  /** Expiration time — Unix timestamp (seconds). */
  readonly exp: number;

  /** Issued at — Unix timestamp (seconds). */
  readonly iat: number;

  /**
   * OAuth scopes — a space-separated string of granted scopes.
   * e.g. "api:ontologies-read api:datasets-read"
   */
  readonly scope: string;

  /**
   * Platform roles held by the subject - a space-separated string, e.g.
   * "ADMIN" or "EDITOR VIEWER". Optional: tokens minted before this claim
   * existed do not carry it, and a token without it simply conveys no roles.
   *
   * Minted, but with no consumer yet: the gateway asserts no identity
   * downstream (services/svc-gateway/src/proxy.ts). The permission-model work
   * that unifies the guarded routes is what will read this claim, and it is
   * the only trustworthy source of a caller's roles when it does.
   */
  readonly roles?: string;
}

/**
 * The subset of claims that callers must provide when creating a token.
 * Fields like `iat` are set automatically at creation time.
 */
export type TokenInput = Omit<OpenFoundryClaims, "iat">;

/**
 * Parse the space-separated role string into an array of individual roles.
 */
export function parseRoles(roles: string | undefined): string[] {
  if (!roles || roles.trim().length === 0) return [];
  return roles.trim().split(/\s+/);
}

/**
 * Parse the space-separated scope string into an array of individual scopes.
 */
export function parseScopes(scope: string): string[] {
  if (!scope || scope.trim().length === 0) return [];
  return scope.trim().split(/\s+/);
}

/**
 * Check whether a claims object includes a specific scope.
 */
export function hasScope(claims: OpenFoundryClaims, scope: string): boolean {
  return parseScopes(claims.scope).includes(scope);
}
