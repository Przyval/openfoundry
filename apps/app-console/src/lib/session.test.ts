import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restoreSession } from "./session";
import { LOCAL_STORAGE_TOKEN_KEY, LOCAL_STORAGE_USER_KEY } from "./authFetch";

/**
 * Once the gateway enforces, adopting a session that cannot be refreshed
 * leaves the navbar showing the operator as logged in while every request
 * 401s. The dev password login mints no refresh token, so a reload an hour
 * later lands in exactly that case.
 */
const store = new Map<string, string>();

const NOW = 1_700_000_000_000;
const USER = { username: "admin", token: "tok-1", roles: ["ADMIN"] };

function persist(token: Record<string, unknown>, user: unknown = USER) {
  store.set(LOCAL_STORAGE_TOKEN_KEY, JSON.stringify(token));
  store.set(LOCAL_STORAGE_USER_KEY, JSON.stringify(user));
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("restoreSession", () => {
  it("adopts a session still inside its deadline and leaves storage intact", () => {
    persist({ accessToken: "tok-1", expiresIn: 3600, expiresAt: NOW + 60_000 });

    const restored = restoreSession(NOW);

    expect(restored?.user).toEqual(USER);
    expect(restored?.expiresAt).toBe(NOW + 60_000);
    expect(restored?.token.accessToken).toBe("tok-1");
    expect(store.has(LOCAL_STORAGE_TOKEN_KEY)).toBe(true);
    expect(store.has(LOCAL_STORAGE_USER_KEY)).toBe(true);
  });

  it("refuses an expired session with no refresh token and clears storage", () => {
    persist({ accessToken: "tok-1", expiresIn: 3600, expiresAt: NOW - 1 });

    expect(restoreSession(NOW)).toBeNull();
    expect(store.has(LOCAL_STORAGE_TOKEN_KEY)).toBe(false);
    expect(store.has(LOCAL_STORAGE_USER_KEY)).toBe(false);
  });

  it("adopts an expired session that carries a refresh token", () => {
    persist({
      accessToken: "tok-1",
      refreshToken: "refresh-1",
      expiresIn: 3600,
      expiresAt: NOW - 1,
    });

    const restored = restoreSession(NOW);

    expect(restored?.token.refreshToken).toBe("refresh-1");
    expect(store.has(LOCAL_STORAGE_TOKEN_KEY)).toBe(true);
  });

  it("adopts a session persisted before the deadline was recorded", () => {
    persist({ accessToken: "tok-1", expiresIn: 3600 });

    expect(restoreSession(NOW)?.token.accessToken).toBe("tok-1");
  });

  it("returns null when nothing is stored", () => {
    expect(restoreSession(NOW)).toBeNull();
  });

  it("clears corrupt storage instead of throwing", () => {
    store.set(LOCAL_STORAGE_TOKEN_KEY, "{not json");
    store.set(LOCAL_STORAGE_USER_KEY, JSON.stringify(USER));

    expect(restoreSession(NOW)).toBeNull();
    expect(store.has(LOCAL_STORAGE_TOKEN_KEY)).toBe(false);
    expect(store.has(LOCAL_STORAGE_USER_KEY)).toBe(false);
  });

  it("survives storage that throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
    });

    expect(restoreSession(NOW)).toBeNull();
  });
});
