import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

describe("End-to-end: Ontology → Objects → Actions", () => {
  let ontologyApp: FastifyInstance;
  let objectsApp: FastifyInstance;
  let actionsApp: FastifyInstance;
  let ontologyRid: string;

  beforeAll(async () => {
    const { createServer: createOntologyServer } = await import(
      "../../services/svc-ontology/src/server.js"
    );
    const { createServer: createObjectsServer } = await import(
      "../../services/svc-objects/src/server.js"
    );
    const { createServer: createActionsServer } = await import(
      "../../services/svc-actions/src/server.js"
    );

    ontologyApp = await createOntologyServer();
    objectsApp = await createObjectsServer();
    actionsApp = await createActionsServer();
  });

  afterAll(async () => {
    await ontologyApp?.close();
    await objectsApp?.close();
    await actionsApp?.close();
  });

  it("creates an ontology with object types", async () => {
    const createRes = await ontologyApp.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      headers: { "content-type": "application/json" },
      payload: { apiName: "test-ontology", displayName: "Test", description: "Test ontology" },
    });
    expect(createRes.statusCode).toBe(201);
    ontologyRid = createRes.json().rid;

    const typeRes = await ontologyApp.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      headers: { "content-type": "application/json" },
      payload: {
        apiName: "Employee",
        displayName: "Employee",
        primaryKey: "id",
        properties: {
          id: { apiName: "id", displayName: "ID", dataType: "STRING" },
          name: { apiName: "name", displayName: "Name", dataType: "STRING" },
        },
      },
    });
    expect(typeRes.statusCode).toBe(201);
  });

  it("lists the created object types", async () => {
    const res = await ontologyApp.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
    expect(res.json().data[0].apiName).toBe("Employee");
  });

  it("creates and lists objects", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await objectsApp.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ontologyRid}/objects/Employee`,
        headers: { "content-type": "application/json" },
        payload: { primaryKey: `emp-${i}`, properties: { id: `emp-${i}`, name: `Employee ${i}` } },
      });
      expect(res.statusCode).toBe(201);
    }

    const listRes = await objectsApp.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objects/Employee`,
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.length).toBe(5);
  });

  it("queries objects using ObjectSet filters", async () => {
    const res = await objectsApp.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectSets/loadObjects`,
      headers: { "content-type": "application/json" },
      payload: {
        objectSet: {
          type: "FILTER",
          objectSet: { type: "BASE", objectType: "Employee" },
          filter: { type: "CONTAINS", property: "name", value: "Employee 3" },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
    expect(res.json().data[0].properties.name).toBe("Employee 3");
  });

  it("aggregates objects", async () => {
    const res = await objectsApp.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectSets/aggregate`,
      headers: { "content-type": "application/json" },
      payload: {
        objectSet: { type: "BASE", objectType: "Employee" },
        aggregation: [{ type: "COUNT" }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].value).toBe(5);
  });

  it("returns 404 for unregistered action", async () => {
    const res = await actionsApp.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/actions/nonexistent/apply`,
      headers: { "content-type": "application/json" },
      payload: { parameters: {} },
    });
    expect(res.statusCode).toBe(404);
  });
});
