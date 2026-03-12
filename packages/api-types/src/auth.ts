/**
 * Types for the Auth Service (Multipass) API.
 * Derived from conjure/auth-service.yml.
 */

// ---------------------------------------------------------------------------
// Grant type
// ---------------------------------------------------------------------------

export type GrantType = "authorization_code" | "client_credentials" | "refresh_token";

export type CodeChallengeMethod = "S256" | "plain";

export type TokenTypeHint = "access_token" | "refresh_token";

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

/** OAuth2 token request */
export interface TokenRequest {
  grant_type: string;
  client_id?: string;
  client_secret?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  refresh_token?: string;
  scope?: string;
}

/** OAuth2 token response */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

// ---------------------------------------------------------------------------
// Authorize
// ---------------------------------------------------------------------------

export interface AuthorizeRequest {
  response_type: string;
  client_id: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: CodeChallengeMethod;
}

export interface AuthorizeResponse {
  code: string;
  state?: string;
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

/** OAuth2 token revocation request per RFC 7009 */
export interface RevokeRequest {
  token: string;
  token_type_hint?: TokenTypeHint;
}

export interface RevokeResponse {
  revoked: boolean;
}

// ---------------------------------------------------------------------------
// UserInfo
// ---------------------------------------------------------------------------

/** OpenID Connect UserInfo response */
export interface UserInfo {
  sub: string;
  org?: string;
  scope?: string;
  sid?: string;
  svc?: string;
}

// ---------------------------------------------------------------------------
// OAuthClient
// ---------------------------------------------------------------------------

/** Registered OAuth2 client */
export interface OAuthClient {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  grant_types: string[];
  scopes: string[];
}

// ---------------------------------------------------------------------------
// OpenID Configuration
// ---------------------------------------------------------------------------

/** OpenID Connect Discovery document */
export interface OpenIdConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint: string;
  userinfo_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  scopes_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  code_challenge_methods_supported: string[];
}
