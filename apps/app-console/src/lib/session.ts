import type { TokenResponse } from "@openfoundry/sdk-oauth";

/**
 * The persisted session: the token response plus the absolute expiry it is
 * only meaningful with. `expiresIn` is relative to issue time, so a session
 * restored after a reload needs the wall-clock deadline to know it is stale.
 */
export interface StoredToken extends TokenResponse {
  expiresAt?: number;
}

/**
 * Whether a persisted session is worth restoring. A session past its deadline
 * with no refresh token cannot be recovered, and restoring it would leave the
 * console showing the operator as logged in while every request 401s.
 */
export function isRestorable(
  stored: Pick<StoredToken, "expiresAt" | "refreshToken">,
  now: number = Date.now(),
): boolean {
  if (stored.expiresAt === undefined) return true;
  if (stored.expiresAt > now) return true;
  return Boolean(stored.refreshToken);
}
