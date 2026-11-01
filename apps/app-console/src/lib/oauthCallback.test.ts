import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeOAuthCallback } from "./session";

/**
 * React StrictMode runs the console's OAuth callback effect twice. The code is
 * single-use, so only the first run may see it: a second swap fails and used
 * to leave a "Sign-in could not be completed" error behind a successful login.
 */
let url: URL;

beforeEach(() => {
  url = new URL("http://console.test/login");
  vi.stubGlobal("window", {
    get location() {
      return { search: url.search, pathname: url.pathname };
    },
    history: {
      replaceState: (_s: unknown, _t: string, next: string) => {
        url = new URL(next, url);
      },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("takeOAuthCallback", () => {
  it("hands out an authorization code once, then nothing", () => {
    url = new URL("http://console.test/login?code=abc&state=xyz");
    expect(takeOAuthCallback()).toEqual({ code: "abc" });
    expect(url.search).toBe("");
    expect(takeOAuthCallback()).toBeNull();
  });

  it("hands out an error once, with its description", () => {
    url = new URL(
      "http://console.test/login?error=server_error&error_description=boom",
    );
    expect(takeOAuthCallback()).toEqual({
      error: "server_error",
      errorDescription: "boom",
    });
    expect(takeOAuthCallback()).toBeNull();
  });

  it("leaves a URL with no callback untouched", () => {
    url = new URL("http://console.test/login?next=%2Fdatasets");
    expect(takeOAuthCallback()).toBeNull();
    expect(url.search).toBe("?next=%2Fdatasets");
  });
});
