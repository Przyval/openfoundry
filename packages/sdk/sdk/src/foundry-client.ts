import type { Client, TokenProvider, FetchFn } from "@openfoundry/client";
import { createClient } from "@openfoundry/client";
import { BearerToken } from "@openfoundry/auth-tokens";
import { type OntologiesApi, createOntologiesApi } from "./api/ontologies.js";
import { type ObjectsApi, createObjectsApi } from "./api/objects.js";
import { type ActionsApi, createActionsApi } from "./api/actions.js";
import { type DatasetsApi, createDatasetsApi } from "./api/datasets.js";
import { type AdminApi, createAdminApi } from "./api/admin.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for creating a FoundryClient.
 *
 * Provide either a `tokenProvider` function or a static `token` string.
 * If both are given, `tokenProvider` takes precedence.
 */
export interface FoundryClientOptions {
  /** Base URL of the OpenFoundry instance (e.g. "https://myorg.openfoundry.com"). */
  baseUrl: string;

  /**
   * Async or sync function that returns a BearerToken.
   * Takes precedence over `token` if both are provided.
   */
  tokenProvider?: TokenProvider;

  /**
   * A static token string. Wrapped in a BearerToken and used as the
   * token provider when `tokenProvider` is not set.
   */
  token?: string;

  /** Optional custom fetch implementation. Defaults to globalThis.fetch. */
  fetchFn?: FetchFn;
}

// ---------------------------------------------------------------------------
// FoundryClient
// ---------------------------------------------------------------------------

/**
 * The main SDK client for the OpenFoundry platform.
 *
 * Provides namespaced access to platform APIs. Each API namespace is lazily
 * created on first access.
 *
 * @example
 * ```ts
 * const client = createFoundryClient({
 *   baseUrl: "https://myorg.openfoundry.com",
 *   token: "my-token",
 * });
 *
 * const ontologies = await client.ontologies.listOntologies();
 * ```
 */
export class FoundryClient {
  readonly #client: Client;

  #ontologies?: OntologiesApi;
  #objects?: ObjectsApi;
  #actions?: ActionsApi;
  #datasets?: DatasetsApi;
  #admin?: AdminApi;

  constructor(client: Client) {
    this.#client = client;
  }

  /** Ontology metadata operations (list ontologies, object types, etc.). */
  get ontologies(): OntologiesApi {
    if (!this.#ontologies) {
      this.#ontologies = createOntologiesApi(this.#client);
    }
    return this.#ontologies;
  }

  /** Object CRUD and query operations. */
  get objects(): ObjectsApi {
    if (!this.#objects) {
      this.#objects = createObjectsApi(this.#client);
    }
    return this.#objects;
  }

  /** Action apply, validate, and batch operations. */
  get actions(): ActionsApi {
    if (!this.#actions) {
      this.#actions = createActionsApi(this.#client);
    }
    return this.#actions;
  }

  /** Dataset CRUD operations. */
  get datasets(): DatasetsApi {
    if (!this.#datasets) {
      this.#datasets = createDatasetsApi(this.#client);
    }
    return this.#datasets;
  }

  /** Platform administration operations (users, groups). */
  get admin(): AdminApi {
    if (!this.#admin) {
      this.#admin = createAdminApi(this.#client);
    }
    return this.#admin;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a new FoundryClient from the given options.
 *
 * @throws {Error} If neither `token` nor `tokenProvider` is provided.
 */
export function createFoundryClient(options: FoundryClientOptions): FoundryClient {
  const { baseUrl, fetchFn } = options;

  let tokenProvider: TokenProvider;

  if (options.tokenProvider) {
    tokenProvider = options.tokenProvider;
  } else if (options.token) {
    const bearerToken = new BearerToken(options.token);
    tokenProvider = () => bearerToken;
  } else {
    throw new Error(
      "FoundryClient requires either a tokenProvider or a token string",
    );
  }

  const client = createClient({
    baseUrl,
    tokenProvider,
    fetch: fetchFn,
  });

  return new FoundryClient(client);
}
