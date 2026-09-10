/**
 * The object read endpoints against a store whose methods answer with
 * promises.
 *
 * `PgObjectStore` is entirely async, so a handler that reads a store's return
 * value without awaiting it serves the unresolved promise — or crashes — only
 * on a Postgres-backed deployment, while every in-memory test still passes.
 * The double below reproduces that asymmetry without needing a live database.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import {
  ObjectStore,
  type ObjectReadWriteStore,
  type StoredObject,
} from "../src/store/object-store.js";
import { LinkStore } from "../src/store/link-store.js";

const ONTOLOGY_RID = "ri.ontology.main.ontology.test-ontology";
const BASE_URL = `/api/v2/ontologies/${ONTOLOGY_RID}/objects`;

/**
 * Delegates to the in-memory store but answers asynchronously, as every
 * `PgObjectStore` method does.
 */
class AsyncObjectStore implements ObjectReadWriteStore {
  constructor(private readonly inner: ObjectStore) {}

  async allObjects(objectType: string): Promise<StoredObject[]> {
    return this.inner.allObjects(objectType);
  }

  async getObject(objectType: string, primaryKey: string): Promise<StoredObject> {
    return this.inner.getObject(objectType, primaryKey);
  }

  async createObject(
    objectType: string,
    primaryKey: string,
    properties: Record<string, unknown>,
  ): Promise<StoredObject> {
    return this.inner.createObject(objectType, primaryKey, properties);
  }

  async upsertObject(
    objectType: string,
    primaryKey: string,
    properties: Record<string, unknown>,
  ): Promise<StoredObject> {
    return this.inner.upsertObject(objectType, primaryKey, properties);
  }

  async updateObject(
    objectType: string,
    primaryKey: string,
    properties: Record<string, unknown>,
  ): Promise<StoredObject> {
    return this.inner.updateObject(objectType, primaryKey, properties);
  }

  async deleteObject(objectType: string, primaryKey: string): Promise<void> {
    this.inner.deleteObject(objectType, primaryKey);
  }
}

let app: FastifyInstance;
let inner: ObjectStore;

beforeEach(async () => {
  inner = new ObjectStore(null);
  app = await createServer({
    config: { port: 0, host: "127.0.0.1", logLevel: "silent" },
    // The object-set and link routes still need the richer in-memory store;
    // only the object routes under test are driven through the async double.
    store: new AsyncObjectStore(inner) as unknown as ObjectStore,
    linkStore: new LinkStore(null),
  });

  inner.createObject("Employee", "emp-1", { name: "Carol", salary: 120000 });
  inner.createObject("Employee", "emp-2", { name: "Alice", salary: 90000 });
});

describe("Object read endpoints against an async store", () => {
  it("lists the objects rather than failing on an unresolved collection", async () => {
    const res = await app.inject({ method: "GET", url: `${BASE_URL}/Employee` });

    expect(res.statusCode).toBe(200);
    expect(res.json().totalCount).toBe(2);
    expect(res.json().data.map((o: any) => o.primaryKey).sort()).toEqual([
      "emp-1",
      "emp-2",
    ]);
  });

  it("still honours orderBy, select and totalCount over the whole collection", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/Employee?orderBy=properties.name&select=name`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((o: any) => o.properties.name)).toEqual([
      "Alice",
      "Carol",
    ]);
  });

  it("returns the selected properties of a single object, not an empty bag", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/Employee/emp-1?select=name`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().properties).toEqual({ name: "Carol" });
  });

  it("returns the whole single object when select is omitted", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/Employee/emp-1`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().primaryKey).toBe("emp-1");
    expect(res.json().properties).toEqual({ name: "Carol", salary: 120000 });
  });

  it("reports a missing object as not found instead of serving a pending read", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/Employee/emp-absent?select=name`,
    });

    expect(res.statusCode).toBe(404);
  });

  it("writes and deletes through the async store", async () => {
    const created = await app.inject({
      method: "POST",
      url: `${BASE_URL}/Employee`,
      payload: { primaryKey: "emp-3", properties: { name: "Bob" } },
    });
    expect(created.statusCode).toBe(201);

    const deleted = await app.inject({
      method: "DELETE",
      url: `${BASE_URL}/Employee/emp-3`,
    });
    expect(deleted.statusCode).toBe(204);
    expect(inner.allObjects("Employee").map((o) => o.primaryKey)).toEqual([
      "emp-1",
      "emp-2",
    ]);
  });
});
