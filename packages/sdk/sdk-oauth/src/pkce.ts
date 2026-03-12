/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0.
 *
 * Implements RFC 7636 using the S256 code challenge method.
 */

/**
 * Character set for generating code verifiers (RFC 7636 Section 4.1).
 * Uses unreserved characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 */
const UNRESERVED_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/**
 * Generates a cryptographically random code verifier string.
 *
 * The verifier is 128 characters long, composed of unreserved URI characters
 * as specified in RFC 7636 Section 4.1.
 *
 * @returns A 128-character random string suitable for use as a PKCE code verifier.
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(128);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) =>
    UNRESERVED_CHARS[byte % UNRESERVED_CHARS.length],
  ).join("");
}

/**
 * Generates a code challenge from a code verifier using the S256 method.
 *
 * Computes `BASE64URL(SHA256(verifier))` as specified in RFC 7636 Section 4.2.
 *
 * @param verifier - The code verifier string to hash.
 * @returns The base64url-encoded SHA-256 hash of the verifier.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

/**
 * Encodes an ArrayBuffer to a base64url string (no padding).
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
