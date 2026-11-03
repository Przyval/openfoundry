/**
 * The authorization endpoint authenticates the person it issues a code for.
 *
 * Before this, GET /multipass/api/oauth2/authorize approved every request as a
 * hardcoded "admin", registered any client_id it was handed and accepted any
 * redirect_uri. These tests pin the replacement: a closed client registry, a
 * sign-in form that checks a password, and tokens that carry the roles of the
 * user who signed in.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { decodeJwt } from "jose";
import { FileAuthorizationStore, ROOT_RESOURCE, evaluate, identityFromClaims } from "@openfoundry/permissions";
import {
  ALICE_PASSWORD,
  CONSOLE_CLIENT,
  CONSOLE_REDIRECT,
  VERIFIER,
  consoleRequest,
  locationParams,
  signInAndExchange,
  startServer,
  submitSignIn,
  user,
  type TestServer,
} from "./fixtures.js";

let server: TestServer;

beforeEach(async () => {
  server = await startServer();
});

afterEach(async () => {
  await server.app.close();
});

function getAuthorize(query: Record<string, string>) {
  return server.app.inject({ method: "GET", url: "/multipass/api/oauth2/authorize", query });
}

describe("GET /authorize shows a sign-in form instead of approving", () => {
  it("answers a valid request with the form, and no code", async () => {
    const response = await getAuthorize(await consoleRequest());

    expect(response.statusCode).toBe(200);
    expect(response.headers.location).toBeUndefined();
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.body).toContain('<form method="post" action="authorize">');
    expect(response.body).toContain('name="password"');
    expect(response.body).toContain("Example Console");
    expect(response.body).not.toContain("code=");
  });

  it("serves the form uncacheable and unframeable, with no script allowed", async () => {
    const response = await getAuthorize(await consoleRequest());

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    const csp = String(response.headers["content-security-policy"]);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.body).not.toContain("<script");
  });

  it("carries the request through the form, escaped", async () => {
    const response = await getAuthorize(
      await consoleRequest({ state: '"><script>alert(1)</script>' }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("<script>alert(1)</script>");
    expect(response.body).toContain(
      'name="state" value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"',
    );
    expect(response.body).toContain(`name="redirect_uri" value="${CONSOLE_REDIRECT}"`);
  });

  it("uses the only registered redirect URI when the request names none", async () => {
    const response = await getAuthorize(await consoleRequest({ redirect_uri: undefined }));
    expect(response.statusCode).toBe(200);
  });
});

describe("the client registry is closed", () => {
  it("rejects an unknown client_id on a page, without registering it or redirecting", async () => {
    const response = await getAuthorize(
      await consoleRequest({ client_id: "attacker", redirect_uri: "https://evil.example/cb" }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.headers.location).toBeUndefined();
    expect(response.body).toContain("Unknown application");
    expect(server.clientStore.getClient("attacker")).toBeUndefined();
  });

  it("rejects an unregistered redirect_uri on a page, without adding it or redirecting", async () => {
    const response = await getAuthorize(
      await consoleRequest({ redirect_uri: "https://evil.example/cb" }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.headers.location).toBeUndefined();
    expect(server.clientStore.getClient("console")!.redirectUris).toEqual([CONSOLE_REDIRECT]);
  });

  it("does not treat a registered URI's prefix or variant as registered", async () => {
    for (const variant of [`${CONSOLE_REDIRECT}/x`, `${CONSOLE_REDIRECT}?a=1`, CONSOLE_REDIRECT.toUpperCase()]) {
      const response = await getAuthorize(await consoleRequest({ redirect_uri: variant }));
      expect(response.statusCode).toBe(400);
    }
  });

  it("will not issue a code even to correct credentials posted for an unknown client", async () => {
    const response = await submitSignIn(server.app, {
      ...(await consoleRequest({ client_id: "attacker", redirect_uri: "https://evil.example/cb" })),
      username: "alice",
      password: ALICE_PASSWORD,
      action: "login",
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers.location).toBeUndefined();
  });

  it("will not redirect correct credentials to a redirect_uri swapped into the form", async () => {
    const response = await submitSignIn(server.app, {
      ...(await consoleRequest({ redirect_uri: "https://evil.example/cb" })),
      username: "alice",
      password: ALICE_PASSWORD,
      action: "login",
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers.location).toBeUndefined();
  });
});

describe("a malformed request from a known client goes back to the client", () => {
  async function errorFor(overrides: Record<string, string | undefined>) {
    const response = await getAuthorize(await consoleRequest(overrides));
    expect(response.statusCode).toBe(302);
    const location = String(response.headers.location);
    expect(location.startsWith(`${CONSOLE_REDIRECT}?`)).toBe(true);
    const params = locationParams(response);
    expect(params.get("state")).toBe("st-123");
    expect(params.get("code")).toBeNull();
    return params.get("error");
  }

  it("requires PKCE from a public client", async () => {
    expect(await errorFor({ code_challenge: undefined, code_challenge_method: undefined }))
      .toBe("invalid_request");
  });

  it("refuses the plain PKCE method, explicit or implied", async () => {
    expect(await errorFor({ code_challenge_method: "plain" })).toBe("invalid_request");
    expect(await errorFor({ code_challenge_method: undefined })).toBe("invalid_request");
  });

  it("refuses a malformed code_challenge", async () => {
    expect(await errorFor({ code_challenge: "short" })).toBe("invalid_request");
  });

  it("refuses any response_type but code", async () => {
    expect(await errorFor({ response_type: "token" })).toBe("unsupported_response_type");
  });

  it("refuses a scope the client was not given", async () => {
    expect(await errorFor({ scope: "api:read api:admin" })).toBe("invalid_scope");
  });
});

describe("POST /authorize checks the password", () => {
  it("redirects a correct sign-in to the client with a code and the state", async () => {
    // ALICE_PASSWORD is "correct horse+battery=staple&co". URLSearchParams
    // encodes its spaces as "+", which the old split-and-decode form parser
    // kept as literal plus signs.
    const response = await submitSignIn(server.app, {
      ...(await consoleRequest()),
      username: "alice",
      password: ALICE_PASSWORD,
      action: "login",
    });

    // 303, so the browser follows with a GET and never re-posts the password.
    expect(response.statusCode).toBe(303);
    const params = locationParams(response);
    expect(String(response.headers.location).startsWith(`${CONSOLE_REDIRECT}?`)).toBe(true);
    expect(params.get("code")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.get("state")).toBe("st-123");
  });

  for (const [label, username, password] of [
    ["a wrong password", "alice", "not-her-password"],
    ["an unknown user", "mallory", "whatever-it-is"],
    ["a disabled user's correct password", "dave", "dave-password"],
    ["an empty password", "alice", ""],
  ] as const) {
    it(`re-shows the form, with no code, for ${label}`, async () => {
      const response = await submitSignIn(server.app, {
        ...(await consoleRequest()),
        username,
        password,
        action: "login",
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers.location).toBeUndefined();
      expect(response.body).toContain("Incorrect username or password.");
      expect(response.body).toContain(`name="username" value="${username}"`);
      if (password !== "") expect(response.body).not.toContain(password);
    });
  }

  it("sends a cancelled sign-in back to the client as access_denied", async () => {
    const response = await submitSignIn(server.app, {
      ...(await consoleRequest()),
      action: "deny",
    });

    expect(response.statusCode).toBe(303);
    const params = locationParams(response);
    expect(params.get("error")).toBe("access_denied");
    expect(params.get("state")).toBe("st-123");
    expect(params.get("code")).toBeNull();
  });
});

describe("the token is the signed-in user's", () => {
  it("names the user and carries their roles and organization", async () => {
    const response = await signInAndExchange(server.app);

    expect(response.statusCode).toBe(200);
    const claims = decodeJwt(response.json().access_token);
    expect(claims.sub).toBe("alice");
    expect(claims.roles).toBe("SERVICE_ACCOUNT");
    expect(claims.org).toBe("org:acme");
    expect(claims.scope).toBe("api:read");
    expect(response.json().refresh_token).toBeTruthy();
  });

  it("carries no roles claim for a user who holds none", async () => {
    const response = await signInAndExchange(server.app, "carol", "carol-password");

    expect(response.statusCode).toBe(200);
    const claims = decodeJwt(response.json().access_token);
    expect(claims.sub).toBe("carol");
    expect(claims.roles).toBeUndefined();
    expect(claims.org).toBe("default-org");
  });

  it("carries the user's groups and markings, at sign-in, direct login and refresh", async () => {
    server.users.add(
      await user("alice", ALICE_PASSWORD, {
        roles: ["SERVICE_ACCOUNT"],
        groups: ["ri.group.analysts"],
        markings: ["pii", "phi"],
      }),
    );

    const exchanged = await signInAndExchange(server.app);
    const alice = identityFromClaims(decodeJwt(exchanged.json().access_token))!;
    expect(alice).toMatchObject({
      userId: "alice",
      groups: ["ri.group.analysts"],
      markings: ["pii", "phi"],
    });

    // What the token carries is what opens a marked resource: a viewer role
    // through the group, and the Marking on the ontology.
    const authz = new FileAuthorizationStore(null);
    const marked = "ri.ontology.main.ontology.patients";
    await authz.addGrant({
      resourceRid: marked,
      principalType: "group",
      principalId: "ri.group.analysts",
      roleId: "viewer",
      grantedBy: "t",
      grantedAt: "2026-01-01T00:00:00.000Z",
    });
    await authz.setPolicy({ resourceRid: marked, organizations: [], markings: ["pii"] });
    expect(await evaluate(authz, alice, "objects:read", [marked, ROOT_RESOURCE])).toBeUndefined();
    expect(
      await evaluate(authz, { ...alice, markings: [] }, "objects:read", [marked, ROOT_RESOURCE]),
    ).toMatchObject({ layer: "marking" });

    const login = await server.app.inject({
      method: "POST",
      url: "/multipass/api/auth/login",
      payload: { username: "alice", password: ALICE_PASSWORD },
    });
    expect(identityFromClaims(decodeJwt(login.json().accessToken))).toMatchObject({
      groups: ["ri.group.analysts"],
      markings: ["pii", "phi"],
    });

    // A Marking taken away reaches the next refreshed token.
    server.users.add(await user("alice", ALICE_PASSWORD, { groups: ["ri.group.analysts"], markings: ["pii"] }));
    const refreshed = await server.app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "refresh_token",
        client_id: CONSOLE_CLIENT.clientId,
        refresh_token: exchanged.json().refresh_token,
      },
    });
    const claims = decodeJwt(refreshed.json().access_token);
    expect(claims.markings).toBe("pii");
    expect(claims.groups).toBe("ri.group.analysts");
  });

  it("carries no groups or markings claim for a user who has none", async () => {
    const claims = decodeJwt((await signInAndExchange(server.app, "carol", "carol-password")).json().access_token);
    expect(claims.groups).toBeUndefined();
    expect(claims.markings).toBeUndefined();
  });

  it("will not exchange a public client's code without the PKCE verifier", async () => {
    const signIn = await submitSignIn(server.app, {
      ...(await consoleRequest()),
      username: "alice",
      password: ALICE_PASSWORD,
      action: "login",
    });
    const code = locationParams(signIn).get("code")!;

    for (const verifier of [undefined, "a-different-verifier-that-is-long-enough-1234567"]) {
      const response = await server.app.inject({
        method: "POST",
        url: "/multipass/api/oauth2/token",
        payload: {
          grant_type: "authorization_code",
          client_id: CONSOLE_CLIENT.clientId,
          code,
          ...(verifier ? { code_verifier: verifier } : {}),
        },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it("reads the roles again on refresh, so a demotion takes effect", async () => {
    const first = await signInAndExchange(server.app);
    server.users.add(await user("alice", ALICE_PASSWORD, { roles: ["SERVICE_ACCOUNT"] }));

    const refreshed = await server.app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "refresh_token",
        client_id: CONSOLE_CLIENT.clientId,
        refresh_token: first.json().refresh_token,
      },
    });

    expect(refreshed.statusCode).toBe(200);
    expect(decodeJwt(refreshed.json().access_token).roles).toBe("SERVICE_ACCOUNT");
    expect(refreshed.json().refresh_token).not.toBe(first.json().refresh_token);
  });

  it("refuses to refresh for a user disabled since they signed in", async () => {
    const first = await signInAndExchange(server.app);
    server.users.add(await user("alice", ALICE_PASSWORD, { roles: ["SERVICE_ACCOUNT"], active: false }));

    const refreshed = await server.app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "refresh_token",
        client_id: CONSOLE_CLIENT.clientId,
        refresh_token: first.json().refresh_token,
      },
    });

    expect(refreshed.statusCode).toBe(400);
  });

  it("refuses a refresh token presented by a client it was not issued to", async () => {
    const first = await signInAndExchange(server.app);
    server.clientStore.registerClient({ ...CONSOLE_CLIENT, clientId: "other-console" });

    const refreshed = await server.app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "refresh_token",
        client_id: "other-console",
        refresh_token: first.json().refresh_token,
      },
    });

    expect(refreshed.statusCode).toBe(400);
  });

  it("uses each code once", async () => {
    const signIn = await submitSignIn(server.app, {
      ...(await consoleRequest()),
      username: "alice",
      password: ALICE_PASSWORD,
      action: "login",
    });
    const exchange = () =>
      server.app.inject({
        method: "POST",
        url: "/multipass/api/oauth2/token",
        payload: {
          grant_type: "authorization_code",
          client_id: CONSOLE_CLIENT.clientId,
          code: locationParams(signIn).get("code"),
          code_verifier: VERIFIER,
        },
      });

    expect((await exchange()).statusCode).toBe(200);
    expect((await exchange()).statusCode).toBe(400);
  });
});
