import { generateKeyPair } from "jose";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { createServer } from "../src/server.js";
import type { MultipassConfig } from "../src/config.js";
import { hashPassword } from "../src/passwords.js";
import { generateCodeChallenge } from "../src/pkce.js";
import { ClientStore, type OAuthClient } from "../src/store/client-store.js";
import { TokenStore } from "../src/store/token-store.js";
import { InMemoryUserDirectory, type UserRecord } from "../src/store/user-store.js";

export function testConfig(overrides: Partial<MultipassConfig> = {}): MultipassConfig {
  return {
    port: 0,
    host: "127.0.0.1",
    databaseUrl: "",
    jwtPrivateKey: "",
    jwtPublicKey: "",
    tokenExpirySeconds: 3600,
    refreshTokenExpirySeconds: 86400 * 30,
    logLevel: "silent",
    nodeEnv: "test",
    oauthClients: "",
    ...overrides,
  };
}

export const CONSOLE_REDIRECT = "https://console.example.com/login";

/** A public browser client, as an operator would declare the console. */
export const CONSOLE_CLIENT: OAuthClient = {
  clientId: "console",
  clientName: "Example Console",
  isPublic: true,
  redirectUris: [CONSOLE_REDIRECT],
  grantTypes: ["authorization_code", "refresh_token"],
  scopes: ["api:read", "api:write"],
};

/** A confidential service client, as an operator would declare a sync job. */
export const SERVICE_CLIENT: OAuthClient = {
  clientId: "service-app",
  clientSecret: "service-secret",
  clientName: "Service App",
  isPublic: false,
  redirectUris: [],
  grantTypes: ["client_credentials"],
  scopes: ["api:read", "api:write"],
};

export const ALICE_PASSWORD = "correct horse+battery=staple&co";

export async function user(
  username: string,
  password: string | null,
  extra: Partial<UserRecord> = {},
): Promise<UserRecord> {
  return {
    username,
    displayName: username,
    passwordHash: password === null ? null : await hashPassword(password),
    roles: [],
    orgRid: null,
    active: true,
    ...extra,
  };
}

export interface TestServer {
  app: FastifyInstance;
  users: InMemoryUserDirectory;
  clientStore: ClientStore;
  tokenStore: TokenStore;
}

/**
 * A server with no development accounts or clients - nodeEnv "test" still
 * seeds them, so the stores are passed explicitly - holding alice (EDITOR),
 * carol (no roles) and dave (disabled).
 */
export async function startServer(): Promise<TestServer> {
  const keys = await generateKeyPair("ES256", { extractable: true });
  const users = new InMemoryUserDirectory([
    await user("alice", ALICE_PASSWORD, { roles: ["EDITOR"], orgRid: "org:acme" }),
    await user("carol", "carol-password"),
    await user("dave", "dave-password", { roles: ["ADMIN"], active: false }),
  ]);
  const clientStore = new ClientStore([CONSOLE_CLIENT, SERVICE_CLIENT]);
  const tokenStore = new TokenStore();
  const app = await createServer({
    config: testConfig(),
    oauthOptions: { tokenStore, clientStore, ...keys },
    users,
  });
  await app.ready();
  return { app, users, clientStore, tokenStore };
}

export const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

/** A valid authorization request from the console client. */
export async function consoleRequest(
  overrides: Record<string, string | undefined> = {},
): Promise<Record<string, string>> {
  const request: Record<string, string | undefined> = {
    response_type: "code",
    client_id: CONSOLE_CLIENT.clientId,
    redirect_uri: CONSOLE_REDIRECT,
    scope: "api:read",
    state: "st-123",
    code_challenge: await generateCodeChallenge(VERIFIER, "S256"),
    code_challenge_method: "S256",
    ...overrides,
  };
  return Object.fromEntries(
    Object.entries(request).filter((e): e is [string, string] => e[1] !== undefined),
  );
}

/** Submit the sign-in form, url-encoded exactly as a browser would. */
export function submitSignIn(
  app: FastifyInstance,
  fields: Record<string, string>,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: "/multipass/api/oauth2/authorize",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams(fields).toString(),
  });
}

export function locationParams(response: LightMyRequestResponse): URLSearchParams {
  return new URL(String(response.headers.location)).searchParams;
}

/** Sign alice in through the console and exchange the code. */
export async function signInAndExchange(
  app: FastifyInstance,
  username = "alice",
  password = ALICE_PASSWORD,
): Promise<LightMyRequestResponse> {
  const signIn = await submitSignIn(app, {
    ...(await consoleRequest()),
    username,
    password,
    action: "login",
  });
  if (signIn.statusCode !== 303) {
    throw new Error(`sign-in failed: ${signIn.statusCode} ${signIn.body.slice(0, 200)}`);
  }
  return app.inject({
    method: "POST",
    url: "/multipass/api/oauth2/token",
    payload: {
      grant_type: "authorization_code",
      client_id: CONSOLE_CLIENT.clientId,
      code: locationParams(signIn).get("code"),
      redirect_uri: CONSOLE_REDIRECT,
      code_verifier: VERIFIER,
    },
  });
}
