/**
 * Tenant Isolation Integration Tests
 *
 * WARNING: tenant isolation is NOT implemented. svc-ontology never reads the
 * `org` claim, never writes `org_rid`, and nothing sets `app.org_rid` on the
 * ontology path. The cases that assert isolation are therefore declared with
 * `it.todo`: they are a specification, they do not run, and neither a todo nor
 * a skipped suite may be read as evidence that one tenant cannot see another
 * tenant's data.
 *
 * What DOES run here is the part that exists today: signup issues a JWT whose
 * `org` claim matches the returned orgRid, and a tenant can read back the
 * ontology it created.
 *
 * Prerequisites: a running gateway (bash start.sh) with DATABASE_URL set, and
 * OPENFOUNDRY_ALLOW_OPEN_SIGNUP enabled on the service processes - setting it
 * in this file would not reach them. The suite skips when either is missing.
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.OPENFOUNDRY_HOST ?? "http://localhost:8080";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let tenantAToken: string;
let tenantAOrgRid: string;
let tenantBToken: string;
let tenantBOrgRid: string;
let tenantAOntologyRid: string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function signup(
  username: string,
  password: string,
  orgName: string,
): Promise<{ token: string; orgRid: string }> {
  const res = await fetch(`${BASE}/api/v2/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, orgName }),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.accessToken).toBeDefined();
  expect(body.orgRid).toBeDefined();
  return { token: body.accessToken, orgRid: body.orgRid };
}

async function api(method: string, path: string, token: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Probe the environment once so a missing prerequisite skips this suite with a
// clear reason instead of erroring every test from beforeAll.
const GATEWAY_UP = await fetch(`${BASE}/api/v2/ontologies`)
  .then(() => true)
  .catch(() => false);

// An empty body is rejected as a bad request when signup is reachable and as
// 401/403 when it is not, so this probe creates no user either way.
const SIGNUP_ENABLED =
  GATEWAY_UP &&
  (await fetch(`${BASE}/api/v2/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
    .then((res) => res.status !== 401 && res.status !== 403)
    .catch(() => false));

const SUITE_READY = GATEWAY_UP && SIGNUP_ENABLED;

if (!GATEWAY_UP) {
  console.warn(
    `[skip] gateway unreachable at ${BASE} - tenant-isolation suite skipped. ` +
      "A skip is NOT evidence of isolation: tenant scoping is not implemented yet.",
  );
} else if (!SIGNUP_ENABLED) {
  console.warn(
    "[skip] POST /api/v2/auth/signup is disabled - tenant-isolation suite skipped. " +
      "Start the services with OPENFOUNDRY_ALLOW_OPEN_SIGNUP=1 to run it.",
  );
}

// ===========================================================================
// Tests
// ===========================================================================

describe.skipIf(!SUITE_READY)(
  "Tenant Isolation (Multi-Tenancy RLS) - isolation itself is NOT IMPLEMENTED (those cases are todo)",
  () => {
    // -------------------------------------------------------------------------
    // Setup: create two tenants
    // -------------------------------------------------------------------------
    beforeAll(async () => {
      const suffix = Date.now().toString(36);
      const tenantA = await signup(
        `tenant-a-${suffix}`,
        "password-a-12345",
        "Pest Control Jakarta",
      );
      tenantAToken = tenantA.token;
      tenantAOrgRid = tenantA.orgRid;

      const tenantB = await signup(
        `tenant-b-${suffix}`,
        "password-b-12345",
        "Pest Control Surabaya",
      );
      tenantBToken = tenantB.token;
      tenantBOrgRid = tenantB.orgRid;

      expect(tenantAOrgRid).not.toBe(tenantBOrgRid);

      const createRes = await api("POST", "/api/v2/ontologies", tenantAToken, {
        apiName: `isolation-test-${suffix}`,
        displayName: "Tenant A Ontology",
        description: "Should only be visible to Tenant A",
      });
      expect(createRes.status).toBe(201);
      tenantAOntologyRid = (await createRes.json()).rid;
    });

    // -------------------------------------------------------------------------
    // Test 1: JWT carries correct org_rid
    // -------------------------------------------------------------------------
    it("JWT contains the correct org_rid claim for each tenant", () => {
      // Decode JWT payload (base64url)
      const decodeJwt = (token: string) => {
        const payload = token.split(".")[1];
        return JSON.parse(Buffer.from(payload, "base64url").toString());
      };

      const claimsA = decodeJwt(tenantAToken);
      expect(claimsA.org).toBe(tenantAOrgRid);

      const claimsB = decodeJwt(tenantBToken);
      expect(claimsB.org).toBe(tenantBOrgRid);

      expect(claimsA.org).not.toBe(claimsB.org);
    });

    // -------------------------------------------------------------------------
    // Test 2: Tenant A creates data, Tenant B cannot see it
    // -------------------------------------------------------------------------
    it.todo("Tenant A creates an ontology; Tenant B cannot list it", async () => {
      // Tenant A creates an ontology
      const createRes = await api("POST", "/api/v2/ontologies", tenantAToken, {
        apiName: `isolation-test-${Date.now()}`,
        displayName: "Tenant A Ontology",
        description: "Should only be visible to Tenant A",
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      tenantAOntologyRid = created.rid;

      // Tenant B lists ontologies — should NOT include Tenant A's
      const listRes = await api("GET", "/api/v2/ontologies", tenantBToken);
      expect(listRes.status).toBe(200);
      const list = await listRes.json();

      const foundByB = list.data?.find((o: { rid: string }) => o.rid === tenantAOntologyRid);
      expect(foundByB).toBeUndefined();
    });

    // -------------------------------------------------------------------------
    // Test 3: Tenant B cannot read Tenant A's specific resource
    // -------------------------------------------------------------------------
    it.todo("Tenant B cannot GET Tenant A's ontology by RID", async () => {
      const res = await api("GET", `/api/v2/ontologies/${tenantAOntologyRid}`, tenantBToken);
      // Should be 404 (not found for this tenant) — not 200
      expect(res.status).toBe(404);
    });

    // -------------------------------------------------------------------------
    // Test 4: Tenant A can see their own data
    // -------------------------------------------------------------------------
    it("Tenant A CAN see their own ontology", async () => {
      const res = await api("GET", `/api/v2/ontologies/${tenantAOntologyRid}`, tenantAToken);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rid).toBe(tenantAOntologyRid);
    });

    // -------------------------------------------------------------------------
    // Test 5: Duplicate signup username returns 409
    // -------------------------------------------------------------------------
    it.todo("Duplicate signup username returns 409 Conflict", async () => {
      const suffix = Date.now().toString(36);
      const username = `dup-test-${suffix}`;

      // First signup succeeds
      const first = await fetch(`${BASE}/api/v2/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: "password12345" }),
      });
      expect(first.status).toBe(201);

      // Second signup with same username fails
      const second = await fetch(`${BASE}/api/v2/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: "different12345" }),
      });
      expect(second.status).toBe(409);
    });
  },
);
