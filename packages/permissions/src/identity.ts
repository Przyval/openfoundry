/**
 * The verified caller, as a downstream service sees it.
 *
 * The gateway verifies the bearer token and writes these headers; a service
 * trusts them because only the gateway can reach it. The gateway strips any
 * `x-user-*` header a client sends, so they are never a client input.
 */

import { hasPlatformAdminRole } from "./roles.js";

export interface Identity {
  /** The token subject - a username, not a RID. */
  readonly userId: string;
  readonly groups: readonly string[];
  /** The caller's Organization. */
  readonly organization: string | undefined;
  /** Markings the caller is a member of. */
  readonly markings: readonly string[];
  readonly platformAdmin: boolean;
}

export const IDENTITY_HEADERS = {
  userId: "x-user-id",
  groups: "x-user-groups",
  organization: "x-user-org",
  markings: "x-user-markings",
  platformAdmin: "x-user-platform-admin",
} as const;

function list(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function single(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v !== undefined && v !== "" ? v : undefined;
}

/** Read the identity the gateway asserted, or undefined for an anonymous request. */
export function identityFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): Identity | undefined {
  const userId = single(headers[IDENTITY_HEADERS.userId]);
  if (userId === undefined) return undefined;
  return {
    userId,
    groups: list(headers[IDENTITY_HEADERS.groups]),
    organization: single(headers[IDENTITY_HEADERS.organization]),
    markings: list(headers[IDENTITY_HEADERS.markings]),
    platformAdmin: single(headers[IDENTITY_HEADERS.platformAdmin]) === "true",
  };
}

/** The headers a gateway sends for a verified identity. Inverse of `identityFromHeaders`. */
export function identityToHeaders(identity: Identity): Record<string, string> {
  const headers: Record<string, string> = {
    [IDENTITY_HEADERS.userId]: identity.userId,
  };
  if (identity.groups.length > 0) headers[IDENTITY_HEADERS.groups] = identity.groups.join(",");
  if (identity.organization) headers[IDENTITY_HEADERS.organization] = identity.organization;
  if (identity.markings.length > 0) headers[IDENTITY_HEADERS.markings] = identity.markings.join(",");
  if (identity.platformAdmin) headers[IDENTITY_HEADERS.platformAdmin] = "true";
  return headers;
}

function claimList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v !== "");
  return typeof value === "string" ? list(value) : [];
}

/**
 * The identity a verified token stands for. `roles`, `groups` and `markings`
 * are space-separated strings (or arrays); `org` is the Organization.
 * Returns undefined when the token names no subject.
 */
export function identityFromClaims(claims: Record<string, unknown>): Identity | undefined {
  const sub = claims.sub;
  if (typeof sub !== "string" || sub === "") return undefined;
  const org = claims.org;
  return {
    userId: sub,
    groups: claimList(claims.groups),
    organization: typeof org === "string" && org !== "" ? org : undefined,
    markings: claimList(claims.markings),
    platformAdmin: hasPlatformAdminRole(claimList(claims.roles)),
  };
}
