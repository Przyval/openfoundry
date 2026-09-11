/**
 * In-memory token store for refresh tokens and authorization codes.
 *
 * Will be replaced with a database-backed implementation in production.
 */

export interface StoredRefreshToken {
  readonly token: string;
  readonly clientId: string;
  readonly userId: string;
  readonly scope: string;
  readonly expiresAt: number;
  revoked: boolean;
}

export interface StoredAuthCode {
  readonly code: string;
  readonly clientId: string;
  readonly userId: string;
  readonly redirectUri: string;
  readonly scope: string;
  readonly codeChallenge?: string;
  readonly codeChallengeMethod?: "S256" | "plain";
  readonly expiresAt: number;
  consumed: boolean;
}

/** Authorization codes expire after 10 minutes. */
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;

export class TokenStore {
  private readonly refreshTokens = new Map<string, StoredRefreshToken>();
  private readonly authCodes = new Map<string, StoredAuthCode>();

  /**
   * Store a refresh token.
   */
  storeRefreshToken(entry: StoredRefreshToken): void {
    this.refreshTokens.set(entry.token, entry);
  }

  /**
   * Retrieve a refresh token. Returns undefined if not found, expired, or revoked.
   */
  getRefreshToken(token: string): StoredRefreshToken | undefined {
    const entry = this.refreshTokens.get(token);
    if (!entry) return undefined;
    if (entry.revoked) return undefined;

    const now = Math.floor(Date.now() / 1000);
    if (entry.expiresAt <= now) return undefined;

    return entry;
  }

  /**
   * Revoke a refresh token.
   *
   * @returns `true` if the token existed and was revoked.
   */
  revokeRefreshToken(token: string): boolean {
    const entry = this.refreshTokens.get(token);
    if (!entry) return false;
    entry.revoked = true;
    return true;
  }

  /**
   * Store an authorization code.
   */
  storeAuthCode(params: Omit<StoredAuthCode, "expiresAt" | "consumed">): void {
    const entry: StoredAuthCode = {
      ...params,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
      consumed: false,
    };
    this.authCodes.set(params.code, entry);
  }

  /**
   * Consume an authorization code. Returns the code data if valid, or
   * undefined if not found, expired, or already consumed.
   *
   * A code can only be consumed once (single-use).
   */
  consumeAuthCode(code: string): StoredAuthCode | undefined {
    const entry = this.authCodes.get(code);
    if (!entry) return undefined;
    if (entry.consumed) return undefined;
    if (entry.expiresAt <= Date.now()) return undefined;

    entry.consumed = true;
    return entry;
  }
}
