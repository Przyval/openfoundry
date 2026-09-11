import { API_BASE_URL } from "../config";

/**
 * Browser-side credential plumbing for the console.
 *
 * The gateway rejects unauthenticated requests as soon as AUTH_PUBLIC_KEY is
 * configured (services/svc-gateway/src/middleware/auth.ts). The console logs
 * in and stores a token, but its ~80 call sites all reach for the global
 * `fetch` directly, so the token never reached the wire. Rather than thread an
 * authenticated client through every page, this installs one interceptor over
 * `window.fetch` that attaches the stored token to OpenFoundry API requests -
 * new call sites are covered the day they are written.
 */

/** Where AuthContext keeps the OAuth token response. */
export const LOCAL_STORAGE_TOKEN_KEY = "openfoundry_token";

/** Where AuthContext keeps the logged-in user (including their raw token). */
export const LOCAL_STORAGE_USER_KEY = "openfoundry_user";

/**
 * Endpoints that mint tokens. They are exempt from gateway auth by design, and
 * sending a stale token to them only muddies the request.
 */
const CREDENTIAL_ENDPOINTS = [
  "/multipass/api/oauth2/",
  "/multipass/api/auth/login",
];

/** Read the stored access token, or null when nobody is logged in. */
export function readStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { accessToken?: string };
      if (parsed.accessToken) return parsed.accessToken;
    }
    const user = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
    if (user) {
      const parsed = JSON.parse(user) as { token?: string };
      if (parsed.token) return parsed.token;
    }
  } catch {
    // Corrupted or unavailable storage - treat as logged out.
  }
  return null;
}

/** Root-relative prefixes the Vite dev proxy forwards to the gateway. */
const PROXIED_PREFIXES = ["/api/", "/multipass/"];

/**
 * Whether `url` addresses the gateway.
 *
 * An absolute URL under a non-empty API_BASE_URL is the gateway whatever its
 * path, so it gets the token. An empty API_BASE_URL (a same-origin build) is
 * a prefix of every URL, so it never identifies one. A relative URL is served by the console's own origin, and
 * only the prefixes the dev proxy forwards reach the gateway - the token must
 * not ride along on anything else.
 */
function isApiRequest(url: string): boolean {
  let path: string;
  if (API_BASE_URL !== "" && url.startsWith(API_BASE_URL)) {
    path = url.slice(API_BASE_URL.length) || "/";
  } else if (url.startsWith("/")) {
    if (!PROXIED_PREFIXES.some((prefix) => url.startsWith(prefix))) return false;
    path = url;
  } else {
    return false;
  }
  return !CREDENTIAL_ENDPOINTS.some((prefix) => path.startsWith(prefix));
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * Marks the wrapper on the function itself rather than in a module-level flag,
 * so "already installed?" is a question about the live `globalThis.fetch` and
 * not about which copy of this module is asking.
 */
const INSTALLED = Symbol.for("openfoundry.authFetch");

type TaggedFetch = typeof globalThis.fetch & { [INSTALLED]?: true };

/**
 * Wrap the global `fetch` so OpenFoundry API requests carry the stored bearer
 * token. Safe to call more than once; only the first call takes effect.
 */
export function installAuthFetch(): void {
  if ((globalThis.fetch as TaggedFetch)[INSTALLED]) return;

  const originalFetch = globalThis.fetch.bind(globalThis);

  const wrapped: TaggedFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if (!isApiRequest(requestUrl(input))) {
      return originalFetch(input, init);
    }

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has("Authorization")) {
      const token = readStoredToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    return originalFetch(input, { ...init, headers });
  };

  wrapped[INSTALLED] = true;
  globalThis.fetch = wrapped;
}
