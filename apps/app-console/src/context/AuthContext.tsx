import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  TokenManager,
  createAuthorizationUrl,
  exchangeCodeForToken,
} from "@openfoundry/sdk-oauth";
import type { TokenResponse } from "@openfoundry/sdk-oauth";
import { API_BASE_URL } from "../config";
import {
  LOCAL_STORAGE_TOKEN_KEY,
  LOCAL_STORAGE_USER_KEY,
  setAuthTokenSource,
} from "../lib/authFetch";
import {
  clearStoredSession,
  restoreSession,
  type AuthUser,
  type StoredToken,
} from "../lib/session";

export type { AuthUser };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthContextValue {
  /** The currently logged-in user, or null. */
  currentUser: AuthUser | null;
  /** Whether the user is authenticated. */
  isAuthenticated: boolean;
  /** Whether the initial auth check is still in progress. */
  loading: boolean;
  /** Log in with username/password (local dev mode). */
  login: (username: string, password: string) => Promise<void>;
  /** Start the OAuth PKCE login flow (production mode). */
  loginWithOAuth: () => Promise<void>;
  /** Log out and clear stored tokens. */
  logout: () => void;
  /** The underlying TokenManager instance. */
  tokenManager: TokenManager;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// LOCAL_STORAGE_TOKEN_KEY / LOCAL_STORAGE_USER_KEY live in lib/authFetch, which
// is where they are read back from to authenticate outgoing requests.
const PKCE_VERIFIER_KEY = "openfoundry_pkce_verifier";



const oauthOptions = {
  // `||`, not `??`: a build that defines the variable empty has no client id,
  // not an intentionally blank one.
  clientId:
    (import.meta.env.VITE_OAUTH_CLIENT_ID as string | undefined) ||
    "openfoundry-console",
  baseUrl: API_BASE_URL,
  redirectUri: `${window.location.origin}/login`,
  scopes: ["api:read", "api:write"],
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Hook to access the auth context. Must be used inside an <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const tokenManager = useMemo(
    () =>
      new TokenManager({
        ...oauthOptions,
        onTokenChange: (token: TokenResponse, expiresAt: number) => {
          const stored: StoredToken = { ...token, expiresAt };
          localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, JSON.stringify(stored));
        },
      }),
    [],
  );

  // ---- Let the fetch interceptor use the managed (refreshing) token ----
  useEffect(() => {
    setAuthTokenSource(tokenManager);
    return () => setAuthTokenSource(null);
  }, [tokenManager]);

  // ---- Restore session from localStorage on mount ----
  useEffect(() => {
    const restored = restoreSession();
    if (restored) {
      tokenManager.setToken(restored.token, restored.expiresAt);
      setCurrentUser(restored.user);
    }
    setLoading(false);
  }, [tokenManager]);

  // ---- Login with username/password (local dev mode) ----
  const login = useCallback(
    async (username: string, password: string) => {
      const res = await fetch(`${API_BASE_URL}/multipass/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Login failed (${res.status})`);
      }

      const data = (await res.json()) as {
        accessToken: string;
        expiresIn: number;
        roles?: string[];
      };

      const tokenResponse: TokenResponse = {
        accessToken: data.accessToken,
        tokenType: "Bearer",
        expiresIn: data.expiresIn,
        scope: "api:read api:write",
      };

      tokenManager.setToken(tokenResponse);

      const user: AuthUser = {
        username,
        token: data.accessToken,
        roles: data.roles ?? [],
      };

      setCurrentUser(user);
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(user));
    },
    [tokenManager],
  );

  // ---- Start OAuth PKCE flow ----
  const loginWithOAuth = useCallback(async () => {
    const { url, codeVerifier } = await createAuthorizationUrl(oauthOptions);
    if (codeVerifier) {
      sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
    }
    window.location.href = url;
  }, []);

  // ---- Handle OAuth callback (code in URL) ----
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;

    const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY) ?? undefined;
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);

    (async () => {
      try {
        const tokenResponse = await exchangeCodeForToken(
          oauthOptions,
          code,
          codeVerifier,
        );
        tokenManager.setToken(tokenResponse);

        const user: AuthUser = {
          username: "oauth-user",
          token: tokenResponse.accessToken,
          roles: [],
        };

        setCurrentUser(user);
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(user));

        // Clean the URL
        window.history.replaceState({}, "", window.location.pathname);
      } catch (err) {
        console.error("OAuth callback failed:", err);
      }
    })();
  }, [tokenManager]);

  // ---- Logout ----
  const logout = useCallback(() => {
    tokenManager.clear();
    setCurrentUser(null);
    clearStoredSession();
  }, [tokenManager]);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      isAuthenticated: currentUser !== null,
      loading,
      login,
      loginWithOAuth,
      logout,
      tokenManager,
    }),
    [currentUser, loading, login, loginWithOAuth, logout, tokenManager],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
