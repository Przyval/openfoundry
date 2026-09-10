/**
 * Tenant Isolation Integration Tests — NOT YET IMPLEMENTED
 *
 * WARNING: This file is a specification, not evidence. Tenant isolation is NOT
 * enforced anywhere in the codebase today: svc-ontology never reads the `org`
 * claim, never writes `org_rid`, and nothing sets `app.org_rid` on the ontology
 * path. The tests marked [NOT YET IMPLEMENTED] below therefore FAIL when they
 * run. Neither a skip (no gateway) nor a green suite may be read as proof that
 * one tenant cannot see another tenant's data.
 *
 * Signup is also gated behind OPENFOUNDRY_ALLOW_OPEN_SIGNUP, which is off by
 * default, so the setup step needs it enabled on the running services.
 *
 * Prerequisites: Services must be running with DATABASE_URL set (Postgres mode).
 *
 * These tests:
 * 1. Sign up two tenants (Tenant A and Tenant B)
 * 2. Create data as Tenant A
 * 3. Verify Tenant B CANNOT see Tenant A's data
 * 4. Verify Tenant B CANNOT modify Tenant A's data
 * 5. Verify each tenant's JWT carries the correct org_rid claim
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

// The suite needs a running gateway (bash start.sh). Probe once so an absent
// gateway skips these tests instead of erroring the whole suite in beforeAll.
const GATEWAY_UP = await fetch(`${BASE}/api/v2/ontologies`)
  .then(() => true)
  .catch(() => false);

if (!GATEWAY_UP) {
  console.warn(
    `[skip] gateway unreachable at ${BASE} - tenant-isolation suite skipped. ` +
      "A skip is NOT evidence of isolation: tenant scoping is not implemented yet.",
  );
}

// ===========================================================================
// Tests
// ===========================================================================

describe.skipIf(!GATEWAY_UP)(
  "Tenant Isolation (Multi-Tenancy RLS) [NOT YET IMPLEMENTED - specification only, currently failing]",
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
    it("[NOT YET IMPLEMENTED] Tenant A creates an ontology; Tenant B cannot list it", async () => {
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
    it("[NOT YET IMPLEMENTED] Tenant B cannot GET Tenant A's ontology by RID", async () => {
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
    it("[NOT YET IMPLEMENTED] Duplicate signup username returns 409 Conflict", async () => {
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
