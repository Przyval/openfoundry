import type { TokenProvider } from "@openfoundry/client";
import { BearerToken } from "@openfoundry/auth-tokens";
import type { OAuthClientOptions, TokenResponse } from "./oauth-client.js";
import { refreshAccessToken } from "./oauth-client.js";

/**
 * Options for the TokenManager, extending OAuthClientOptions with
 * an optional callback for token changes.
 */
export interface TokenManagerOptions extends OAuthClientOptions {
  /**
   * Called whenever the token is set or refreshed.
   * Useful for persisting tokens to storage.
   */
  onTokenChange?: (token: TokenResponse) => void;
}

/**
 * Manages OAuth tokens with automatic refresh.
 *
 * Provides a `toTokenProvider()` method that returns a `TokenProvider`
 * function compatible with `@openfoundry/client`, so it can be passed
 * directly to `createClient` or `createFoundryClient`.
 *
 * The manager tracks when the current access token will expire and
 * proactively refreshes it (with a 60-second buffer) when `getToken()`
 * is called.
 *
 * @example
 * ```ts
 * const manager = new TokenManager({
 *   clientId: "my-client",
 *   baseUrl: "https://myorg.openfoundry.com",
 *   redirectUri: "http://localhost:3000/callback",
 *   scopes: ["api:ontologies-read"],
 *   onTokenChange: (token) => localStorage.setItem("token", JSON.stringify(token)),
 * });
 *
 * manager.setToken(initialTokenResponse);
 *
 * const client = createFoundryClient({
 *   baseUrl: "https://myorg.openfoundry.com",
 *   tokenProvider: manager.toTokenProvider(),
 * });
 * ```
 */
export class TokenManager {
  readonly #options: TokenManagerOptions;

  #currentToken: TokenResponse | null = null;
  #expiresAt: number = 0;
  #refreshPromise: Promise<void> | null = null;

  /** Buffer in milliseconds before expiration to trigger a refresh. */
  static readonly REFRESH_BUFFER_MS = 60_000;

  constructor(options: TokenManagerOptions) {
    this.#options = options;
  }

  /**
   * Returns a `TokenProvider` function that can be passed to
   * `createClient` or `createFoundryClient`.
   *
   * The returned function will automatically refresh the token
   * if it is expired or about to expire.
   */
  toTokenProvider(): TokenProvider {
    return async (): Promise<BearerToken> => {
      const token = await this.getToken();
      return new BearerToken(token);
    };
  }

  /**
   * Returns a valid access token string.
   *
   * Automatically refreshes if the token is expired or close to expiring.
   *
   * @throws {Error} If no token has been set.
   */
  async getToken(): Promise<string> {
    if (!this.#currentToken) {
      throw new Error(
        "TokenManager has no token. Call setToken() with an initial token first.",
      );
    }

    if (this.#isExpiringSoon()) {
      await this.#refresh();
    }

    return this.#currentToken.accessToken;
  }

  /**
   * Sets the current token, typically after the initial authorization code exchange.
   *
   * @param token - The token response to store.
   */
  setToken(token: TokenResponse): void {
    this.#currentToken = token;
    this.#expiresAt = Date.now() + token.expiresIn * 1000;
    this.#options.onTokenChange?.(token);
  }

  /**
   * Clears the stored token and cancels any pending refresh.
   */
  clear(): void {
    this.#currentToken = null;
    this.#expiresAt = 0;
    this.#refreshPromise = null;
  }

  /**
   * Returns whether a token is currently set.
   */
  hasToken(): boolean {
    return this.#currentToken !== null;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  #isExpiringSoon(): boolean {
    return Date.now() >= this.#expiresAt - TokenManager.REFRESH_BUFFER_MS;
  }

  async #refresh(): Promise<void> {
    // Deduplicate concurrent refresh calls
    if (this.#refreshPromise) {
      return this.#refreshPromise;
    }

    if (!this.#currentToken?.refreshToken) {
      throw new Error(
        "Cannot refresh: no refresh token available. Re-authenticate to obtain a new token.",
      );
    }

    this.#refreshPromise = this.#doRefresh();

    try {
      await this.#refreshPromise;
    } finally {
      this.#refreshPromise = null;
    }
  }

  async #doRefresh(): Promise<void> {
    const newToken = await refreshAccessToken(
      this.#options,
      this.#currentToken!.refreshToken!,
    );
    this.setToken(newToken);
  }
}
