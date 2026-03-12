import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { FunctionStore } from "../src/store/function-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
} as const;

function makeFunction(apiName: string, code = "return args.x + args.y;") {
  return {
    apiName,
    displayName: `${apiName} function`,
    description: `A test function: ${apiName}`,
    code,
    parameters: [
      { name: "x", type: "number", required: true },
      { name: "y", type: "number", required: true },
    ],
    returnType: "number",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let store: FunctionStore;

beforeEach(async () => {
  store = new FunctionStore();
  app = await createServer({ config: TEST_CONFIG, store });
});

// -------------------------------------------------------------------------
// Health
// -------------------------------------------------------------------------

describe("Health endpoints", () => {
  it("GET /status/health returns HEALTHY", async () => {
    const res = await app.inject({ method: "GET", url: "/status/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "HEALTHY" });
  });
});

// -------------------------------------------------------------------------
// Function CRUD
// -------------------------------------------------------------------------

describe("Function CRUD", () => {
  it("POST /api/v2/functions registers a function", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/functions",
      payload: makeFunction("addNumbers"),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.apiName).toBe("addNumbers");
    expect(body.rid).toMatch(/^ri\./);
    expect(body.runtime).toBe("TYPESCRIPT");
    expect(body.status).toBe("ACTIVE");
  });

  it("GET /api/v2/functions lists functions", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/functions",
      payload: makeFunction("fn-a"),
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/functions",
      payload: makeFunction("fn-b"),
    });

    const res = await app.inject({ method: "GET", url: "/api/v2/functions" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("GET /api/v2/functions supports pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: "POST",
        url: "/api/v2/functions",
        payload: makeFunction(`fn-${i}`),
      });
    }

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/functions?pageSize=2",
    });
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.nextPageToken).toBeDefined();
  });

  it("GET /api/v2/functions/:functionRid returns a function", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/functions",
      payload: makeFunction("myFunc"),
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/functions/${rid}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().apiName).toBe("myFunc");
  });

  it("GET /api/v2/functions/:functionRid returns 404 for unknown RID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/functions/ri.functions.main.function.nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("PUT /api/v2/functions/:functionRid updates a function", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/functions",
      payload: makeFunction("updatable"),
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "PUT",
      url: `/api/v2/functions/${rid}`,
      payload: { description: "Updated description", status: "DISABLED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBe("Updated description");
    expect(res.json().status).toBe("DISABLED");
    expect(res.json().version).toBe(2);
  });

  it("DELETE /api/v2/functions/:functionRid deletes a function", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/functions",
      payload: makeFunction("deleteMe"),
    });
    const rid = createRes.json().rid;

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/functions/${rid}`,
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v2/functions/${rid}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("POST /api/v2/functions returns 409 for duplicate apiName", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/functions",
      payload: makeFunction("dupFunc"),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/functions",
      payload: makeFunction("dupFunc"),
    });
    expect(res.statusCode).toBe(409);
  });
});

// -------------------------------------------------------------------------
// Function execution
// -------------------------------------------------------------------------

describe("Function execution", () => {
  it("POST /api/v2/functions/:functionRid/execute runs a function", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/functions",
      payload: makeFunction("adder", "return args.x + args.y;"),
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/functions/${rid}/execute`,
      payload: { args: { x: 3, y: 4 } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.output).toBe(7);
    expect(typeof body.duration).toBe("number");
    expect(Array.isArray(body.logs)).toBe(true);
  });

  it("captures console.log output during execution", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/functions",
      payload: makeFunction(
        "logger",
        'console.log("hello", "world"); return 42;',
      ),
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/functions/${rid}/execute`,
      payload: { args: {} },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.output).toBe(42);
    expect(body.logs).toContain("hello world");
  });

  it("returns error when executing a disabled function", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/functions",
      payload: makeFunction("disabledFn"),
    });
    const rid = createRes.json().rid;

    // Disable it
    await app.inject({
      method: "PUT",
      url: `/api/v2/functions/${rid}`,
      payload: { status: "DISABLED" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/functions/${rid}/execute`,
      payload: { args: {} },
    });
    expect(res.statusCode).toBe(500);
  });

  it("handles function execution errors gracefully", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/functions",
      payload: makeFunction("badFn", 'throw new Error("boom");'),
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/functions/${rid}/execute`,
      payload: { args: {} },
    });
    expect(res.statusCode).toBe(500);
  });

  it("executes function with no args provided", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/functions",
      payload: makeFunction("noArgs", "return 99;"),
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/functions/${rid}/execute`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().output).toBe(99);
  });
});
