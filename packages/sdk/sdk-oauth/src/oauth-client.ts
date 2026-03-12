import { generateCodeVerifier, generateCodeChallenge } from "./pkce.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration options for the OAuth client.
 */
export interface OAuthClientOptions {
  /** The OAuth client ID registered with the OpenFoundry instance. */
  clientId: string;

  /** Base URL of the OpenFoundry instance (e.g. "https://myorg.openfoundry.com"). */
  baseUrl: string;

  /** The redirect URI registered for this client. */
  redirectUri: string;

  /** The OAuth scopes to request. */
  scopes: readonly string[];

  /** Whether to use PKCE (Proof Key for Code Exchange). Defaults to true. */
  usePkce?: boolean;
}

/**
 * The result of a token exchange or refresh operation.
 */
export interface TokenResponse {
  /** The access token string. */
  accessToken: string;

  /** The refresh token string, if issued. */
  refreshToken?: string;

  /** The token type (typically "Bearer"). */
  tokenType: string;

  /** The number of seconds until the access token expires. */
  expiresIn: number;

  /** The granted scope string. */
  scope: string;
}

/**
 * Result of creating an authorization URL, including PKCE verifier if applicable.
 */
export interface AuthorizationUrlResult {
  /** The full authorization URL to redirect the user to. */
  url: string;

  /** The PKCE code verifier, if PKCE is enabled. Store this securely for the token exchange. */
  codeVerifier?: string;
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function authorizeEndpoint(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/multipass/api/oauth2/authorize`;
}

function tokenEndpoint(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/multipass/api/oauth2/token`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

// ---------------------------------------------------------------------------
// OAuth operations
// ---------------------------------------------------------------------------

/**
 * Creates an OAuth 2.0 authorization URL for the authorization code flow.
 *
 * When PKCE is enabled (default), generates a code verifier and includes
 * the S256 code challenge in the authorization request.
 *
 * @param options - The OAuth client configuration.
 * @param state - Optional opaque state value for CSRF protection.
 * @returns The authorization URL and optional PKCE code verifier.
 */
export async function createAuthorizationUrl(
  options: OAuthClientOptions,
  state?: string,
): Promise<AuthorizationUrlResult> {
  const usePkce = options.usePkce ?? true;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    scope: options.scopes.join(" "),
  });

  if (state) {
    params.set("state", state);
  }

  let codeVerifier: string | undefined;

  if (usePkce) {
    codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  const url = `${authorizeEndpoint(options.baseUrl)}?${params.toString()}`;

  return { url, codeVerifier };
}

/**
 * Exchanges an authorization code for an access token.
 *
 * @param options - The OAuth client configuration.
 * @param code - The authorization code received from the redirect.
 * @param codeVerifier - The PKCE code verifier, required if PKCE was used during authorization.
 * @returns The token response containing access token and optional refresh token.
 */
export async function exchangeCodeForToken(
  options: OAuthClientOptions,
  code: string,
  codeVerifier?: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    code,
  });

  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const response = await fetch(tokenEndpoint(options.baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Token exchange failed (${response.status}): ${errorBody}`,
    );
  }

  const json = await response.json() as Record<string, unknown>;

  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token as string | undefined,
    tokenType: json.token_type as string,
    expiresIn: json.expires_in as number,
    scope: json.scope as string,
  };
}

/**
 * Refreshes an access token using a refresh token.
 *
 * @param options - The OAuth client configuration.
 * @param refreshToken - The refresh token to use.
 * @returns A new token response with a fresh access token.
 */
export async function refreshAccessToken(
  options: OAuthClientOptions,
  refreshToken: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: options.clientId,
    refresh_token: refreshToken,
  });

  const response = await fetch(tokenEndpoint(options.baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Token refresh failed (${response.status}): ${errorBody}`,
    );
  }

  const json = await response.json() as Record<string, unknown>;

  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token as string | undefined,
    tokenType: json.token_type as string,
    expiresIn: json.expires_in as number,
    scope: json.scope as string,
  };
}
