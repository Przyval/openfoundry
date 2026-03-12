import { SignJWT, type KeyLike } from "jose";
import type { TokenInput } from "./claims.js";

/**
 * Create a signed JWT from the given claims and signing key.
 *
 * Uses the ES256 algorithm (ECDSA with P-256 and SHA-256) by default,
 * matching the recommended signing algorithm for platform tokens.
 *
 * @param input      - The claims to embed in the token (iat is set automatically).
 * @param signingKey - An ECDSA private key or symmetric secret.
 * @param algorithm  - The JWS algorithm to use (default: "ES256").
 * @returns The compact-serialised JWT string.
 */
export async function createToken(
  input: TokenInput,
  signingKey: KeyLike | Uint8Array,
  algorithm: string = "ES256",
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const jwt = new SignJWT({
    sub: input.sub,
    sid: input.sid,
    jti: input.jti,
    org: input.org,
    svc: input.svc,
    scope: input.scope,
  })
    .setProtectedHeader({ alg: algorithm, typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(input.exp)
    .setIssuer(input.iss)
    .setAudience(
      typeof input.aud === "string" ? input.aud : [...input.aud],
    );

  return jwt.sign(signingKey);
}

/**
 * Helper to build a complete set of claims with a calculated expiry.
 *
 * @param partial - Partial claims; `exp` and `iat` will be calculated.
 * @param ttlSeconds - Time-to-live in seconds (default: 3600 = 1 hour).
 */
export function buildTokenInput(
  partial: Omit<TokenInput, "exp">,
  ttlSeconds: number = 3600,
): TokenInput {
  const now = Math.floor(Date.now() / 1000);
  return {
    ...partial,
    exp: now + ttlSeconds,
  };
}

/**
 * Type guard to check whether a decoded payload matches the OpenFoundryClaims shape.
 */
export function isValidClaimsShape(
  payload: Record<string, unknown>,
): boolean {
  return (
    typeof payload.sub === "string" &&
    typeof payload.sid === "string" &&
    typeof payload.jti === "string" &&
    typeof payload.org === "string" &&
    typeof payload.svc === "string" &&
    typeof payload.iss === "string" &&
    (typeof payload.aud === "string" || Array.isArray(payload.aud)) &&
    typeof payload.exp === "number" &&
    typeof payload.iat === "number" &&
    typeof payload.scope === "string"
  );
}
