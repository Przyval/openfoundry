import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PropertyType } from "@openfoundry/ontology-schema";
import { createServer } from "../src/server.js";
import { ActionRegistry, type RegisteredAction } from "../src/store/action-registry.js";
import { ActionLog } from "../src/store/action-log.js";
import type { FastifyInstance } from "fastify";
import { setEnforcePermissions } from "@openfoundry/permissions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
};

/** Headers that grant full ADMIN access. */
const ADMIN_HEADERS = {
  "x-user-id": "test-admin",
  "x-user-roles": "ADMIN",
};

/** Headers that grant read-only VIEWER access. */
const VIEWER_HEADERS = {
  "x-user-id": "test-viewer",
  "x-user-roles": "VIEWER",
};

const ONTOLOGY_RID = "ri.ontology.main.ontology.test-ontology";

function createTestAction(overrides: Partial<RegisteredAction> = {}): RegisteredAction {
  return {
    apiName: "create-employee",
    displayName: "Create Employee",
    parameters: new Map([
      ["firstName", { type: PropertyType.STRING, required: true, description: "First name" }],
      ["lastName", { type: PropertyType.STRING, required: true, description: "Last name" }],
      ["age", { type: PropertyType.INTEGER, required: false, description: "Age" }],
      ["active", { type: PropertyType.BOOLEAN, required: false }],
      ["startDate", { type: PropertyType.TIMESTAMP, required: false }],
    ]),
    modifiedEntities: { Employee: { created: true, modified: false } },
    status: "ACTIVE",
    ...overrides,
  };
}

let app: FastifyInstance;
let registry: ActionRegistry;
let actionLog: ActionLog;

async function buildApp(): Promise<FastifyInstance> {
  registry = new ActionRegistry();
  actionLog = new ActionLog();
  app = await createServer({
    config: TEST_CONFIG,
    registry,
    actionLog,
  });
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Actions Service", () => {
  beforeEach(async () => {
    await buildApp();
  });

  // -----------------------------------------------------------------------
  // Health endpoints
  // -----------------------------------------------------------------------

  describe("Health endpoints", () => {
    it("GET /status/health returns HEALTHY", async () => {
      const res = await app.inject({ method: "GET", url: "/status/health" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "HEALTHY" });
    });

    it("GET /status/liveness returns HEALTHY", async () => {
      const res = await app.inject({ method: "GET", url: "/status/liveness" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "HEALTHY" });
    });

    it("GET /status/readiness returns HEALTHY", async () => {
      const res = await app.inject({ method: "GET", url: "/status/readiness" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "HEALTHY" });
    });
  });

  // -----------------------------------------------------------------------
  // Action registration
  // -----------------------------------------------------------------------

  describe("Action registration", () => {
    it("registers and retrieves an action type", () => {
      const action = createTestAction();
      registry.registerAction(action);
      expect(registry.getAction("create-employee")).toBe(action);
    });

    it("lists all registered actions", () => {
      registry.registerAction(createTestAction({ apiName: "action-a", displayName: "A" }));
      registry.registerAction(createTestAction({ apiName: "action-b", displayName: "B" }));
      expect(registry.listActions()).toHaveLength(2);
    });

    it("sets a handler on an existing action", () => {
      const action = createTestAction();
      registry.registerAction(action);
      const handler = async () => ({ result: { ok: true } });
      const success = registry.setHandler("create-employee", handler);
      expect(success).toBe(true);
      expect(registry.getAction("create-employee")?.handler).toBe(handler);
    });

    it("returns false when setting handler on non-existent action", () => {
      const handler = async () => ({});
      expect(registry.setHandler("nope", handler)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Apply action
  // -----------------------------------------------------------------------

  describe("POST .../apply", () => {
    it("applies an action successfully with no handler (default success)", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`,
        payload: { parameters: { firstName: "Alice", lastName: "Smith" } },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("SUCCEEDED");
      expect(body.rid).toBeDefined();
    });

    it("applies an action with a custom handler", async () => {
      const action = createTestAction();
      action.handler = async (params) => ({
        result: { employeeId: `emp-${params.firstName}` },
      });
      registry.registerAction(action);

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`,
        payload: { parameters: { firstName: "Bob", lastName: "Jones" } },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("SUCCEEDED");
      expect(body.result).toEqual({ employeeId: "emp-Bob" });
    });

    it("returns 404 for non-existent action", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/no-such-action/apply`,
        payload: { parameters: {} },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.errorCode).toBe("NOT_FOUND");
    });

    it("returns 400 when required parameter is missing", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`,
        payload: { parameters: { firstName: "Alice" } },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.errorCode).toBe("INVALID_ARGUMENT");
      expect(body.parameters.validationErrors).toHaveLength(1);
      expect(body.parameters.validationErrors[0].parameter).toBe("lastName");
      expect(body.parameters.validationErrors[0].code).toBe("REQUIRED_PARAMETER_MISSING");
    });

    it("returns 400 when parameter has wrong type (integer expected)", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`,
        payload: {
          parameters: { firstName: "Alice", lastName: "Smith", age: "not-a-number" },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      const errors = body.parameters.validationErrors;
      expect(errors).toHaveLength(1);
      expect(errors[0].parameter).toBe("age");
      expect(errors[0].code).toBe("INVALID_PARAMETER_TYPE");
    });

    it("returns 400 when unknown parameter is supplied", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`,
        payload: {
          parameters: { firstName: "Alice", lastName: "Smith", unknownField: "x" },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      const errors = body.parameters.validationErrors;
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("UNKNOWN_PARAMETER");
    });

    it("returns 500 when handler throws", async () => {
      const action = createTestAction();
      action.handler = async () => {
        throw new Error("Handler exploded");
      };
      registry.registerAction(action);

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`,
        payload: { parameters: { firstName: "Alice", lastName: "Smith" } },
      });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.errorName).toBe("ActionExecutionFailed");
    });
  });

  // -----------------------------------------------------------------------
  // Validate endpoint
  // -----------------------------------------------------------------------

  describe("POST .../validate", () => {
    it("returns valid: true for correct parameters", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/validate`,
        payload: { parameters: { firstName: "Alice", lastName: "Smith" } },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ valid: true });
    });

    it("returns valid: false with errors for invalid parameters", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/validate`,
        payload: { parameters: {} },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.valid).toBe(false);
      expect(body.errors).toHaveLength(2); // firstName and lastName both required
    });

    it("returns 404 for non-existent action", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/nonexistent/validate`,
        payload: { parameters: {} },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Batch apply
  // -----------------------------------------------------------------------

  describe("POST .../applyBatch", () => {
    it("batch applies multiple actions successfully", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/applyBatch`,
        payload: {
          requests: [
            { parameters: { firstName: "Alice", lastName: "Smith" } },
            { parameters: { firstName: "Bob", lastName: "Jones" } },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toHaveLength(2);
      expect(body.results[0].status).toBe("SUCCEEDED");
      expect(body.results[1].status).toBe("SUCCEEDED");
    });

    it("handles partial failure in batch", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/applyBatch`,
        payload: {
          requests: [
            { parameters: { firstName: "Alice", lastName: "Smith" } },
            { parameters: { firstName: "Bob" } }, // missing lastName
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toHaveLength(2);
      expect(body.results[0].status).toBe("SUCCEEDED");
      expect(body.results[1].status).toBe("FAILED");
      expect(body.results[1].error).toContain("lastName");
    });

    it("returns 404 for non-existent action", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/nonexistent/applyBatch`,
        payload: { requests: [{ parameters: {} }] },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Execution log
  // -----------------------------------------------------------------------

  describe("Execution log", () => {
    it("lists executions for an action", async () => {
      registry.registerAction(createTestAction());

      // Create some executions
      await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`,
        payload: { parameters: { firstName: "A", lastName: "B" } },
      });
      await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`,
        payload: { parameters: { firstName: "C", lastName: "D" } },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/executions`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data[0].actionApiName).toBe("create-employee");
    });

    it("gets a single execution by RID", async () => {
      registry.registerAction(createTestAction());

      const applyRes = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`,
        payload: { parameters: { firstName: "Alice", lastName: "Smith" } },
      });

      const { rid } = applyRes.json();

      const res = await app.inject({
        method: "GET",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/executions/${rid}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.rid).toBe(rid);
      expect(body.status).toBe("SUCCEEDED");
      expect(body.parameters).toEqual({ firstName: "Alice", lastName: "Smith" });
    });

    it("returns 404 for non-existent execution RID", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "GET",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/executions/ri.actions.main.execution.nonexistent`,
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for executions of non-existent action", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/no-such/executions`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Parameter type validation
  // -----------------------------------------------------------------------

  describe("Parameter type validation", () => {
    it("validates string type correctly", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/validate`,
        payload: { parameters: { firstName: 123, lastName: "Smith" } },
      });

      const body = res.json();
      expect(body.valid).toBe(false);
      expect(body.errors[0].parameter).toBe("firstName");
      expect(body.errors[0].code).toBe("INVALID_PARAMETER_TYPE");
    });

    it("validates integer type correctly", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/validate`,
        payload: {
          parameters: { firstName: "Alice", lastName: "Smith", age: 3.14 },
        },
      });

      const body = res.json();
      expect(body.valid).toBe(false);
      expect(body.errors[0].parameter).toBe("age");
    });

    it("validates boolean type correctly", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/validate`,
        payload: {
          parameters: { firstName: "Alice", lastName: "Smith", active: "yes" },
        },
      });

      const body = res.json();
      expect(body.valid).toBe(false);
      expect(body.errors[0].parameter).toBe("active");
    });

    it("validates timestamp type correctly", async () => {
      registry.registerAction(createTestAction());

      // Valid timestamp
      const validRes = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/validate`,
        payload: {
          parameters: {
            firstName: "Alice",
            lastName: "Smith",
            startDate: "2024-01-15T10:30:00Z",
          },
        },
      });
      expect(validRes.json().valid).toBe(true);

      // Invalid timestamp
      const invalidRes = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/validate`,
        payload: {
          parameters: {
            firstName: "Alice",
            lastName: "Smith",
            startDate: "not-a-timestamp",
          },
        },
      });
      expect(invalidRes.json().valid).toBe(false);
    });

    it("accepts valid optional parameters", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/validate`,
        payload: {
          parameters: {
            firstName: "Alice",
            lastName: "Smith",
            age: 30,
            active: true,
            startDate: "2024-06-01T09:00:00Z",
          },
        },
      });

      expect(res.json().valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Custom handler invocation
  // -----------------------------------------------------------------------

  describe("Custom handler", () => {
    it("receives correct params and context", async () => {
      let capturedParams: Record<string, unknown> | undefined;
      let capturedContext: { ontologyRid: string; actionApiName: string } | undefined;

      const action = createTestAction();
      action.handler = async (params, context) => {
        capturedParams = params;
        capturedContext = context;
        return {};
      };
      registry.registerAction(action);

      await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`,
        payload: { parameters: { firstName: "Alice", lastName: "Smith" } },
      });

      expect(capturedParams).toEqual({ firstName: "Alice", lastName: "Smith" });
      expect(capturedContext).toEqual({
        ontologyRid: ONTOLOGY_RID,
        actionApiName: "create-employee",
      });
    });
  });

  // -----------------------------------------------------------------------
  // Permission enforcement
  // -----------------------------------------------------------------------

  describe("Permission enforcement", () => {
    beforeEach(() => {
      setEnforcePermissions(true);
    });

    afterEach(() => {
      setEnforcePermissions(false);
    });

    it("allows ADMIN to apply an action", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`,
        headers: ADMIN_HEADERS,
        payload: { parameters: { firstName: "Alice", lastName: "Smith" } },
      });
      expect(res.statusCode).toBe(200);
    });

    it("allows VIEWER to validate an action (actions:read)", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/validate`,
        headers: VIEWER_HEADERS,
        payload: { parameters: { firstName: "Alice", lastName: "Smith" } },
      });
      expect(res.statusCode).toBe(200);
    });

    it("denies VIEWER from applying an action (actions:execute required)", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`,
        headers: VIEWER_HEADERS,
        payload: { parameters: { firstName: "Alice", lastName: "Smith" } },
      });
      expect(res.statusCode).toBe(403);
    });

    it("denies requests with no identity when enforcement is enabled", async () => {
      registry.registerAction(createTestAction());

      const res = await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`,
        payload: { parameters: { firstName: "Alice", lastName: "Smith" } },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
