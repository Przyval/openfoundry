/**
 * PKCE (Proof Key for Code Exchange) utilities.
 *
 * Implements RFC 7636 code challenge generation and verification
 * using crypto.subtle for SHA-256 hashing.
 */

/**
 * Generate a code challenge from a code verifier.
 *
 * @param verifier - The PKCE code verifier string.
 * @param method   - The challenge method: "S256" (recommended) or "plain".
 * @returns The computed code challenge string.
 */
export async function generateCodeChallenge(
  verifier: string,
  method: "S256" | "plain",
): Promise<string> {
  if (method === "plain") {
    return verifier;
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Verify that a code verifier matches a previously stored code challenge.
 *
 * @param verifier  - The PKCE code verifier provided by the client.
 * @param challenge - The code challenge that was stored during authorization.
 * @param method    - The challenge method used: "S256" or "plain".
 * @returns Whether the verifier matches the challenge.
 */
export async function verifyCodeChallenge(
  verifier: string,
  challenge: string,
  method: "S256" | "plain",
): Promise<boolean> {
  const computed = await generateCodeChallenge(verifier, method);
  return computed === challenge;
}

/**
 * Base64url-encode a Uint8Array (no padding), per RFC 4648 Section 5.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
