import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { FileAuthorizationStore, ROOT_RESOURCE, setEnforcePermissions } from "@openfoundry/permissions";
import { createServer } from "../src/server.js";
import { OntologyStore } from "../src/store/ontology-store.js";

const as = (userId: string, extra: Record<string, string> = {}) => ({ "x-user-id": userId, ...extra });

let app: FastifyInstance;
let authz: FileAuthorizationStore;

async function grant(resourceRid: string, principalId: string, roleId: "owner" | "editor" | "viewer" | "discoverer") {
  await authz.addGrant({
    resourceRid,
    principalType: "user",
    principalId,
    roleId,
    grantedBy: "test",
    grantedAt: new Date().toISOString(),
  });
}

async function createOntology(userId: string, apiName: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v2/ontologies",
    headers: as(userId),
    payload: { apiName, displayName: apiName, description: apiName },
  });
  return res;
}

beforeEach(async () => {
  authz = new FileAuthorizationStore(null);
  app = await createServer({
    config: { port: 0, host: "127.0.0.1", logLevel: "silent", nodeEnv: "test" },
    store: new OntologyStore(null),
    authorizationStore: authz,
  });
  setEnforcePermissions(true);
});

afterEach(() => {
  setEnforcePermissions(false);
});

describe("roles on an ontology", () => {
  it("make its creator Owner, and nobody else anything", async () => {
    await grant(ROOT_RESOURCE, "bob", "editor");

    const denied = await createOntology("nobody", "denied");
    expect(denied.statusCode).toBe(403);

    const created = await createOntology("bob", "bobs");
    expect(created.statusCode).toBe(201);
    const rid = created.json().rid as string;

    expect((await app.inject({ method: "GET", url: `/api/v2/ontologies/${rid}`, headers: as("bob") })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/v2/ontologies/${rid}`, headers: as("carol") })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: `/api/v2/ontologies/${rid}`, headers: as("carol") })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: `/api/v2/ontologies/${rid}`, headers: as("bob") })).statusCode).toBe(204);
  });

  it("let a Viewer read an ontology and its types but not change them", async () => {
    await grant(ROOT_RESOURCE, "bob", "editor");
    const rid = (await createOntology("bob", "alpha")).json().rid as string;
    await grant(rid, "vera", "viewer");

    expect((await app.inject({ method: "GET", url: `/api/v2/ontologies/${rid}/objectTypes`, headers: as("vera") })).statusCode).toBe(200);
    const write = await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${rid}/objectTypes`,
      headers: as("vera"),
      payload: { apiName: "Thing", primaryKeyApiName: "id", primaryKeyType: "STRING", properties: {} },
    });
    expect(write.statusCode).toBe(403);
  });

  it("show a caller only the ontologies they can discover", async () => {
    await grant(ROOT_RESOURCE, "bob", "editor");
    const a = (await createOntology("bob", "alpha")).json().rid as string;
    const b = (await createOntology("bob", "beta")).json().rid as string;
    await grant(a, "dina", "discoverer");

    const list = await app.inject({ method: "GET", url: "/api/v2/ontologies", headers: as("dina") });
    expect(list.statusCode).toBe(200);
    expect((list.json().data as Array<{ rid: string }>).map((o) => o.rid)).toEqual([a]);
    expect((list.json().data as Array<{ rid: string }>).map((o) => o.rid)).not.toContain(b);

    // Discoverer sees that it exists; reading its contents is a Viewer's right.
    expect((await app.inject({ method: "GET", url: `/api/v2/ontologies/${a}/objectTypes`, headers: as("dina") })).statusCode).toBe(403);
  });
});

describe("mandatory controls on an ontology", () => {
  async function restricted() {
    await grant(ROOT_RESOURCE, "bob", "editor");
    const rid = (await createOntology("bob", "classified")).json().rid as string;
    await grant(rid, "vera", "viewer");
    await authz.setPolicy({ resourceRid: rid, organizations: ["org-a"], markings: ["pii"] });
    return rid;
  }

  it("deny a Viewer without the Marking, and admit one who holds it in the right Organization", async () => {
    const rid = await restricted();
    const url = `/api/v2/ontologies/${rid}/objectTypes`;

    expect((await app.inject({ method: "GET", url, headers: as("vera", { "x-user-org": "org-a" }) })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url, headers: as("vera", { "x-user-org": "org-b", "x-user-markings": "pii" }) })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url, headers: as("vera", { "x-user-org": "org-a", "x-user-markings": "pii" }) })).statusCode).toBe(200);
  });

  it("bind a platform administrator", async () => {
    const rid = await restricted();
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${rid}/objectTypes`,
      headers: as("root", { "x-user-platform-admin": "true", "x-user-org": "org-a" }),
    });
    expect(res.statusCode).toBe(403);
  });

  it("hold when the ontology is reached by its API name instead of its RID", async () => {
    const rid = await restricted();
    expect(rid.startsWith("ri.")).toBe(true);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/ontologies/classified",
      headers: as("vera", { "x-user-org": "org-a" }),
    });
    expect(res.statusCode).toBe(403);
  });
});
