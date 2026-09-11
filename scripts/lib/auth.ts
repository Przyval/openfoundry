/**
 * Bearer credentials for TypeScript callers of the OpenFoundry API.
 *
 * The gateway rejects unauthenticated requests as soon as AUTH_PUBLIC_KEY is
 * configured (services/svc-gateway/src/middleware/auth.ts). Every caller that
 * talks to it therefore needs a token, and the token must come from the
 * environment: this repository is public, so no credential is written here.
 *
 * Credentials, in precedence order - all optional, all read from the
 * environment or from the gitignored .env, never from this file:
 *
 *   OPENFOUNDRY_TOKEN                        a bearer token, used verbatim
 *   OPENFOUNDRY_CLIENT_ID / _CLIENT_SECRET   exchanged for a token via the
 *                                            OAuth2 client_credentials grant
 *   OPENFOUNDRY_AUTH_URL                     where to exchange them
 *                                            (default: the caller's base URL)
 *
 * With neither credential set no Authorization header is produced, which is
 * exactly today's behaviour and still works against a gateway that has no
 * AUTH_PUBLIC_KEY. The keys are listed in .env.example with empty values.
 *
 * The shell equivalent is scripts/lib/auth.sh; keep the two in step.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CREDENTIAL_KEYS = [
  "OPENFOUNDRY_TOKEN",
  "OPENFOUNDRY_CLIENT_ID",
  "OPENFOUNDRY_CLIENT_SECRET",
  "OPENFOUNDRY_AUTH_URL",
] as const;

/**
 * Pull the OPENFOUNDRY_* credential keys out of the repo's .env, without
 * importing the rest of the file: a seed script has no business inheriting
 * DATABASE_URL and friends. Values already in the environment win.
 */
function loadEnvCredentials(): void {
  let text: string;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    text = readFileSync(resolve(here, "../..", ".env"), "utf8");
  } catch {
    return; // no .env - the environment is the only source
  }

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq);
    if (!(CREDENTIAL_KEYS as readonly string[]).includes(key)) continue;
    if (process.env[key]) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) process.env[key] = value;
  }
}

loadEnvCredentials();

/** Resolved tokens, keyed by the base URL they were minted against. */
const tokenCache = new Map<string, string | null>();

/**
 * Resolve a bearer token for `baseUrl`, or null when no credential is
 * configured. The result is cached for the lifetime of the process.
 */
export async function resolveAccessToken(
  baseUrl: string,
): Promise<string | null> {
  const cached = tokenCache.get(baseUrl);
  if (cached !== undefined) return cached;

  const token = await mintAccessToken(baseUrl);
  tokenCache.set(baseUrl, token);
  return token;
}

async function mintAccessToken(baseUrl: string): Promise<string | null> {
  const direct = process.env.OPENFOUNDRY_TOKEN;
  if (direct) return direct;

  const clientId = process.env.OPENFOUNDRY_CLIENT_ID;
  const clientSecret = process.env.OPENFOUNDRY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // The gateway leaves /multipass/api/oauth2/ reachable without a token by
  // design - it is where tokens come from.
  // `||`, not `??`: .env.example ships this key empty and the sync scripts
  // `set -a && source .env`, so an empty string is what a real run exports.
  const authUrl = process.env.OPENFOUNDRY_AUTH_URL || baseUrl;

  try {
    const res = await fetch(`${authUrl}/multipass/api/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) {
      console.warn(
        `[auth] ${authUrl} refused client_credentials (HTTP ${res.status}); continuing unauthenticated`,
      );
      return null;
    }
    const body = (await res.json()) as { access_token?: string };
    return body.access_token ?? null;
  } catch (err) {
    console.warn(`[auth] could not reach ${authUrl}: ${String(err)}`);
    return null;
  }
}

/**
 * Headers to merge into a request against `baseUrl` - `{ Authorization }`
 * when a credential is configured, `{}` otherwise.
 */
export async function authHeaders(
  baseUrl: string,
): Promise<Record<string, string>> {
  const token = await resolveAccessToken(baseUrl);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
