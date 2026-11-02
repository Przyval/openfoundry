/**
 * A pipeline reads its source objects from one ontology.
 *
 * An object type's API name is unique only within one ontology, so two
 * ontologies may each declare an `Employee`. A pipeline names the ontology it
 * reads from; one defined before that field existed reads from the single
 * ontology that declares its source type, and fails when that is not exactly
 * one, rather than silently reading no rows.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { createServer as CreateServer } from "../src/server.js";
import { PipelineStore } from "../src/store/pipeline-store.js";

const ALPHA = "ri.ontology.main.ontology.alpha";
const BETA = "ri.ontology.main.ontology.beta";

/** object types each ontology declares, and the objects stored under them */
const ONTOLOGIES: Record<string, Record<string, Array<{ primaryKey: string; name: string }>>> = {
  [ALPHA]: {
    Employee: [{ primaryKey: "emp-1", name: "Alpha Ann" }],
    Office: [{ primaryKey: "hq", name: "Alpha HQ" }],
  },
  [BETA]: {
    Employee: [
      { primaryKey: "emp-1", name: "Beta Bob" },
      { primaryKey: "emp-2", name: "Beta Bea" },
    ],
  },
};

const TEST_CONFIG = { port: 0, host: "127.0.0.1", logLevel: "silent", nodeEnv: "test" } as const;

let upstream: FastifyInstance;
let createServer: typeof CreateServer;
let app: FastifyInstance;

beforeAll(async () => {
  upstream = Fastify();
  upstream.get("/api/v2/ontologies", async () => ({
    data: Object.keys(ONTOLOGIES).map((rid) => ({ rid })),
  }));
  upstream.get<{ Params: { ontologyRid: string; objectType: string } }>(
    "/api/v2/ontologies/:ontologyRid/objectTypes/:objectType",
    async (request, reply) => {
      const { ontologyRid, objectType } = request.params;
      if (!ONTOLOGIES[ontologyRid]?.[objectType]) return reply.status(404).send({});
      return { apiName: objectType };
    },
  );
  upstream.get<{ Params: { ontologyRid: string; objectType: string } }>(
    "/api/v2/ontologies/:ontologyRid/objects/:objectType",
    async (request, reply) => {
      const { ontologyRid, objectType } = request.params;
      const objects = ONTOLOGIES[ontologyRid]?.[objectType];
      if (!objects) return reply.status(404).send({});
      return {
        data: objects.map(({ primaryKey, name }) => ({
          rid: `${ontologyRid}/${primaryKey}`,
          objectType,
          primaryKey,
          properties: { name },
        })),
      };
    },
  );
  const url = await upstream.listen({ port: 0, host: "127.0.0.1" });
  process.env.ONTOLOGY_SERVICE_URL = url;
  process.env.OBJECTS_SERVICE_URL = url;
  ({ createServer } = await import("../src/server.js"));
});

afterAll(async () => {
  await upstream.close();
  delete process.env.ONTOLOGY_SERVICE_URL;
  delete process.env.OBJECTS_SERVICE_URL;
});

beforeEach(async () => {
  app = await createServer({ config: TEST_CONFIG, pipelineStore: new PipelineStore() });
});

afterEach(async () => {
  await app.close();
});

async function execute(source: string, ontologyRid?: string) {
  const created = await app.inject({
    method: "POST",
    url: "/api/v2/pipelines",
    payload: {
      name: `read ${source} ${ontologyRid ?? "unscoped"}`,
      inputDatasets: [source],
      ontologyRid,
      outputDataset: "out",
      steps: [
        {
          id: "sort",
          name: "Sort",
          type: "SORT",
          config: { fields: [{ field: "name", direction: "asc" }] },
        },
      ],
    },
  });
  expect(created.statusCode).toBe(201);
  expect(created.json().ontologyRid).toBe(ontologyRid);
  return app.inject({
    method: "POST",
    url: `/api/v2/pipelines/${created.json().rid}/execute`,
  });
}

describe("Pipeline source objects", () => {
  it("reads rows from the ontology the pipeline names", async () => {
    for (const [ontologyRid, names] of [
      [ALPHA, ["Alpha Ann"]],
      [BETA, ["Beta Bea", "Beta Bob"]],
    ] as const) {
      const res = await execute("Employee", ontologyRid);
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("SUCCEEDED");
      expect(res.json().resultData).toEqual(names.map((name) => ({ name })));
    }
  });

  it("reads from the single ontology that declares the type when the pipeline names none", async () => {
    const res = await execute("Office");
    expect(res.statusCode).toBe(200);
    expect(res.json().resultData).toEqual([{ name: "Alpha HQ" }]);
  });

  it("fails the run when several ontologies declare the type and the pipeline names none", async () => {
    const res = await execute("Employee");
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ status: "FAILED", resultData: [] });
    expect(res.json().error).toBe(
      `Failed to fetch source data: Object type Employee is declared by 2 ontologies ` +
        `(${ALPHA}, ${BETA}); set the pipeline's ontologyRid`,
    );
  });

  it("fails the run when no ontology declares the type", async () => {
    const res = await execute("Badge");
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      status: "FAILED",
      error: "Failed to fetch source data: No ontology declares object type Badge",
    });
  });
});
