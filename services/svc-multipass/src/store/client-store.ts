/**
 * In-memory OAuth client store.
 *
 * Manages registered OAuth2 clients. In production this would be backed
 * by a database; the in-memory implementation is sufficient for development
 * and testing.
 */

export interface OAuthClient {
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly clientName: string;
  readonly redirectUris: readonly string[];
  readonly grantTypes: readonly string[];
  readonly scopes: readonly string[];
  readonly isPublic: boolean;
}

/** Default development client, pre-seeded for local development. */
const DEFAULT_DEV_CLIENT: OAuthClient = {
  clientId: "openfoundry-dev",
  clientName: "OpenFoundry Dev Client",
  isPublic: true,
  redirectUris: ["http://localhost:3000/callback"],
  grantTypes: ["authorization_code", "refresh_token"],
  scopes: ["api:read", "api:write"],
};

export class ClientStore {
  private readonly clients = new Map<string, OAuthClient>();

  constructor() {
    // Seed the default dev client
    this.clients.set(DEFAULT_DEV_CLIENT.clientId, DEFAULT_DEV_CLIENT);
  }

  /**
   * Look up a client by its ID.
   */
  getClient(clientId: string): OAuthClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Register a new client.
   */
  registerClient(client: OAuthClient): void {
    this.clients.set(client.clientId, client);
  }

  /**
   * Validate a client's secret. Public clients always pass (they have no secret).
   *
   * @returns `true` if the secret is valid or the client is public.
   */
  validateClientSecret(clientId: string, secret: string | undefined): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    if (client.isPublic) return true;

    if (!client.clientSecret || !secret) return false;

    return client.clientSecret === secret;
  }
}
