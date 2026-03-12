import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

describe("Compass navigation: spaces, projects, folders, hierarchy", () => {
  let compassApp: FastifyInstance;
  let spaceRid: string;
  let project1Rid: string;
  let project2Rid: string;
  let folder1Rid: string;
  let folder2Rid: string;

  beforeAll(async () => {
    const { createServer: createCompassServer } = await import(
      "../../services/svc-compass/src/server.js"
    );
    compassApp = await createCompassServer();
  });

  afterAll(async () => {
    await compassApp?.close();
  });

  it("creates a SPACE", async () => {
    const res = await compassApp.inject({
      method: "POST",
      url: "/api/v2/compass/resources",
      headers: { "content-type": "application/json" },
      payload: {
        name: "Engineering",
        type: "SPACE",
        description: "Engineering team space",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.rid).toBeDefined();
    expect(body.name).toBe("Engineering");
    expect(body.type).toBe("SPACE");
    spaceRid = body.rid;
  });

  it("creates PROJECTs inside the space", async () => {
    const res1 = await compassApp.inject({
      method: "POST",
      url: "/api/v2/compass/resources",
      headers: { "content-type": "application/json" },
      payload: {
        name: "Backend",
        type: "PROJECT",
        parentRid: spaceRid,
        description: "Backend services project",
      },
    });
    expect(res1.statusCode).toBe(201);
    project1Rid = res1.json().rid;

    const res2 = await compassApp.inject({
      method: "POST",
      url: "/api/v2/compass/resources",
      headers: { "content-type": "application/json" },
      payload: {
        name: "Frontend",
        type: "PROJECT",
        parentRid: spaceRid,
        description: "Frontend project",
      },
    });
    expect(res2.statusCode).toBe(201);
    project2Rid = res2.json().rid;
  });

  it("creates FOLDERs inside a project", async () => {
    const res1 = await compassApp.inject({
      method: "POST",
      url: "/api/v2/compass/resources",
      headers: { "content-type": "application/json" },
      payload: {
        name: "API Gateway",
        type: "FOLDER",
        parentRid: project1Rid,
      },
    });
    expect(res1.statusCode).toBe(201);
    folder1Rid = res1.json().rid;

    const res2 = await compassApp.inject({
      method: "POST",
      url: "/api/v2/compass/resources",
      headers: { "content-type": "application/json" },
      payload: {
        name: "Auth Service",
        type: "FOLDER",
        parentRid: project1Rid,
      },
    });
    expect(res2.statusCode).toBe(201);
    folder2Rid = res2.json().rid;
  });

  it("lists children of a resource", async () => {
    // Children of the space should include both projects
    const spaceChildren = await compassApp.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${spaceRid}/children`,
    });
    expect(spaceChildren.statusCode).toBe(200);
    const spaceData = spaceChildren.json().data;
    expect(spaceData.length).toBe(2);
    const projectNames = spaceData.map((c: { name: string }) => c.name).sort();
    expect(projectNames).toEqual(["Backend", "Frontend"]);

    // Children of project1 should include both folders
    const projectChildren = await compassApp.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${project1Rid}/children`,
    });
    expect(projectChildren.statusCode).toBe(200);
    expect(projectChildren.json().data.length).toBe(2);
  });

  it("retrieves path/breadcrumbs for a resource", async () => {
    const res = await compassApp.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${folder1Rid}/path`,
    });
    expect(res.statusCode).toBe(200);
    const path = res.json().data;
    // Path should contain: space -> project -> folder
    expect(path.length).toBeGreaterThanOrEqual(2);
    const names = path.map((p: { name: string }) => p.name);
    expect(names).toContain("Engineering");
    expect(names).toContain("Backend");
  });

  it("moves a folder to a different project", async () => {
    const res = await compassApp.inject({
      method: "POST",
      url: `/api/v2/compass/resources/${folder1Rid}/move`,
      headers: { "content-type": "application/json" },
      payload: { newParentRid: project2Rid },
    });
    expect(res.statusCode).toBe(200);

    // Verify folder1 is now under project2
    const project2Children = await compassApp.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${project2Rid}/children`,
    });
    expect(project2Children.statusCode).toBe(200);
    const childRids = project2Children.json().data.map(
      (c: { rid: string }) => c.rid,
    );
    expect(childRids).toContain(folder1Rid);

    // Verify folder1 is no longer under project1
    const project1Children = await compassApp.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${project1Rid}/children`,
    });
    expect(project1Children.json().data.length).toBe(1);
  });

  it("searches for resources by name", async () => {
    const res = await compassApp.inject({
      method: "GET",
      url: "/api/v2/compass/search?q=Backend",
    });
    expect(res.statusCode).toBe(200);
    const results = res.json().data;
    expect(results.length).toBeGreaterThanOrEqual(1);
    const found = results.find(
      (r: { name: string }) => r.name === "Backend",
    );
    expect(found).toBeDefined();
  });

  it("updates a resource name and description", async () => {
    const res = await compassApp.inject({
      method: "PUT",
      url: `/api/v2/compass/resources/${folder2Rid}`,
      headers: { "content-type": "application/json" },
      payload: {
        name: "Authentication Service",
        description: "Handles auth and tokens",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Authentication Service");

    // Verify via GET
    const getRes = await compassApp.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${folder2Rid}`,
    });
    expect(getRes.json().name).toBe("Authentication Service");
    expect(getRes.json().description).toBe("Handles auth and tokens");
  });

  it("deletes resources recursively", async () => {
    // Delete the space recursively (should remove all children)
    const res = await compassApp.inject({
      method: "DELETE",
      url: `/api/v2/compass/resources/${spaceRid}?recursive=true`,
    });
    expect(res.statusCode).toBe(204);

    // Verify root resources no longer include the space
    const listRes = await compassApp.inject({
      method: "GET",
      url: "/api/v2/compass/resources",
    });
    expect(listRes.statusCode).toBe(200);
    const found = listRes.json().data.find(
      (r: { rid: string }) => r.rid === spaceRid,
    );
    expect(found).toBeUndefined();
  });
});
