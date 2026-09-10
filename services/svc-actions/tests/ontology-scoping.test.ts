/**
 * Behaviour of `branch`, `scenarioRid` and `transactionId` on action apply.
 *
 * OpenFoundry models no ontology branches, scenarios or transactions, so any
 * value names something that does not exist. Applying the action anyway would
 * tell the caller its edit landed on the branch or scenario it asked for when
 * it landed on the only ontology there is.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { PropertyType } from "@openfoundry/ontology-schema";
import { createServer } from "../src/server.js";
import { ActionRegistry, type RegisteredAction } from "../src/store/action-registry.js";
import { ActionLog } from "../src/store/action-log.js";

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
};

const ONTOLOGY_RID = "ri.ontology.main.ontology.test-ontology";
const APPLY = `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/apply`;
const APPLY_BATCH = `/api/v2/ontologies/${ONTOLOGY_RID}/actions/create-employee/applyBatch`;

let app: FastifyInstance;
let registry: ActionRegistry;
let actionLog: ActionLog;

const testAction = (): RegisteredAction => ({
  apiName: "create-employee",
  displayName: "Create Employee",
  parameters: new Map([
    ["firstName", { type: PropertyType.STRING, required: true, description: "First name" }],
  ]),
  modifiedEntities: { Employee: { created: true, modified: false } },
  status: "ACTIVE",
});

beforeEach(async () => {
  registry = new ActionRegistry();
  actionLog = new ActionLog();
  app = await createServer({
    config: TEST_CONFIG,
    registry,
    actionLog,
    seedDemoActions: false,
  });
  registry.registerAction(testAction());
});

describe("Apply action — ontology scoping", () => {
  it("answers FoundryBranchNotFound naming the branch that was asked for", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${APPLY}?branch=experiment`,
      payload: { parameters: { firstName: "Ada" } },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("FoundryBranchNotFound");
    expect(res.json().parameters.branch).toBe("experiment");
  });

  it("answers OntologyScenarioNotFound for a scenario", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${APPLY}?scenarioRid=ri.scenario.main.scenario.1`,
      payload: { parameters: { firstName: "Ada" } },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("OntologyScenarioNotFound");
  });

  it("answers OntologyTransactionNotFound for a transaction", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${APPLY}?transactionId=txn-1`,
      payload: { parameters: { firstName: "Ada" } },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("OntologyTransactionNotFound");
  });

  it("does not run the action when the scoping is rejected", async () => {
    await app.inject({
      method: "POST",
      url: `${APPLY}?branch=experiment`,
      payload: { parameters: { firstName: "Ada" } },
    });

    expect(actionLog.listExecutions("create-employee").data).toHaveLength(0);
  });

  it("applies normally when nothing is scoped", async () => {
    const res = await app.inject({
      method: "POST",
      url: APPLY,
      payload: { parameters: { firstName: "Ada" } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("SUCCEEDED");
  });
});

describe("Apply batch — ontology scoping", () => {
  it("rejects a branch and a scenario", async () => {
    for (const [query, errorName] of [
      ["branch=experiment", "FoundryBranchNotFound"],
      ["scenarioRid=ri.scenario.main.scenario.1", "OntologyScenarioNotFound"],
    ]) {
      const res = await app.inject({
        method: "POST",
        url: `${APPLY_BATCH}?${query}`,
        payload: { requests: [{ parameters: { firstName: "Ada" } }] },
      });
      expect(res.statusCode, query).toBe(404);
      expect(res.json().errorName, query).toBe(errorName);
    }
  });

  it("applies normally when nothing is scoped", async () => {
    const res = await app.inject({
      method: "POST",
      url: APPLY_BATCH,
      payload: { requests: [{ parameters: { firstName: "Ada" } }] },
    });

    expect(res.statusCode).toBe(200);
  });
});
