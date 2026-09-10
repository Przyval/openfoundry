/**
 * The `/api/v1` action surface, checked against the v1 models in
 * `foundry_sdk/v1/ontologies/models.py`.
 *
 * None of the three response models survives an alias. v1
 * `ApplyActionResponse` and `BatchApplyActionResponse` declare no fields at
 * all, and `ValidateActionResponse` is a per-parameter evaluation — where the
 * v2 routes answer with OpenFoundry's own `{ rid, status }`, `{ results }` and
 * `{ valid, errors }`.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { PropertyType } from "@openfoundry/ontology-schema";
import { createServer } from "../src/server.js";
import { ActionRegistry, type RegisteredAction } from "../src/store/action-registry.js";
import { ActionLog } from "../src/store/action-log.js";

const ONTOLOGY_RID = "ri.ontology.main.ontology.test";
const BASE = `/api/v1/ontologies/${ONTOLOGY_RID}/actions/create-employee`;

let app: FastifyInstance;
let registry: ActionRegistry;
let actionLog: ActionLog;
let applied: Array<Record<string, unknown>>;

/** Asserts that an object carries exactly these keys — no more, no fewer. */
function expectExactKeys(value: unknown, keys: string[]): void {
  expect(Object.keys(value as object).sort()).toEqual([...keys].sort());
}

function testAction(): RegisteredAction {
  return {
    apiName: "create-employee",
    displayName: "Create Employee",
    parameters: new Map([
      ["firstName", { type: PropertyType.STRING, required: true }],
      ["age", { type: PropertyType.INTEGER, required: false }],
    ]),
    modifiedEntities: { Employee: { created: true, modified: false } },
    status: "ACTIVE",
    handler: async (parameters) => {
      applied.push(parameters);
      return { result: { created: true } };
    },
  };
}

beforeEach(async () => {
  applied = [];
  registry = new ActionRegistry();
  actionLog = new ActionLog();
  registry.registerAction(testAction());
  app = await createServer({
    config: {
      port: 0,
      host: "127.0.0.1",
      logLevel: "silent",
      nodeEnv: "test",
    } as never,
    registry,
    actionLog,
    seedDemoActions: false,
  });
});

describe("v1 apply", () => {
  it("answers an empty ApplyActionResponse and runs the action", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/apply`,
      payload: { parameters: { firstName: "Ada" } },
    });

    expect(res.statusCode).toBe(200);
    // `ApplyActionResponse` declares no fields; the v2 route answers with an
    // execution rid and status, which a v1 client would read as edits.
    expect(res.json()).toEqual({});
    expect(applied).toEqual([{ firstName: "Ada" }]);
  });

  it("refuses parameters that do not validate rather than logging a failure", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/apply`,
      payload: { parameters: { age: 30 } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().errorName).toBe("ActionValidationFailed");
    expect(res.json().parameters).toMatchObject({ actionType: "create-employee" });
    expect(applied).toEqual([]);
  });

  it("reports an unknown action", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/ontologies/${ONTOLOGY_RID}/actions/absent/apply`,
      payload: { parameters: {} },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("v1 applyBatch", () => {
  it("answers an empty BatchApplyActionResponse and runs every request", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/applyBatch`,
      payload: {
        requests: [
          { parameters: { firstName: "Ada" } },
          { parameters: { firstName: "Grace" } },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({});
    expect(applied).toEqual([{ firstName: "Ada" }, { firstName: "Grace" }]);
  });

  it("applies nothing when any request in the batch is invalid", async () => {
    // The response carries no per-request result, so a partially applied batch
    // would report success the caller has no way to inspect.
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/applyBatch`,
      payload: {
        requests: [{ parameters: { firstName: "Ada" } }, { parameters: {} }],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(applied).toEqual([]);
  });
});

describe("v1 validate", () => {
  it("answers a ValidateActionResponse evaluating every declared parameter", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/validate`,
      payload: { parameters: { firstName: "Ada" } },
    });

    expect(res.statusCode).toBe(200);
    expectExactKeys(res.json(), ["result", "submissionCriteria", "parameters"]);
    expect(res.json()).toEqual({
      result: "VALID",
      submissionCriteria: [],
      parameters: {
        firstName: { result: "VALID", evaluatedConstraints: [], required: true },
        age: { result: "VALID", evaluatedConstraints: [], required: false },
      },
    });
    // The v2 route answers `{ valid, errors }`, which shares no field name.
    expect(res.json()).not.toHaveProperty("valid");
  });

  it("marks the offending parameter INVALID rather than listing error strings", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/validate`,
      payload: { parameters: { firstName: "Ada", age: "thirty" } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBe("INVALID");
    expect(res.json().parameters.age.result).toBe("INVALID");
    expect(res.json().parameters.firstName.result).toBe("VALID");
  });

  it("marks a missing required parameter INVALID", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/validate`,
      payload: { parameters: {} },
    });

    expect(res.json().result).toBe("INVALID");
    expect(res.json().parameters.firstName.result).toBe("INVALID");
  });
});
