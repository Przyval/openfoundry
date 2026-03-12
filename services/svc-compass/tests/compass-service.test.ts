import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { CompassStore } from "../src/store/compass-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
} as const;

let app: FastifyInstance;
let store: CompassStore;

beforeEach(async () => {
  store = new CompassStore();
  app = await createServer({ config: TEST_CONFIG, store });
});

// Helper to create a resource via the API
async function createResource(
  payload: { name: string; type: string; parentRid?: string | null; description?: string },
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v2/compass/resources",
    payload,
  });
  return res;
}

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
// Resource CRUD
// -------------------------------------------------------------------------

describe("Resource CRUD", () => {
  it("POST creates a FOLDER resource", async () => {
    const res = await createResource({
      name: "My Folder",
      type: "FOLDER",
      description: "A test folder",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("My Folder");
    expect(body.type).toBe("FOLDER");
    expect(body.description).toBe("A test folder");
    expect(body.rid).toMatch(/^ri\./);
    expect(body.parentRid).toBeNull();
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it("POST creates a PROJECT resource", async () => {
    const res = await createResource({ name: "My Project", type: "PROJECT" });
    expect(res.statusCode).toBe(201);
    expect(res.json().type).toBe("PROJECT");
  });

  it("POST creates a SPACE resource", async () => {
    const res = await createResource({ name: "My Space", type: "SPACE" });
    expect(res.statusCode).toBe(201);
    expect(res.json().type).toBe("SPACE");
  });

  it("GET /api/v2/compass/resources lists root resources", async () => {
    await createResource({ name: "root-a", type: "FOLDER" });
    await createResource({ name: "root-b", type: "PROJECT" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/compass/resources",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("GET /api/v2/compass/resources/:rid returns a specific resource", async () => {
    const createRes = await createResource({
      name: "get-me",
      type: "FOLDER",
      description: "Find me",
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${rid}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("get-me");
    expect(res.json().description).toBe("Find me");
  });

  it("PUT /api/v2/compass/resources/:rid updates a resource", async () => {
    const createRes = await createResource({ name: "old-name", type: "FOLDER" });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "PUT",
      url: `/api/v2/compass/resources/${rid}`,
      payload: { name: "new-name", description: "Updated desc" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("new-name");
    expect(res.json().description).toBe("Updated desc");
  });

  it("DELETE /api/v2/compass/resources/:rid deletes a resource", async () => {
    const createRes = await createResource({ name: "delete-me", type: "FOLDER" });
    const rid = createRes.json().rid;

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/compass/resources/${rid}`,
    });
    expect(deleteRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${rid}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("GET returns 404 for unknown RID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/compass/resources/ri.compass.main.resource.nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST returns 409 for duplicate name under same parent", async () => {
    await createResource({ name: "dup", type: "FOLDER" });
    const res = await createResource({ name: "dup", type: "FOLDER" });
    expect(res.statusCode).toBe(409);
  });

  it("PUT returns 404 for unknown RID", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v2/compass/resources/ri.compass.main.resource.nonexistent",
      payload: { name: "nope" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE returns 404 for unknown RID", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v2/compass/resources/ri.compass.main.resource.nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });
});

// -------------------------------------------------------------------------
// Hierarchical navigation (parent/child)
// -------------------------------------------------------------------------

describe("Hierarchical navigation", () => {
  it("creates a child resource under a parent", async () => {
    const parentRes = await createResource({ name: "parent", type: "FOLDER" });
    const parentRid = parentRes.json().rid;

    const childRes = await createResource({
      name: "child",
      type: "FOLDER",
      parentRid,
    });
    expect(childRes.statusCode).toBe(201);
    expect(childRes.json().parentRid).toBe(parentRid);
  });

  it("lists children of a resource", async () => {
    const parentRes = await createResource({ name: "parent", type: "FOLDER" });
    const parentRid = parentRes.json().rid;

    await createResource({ name: "child-a", type: "FOLDER", parentRid });
    await createResource({ name: "child-b", type: "PROJECT", parentRid });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${parentRid}/children`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("children endpoint returns 404 for unknown parent", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/compass/resources/ri.compass.main.resource.nonexistent/children",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns empty list for resource with no children", async () => {
    const parentRes = await createResource({ name: "empty-parent", type: "FOLDER" });
    const parentRid = parentRes.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${parentRid}/children`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });

  it("cannot create child under nonexistent parent", async () => {
    const res = await createResource({
      name: "orphan",
      type: "FOLDER",
      parentRid: "ri.compass.main.resource.nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("cannot delete parent with children without recursive flag", async () => {
    const parentRes = await createResource({ name: "parent", type: "FOLDER" });
    const parentRid = parentRes.json().rid;
    await createResource({ name: "child", type: "FOLDER", parentRid });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v2/compass/resources/${parentRid}`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("recursive delete removes parent and children", async () => {
    const parentRes = await createResource({ name: "parent", type: "FOLDER" });
    const parentRid = parentRes.json().rid;
    const childRes = await createResource({ name: "child", type: "FOLDER", parentRid });
    const childRid = childRes.json().rid;
    await createResource({ name: "grandchild", type: "FOLDER", parentRid: childRid });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v2/compass/resources/${parentRid}?recursive=true`,
    });
    expect(res.statusCode).toBe(204);

    // Parent, child, and grandchild should all be gone
    const getParent = await app.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${parentRid}`,
    });
    expect(getParent.statusCode).toBe(404);

    const getChild = await app.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${childRid}`,
    });
    expect(getChild.statusCode).toBe(404);
  });
});

// -------------------------------------------------------------------------
// Breadcrumb path resolution
// -------------------------------------------------------------------------

describe("Breadcrumb path resolution", () => {
  it("returns path from root to resource", async () => {
    const spaceRes = await createResource({ name: "Space", type: "SPACE" });
    const spaceRid = spaceRes.json().rid;

    const projectRes = await createResource({
      name: "Project",
      type: "PROJECT",
      parentRid: spaceRid,
    });
    const projectRid = projectRes.json().rid;

    const folderRes = await createResource({
      name: "Folder",
      type: "FOLDER",
      parentRid: projectRid,
    });
    const folderRid = folderRes.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${folderRid}/path`,
    });
    expect(res.statusCode).toBe(200);
    const path = res.json().data;
    expect(path).toHaveLength(3);
    expect(path[0].name).toBe("Space");
    expect(path[1].name).toBe("Project");
    expect(path[2].name).toBe("Folder");
  });

  it("path for root resource has single entry", async () => {
    const rootRes = await createResource({ name: "Root", type: "SPACE" });
    const rootRid = rootRes.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${rootRid}/path`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it("path returns 404 for unknown resource", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/compass/resources/ri.compass.main.resource.nonexistent/path",
    });
    expect(res.statusCode).toBe(404);
  });
});

// -------------------------------------------------------------------------
// Move operations
// -------------------------------------------------------------------------

describe("Move operations", () => {
  it("moves a resource to a new parent", async () => {
    const folderA = await createResource({ name: "Folder A", type: "FOLDER" });
    const folderARid = folderA.json().rid;

    const folderB = await createResource({ name: "Folder B", type: "FOLDER" });
    const folderBRid = folderB.json().rid;

    const child = await createResource({
      name: "Child",
      type: "PROJECT",
      parentRid: folderARid,
    });
    const childRid = child.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/compass/resources/${childRid}/move`,
      payload: { newParentRid: folderBRid },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().parentRid).toBe(folderBRid);

    // Verify old parent has no children
    const oldChildren = await app.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${folderARid}/children`,
    });
    expect(oldChildren.json().data).toHaveLength(0);

    // Verify new parent has the child
    const newChildren = await app.inject({
      method: "GET",
      url: `/api/v2/compass/resources/${folderBRid}/children`,
    });
    expect(newChildren.json().data).toHaveLength(1);
  });

  it("moves a resource to root", async () => {
    const parent = await createResource({ name: "Parent", type: "FOLDER" });
    const parentRid = parent.json().rid;

    const child = await createResource({
      name: "Child",
      type: "PROJECT",
      parentRid,
    });
    const childRid = child.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/compass/resources/${childRid}/move`,
      payload: { newParentRid: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().parentRid).toBeNull();
  });

  it("cannot move a resource into itself", async () => {
    const folder = await createResource({ name: "Self", type: "FOLDER" });
    const folderRid = folder.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/compass/resources/${folderRid}/move`,
      payload: { newParentRid: folderRid },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cannot move a resource into one of its descendants (circular)", async () => {
    const parent = await createResource({ name: "Parent", type: "FOLDER" });
    const parentRid = parent.json().rid;

    const child = await createResource({
      name: "Child",
      type: "FOLDER",
      parentRid,
    });
    const childRid = child.json().rid;

    const grandchild = await createResource({
      name: "Grandchild",
      type: "FOLDER",
      parentRid: childRid,
    });
    const grandchildRid = grandchild.json().rid;

    // Try to move parent under grandchild (circular)
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/compass/resources/${parentRid}/move`,
      payload: { newParentRid: grandchildRid },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cannot move to nonexistent parent", async () => {
    const folder = await createResource({ name: "Orphan", type: "FOLDER" });
    const folderRid = folder.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/compass/resources/${folderRid}/move`,
      payload: { newParentRid: "ri.compass.main.resource.nonexistent" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("cannot move if name conflicts with existing sibling at destination", async () => {
    const folderA = await createResource({ name: "Folder A", type: "FOLDER" });
    const folderARid = folderA.json().rid;

    const folderB = await createResource({ name: "Folder B", type: "FOLDER" });
    const folderBRid = folderB.json().rid;

    // Create children with same name under different parents
    await createResource({ name: "Same Name", type: "PROJECT", parentRid: folderARid });
    const childB = await createResource({
      name: "Same Name",
      type: "PROJECT",
      parentRid: folderBRid,
    });
    const childBRid = childB.json().rid;

    // Try to move childB under folderA (name conflict)
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/compass/resources/${childBRid}/move`,
      payload: { newParentRid: folderARid },
    });
    expect(res.statusCode).toBe(409);
  });

  it("move returns 404 for unknown resource", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/compass/resources/ri.compass.main.resource.nonexistent/move",
      payload: { newParentRid: null },
    });
    expect(res.statusCode).toBe(404);
  });
});

// -------------------------------------------------------------------------
// Search
// -------------------------------------------------------------------------

describe("Search", () => {
  it("searches resources by name", async () => {
    await createResource({ name: "Alpha Project", type: "PROJECT" });
    await createResource({ name: "Beta Folder", type: "FOLDER" });
    await createResource({ name: "Alpha Space", type: "SPACE" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/compass/search?q=Alpha",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("search is case-insensitive", async () => {
    await createResource({ name: "MyProject", type: "PROJECT" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/compass/search?q=myproject",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it("search returns empty for no matches", async () => {
    await createResource({ name: "Something", type: "FOLDER" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/compass/search?q=nonexistent",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });

  it("search with empty query returns all resources", async () => {
    await createResource({ name: "A", type: "FOLDER" });
    await createResource({ name: "B", type: "PROJECT" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/compass/search",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });
});
