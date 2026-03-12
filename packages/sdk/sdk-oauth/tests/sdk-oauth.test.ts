import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  generateCodeVerifier,
  generateCodeChallenge,
  TokenManager,
} from "../src/index.js";
import type { OAuthClientOptions, TokenResponse } from "../src/index.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: OAuthClientOptions = {
  clientId: "my-client-id",
  baseUrl: "https://myorg.openfoundry.com",
  redirectUri: "http://localhost:3000/callback",
  scopes: ["api:ontologies-read", "api:datasets-read"],
};

function createMockTokenResponse(overrides?: Partial<TokenResponse>): TokenResponse {
  return {
    accessToken: "access-token-123",
    refreshToken: "refresh-token-456",
    tokenType: "Bearer",
    expiresIn: 3600,
    scope: "api:ontologies-read api:datasets-read",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

describe("PKCE", () => {
  it("should generate a code verifier of 128 characters", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toHaveLength(128);
    // All characters should be unreserved URI characters
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("should generate unique verifiers on each call", () => {
    const v1 = generateCodeVerifier();
    const v2 = generateCodeVerifier();
    expect(v1).not.toBe(v2);
  });

  it("should generate a valid S256 code challenge from a verifier", async () => {
    const verifier = "test-verifier-string-for-challenge-generation";
    const challenge = await generateCodeChallenge(verifier);

    // Should be base64url encoded (no +, /, or = padding)
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(challenge.length).toBeGreaterThan(0);
  });

  it("should produce deterministic challenges for the same verifier", async () => {
    const verifier = "deterministic-test-verifier";
    const c1 = await generateCodeChallenge(verifier);
    const c2 = await generateCodeChallenge(verifier);
    expect(c1).toBe(c2);
  });

  it("should produce different challenges for different verifiers", async () => {
    const c1 = await generateCodeChallenge("verifier-alpha");
    const c2 = await generateCodeChallenge("verifier-beta");
    expect(c1).not.toBe(c2);
  });

  it("should generate verifiers within valid PKCE length range (43-128)", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });
});

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

describe("createAuthorizationUrl", () => {
  it("should create an authorization URL with PKCE by default", async () => {
    const result = await createAuthorizationUrl(DEFAULT_OPTIONS);

    expect(result.url).toContain("https://myorg.openfoundry.com/multipass/api/oauth2/authorize");
    expect(result.url).toContain("response_type=code");
    expect(result.url).toContain("client_id=my-client-id");
    expect(result.url).toContain("redirect_uri=");
    expect(result.url).toContain("code_challenge=");
    expect(result.url).toContain("code_challenge_method=S256");
    expect(result.codeVerifier).toBeDefined();
    expect(result.codeVerifier!.length).toBe(128);
  });

  it("should include state parameter when provided", async () => {
    const result = await createAuthorizationUrl(DEFAULT_OPTIONS, "my-csrf-state");
    expect(result.url).toContain("state=my-csrf-state");
  });

  it("should omit PKCE when usePkce is false", async () => {
    const result = await createAuthorizationUrl(
      { ...DEFAULT_OPTIONS, usePkce: false },
    );

    expect(result.url).not.toContain("code_challenge");
    expect(result.url).not.toContain("code_challenge_method");
    expect(result.codeVerifier).toBeUndefined();
  });

  it("should include scopes as space-separated string", async () => {
    const result = await createAuthorizationUrl(DEFAULT_OPTIONS);
    // URL-encoded space is + or %20
    expect(result.url).toMatch(/scope=api%3Aontologies-read[+%20]api%3Adatasets-read/);
  });

  it("should include redirect_uri in the URL", async () => {
    const result = await createAuthorizationUrl(DEFAULT_OPTIONS);
    expect(result.url).toContain(encodeURIComponent("http://localhost:3000/callback"));
  });
});

// ---------------------------------------------------------------------------
// Token exchange (mocked)
// ---------------------------------------------------------------------------

describe("exchangeCodeForToken", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should exchange an authorization code for a token", async () => {
    const mockResponse = {
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "api:ontologies-read",
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await exchangeCodeForToken(DEFAULT_OPTIONS, "auth-code-xyz");

    expect(result.accessToken).toBe("new-access-token");
    expect(result.refreshToken).toBe("new-refresh-token");
    expect(result.tokenType).toBe("Bearer");
    expect(result.expiresIn).toBe(3600);
    expect(result.scope).toBe("api:ontologies-read");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/multipass/api/oauth2/token");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("should throw on non-OK response during token exchange", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Bad Request", { status: 400 }),
    );

    await expect(
      exchangeCodeForToken(DEFAULT_OPTIONS, "bad-code"),
    ).rejects.toThrow(/Token exchange failed.*400/);
  });

  it("should include code_verifier when provided", async () => {
    const mockResponse = {
      access_token: "tok",
      refresh_token: "ref",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "",
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await exchangeCodeForToken(DEFAULT_OPTIONS, "auth-code", "my-code-verifier");

    const [_url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.body).toContain("code_verifier=my-code-verifier");
  });
});

// ---------------------------------------------------------------------------
// Token Manager
// ---------------------------------------------------------------------------

describe("TokenManager", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should throw when getToken is called without setting a token first", async () => {
    const manager = new TokenManager(DEFAULT_OPTIONS);
    await expect(manager.getToken()).rejects.toThrow(/no token/i);
  });

  it("should return the access token after setToken", async () => {
    const manager = new TokenManager(DEFAULT_OPTIONS);
    manager.setToken(createMockTokenResponse());

    const token = await manager.getToken();
    expect(token).toBe("access-token-123");
  });

  it("should invoke onTokenChange when setToken is called", () => {
    const onChange = vi.fn();
    const manager = new TokenManager({ ...DEFAULT_OPTIONS, onTokenChange: onChange });
    const tokenResponse = createMockTokenResponse();

    manager.setToken(tokenResponse);

    expect(onChange).toHaveBeenCalledWith(tokenResponse);
  });

  it("should clear the token", async () => {
    const manager = new TokenManager(DEFAULT_OPTIONS);
    manager.setToken(createMockTokenResponse());
    expect(manager.hasToken()).toBe(true);

    manager.clear();
    expect(manager.hasToken()).toBe(false);
    await expect(manager.getToken()).rejects.toThrow(/no token/i);
  });

  it("should auto-refresh when token is expiring soon", async () => {
    const refreshedResponse = {
      access_token: "refreshed-access-token",
      refresh_token: "refreshed-refresh-token",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "api:ontologies-read",
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(refreshedResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const manager = new TokenManager(DEFAULT_OPTIONS);

    // Set a token that is already expired (expiresIn: 0)
    manager.setToken(createMockTokenResponse({ expiresIn: 0 }));

    const token = await manager.getToken();
    expect(token).toBe("refreshed-access-token");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("should report hasToken as false initially", () => {
    const manager = new TokenManager(DEFAULT_OPTIONS);
    expect(manager.hasToken()).toBe(false);
  });

  it("should report hasToken as true after setToken", () => {
    const manager = new TokenManager(DEFAULT_OPTIONS);
    manager.setToken(createMockTokenResponse());
    expect(manager.hasToken()).toBe(true);
  });

  it("should deduplicate concurrent refresh requests", async () => {
    const refreshedResponse = {
      access_token: "refreshed-token",
      refresh_token: "refreshed-refresh",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "",
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(refreshedResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const manager = new TokenManager(DEFAULT_OPTIONS);
    manager.setToken(createMockTokenResponse({ expiresIn: 0 }));

    // Fire multiple concurrent getToken calls
    const [t1, t2, t3] = await Promise.all([
      manager.getToken(),
      manager.getToken(),
      manager.getToken(),
    ]);

    // All should get the same refreshed token
    expect(t1).toBe("refreshed-token");
    expect(t2).toBe("refreshed-token");
    expect(t3).toBe("refreshed-token");

    // Fetch should only have been called once (dedup)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
