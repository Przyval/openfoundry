/**
 * Kelava Sync Integration Tests
 *
 * Tests the core Kelava ERP sync flow: upsert behavior, error handling,
 * dashboard data availability, and incremental sync state.
 *
 * Prerequisites: Services must be running (bash start.sh)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { authHeaders } from "../../scripts/lib/auth";

const BASE = process.env.OPENFOUNDRY_HOST ?? "http://localhost:8080";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * fetch against the gateway carrying whatever credential the environment
 * supplies. The gateway rejects unauthenticated requests once AUTH_PUBLIC_KEY
 * is set, so every call in this suite goes through here rather than through a
 * bare fetch. With no credential configured the header is simply absent, which
 * is what the default dev gateway expects.
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(await authHeaders(BASE))) {
    headers.set(key, value);
  }
  return fetch(`${BASE}${path}`, { ...init, headers });
}

const JSON_HEADERS = { "Content-Type": "application/json" };

async function getOrCreateOntology(): Promise<string> {
  // Try to find existing sanocare-kelava ontology
  const listRes = await apiFetch("/api/v2/ontologies");
  const listData = await listRes.json();
  const existing = (listData.data ?? []).find(
    (o: { apiName: string }) => o.apiName === "test-kelava-sync",
  );
  if (existing) return existing.rid;

  // Create test ontology
  const createRes = await apiFetch("/api/v2/ontologies", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      apiName: "test-kelava-sync",
      displayName: "Test Kelava Sync",
      description: "Integration test ontology",
    }),
  });
  const createData = await createRes.json();
  return createData.rid;
}

async function ensureObjectType(ontRid: string, apiName: string): Promise<void> {
  await apiFetch(`/api/v2/ontologies/${ontRid}/objectTypes`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      apiName,
      displayName: apiName,
      primaryKeyApiName: "id",
      primaryKeyType: "STRING",
      properties: {
        id: { type: "STRING" },
        name: { type: "STRING", nullable: true },
        value: { type: "DOUBLE", nullable: true },
      },
      status: "ACTIVE",
    }),
  });
}

// The suite needs a running gateway (bash start.sh). Probe once so an absent
// gateway skips these tests instead of erroring the whole suite in beforeAll.
// A gateway that answers 401 is up but refusing this suite's credentials, and
// that must fail loudly rather than skip: silently skipping is how a broken
// credential path reaches master looking green.
const PROBE = await apiFetch("/api/v2/ontologies")
  .then((res) => res.status)
  .catch(() => 0);
const GATEWAY_UP = PROBE !== 0;

if (!GATEWAY_UP) {
  console.warn(`[skip] gateway unreachable at ${BASE} - integration suite skipped`);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let ontRid: string;

beforeAll(async () => {
  if (!GATEWAY_UP) return;
  if (PROBE === 401 || PROBE === 403) {
    throw new Error(
      `Gateway at ${BASE} rejected this suite's credentials (HTTP ${PROBE}). ` +
        "Set OPENFOUNDRY_TOKEN, or OPENFOUNDRY_CLIENT_ID and " +
        "OPENFOUNDRY_CLIENT_SECRET, in the environment or .env.",
    );
  }
  ontRid = await getOrCreateOntology();
  await ensureObjectType(ontRid, "TestUpsertObj");
});

// ---------------------------------------------------------------------------
// Test 1: Upsert — create + update same object
// ---------------------------------------------------------------------------

describe.skipIf(!GATEWAY_UP)("Upsert behavior", () => {
  it("should create object on first upsert", async () => {
    const res = await apiFetch(
      `/api/v2/ontologies/${ontRid}/objects/TestUpsertObj`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          primaryKey: "UPSERT-001",
          upsert: true,
          properties: { id: "UPSERT-001", name: "Original", value: 100 },
        }),
      },
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.properties.name).toBe("Original");
    expect(data.properties.value).toBe(100);
  });

  it("should update properties on second upsert with same key", async () => {
    const res = await apiFetch(
      `/api/v2/ontologies/${ontRid}/objects/TestUpsertObj`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          primaryKey: "UPSERT-001",
          upsert: true,
          properties: { id: "UPSERT-001", name: "Updated", value: 200 },
        }),
      },
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.properties.name).toBe("Updated");
    expect(data.properties.value).toBe(200);
  });

  it("should not create duplicate when upserting existing key", async () => {
    // Count objects with this type
    const countRes = await apiFetch(
      `/api/v2/ontologies/${ontRid}/objectSets/aggregate`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          objectSet: {
            type: "base",
            objectType: "TestUpsertObj",
          },
          aggregation: [{ type: "count" }],
        }),
      },
    );
    const countData = await countRes.json();
    const count =
      countData.data?.[0]?.value ?? countData.data?.[0]?.metrics?.count ?? 0;
    // Should be exactly 1 (created + updated, not 2)
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Sync with empty result — no crash
// ---------------------------------------------------------------------------

describe.skipIf(!GATEWAY_UP)("Empty sync handling", () => {
  it("should handle loadObjects for non-existent type gracefully", async () => {
    const res = await apiFetch(
      `/api/v2/ontologies/${ontRid}/objectSets/loadObjects`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          objectSet: { type: "base", objectType: "NonExistentType" },
          pageSize: 100,
        }),
      },
    );
    // Should return 404 or empty data, not 500
    expect(res.status).not.toBe(500);
  });

  it("should return empty array for type with no objects", async () => {
    await ensureObjectType(ontRid, "EmptyType");
    const res = await apiFetch(
      `/api/v2/ontologies/${ontRid}/objectSets/loadObjects`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          objectSet: { type: "base", objectType: "EmptyType" },
          pageSize: 100,
        }),
      },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Dashboard API — error returns valid JSON, not 500
// ---------------------------------------------------------------------------

describe.skipIf(!GATEWAY_UP)("Dashboard data availability", () => {
  it("should return ontology list without error", async () => {
    const res = await apiFetch("/api/v2/ontologies");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("should return aggregate count for known object type", async () => {
    const res = await apiFetch(
      `/api/v2/ontologies/${ontRid}/objectSets/aggregate`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          objectSet: { type: "base", objectType: "TestUpsertObj" },
          aggregation: [{ type: "count" }],
        }),
      },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toBeDefined();
    expect(data.data.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Create without upsert should still reject duplicates
// ---------------------------------------------------------------------------

describe.skipIf(!GATEWAY_UP)("Non-upsert duplicate rejection", () => {
  it("should reject duplicate primaryKey without upsert flag", async () => {
    // First create
    await apiFetch(`/api/v2/ontologies/${ontRid}/objects/TestUpsertObj`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        primaryKey: "DUP-001",
        properties: { id: "DUP-001", name: "First" },
      }),
    });

    // Second create with same key (no upsert flag)
    const res = await apiFetch(
      `/api/v2/ontologies/${ontRid}/objects/TestUpsertObj`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          primaryKey: "DUP-001",
          properties: { id: "DUP-001", name: "Duplicate" },
        }),
      },
    );
    // Should return 409 Conflict, not 201
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Full metadata endpoint for LLM schema injection
// ---------------------------------------------------------------------------

describe.skipIf(!GATEWAY_UP)("LLM schema fetching", () => {
  it("should return fullMetadata with object types and properties", async () => {
    const res = await apiFetch(`/api/v2/ontologies/${ontRid}/fullMetadata`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.objectTypes).toBeDefined();
    expect(Array.isArray(data.objectTypes)).toBe(true);
    // Should include our test object type
    const testType = data.objectTypes.find(
      (ot: { apiName: string }) => ot.apiName === "TestUpsertObj",
    );
    expect(testType).toBeDefined();
    expect(testType.properties).toBeDefined();
    expect(testType.properties.id).toBeDefined();
  });
});
