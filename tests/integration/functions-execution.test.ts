import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

describe("Functions execution: register, execute, error handling, lifecycle", () => {
  let functionsApp: FastifyInstance;
  let simpleFnRid: string;
  let paramsFnRid: string;
  let throwingFnRid: string;

  beforeAll(async () => {
    const { createServer: createFunctionsServer } = await import(
      "../../services/svc-functions/src/server.js"
    );
    functionsApp = await createFunctionsServer();
  });

  afterAll(async () => {
    await functionsApp?.close();
  });

  it("registers a simple function", async () => {
    const res = await functionsApp.inject({
      method: "POST",
      url: "/api/v2/functions",
      headers: { "content-type": "application/json" },
      payload: {
        apiName: "addNumbers",
        displayName: "Add Numbers",
        description: "Adds two numbers together",
        code: "return 2 + 3;",
        parameters: [],
        returnType: "INTEGER",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.rid).toBeDefined();
    expect(body.apiName).toBe("addNumbers");
    simpleFnRid = body.rid;
  });

  it("executes the simple function and verifies the result", async () => {
    const res = await functionsApp.inject({
      method: "POST",
      url: `/api/v2/functions/${simpleFnRid}/execute`,
      headers: { "content-type": "application/json" },
      payload: { args: {} },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.output).toBe(5);
    expect(body.duration).toBeGreaterThanOrEqual(0);
  });

  it("registers a function that accesses parameters", async () => {
    const res = await functionsApp.inject({
      method: "POST",
      url: "/api/v2/functions",
      headers: { "content-type": "application/json" },
      payload: {
        apiName: "greet",
        displayName: "Greet",
        description: "Returns a greeting",
        code: 'return "Hello, " + args.name + "!";',
        parameters: [
          { name: "name", type: "STRING", description: "Person to greet", required: true },
        ],
        returnType: "STRING",
      },
    });
    expect(res.statusCode).toBe(201);
    paramsFnRid = res.json().rid;
  });

  it("executes the parameterized function with arguments", async () => {
    const res = await functionsApp.inject({
      method: "POST",
      url: `/api/v2/functions/${paramsFnRid}/execute`,
      headers: { "content-type": "application/json" },
      payload: { args: { name: "World" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().output).toBe("Hello, World!");
  });

  it("registers and executes a function that captures console output", async () => {
    const logRes = await functionsApp.inject({
      method: "POST",
      url: "/api/v2/functions",
      headers: { "content-type": "application/json" },
      payload: {
        apiName: "withLogs",
        displayName: "With Logs",
        description: "A function that logs",
        code: 'console.log("step 1"); console.log("step 2"); return 42;',
        parameters: [],
      },
    });
    expect(logRes.statusCode).toBe(201);
    const logFnRid = logRes.json().rid;

    const execRes = await functionsApp.inject({
      method: "POST",
      url: `/api/v2/functions/${logFnRid}/execute`,
      headers: { "content-type": "application/json" },
      payload: { args: {} },
    });
    expect(execRes.statusCode).toBe(200);
    const body = execRes.json();
    expect(body.output).toBe(42);
    expect(body.logs).toContain("step 1");
    expect(body.logs).toContain("step 2");
  });

  it("handles a function that throws an error", async () => {
    const res = await functionsApp.inject({
      method: "POST",
      url: "/api/v2/functions",
      headers: { "content-type": "application/json" },
      payload: {
        apiName: "throwError",
        displayName: "Throw Error",
        description: "A function that throws",
        code: 'throw new Error("intentional failure");',
        parameters: [],
      },
    });
    expect(res.statusCode).toBe(201);
    throwingFnRid = res.json().rid;

    const execRes = await functionsApp.inject({
      method: "POST",
      url: `/api/v2/functions/${throwingFnRid}/execute`,
      headers: { "content-type": "application/json" },
      payload: { args: {} },
    });
    // The execution should fail with a 500 or the error should be in the response
    expect(execRes.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("lists all registered functions", async () => {
    const res = await functionsApp.inject({
      method: "GET",
      url: "/api/v2/functions",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(4);
    const apiNames = body.data.map((f: { apiName: string }) => f.apiName);
    expect(apiNames).toContain("addNumbers");
    expect(apiNames).toContain("greet");
    expect(apiNames).toContain("throwError");
  });

  it("deletes a function", async () => {
    const res = await functionsApp.inject({
      method: "DELETE",
      url: `/api/v2/functions/${throwingFnRid}`,
    });
    expect(res.statusCode).toBe(204);

    // Verify it is gone
    const getRes = await functionsApp.inject({
      method: "GET",
      url: `/api/v2/functions/${throwingFnRid}`,
    });
    expect(getRes.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("updates a function and re-executes it", async () => {
    const updateRes = await functionsApp.inject({
      method: "PUT",
      url: `/api/v2/functions/${simpleFnRid}`,
      headers: { "content-type": "application/json" },
      payload: {
        displayName: "Add Numbers (v2)",
        description: "Adds two larger numbers",
        code: "return 10 + 20;",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().displayName).toBe("Add Numbers (v2)");

    const execRes = await functionsApp.inject({
      method: "POST",
      url: `/api/v2/functions/${simpleFnRid}/execute`,
      headers: { "content-type": "application/json" },
      payload: { args: {} },
    });
    expect(execRes.statusCode).toBe(200);
    expect(execRes.json().output).toBe(30);
  });
});
