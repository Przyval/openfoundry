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

/**
 * The user an access token was issued to, read from its claims: `sub` is the
 * username and `roles` the space-separated platform roles. The signature is
 * not checked here - the gateway does that on every request - this only
 * decides what the console shows.
 */
export function userFromAccessToken(accessToken: string): AuthUser {
  let claims: { sub?: unknown; roles?: unknown } = {};
  try {
    const payload = accessToken.split(".")[1] ?? "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
    );
    claims = JSON.parse(json);
  } catch {
    // Not a JWT we can read; show it as an anonymous session.
  }
  return {
    username: typeof claims.sub === "string" ? claims.sub : "unknown",
    token: accessToken,
    roles: typeof claims.roles === "string" ? claims.roles.split(" ").filter(Boolean) : [],
  };
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

  if (!storedToken || !storedUser) {
    // Half a session is no session, and the token key alone is enough for the
    // fetch interceptor to keep sending a dead bearer token.
    if (storedToken || storedUser) clearStoredSession();
    return null;
  }

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

/** What the authorization server sent back on the redirect to /login. */
export type OAuthCallback =
  | { code: string }
  | { error: string; errorDescription: string | null };

/**
 * Read the OAuth callback from the current URL and strip it, synchronously,
 * so it is handled exactly once. React StrictMode runs the callback effect
 * twice; if the URL were cleaned only after the async code swap, both runs
 * would swap the same single-use code and the second would fail.
 */
export function takeOAuthCallback(): OAuthCallback | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");
  if (!code && !error) return null;
  window.history.replaceState({}, "", window.location.pathname);
  if (error) return { error, errorDescription: params.get("error_description") };
  return { code: code as string };
}
