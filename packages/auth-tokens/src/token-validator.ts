import { importSPKI, jwtVerify, type KeyLike, type JWTVerifyOptions } from "jose";
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
// Key import
// ---------------------------------------------------------------------------

const SPKI_HEADER = "-----BEGIN PUBLIC KEY-----";

/**
 * Turn a configured public key into something `validateToken` can verify with.
 *
 * Tokens are signed with ES256, whose verification key must be a real key
 * object: handing jose the PEM's bytes as a `Uint8Array` makes it treat them
 * as an HMAC secret and reject every ES256 token. Callers that read a key out
 * of the environment must come through here.
 *
 * @param pem       - A PEM-encoded SubjectPublicKeyInfo block. Literal `\n`
 *                    escapes are accepted, since a PEM carried in an
 *                    environment variable usually arrives with them.
 * @param algorithm - The algorithm the key will verify (default: "ES256").
 * @throws {TokenValidationError} if the value is not a PEM public key.
 */
export async function importVerificationKey(
  pem: string,
  algorithm: string = "ES256",
): Promise<KeyLike> {
  const normalised = pem.replace(/\\n/g, "\n").trim();

  if (!normalised.startsWith(SPKI_HEADER)) {
    throw new TokenValidationError(
      TokenValidationErrorCode.INVALID_SIGNATURE,
      `Verification key must be a PEM block beginning "${SPKI_HEADER}"; ` +
        "got a value that is not one. An HMAC secret cannot verify an " +
        "ES256 token.",
    );
  }

  try {
    return await importSPKI(normalised, algorithm);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new TokenValidationError(
      TokenValidationErrorCode.INVALID_SIGNATURE,
      `Verification key could not be imported as ${algorithm}: ${message}`,
    );
  }
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
