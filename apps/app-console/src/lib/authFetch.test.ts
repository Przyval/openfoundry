import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The console logs in and stores a token, but every page reaches for the
 * global `fetch` directly, so the token never reached the gateway. Once the
 * gateway enforces auth that is a 401 on every screen. These pin down the
 * interceptor that closes the gap.
 */

/**
 * Mutable so a test can pin the same-origin build (VITE_API_URL set empty),
 * where API_BASE_URL is "" and is therefore a prefix of every URL.
 */
const config = vi.hoisted(() => ({ API_BASE_URL: "http://localhost:8080" }));

vi.mock("../config", () => config);

const API_BASE_URL = config.API_BASE_URL;

const store = new Map<string, string>();

/**
 * Stubbed per test, not once at module scope: afterEach's unstubAllGlobals
 * would otherwise strip localStorage away and leave every later test reading
 * from a `node` environment that has none.
 */
function stubStorage() {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
}

let inner: ReturnType<typeof vi.fn>;

async function loadFresh() {
  vi.resetModules();
  return import("./authFetch");
}

/** Headers the interceptor handed to the underlying fetch. */
function sentHeaders(): Headers {
  const [, init] = inner.mock.calls[0] as [unknown, RequestInit | undefined];
  return new Headers(init?.headers);
}

beforeEach(() => {
  store.clear();
  stubStorage();
  inner = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", inner);
});

afterEach(() => {
  vi.unstubAllGlobals();
  config.API_BASE_URL = API_BASE_URL;
});

describe("installAuthFetch", () => {
  it("attaches the stored token to an API request", async () => {
    store.set("openfoundry_token", JSON.stringify({ accessToken: "tok-123" }));
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();

    await fetch(`${API_BASE_URL}/api/v2/ontologies`);
    expect(sentHeaders().get("Authorization")).toBe("Bearer tok-123");
  });

  it("attaches it to any gateway path, not only /api", async () => {
    // OntologyExplorer passes "" while nothing is selected, which lands on the
    // gateway root. That request still belongs to the gateway.
    store.set("openfoundry_token", JSON.stringify({ accessToken: "tok-123" }));
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();

    await fetch(API_BASE_URL);
    expect(sentHeaders().get("Authorization")).toBe("Bearer tok-123");
  });

  it("falls back to the token stored on the user record", async () => {
    store.set("openfoundry_user", JSON.stringify({ token: "tok-user" }));
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();

    await fetch(`${API_BASE_URL}/api/v2/ontologies`);
    expect(sentHeaders().get("Authorization")).toBe("Bearer tok-user");
  });

  it("sends nothing when nobody is logged in", async () => {
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();

    await fetch(`${API_BASE_URL}/api/v2/ontologies`);
    expect(sentHeaders().has("Authorization")).toBe(false);
  });

  it("never overwrites an Authorization the caller set", async () => {
    store.set("openfoundry_token", JSON.stringify({ accessToken: "tok-123" }));
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();

    await fetch(`${API_BASE_URL}/api/v2/ontologies`, {
      headers: { Authorization: "Bearer explicit" },
    });
    expect(sentHeaders().get("Authorization")).toBe("Bearer explicit");
  });

  it("does not send a stale token to the endpoints that mint tokens", async () => {
    store.set("openfoundry_token", JSON.stringify({ accessToken: "tok-123" }));
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();

    await fetch(`${API_BASE_URL}/multipass/api/auth/login`, { method: "POST" });
    expect(sentHeaders().has("Authorization")).toBe(false);
  });

  it("leaves third-party requests alone", async () => {
    store.set("openfoundry_token", JSON.stringify({ accessToken: "tok-123" }));
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();

    await fetch("https://example.com/api/v2/ontologies");
    expect(sentHeaders().has("Authorization")).toBe(false);
  });

  it("leaves the console's own assets alone", async () => {
    store.set("openfoundry_token", JSON.stringify({ accessToken: "tok-123" }));
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();

    await fetch("/assets/index.js");
    expect(sentHeaders().has("Authorization")).toBe(false);
  });

  it("still covers the relative paths the dev proxy forwards", async () => {
    store.set("openfoundry_token", JSON.stringify({ accessToken: "tok-123" }));
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();

    await fetch("/api/v2/ontologies");
    expect(sentHeaders().get("Authorization")).toBe("Bearer tok-123");
  });

  it("survives storage that throws", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();

    await expect(fetch(`${API_BASE_URL}/api/v2/ontologies`)).resolves.toBeDefined();
    expect(sentHeaders().has("Authorization")).toBe(false);
  });

  it("leaves third-party requests alone on a same-origin build", async () => {
    config.API_BASE_URL = "";
    store.set("openfoundry_token", JSON.stringify({ accessToken: "tok-123" }));
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();

    await fetch("https://example.com/api/v2/ontologies");
    expect(sentHeaders().has("Authorization")).toBe(false);
  });

  it("still covers the proxied paths on a same-origin build", async () => {
    config.API_BASE_URL = "";
    store.set("openfoundry_token", JSON.stringify({ accessToken: "tok-123" }));
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();

    await fetch("/api/v2/ontologies");
    expect(sentHeaders().get("Authorization")).toBe("Bearer tok-123");
  });

  it("leaves a host that merely starts with the gateway's alone", async () => {
    store.set("openfoundry_token", JSON.stringify({ accessToken: "tok-123" }));
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();

    await fetch(`${API_BASE_URL}.attacker.test/api/v2/ontologies`);
    expect(sentHeaders().has("Authorization")).toBe(false);
  });

  it("prefers the managed token, which refreshes before it expires", async () => {
    store.set("openfoundry_token", JSON.stringify({ accessToken: "tok-stale" }));
    const { installAuthFetch, setAuthTokenSource } = await loadFresh();
    installAuthFetch();
    setAuthTokenSource({
      hasToken: () => true,
      getToken: async () => "tok-refreshed",
    });

    await fetch(`${API_BASE_URL}/api/v2/ontologies`);
    expect(sentHeaders().get("Authorization")).toBe("Bearer tok-refreshed");
  });

  it("falls back to storage when the managed token cannot be refreshed", async () => {
    store.set("openfoundry_token", JSON.stringify({ accessToken: "tok-123" }));
    const { installAuthFetch, setAuthTokenSource } = await loadFresh();
    installAuthFetch();
    setAuthTokenSource({
      hasToken: () => true,
      getToken: async () => {
        throw new Error("no refresh token");
      },
    });

    await fetch(`${API_BASE_URL}/api/v2/ontologies`);
    expect(sentHeaders().get("Authorization")).toBe("Bearer tok-123");
  });

  it("installs only once", async () => {
    const { installAuthFetch } = await loadFresh();
    installAuthFetch();
    const afterFirst = globalThis.fetch;
    installAuthFetch();
    expect(globalThis.fetch).toBe(afterFirst);
  });
});
