/**
 * A monitor reads objects through one ontology.
 *
 * An object type's API name is unique only within one ontology, so two
 * ontologies may each declare an `Employee`. A monitor bound to one ontology
 * sees only that ontology's objects; one that names none uses the single
 * ontology declaring its type, and fails clearly when several or none do
 * rather than reporting "not violated".
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { DataFetcher } from "../src/data-fetcher.js";
import { Scheduler } from "../src/scheduler.js";
import { MonitorStore } from "../src/store/monitor-store.js";
import { ExecutionLog } from "../src/store/execution-log.js";
import { NotificationStore } from "../src/store/notification-store.js";
import { EffectExecutor } from "../src/effects/effect-executor.js";

const ALPHA = "ri.ontology.main.ontology.alpha";
const BETA = "ri.ontology.main.ontology.beta";

type Row = { primaryKey: string; properties: { salary: number } };

/** object types each ontology declares, and the objects stored under them */
const ONTOLOGIES: Record<string, Record<string, Row[]>> = {
  [ALPHA]: {
    Employee: [{ primaryKey: "emp-1", properties: { salary: 10 } }],
    Office: [{ primaryKey: "hq", properties: { salary: 0 } }],
  },
  [BETA]: {
    Employee: [
      { primaryKey: "emp-1", properties: { salary: 90 } },
      { primaryKey: "emp-2", properties: { salary: 20 } },
    ],
  },
};

let upstream: FastifyInstance;
let fetcher: DataFetcher;
let url: string;

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
  const rowsOf = (ontologyRid: string, objectSet: Record<string, unknown>): Row[] => {
    const base = (objectSet.objectSet ?? objectSet) as { objectType: string };
    const rows = ONTOLOGIES[ontologyRid]?.[base.objectType] ?? [];
    const where = objectSet.where as { type: string; value: number } | undefined;
    return where?.type === "LT" ? rows.filter((r) => r.properties.salary < where.value) : rows;
  };
  upstream.post<{ Params: { ontologyRid: string }; Body: { objectSet: Record<string, unknown> } }>(
    "/api/v2/ontologies/:ontologyRid/objectSets/loadObjects",
    async (request) => ({ data: rowsOf(request.params.ontologyRid, request.body.objectSet) }),
  );
  upstream.post<{ Params: { ontologyRid: string }; Body: { objectSet: Record<string, unknown> } }>(
    "/api/v2/ontologies/:ontologyRid/objectSets/aggregate",
    async (request) => ({
      data: [{ value: rowsOf(request.params.ontologyRid, request.body.objectSet).length }],
    }),
  );
  url = await upstream.listen({ port: 0, host: "127.0.0.1" });
  fetcher = new DataFetcher(url, url);
});

afterAll(async () => {
  await upstream.close();
});

const threshold = (ontologyRid?: string, objectType = "Employee") =>
  fetcher.evaluateThreshold({
    objectType,
    ontologyRid,
    property: "salary",
    operator: "lt",
    value: 50,
  });

describe("DataFetcher", () => {
  it("evaluates a threshold against the bound ontology's objects only", async () => {
    expect(await threshold(ALPHA)).toEqual({
      violated: true,
      matchCount: 1,
      objects: [{ primaryKey: "emp-1", properties: { salary: 10 } }],
    });
    expect(await threshold(BETA)).toEqual({
      violated: true,
      matchCount: 1,
      objects: [{ primaryKey: "emp-2", properties: { salary: 20 } }],
    });
  });

  it("counts the bound ontology's objects only", async () => {
    expect(await fetcher.countObjects("Employee", undefined, ALPHA)).toBe(1);
    expect(await fetcher.countObjects("Employee", undefined, BETA)).toBe(2);
  });

  it("uses the single declaring ontology when none is bound", async () => {
    expect((await threshold(undefined, "Office")).matchCount).toBe(1);
    expect(await fetcher.countObjects("Office")).toBe(1);
  });

  it("fails clearly when several ontologies declare the type and none is bound", async () => {
    const message =
      `Object type Employee is declared by 2 ontologies (${ALPHA}, ${BETA}); ` +
      `set the monitor's ontologyRid`;
    await expect(threshold()).rejects.toThrow(message);
    await expect(fetcher.countObjects("Employee")).rejects.toThrow(message);
  });

  it("fails clearly when no ontology declares the type", async () => {
    await expect(threshold(undefined, "Badge")).rejects.toThrow(
      "No ontology declares object type Badge",
    );
    await expect(fetcher.countObjects("Badge")).rejects.toThrow(
      "No ontology declares object type Badge",
    );
  });
});

describe("Scheduled threshold monitors", () => {
  function setup(ontologyRid?: string) {
    const monitorStore = new MonitorStore();
    const executionLog = new ExecutionLog();
    const scheduler = new Scheduler(
      monitorStore,
      executionLog,
      new EffectExecutor(new NotificationStore()),
      { intervalMs: 60_000, objectsServiceUrl: url, ontologyServiceUrl: url },
    );
    const monitor = monitorStore.createMonitor({
      name: "low salary",
      objectType: "Employee",
      ontologyRid,
      trigger: {
        type: "SCHEDULE",
        config: {
          intervalMinutes: 1,
          objectType: "Employee",
          property: "salary",
          operator: "lt",
          threshold: 50,
        },
      },
      effects: [{ type: "LOG", config: { message: "low salary" } }],
    });
    return { scheduler, executionLog, monitor };
  }

  it("fires on the bound ontology's objects", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { scheduler, executionLog, monitor } = setup(BETA);

    await scheduler.tick();

    const [execution] = executionLog.listExecutions(monitor.rid);
    expect(execution).toMatchObject({
      status: "SUCCESS",
      triggerData: { message: "low salary: 1 objects match condition (salary lt 50)" },
    });
  });

  it("records a failed execution when the unbound type is ambiguous", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { scheduler, executionLog, monitor } = setup();

    await scheduler.tick();

    const executions = executionLog.listExecutions(monitor.rid);
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({
      status: "FAILURE",
      error:
        `Object type Employee is declared by 2 ontologies (${ALPHA}, ${BETA}); ` +
        `set the monitor's ontologyRid`,
    });
  });
});
