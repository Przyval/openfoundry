import { jwtVerify, type KeyLike, type JWTVerifyOptions } from "jose";
import type { OpenFoundryClaims } from "./claims.js";
import { isValidClaimsShape } from "./token-creator.js";

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

export class TokenValidationError extends Error {
  readonly code: TokenValidationErrorCode;

  constructor(code: TokenValidationErrorCode, message: string) {
    super(message);
    this.name = "TokenValidationError";
    this.code = code;
  }
}

export const TokenValidationErrorCode = {
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  EXPIRED: "EXPIRED",
  MALFORMED_CLAIMS: "MALFORMED_CLAIMS",
  INVALID_AUDIENCE: "INVALID_AUDIENCE",
  INVALID_ISSUER: "INVALID_ISSUER",
} as const;

export type TokenValidationErrorCode =
  (typeof TokenValidationErrorCode)[keyof typeof TokenValidationErrorCode];

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ValidateTokenOptions {
  /** Expected audience value(s). If provided, the `aud` claim is checked. */
  readonly audience?: string | readonly string[];

  /** Expected issuer. If provided, the `iss` claim is checked. */
  readonly issuer?: string;

  /**
   * Allowed clock skew in seconds for expiration checks (default: 60).
   */
  readonly clockToleranceSeconds?: number;

  /** The JWS algorithms to accept (default: ["ES256"]). */
  readonly algorithms?: readonly string[];
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

/**
 * Verify a JWT and decode its claims.
 *
 * @param token     - The compact-serialised JWT string.
 * @param publicKey - The public key or shared secret used for verification.
 * @param options   - Optional audience, issuer, and tolerance settings.
 * @returns The decoded and typed claims.
 * @throws {TokenValidationError} if the token is invalid.
 */
export async function validateToken(
  token: string,
  publicKey: KeyLike | Uint8Array,
  options: ValidateTokenOptions = {},
): Promise<OpenFoundryClaims> {
  const verifyOptions: JWTVerifyOptions = {
    algorithms: options.algorithms
      ? [...options.algorithms]
      : ["ES256"],
    clockTolerance: options.clockToleranceSeconds ?? 60,
  };

  if (options.audience) {
    verifyOptions.audience =
      typeof options.audience === "string"
        ? options.audience
        : [...options.audience];
  }

  if (options.issuer) {
    verifyOptions.issuer = options.issuer;
  }

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, publicKey, verifyOptions);
    payload = result.payload as Record<string, unknown>;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("expired") || message.includes("exp")) {
      throw new TokenValidationError(
        TokenValidationErrorCode.EXPIRED,
        `Token has expired: ${message}`,
      );
    }
    if (message.includes("audience") || message.includes("aud")) {
      throw new TokenValidationError(
        TokenValidationErrorCode.INVALID_AUDIENCE,
        `Invalid audience: ${message}`,
      );
    }
    if (message.includes("issuer") || message.includes("iss")) {
      throw new TokenValidationError(
        TokenValidationErrorCode.INVALID_ISSUER,
        `Invalid issuer: ${message}`,
      );
    }

    throw new TokenValidationError(
      TokenValidationErrorCode.INVALID_SIGNATURE,
      `Token verification failed: ${message}`,
    );
  }

  if (!isValidClaimsShape(payload)) {
    throw new TokenValidationError(
      TokenValidationErrorCode.MALFORMED_CLAIMS,
      "Token payload does not match the expected OpenFoundry claims structure",
    );
  }

  return payload as unknown as OpenFoundryClaims;
}
