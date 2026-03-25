// ---------------------------------------------------------------------------
// HTTP client for the Objects service (svc-objects).
//
// Action handlers use this to read, create, and update objects atomically
// during action execution.
// ---------------------------------------------------------------------------

export interface ObjectRecord {
  [key: string]: unknown;
  rid: string;
  objectType: string;
  primaryKey: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class ObjectsClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ObjectsClientError";
  }
}

/**
 * Lightweight HTTP client that talks to svc-objects.
 *
 * Every method throws `ObjectsClientError` on non-2xx responses so that
 * action handlers can let the error propagate and be caught by the
 * execution framework.
 */
export class ObjectsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly ontologyRid: string,
  ) {}

  private url(objectType: string, primaryKey?: string): string {
    const base = `${this.baseUrl}/api/v2/ontologies/${this.ontologyRid}/objects/${objectType}`;
    return primaryKey ? `${base}/${primaryKey}` : base;
  }

  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);

    if (!res.ok) {
      let errorBody: unknown;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = await res.text().catch(() => "");
      }
      throw new ObjectsClientError(
        `Objects service returned ${res.status} for ${method} ${url}`,
        res.status,
        errorBody,
      );
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /** Retrieve a single object by type and primary key. */
  async getObject(objectType: string, primaryKey: string): Promise<ObjectRecord> {
    return this.request<ObjectRecord>("GET", this.url(objectType, primaryKey));
  }

  /** Create a new object. Returns the created record. */
  async createObject(
    objectType: string,
    primaryKey: string,
    properties: Record<string, unknown>,
  ): Promise<ObjectRecord> {
    return this.request<ObjectRecord>("POST", this.url(objectType), {
      primaryKey,
      properties,
    });
  }

  /** Update an existing object (merge properties). Returns updated record. */
  async updateObject(
    objectType: string,
    primaryKey: string,
    properties: Record<string, unknown>,
  ): Promise<ObjectRecord> {
    return this.request<ObjectRecord>("PUT", this.url(objectType, primaryKey), {
      properties,
    });
  }
}
