/**
 * SDK Compatibility Test
 *
 * Tests whether OpenFoundry's API is compatible with Palantir's official
 * @osdk/foundry v2 SDK (function-based architecture).
 *
 * The SDK uses a SharedClientContext with { baseUrl, fetch, tokenProvider }
 * and constructs URLs as {baseUrl}/api/v2/...
 *
 * Usage (must use .mts extension for ESM compatibility with @osdk packages):
 *   cp tests/sdk-compat/test-osdk-compat.ts tests/sdk-compat/test-osdk-compat.mts
 *   npx tsx tests/sdk-compat/test-osdk-compat.mts
 *
 * Or add "type": "module" to root package.json and run directly:
 *   npx tsx tests/sdk-compat/test-osdk-compat.ts
 */

import { Ontologies, Datasets, Admin } from "@osdk/foundry";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const HOST = process.env.OPENFOUNDRY_HOST ?? "http://localhost:8080";
const CLIENT_ID = process.env.OPENFOUNDRY_CLIENT_ID ?? "admin";
const CLIENT_SECRET = process.env.OPENFOUNDRY_CLIENT_SECRET ?? "admin123";

// ---------------------------------------------------------------------------
// Result tracking
// ---------------------------------------------------------------------------
interface TestResult {
  name: string;
  endpoint: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function record(name: string, endpoint: string, passed: boolean, detail: string) {
  results.push({ name, endpoint, passed, detail });
  const icon = passed ? "[PASS]" : "[FAIL]";
  console.log(`  ${icon} ${name}`);
  if (detail) {
    // Truncate long details
    const short = detail.length > 300 ? detail.slice(0, 300) + "..." : detail;
    console.log(`        ${short}`);
  }
}

// ---------------------------------------------------------------------------
// Create an SDK-compatible client context
// ---------------------------------------------------------------------------

/**
 * The @osdk/foundry SDK expects a client context object that satisfies
 * SharedClientContext from @osdk/shared.client2:
 *   { baseUrl: string, fetch: typeof fetch, tokenProvider: () => Promise<string> }
 *
 * The SDK accesses it either directly (if passed as context) or via
 * client["__osdkClientContext"].
 */
function createClientContext(baseUrl: string, token: string) {
  // The SDK's foundryPlatformFetch checks for client[symbolClientContext]
  // where symbolClientContext = "__osdkClientContext" (a string key).
  // If not found, it falls back to treating the object itself as the context.
  // We implement the context interface directly AND set the symbol key.
  const ctx = {
    baseUrl,
    tokenProvider: async () => token,
    fetch: async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const token = await ctx.tokenProvider();
      const headers = new Headers(init?.headers);
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return globalThis.fetch(url, { ...init, headers });
    },
  };

  // Also expose it as a SharedClient (the SDK checks both patterns)
  const client = {
    ...ctx,
    ["__osdkClientContext"]: ctx,
  };

  return client;
}

// ---------------------------------------------------------------------------
// Token acquisition
// ---------------------------------------------------------------------------
async function getToken(): Promise<string> {
  const tokenRes = await fetch(`${HOST}/multipass/api/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
  });

  if (!tokenRes.ok) {
    throw new Error(
      `Token request failed: ${tokenRes.status} ${await tokenRes.text()}`
    );
  }

  const data = await tokenRes.json();
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function isError(val: unknown): val is { errorCode?: string; message?: string; errorName?: string } {
  return (
    val != null &&
    typeof val === "object" &&
    ("errorCode" in val || "errorName" in val)
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== OpenFoundry <-> @osdk/foundry SDK Compatibility Test ===");
  console.log(`Target: ${HOST}`);
  console.log(`SDK version: @osdk/foundry (v2 function-based API)\n`);

  // Step 1: Get token
  let token: string;
  try {
    token = await getToken();
    record("OAuth2 Token (client_credentials)", "POST /multipass/api/oauth2/token", true,
      `Token: ${token.slice(0, 20)}...`);
  } catch (e: any) {
    record("OAuth2 Token (client_credentials)", "POST /multipass/api/oauth2/token", false, e.message);
    console.log("\nCannot proceed without a token. Is OpenFoundry running?");
    printSummary();
    process.exit(1);
  }

  const client = createClientContext(HOST, token);

  // -----------------------------------------------------------------------
  // Test Group 1: Ontologies (Ontologies.OntologiesV2)
  // -----------------------------------------------------------------------
  console.log("\n--- Ontology API ---");

  // 1a. List ontologies
  try {
    const result = await Ontologies.OntologiesV2.list(client);
    if (isError(result)) {
      record("List Ontologies", "GET /api/v2/ontologies", false,
        `SDK returned error object: ${JSON.stringify(result)}`);
    } else {
      record("List Ontologies", "GET /api/v2/ontologies", true,
        JSON.stringify(result));
    }
  } catch (e: any) {
    record("List Ontologies", "GET /api/v2/ontologies", false, e.message);
  }

  // 1b. Get ontology by identifier
  let ontologyApiName: string | undefined;
  let ontologyRid: string | undefined;
  try {
    const listResult = await Ontologies.OntologiesV2.list(client);
    if (!isError(listResult) && listResult.data && listResult.data.length > 0) {
      ontologyApiName = listResult.data[0].apiName;
      ontologyRid = listResult.data[0].rid;
    }
  } catch { /* ignore */ }

  // Use the RID as primary identifier (OpenFoundry currently needs RID, not apiName)
  const ontologyId = ontologyRid;

  // Test with apiName first (this is what real SDK users would do)
  if (ontologyApiName) {
    try {
      const result = await Ontologies.OntologiesV2.get(client, ontologyApiName);
      if (isError(result)) {
        record("Get Ontology (by apiName)", `GET /api/v2/ontologies/${ontologyApiName}`, false,
          `COMPAT GAP: ${JSON.stringify(result)}`);
      } else {
        record("Get Ontology (by apiName)", `GET /api/v2/ontologies/${ontologyApiName}`, true,
          JSON.stringify(result));
      }
    } catch (e: any) {
      record("Get Ontology (by apiName)", `GET /api/v2/ontologies/${ontologyApiName}`, false, e.message);
    }
  }

  // Also test with RID (the workaround)
  if (ontologyId) {
    try {
      const result = await Ontologies.OntologiesV2.get(client, ontologyId);
      if (isError(result)) {
        record("Get Ontology (by RID)", `GET /api/v2/ontologies/${ontologyId}`, false,
          JSON.stringify(result));
      } else {
        record("Get Ontology (by RID)", `GET /api/v2/ontologies/${ontologyId}`, true,
          JSON.stringify(result));
      }
    } catch (e: any) {
      record("Get Ontology (by RID)", `GET /api/v2/ontologies/${ontologyId}`, false, e.message);
    }

    // 1c. List object types for ontology
    try {
      const result = await Ontologies.ObjectTypesV2.list(client, ontologyId);
      if (isError(result)) {
        record("List Object Types", `GET /api/v2/ontologies/${ontologyId}/objectTypes`, false,
          JSON.stringify(result));
      } else {
        record("List Object Types", `GET /api/v2/ontologies/${ontologyId}/objectTypes`, true,
          JSON.stringify(result));
      }
    } catch (e: any) {
      record("List Object Types", `GET /api/v2/ontologies/${ontologyId}/objectTypes`, false, e.message);
    }

    // 1d. List query types
    try {
      const result = await Ontologies.QueryTypes.list(client, ontologyId);
      if (isError(result)) {
        record("List Query Types", `GET /api/v2/ontologies/${ontologyId}/queryTypes`, false,
          JSON.stringify(result));
      } else {
        record("List Query Types", `GET /api/v2/ontologies/${ontologyId}/queryTypes`, true,
          JSON.stringify(result));
      }
    } catch (e: any) {
      record("List Query Types", `GET /api/v2/ontologies/${ontologyId}/queryTypes`, false, e.message);
    }

    // 1e. List action types
    try {
      const result = await Ontologies.ActionTypesV2.list(client, ontologyId);
      if (isError(result)) {
        record("List Action Types", `GET /api/v2/ontologies/${ontologyId}/actionTypes`, false,
          JSON.stringify(result));
      } else {
        record("List Action Types", `GET /api/v2/ontologies/${ontologyId}/actionTypes`, true,
          JSON.stringify(result));
      }
    } catch (e: any) {
      record("List Action Types", `GET /api/v2/ontologies/${ontologyId}/actionTypes`, false, e.message);
    }
  } else {
    console.log("  (skipping ontology-specific tests -- no ontology found)");
  }

  // -----------------------------------------------------------------------
  // Test Group 2: Admin - Users
  // -----------------------------------------------------------------------
  console.log("\n--- Admin API ---");

  // 2a. Get current user
  try {
    const result = await Admin.Users.getCurrent(client);
    if (isError(result)) {
      record("Get Current User", "GET /api/v2/admin/users/getCurrent", false,
        JSON.stringify(result));
    } else {
      record("Get Current User", "GET /api/v2/admin/users/getCurrent", true,
        JSON.stringify(result));
    }
  } catch (e: any) {
    record("Get Current User", "GET /api/v2/admin/users/getCurrent", false, e.message);
  }

  // 2b. List users
  try {
    const result = await Admin.Users.list(client);
    if (isError(result)) {
      record("List Users", "GET /api/v2/admin/users", false,
        JSON.stringify(result));
    } else {
      record("List Users", "GET /api/v2/admin/users", true,
        JSON.stringify(result));
    }
  } catch (e: any) {
    record("List Users", "GET /api/v2/admin/users", false, e.message);
  }

  // 2c. List groups
  try {
    const result = await Admin.Groups.list(client);
    if (isError(result)) {
      record("List Groups", "GET /api/v2/admin/groups", false,
        JSON.stringify(result));
    } else {
      record("List Groups", "GET /api/v2/admin/groups", true,
        JSON.stringify(result));
    }
  } catch (e: any) {
    record("List Groups", "GET /api/v2/admin/groups", false, e.message);
  }

  // -----------------------------------------------------------------------
  // Test Group 3: Datasets
  // -----------------------------------------------------------------------
  console.log("\n--- Datasets API ---");

  // 3a. Create a dataset
  let createdDatasetRid: string | undefined;
  try {
    const result = await Datasets.Datasets.create(client, {
      name: `sdk-compat-test-${Date.now()}`,
      parentFolderRid: "ri.compass.main.folder.root",
    });
    if (isError(result)) {
      record("Create Dataset", "POST /api/v2/datasets", false,
        JSON.stringify(result));
    } else {
      createdDatasetRid = result.rid;
      record("Create Dataset", "POST /api/v2/datasets", true,
        JSON.stringify(result));
    }
  } catch (e: any) {
    record("Create Dataset", "POST /api/v2/datasets", false, e.message);
  }

  // 3b. Get dataset by RID
  if (createdDatasetRid) {
    try {
      const result = await Datasets.Datasets.get(client, createdDatasetRid);
      if (isError(result)) {
        record("Get Dataset", `GET /api/v2/datasets/${createdDatasetRid}`, false,
          JSON.stringify(result));
      } else {
        record("Get Dataset", `GET /api/v2/datasets/${createdDatasetRid}`, true,
          JSON.stringify(result));
      }
    } catch (e: any) {
      record("Get Dataset", `GET /api/v2/datasets/${createdDatasetRid}`, false, e.message);
    }

    // 3c. List branches
    try {
      const result = await Datasets.Branches.list(client, createdDatasetRid);
      if (isError(result)) {
        record("List Branches", `GET /api/v2/datasets/${createdDatasetRid}/branches`, false,
          JSON.stringify(result));
      } else {
        record("List Branches", `GET /api/v2/datasets/${createdDatasetRid}/branches`, true,
          JSON.stringify(result));
      }
    } catch (e: any) {
      record("List Branches", `GET /api/v2/datasets/${createdDatasetRid}/branches`, false, e.message);
    }

    // 3d. Create a transaction (specify branch name explicitly)
    try {
      const result = await Datasets.Transactions.create(client, createdDatasetRid, {
        transactionType: "APPEND",
      }, { branchName: "main" });
      if (isError(result)) {
        record("Create Transaction", `POST /api/v2/datasets/.../transactions`, false,
          JSON.stringify(result));
      } else {
        record("Create Transaction", `POST /api/v2/datasets/.../transactions`, true,
          JSON.stringify(result));
      }
    } catch (e: any) {
      record("Create Transaction", `POST /api/v2/datasets/.../transactions`, false, e.message);
    }
  } else {
    console.log("  (skipping dataset-specific tests -- create failed)");
  }

  // -----------------------------------------------------------------------
  // Test Group 4: Objects (if ontology and object types exist)
  // -----------------------------------------------------------------------
  if (ontologyId) {
    console.log("\n--- Objects API ---");

    // Try listing objects for first object type
    let objectTypeApiName: string | undefined;
    try {
      const otResult = await Ontologies.ObjectTypesV2.list(client, ontologyId);
      if (!isError(otResult) && otResult.data && otResult.data.length > 0) {
        objectTypeApiName = otResult.data[0].apiName;
      }
    } catch { /* ignore */ }

    if (objectTypeApiName) {
      // 4a. List objects (requires select param)
      try {
        const result = await Ontologies.OntologyObjectsV2.list(client, ontologyId, objectTypeApiName, {
          select: [],
          pageSize: 10,
        });
        if (isError(result)) {
          record("List Objects", `GET /api/v2/ontologies/.../objects/${objectTypeApiName}`, false,
            JSON.stringify(result));
        } else {
          record("List Objects", `GET /api/v2/ontologies/.../objects/${objectTypeApiName}`, true,
            JSON.stringify(result));
        }
      } catch (e: any) {
        record("List Objects", `GET /api/v2/ontologies/.../objects/${objectTypeApiName}`, false, e.message);
      }

      // 4b. Search objects (empty where -- SDK sends {} to mean "no filter")
      try {
        const result = await Ontologies.OntologyObjectsV2.search(client, ontologyId, objectTypeApiName, {
          where: {},
        });
        if (isError(result)) {
          record("Search Objects (empty where)", `POST .../objects/${objectTypeApiName}/search`, false,
            `COMPAT GAP: empty where:{} crashes handler. ${JSON.stringify(result)}`);
        } else {
          record("Search Objects (empty where)", `POST .../objects/${objectTypeApiName}/search`, true,
            JSON.stringify(result));
        }
      } catch (e: any) {
        record("Search Objects (empty where)", `POST .../objects/${objectTypeApiName}/search`, false, e.message);
      }

      // 4b2. Search objects with a real filter
      try {
        const result = await Ontologies.OntologyObjectsV2.search(client, ontologyId, objectTypeApiName, {
          where: { type: "eq", field: "customerId", value: "CUST-001" },
          pageSize: 5,
        } as any);
        if (isError(result)) {
          record("Search Objects (with filter)", `POST .../objects/${objectTypeApiName}/search`, false,
            JSON.stringify(result));
        } else {
          record("Search Objects (with filter)", `POST .../objects/${objectTypeApiName}/search`, true,
            JSON.stringify(result));
        }
      } catch (e: any) {
        record("Search Objects (with filter)", `POST .../objects/${objectTypeApiName}/search`, false, e.message);
      }

      // 4c. Aggregate objects
      try {
        const result = await Ontologies.OntologyObjectsV2.aggregate(client, ontologyId, objectTypeApiName, {
          aggregation: [{ type: "count" }],
        });
        if (isError(result)) {
          record("Aggregate Objects", `POST /api/v2/ontologies/.../objects/${objectTypeApiName}/aggregate`, false,
            JSON.stringify(result));
        } else {
          record("Aggregate Objects", `POST /api/v2/ontologies/.../objects/${objectTypeApiName}/aggregate`, true,
            JSON.stringify(result));
        }
      } catch (e: any) {
        record("Aggregate Objects", `POST /api/v2/ontologies/.../objects/${objectTypeApiName}/aggregate`, false, e.message);
      }
    } else {
      console.log("  (skipping object tests -- no object types found)");
    }
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  printSummary();
}

function printSummary() {
  console.log("\n" + "=".repeat(70));
  console.log("SDK COMPATIBILITY SUMMARY");
  console.log("=".repeat(70));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const pct = total > 0 ? ((passed / total) * 100).toFixed(1) : "0.0";

  console.log(`\nTotal tests: ${total}`);
  console.log(`Passed:      ${passed}`);
  console.log(`Failed:      ${failed}`);
  console.log(`Success:     ${pct}%`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.name} (${r.endpoint})`);
      console.log(`    ${r.detail}`);
    }
  }

  console.log("\nEndpoint coverage tested:");
  console.log("  Ontology API:  list, get(apiName), get(RID), objectTypes, queryTypes, actionTypes");
  console.log("  Admin API:     getCurrent, listUsers, listGroups");
  console.log("  Datasets API:  create, get, branches, transactions");
  console.log("  Objects API:   list, search(empty), search(filter), aggregate");

  console.log("\nKnown compatibility gaps:");
  console.log("  1. GET /api/v2/ontologies/{apiName} -- OpenFoundry only accepts RID, not apiName.");
  console.log("     The Palantir SDK docs say the {ontology} param accepts either apiName or RID.");
  console.log("     Fix: svc-ontology should resolve apiName to RID before DB lookup.");
  console.log("  2. GET /api/v2/ontologies/{id}/queryTypes -- Route not implemented.");
  console.log("     Fix: Add query-types.ts route handler in svc-ontology.");
  console.log("  3. POST /api/v2/datasets/{rid}/transactions -- Body format mismatch.");
  console.log("     SDK sends { transactionType: 'APPEND' } + ?branchName=main (query param).");
  console.log("     OpenFoundry expects { branchRid: '...', type: 'APPEND' } in the body.");
  console.log("     Fix: Accept Palantir's format (transactionType in body, branchName in query).");
  console.log("  4. POST .../objects/{type}/search with where:{} -- handler crashes.");
  console.log("     SDK sends empty where:{} to mean 'no filter'; handler calls .type.toLowerCase()");
  console.log("     on undefined. Fix: treat empty/missing where as 'match all'.");
  console.log("");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
