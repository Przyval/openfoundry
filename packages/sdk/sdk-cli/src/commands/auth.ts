import * as http from "node:http";
import * as crypto from "node:crypto";
import { CredentialStore } from "../config/credentials.js";
import { loadProjectConfig } from "../config/project-config.js";
import { log, success, error, warn, bold, dim, spinner } from "../output.js";
import type { ParsedArgs } from "../cli.js";

const CALLBACK_PORT = 8477;
const CALLBACK_PATH = "/oauth/callback";
const CLIENT_ID = "openfoundry-cli";

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

async function login(args: ParsedArgs): Promise<void> {
  const config = loadProjectConfig();
  const baseUrl =
    typeof args.flags["base-url"] === "string"
      ? args.flags["base-url"]
      : config.baseUrl;

  const store = new CredentialStore();

  const existingCreds = store.loadCredentials();
  if (existingCreds && Date.now() < existingCreds.expiresAt) {
    warn("Already logged in. Use 'auth logout' first to re-authenticate.");
    return;
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const redirectUri = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
  const authUrl = new URL("/oauth/authorize", baseUrl);
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", "openid offline_access");

  log("");
  log(bold("OpenFoundry CLI Authentication"));
  log("");
  log("Open the following URL in your browser to authenticate:");
  log("");
  log(`  ${authUrl.toString()}`);
  log("");

  const sp = spinner("Waiting for authentication callback...");

  try {
    const code = await waitForCallback(state);
    sp.update("Exchanging authorization code for tokens...");

    const tokenUrl = new URL("/oauth/token", baseUrl);
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    const response = await fetch(tokenUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Token exchange failed (${response.status}): ${text}`,
      );
    }

    const tokenData = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    store.saveCredentials({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      baseUrl,
    });

    sp.stop("Successfully authenticated with OpenFoundry!");
    log(dim(`  Credentials saved to ${store.getCredentialsPath()}`));
  } catch (err) {
    sp.stop();
    throw err;
  }
}

function waitForCallback(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        const description =
          url.searchParams.get("error_description") ?? errorParam;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Authentication Failed</h2><p>You can close this window.</p></body></html>",
        );
        server.close();
        reject(new Error(`Authentication failed: ${description}`));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Invalid State</h2><p>CSRF validation failed.</p></body></html>",
        );
        server.close();
        reject(new Error("Invalid state parameter — possible CSRF attack"));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Missing Code</h2><p>No authorization code received.</p></body></html>",
        );
        server.close();
        reject(new Error("No authorization code received"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<html><body><h2>Authentication Successful</h2><p>You can close this window and return to the CLI.</p></body></html>",
      );
      server.close();
      resolve(code);
    });

    server.listen(CALLBACK_PORT, "127.0.0.1", () => {
      // Server is listening
    });

    server.on("error", (err) => {
      reject(
        new Error(`Failed to start callback server on port ${CALLBACK_PORT}: ${err.message}`),
      );
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out after 5 minutes"));
    }, 5 * 60 * 1000);
  });
}

async function logout(_args: ParsedArgs): Promise<void> {
  const store = new CredentialStore();
  const creds = store.loadCredentials();

  if (!creds) {
    warn("Not currently logged in.");
    return;
  }

  store.clearCredentials();
  success("Logged out and removed saved credentials.");
}

async function status(_args: ParsedArgs): Promise<void> {
  const store = new CredentialStore();
  const creds = store.loadCredentials();

  log("");
  log(bold("Authentication Status"));
  log("");

  if (!creds) {
    log("  Status: Not authenticated");
    log('  Run "openfoundry auth login" to authenticate.');
    return;
  }

  const isExpired = Date.now() >= creds.expiresAt;
  const expiresDate = new Date(creds.expiresAt).toISOString();

  log(`  Status:    ${isExpired ? "Expired" : "Authenticated"}`);
  log(`  Base URL:  ${creds.baseUrl}`);
  log(`  Expires:   ${expiresDate}`);

  if (isExpired) {
    log("");
    warn('Token has expired. Run "openfoundry auth login" to re-authenticate.');
  }
}

async function token(_args: ParsedArgs): Promise<void> {
  const store = new CredentialStore();
  const creds = store.loadCredentials();

  if (!creds) {
    error("Not authenticated. Run 'openfoundry auth login' first.");
    process.exitCode = 1;
    return;
  }

  if (Date.now() >= creds.expiresAt) {
    error("Token has expired. Run 'openfoundry auth login' to re-authenticate.");
    process.exitCode = 1;
    return;
  }

  // Print raw token for piping
  process.stdout.write(creds.accessToken);
}

const SUBCOMMANDS: Record<string, (args: ParsedArgs) => Promise<void>> = {
  login,
  logout,
  status,
  token,
};

export async function handleAuth(args: ParsedArgs): Promise<void> {
  const sub = args.subcommand;

  if (!sub) {
    error("Missing subcommand. Usage: openfoundry auth <login|logout|status|token>");
    process.exitCode = 1;
    return;
  }

  const handler = SUBCOMMANDS[sub];
  if (!handler) {
    error(`Unknown auth subcommand: ${sub}`);
    error("Available subcommands: login, logout, status, token");
    process.exitCode = 1;
    return;
  }

  await handler(args);
}
