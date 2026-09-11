import type { TokenResponse } from "@openfoundry/sdk-oauth";
import { LOCAL_STORAGE_TOKEN_KEY, LOCAL_STORAGE_USER_KEY } from "./authFetch";

/**
 * The persisted session: the token response plus the absolute expiry it is
 * only meaningful with. `expiresIn` is relative to issue time, so a session
 * restored after a reload needs the wall-clock deadline to know it is stale.
 */
export interface StoredToken extends TokenResponse {
  expiresAt?: number;
}

/** The logged-in user, as the console persists and displays them. */
export interface AuthUser {
  username: string;
  token: string;
  roles: string[];
}

/** A session worth adopting, as returned by `restoreSession`. */
export interface RestoredSession {
  token: TokenResponse;
  expiresAt?: number;
  user: AuthUser;
}

/** Drop the persisted session. The one place that knows what "logged out" is. */
export function clearStoredSession(): void {
  localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
  localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
}

/**
 * A session past its deadline with no refresh token cannot be recovered.
 * Adopting one would leave the console showing the operator as logged in
 * while every request 401s, with no way back to the login screen.
 */
function isRestorable(stored: StoredToken, now: number): boolean {
  if (stored.expiresAt === undefined) return true;
  if (stored.expiresAt > now) return true;
  return Boolean(stored.refreshToken);
}

/**
 * The session to adopt on mount, or null when there is none to adopt - in
 * which case the stored keys are cleared, so an unusable session does not
 * survive the reload that found it.
 */
export function restoreSession(now: number = Date.now()): RestoredSession | null {
  let storedToken: string | null;
  let storedUser: string | null;
  try {
    storedToken = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
    storedUser = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
  } catch {
    return null;
  }

  if (!storedToken || !storedUser) return null;

  try {
    const { expiresAt, ...token }: StoredToken = JSON.parse(storedToken);
    const user: AuthUser = JSON.parse(storedUser);
    if (!isRestorable({ ...token, expiresAt }, now)) {
      clearStoredSession();
      return null;
    }
    return { token, expiresAt, user };
  } catch {
    clearStoredSession();
    return null;
  }
}
