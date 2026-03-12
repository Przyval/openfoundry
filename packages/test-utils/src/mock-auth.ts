import { generateKeyPair, SignJWT } from "jose";
import type { OpenFoundryClaims } from "@openfoundry/auth-tokens";

/**
 * Generates an ES256 (ECDSA P-256) key pair for testing.
 *
 * @returns An object with `publicKey` and `privateKey`.
 */
export async function createTestKeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}> {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  return { publicKey, privateKey };
}

/**
 * Default claims used when creating test tokens.
 */
function defaultClaims(): OpenFoundryClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: "00000000-0000-4000-a000-000000000001",
    sid: "00000000-0000-4000-a000-000000000002",
    jti: "00000000-0000-4000-a000-000000000003",
    org: "00000000-0000-4000-a000-000000000010",
    svc: "test-service",
    iss: "openfoundry-test",
    aud: "openfoundry-test",
    exp: now + 3600,
    iat: now,
    scope: "api:ontologies-read api:datasets-read",
  };
}

/**
 * Creates a valid signed JWT for testing.
 *
 * @param claims   - Optional partial claims to override defaults.
 * @param keyPair  - Optional key pair; if omitted, a fresh pair is generated.
 * @returns The compact-serialised JWT string and the key pair used.
 */
export async function createTestToken(
  claims?: Partial<OpenFoundryClaims>,
  keyPair?: { publicKey: CryptoKey; privateKey: CryptoKey },
): Promise<{ token: string; publicKey: CryptoKey; privateKey: CryptoKey }> {
  const kp = keyPair ?? await createTestKeyPair();
  const merged = { ...defaultClaims(), ...claims };

  const token = await new SignJWT({
    sub: merged.sub,
    sid: merged.sid,
    jti: merged.jti,
    org: merged.org,
    svc: merged.svc,
    scope: merged.scope,
  })
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setIssuedAt(merged.iat)
    .setExpirationTime(merged.exp)
    .setIssuer(merged.iss)
    .setAudience(
      typeof merged.aud === "string" ? merged.aud : [...merged.aud],
    )
    .sign(kp.privateKey);

  return { token, publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/**
 * Creates an expired JWT for testing token validation error paths.
 *
 * @param keyPair - Optional key pair; if omitted, a fresh pair is generated.
 * @returns The expired JWT string and the key pair used.
 */
export async function createExpiredToken(
  keyPair?: { publicKey: CryptoKey; privateKey: CryptoKey },
): Promise<{ token: string; publicKey: CryptoKey; privateKey: CryptoKey }> {
  const pastTime = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
  return createTestToken(
    {
      iat: pastTime,
      exp: pastTime + 3600, // expired 1 hour ago
    },
    keyPair,
  );
}
