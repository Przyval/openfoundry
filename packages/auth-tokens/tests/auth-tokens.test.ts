import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPair } from "jose";
import type { KeyLike } from "jose";
import {
  type OpenFoundryClaims,
  type TokenInput,
  parseScopes,
  hasScope,
  createToken,
  buildTokenInput,
  isValidClaimsShape,
  validateToken,
  TokenValidationError,
  TokenValidationErrorCode,
  BearerToken,
  Scope,
  expandScopes,
  buildScopeString,
  satisfiesScope,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Key pair for all JWT tests
// ---------------------------------------------------------------------------

let privateKey: KeyLike;
let publicKey: KeyLike;

beforeAll(async () => {
  const keys = await generateKeyPair("ES256");
  privateKey = keys.privateKey;
  publicKey = keys.publicKey;
});

// ---------------------------------------------------------------------------
// Claims helpers
// ---------------------------------------------------------------------------

describe("parseScopes", () => {
  it("splits a scope string into an array", () => {
    expect(parseScopes("api:ontologies-read api:datasets-write")).toEqual([
      "api:ontologies-read",
      "api:datasets-write",
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseScopes("")).toEqual([]);
    expect(parseScopes("  ")).toEqual([]);
  });
});

describe("hasScope", () => {
  const claims = {
    sub: "user-1",
    sid: "session-1",
    jti: "token-1",
    org: "org-1",
    svc: "foundry",
    iss: "openfoundry",
    aud: "openfoundry",
    exp: 9999999999,
    iat: 1000000000,
    scope: "api:ontologies-read api:datasets-write",
  } satisfies OpenFoundryClaims;

  it("returns true for a present scope", () => {
    expect(hasScope(claims, "api:ontologies-read")).toBe(true);
  });

  it("returns false for an absent scope", () => {
    expect(hasScope(claims, "api:admin-write")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Token creation and validation round-trip
// ---------------------------------------------------------------------------

function makeTokenInput(): TokenInput {
  return {
    sub: "550e8400-e29b-41d4-a716-446655440000",
    sid: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    jti: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    org: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    svc: "ontology-service",
    iss: "openfoundry-auth",
    aud: "openfoundry-api",
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "api:ontologies-read api:datasets-read",
  };
}

describe("createToken + validateToken", () => {
  it("round-trips claims through sign and verify", async () => {
    const input = makeTokenInput();
    const jwt = await createToken(input, privateKey);
    expect(typeof jwt).toBe("string");
    expect(jwt.split(".")).toHaveLength(3);

    const claims = await validateToken(jwt, publicKey);
    expect(claims.sub).toBe(input.sub);
    expect(claims.sid).toBe(input.sid);
    expect(claims.jti).toBe(input.jti);
    expect(claims.org).toBe(input.org);
    expect(claims.svc).toBe(input.svc);
    expect(claims.iss).toBe(input.iss);
    expect(claims.aud).toBe(input.aud);
    expect(claims.scope).toBe(input.scope);
    expect(typeof claims.iat).toBe("number");
  });

  it("rejects a token signed with a different key", async () => {
    const input = makeTokenInput();
    const otherKeys = await generateKeyPair("ES256");
    const jwt = await createToken(input, otherKeys.privateKey);

    await expect(validateToken(jwt, publicKey)).rejects.toThrow(
      TokenValidationError,
    );
  });

  it("rejects an expired token", async () => {
    const input = {
      ...makeTokenInput(),
      exp: Math.floor(Date.now() / 1000) - 600, // 10 minutes ago
    };
    const jwt = await createToken(input, privateKey);

    try {
      await validateToken(jwt, publicKey, { clockToleranceSeconds: 0 });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TokenValidationError);
      expect((err as TokenValidationError).code).toBe(
        TokenValidationErrorCode.EXPIRED,
      );
    }
  });

  it("validates audience when specified", async () => {
    const input = makeTokenInput();
    const jwt = await createToken(input, privateKey);

    // Correct audience
    const claims = await validateToken(jwt, publicKey, {
      audience: "openfoundry-api",
    });
    expect(claims.aud).toBe("openfoundry-api");

    // Wrong audience
    await expect(
      validateToken(jwt, publicKey, { audience: "wrong-audience" }),
    ).rejects.toThrow(TokenValidationError);
  });

  it("supports array audiences", async () => {
    const input = { ...makeTokenInput(), aud: ["svc-a", "svc-b"] };
    const jwt = await createToken(input, privateKey);
    const claims = await validateToken(jwt, publicKey, { audience: "svc-a" });
    expect(claims.aud).toContain("svc-a");
  });
});

describe("buildTokenInput", () => {
  it("sets exp based on TTL", () => {
    const before = Math.floor(Date.now() / 1000);
    const input = buildTokenInput(
      {
        sub: "user-1",
        sid: "session-1",
        jti: "token-1",
        org: "org-1",
        svc: "svc",
        iss: "iss",
        aud: "aud",
        scope: "",
      },
      7200,
    );
    const after = Math.floor(Date.now() / 1000);
    expect(input.exp).toBeGreaterThanOrEqual(before + 7200);
    expect(input.exp).toBeLessThanOrEqual(after + 7200);
  });
});

describe("isValidClaimsShape", () => {
  it("returns true for a valid claims object", () => {
    expect(
      isValidClaimsShape({
        sub: "u",
        sid: "s",
        jti: "j",
        org: "o",
        svc: "v",
        iss: "i",
        aud: "a",
        exp: 1,
        iat: 1,
        scope: "",
      }),
    ).toBe(true);
  });

  it("returns false when a required field is missing", () => {
    expect(
      isValidClaimsShape({
        sub: "u",
        sid: "s",
        jti: "j",
        org: "o",
        svc: "v",
        iss: "i",
        aud: "a",
        exp: 1,
        iat: 1,
        // scope missing
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BearerToken
// ---------------------------------------------------------------------------

describe("BearerToken", () => {
  it("stores and retrieves the raw value", () => {
    const token = new BearerToken("secret-jwt-value");
    expect(token.dangerouslyGetValue()).toBe("secret-jwt-value");
  });

  it("rejects empty values", () => {
    expect(() => new BearerToken("")).toThrow();
    expect(() => new BearerToken("   ")).toThrow();
  });

  it("provides constant-time equality", () => {
    const a = new BearerToken("token-abc-123");
    const b = new BearerToken("token-abc-123");
    const c = new BearerToken("token-xyz-456");

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(a.equals("token-abc-123")).toBe(true);
    expect(a.equals("different")).toBe(false);
  });

  it("redacts toString()", () => {
    const token = new BearerToken("super-secret");
    expect(token.toString()).toBe("[REDACTED BearerToken]");
    expect(`${token}`).toBe("[REDACTED BearerToken]");
  });

  it("redacts toJSON()", () => {
    const token = new BearerToken("super-secret");
    expect(JSON.stringify({ token })).toBe('{"token":"[REDACTED BearerToken]"}');
  });

  it("produces an Authorization header", () => {
    const token = new BearerToken("my-jwt");
    expect(token.toAuthorizationHeader()).toBe("Bearer my-jwt");
  });
});

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

describe("Scope constants", () => {
  it("has read and write scopes for core resources", () => {
    expect(Scope.ONTOLOGIES_READ).toBe("api:ontologies-read");
    expect(Scope.ONTOLOGIES_WRITE).toBe("api:ontologies-write");
    expect(Scope.DATASETS_READ).toBe("api:datasets-read");
    expect(Scope.DATASETS_WRITE).toBe("api:datasets-write");
    expect(Scope.ADMIN_READ).toBe("api:admin-read");
    expect(Scope.ADMIN_WRITE).toBe("api:admin-write");
    expect(Scope.AIP_AGENTS_READ).toBe("api:aip-agents-read");
    expect(Scope.AIP_AGENTS_WRITE).toBe("api:aip-agents-write");
  });
});

describe("expandScopes", () => {
  it("adds implied read scopes for write grants", () => {
    const expanded = expandScopes(["api:ontologies-write"]);
    expect(expanded).toContain("api:ontologies-write");
    expect(expanded).toContain("api:ontologies-read");
  });

  it("does not duplicate existing read scopes", () => {
    const expanded = expandScopes([
      "api:ontologies-read",
      "api:ontologies-write",
    ]);
    const readCount = expanded.filter((s) => s === "api:ontologies-read").length;
    expect(readCount).toBe(1);
  });
});

describe("buildScopeString", () => {
  it("joins scopes with spaces", () => {
    expect(
      buildScopeString(["api:ontologies-read", "api:datasets-read"]),
    ).toBe("api:ontologies-read api:datasets-read");
  });
});

describe("satisfiesScope", () => {
  it("returns true for an exact match", () => {
    expect(satisfiesScope(["api:ontologies-read"], "api:ontologies-read")).toBe(
      true,
    );
  });

  it("returns true when write implies read", () => {
    expect(
      satisfiesScope(["api:ontologies-write"], "api:ontologies-read"),
    ).toBe(true);
  });

  it("returns false for an ungranted scope", () => {
    expect(
      satisfiesScope(["api:ontologies-read"], "api:admin-write"),
    ).toBe(false);
  });
});
