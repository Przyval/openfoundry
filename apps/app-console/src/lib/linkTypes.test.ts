import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOutgoingLinkTypes } from "./linkTypes";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("fetchOutgoingLinkTypes", () => {
  it("returns the link types an object type declares", async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ data: [{ apiName: "employs" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchOutgoingLinkTypes("ri.ontology.main.o.1", "Employee", "t");
    expect(result).toEqual({ ok: true, linkTypes: [{ apiName: "employs" }] });
  });

  it("reports a genuinely empty result as success, not as a failure", async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchOutgoingLinkTypes("ri.ontology.main.o.1", "Employee", "t");
    expect(result).toEqual({ ok: true, linkTypes: [] });
  });

  it("reports a denied lookup as a failure rather than as no links", async () => {
    stubFetch(async () =>
      new Response(
        JSON.stringify({
          errorName: "PermissionDenied",
          parameters: { resource: "Ontology", action: "read" },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetchOutgoingLinkTypes("ri.ontology.main.o.1", "Employee", "t");
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: "Permission denied: you cannot read Ontology.",
    });
  });

  it("reports a gateway failure as a failure", async () => {
    stubFetch(async () => new Response("bad gateway", { status: 502 }));

    const result = await fetchOutgoingLinkTypes("ri.ontology.main.o.1", "Employee", "t");
    expect(result).toEqual({ ok: false, error: "Request failed with HTTP 502." });
  });

  it("reports a network failure as a failure", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    const result = await fetchOutgoingLinkTypes("ri.ontology.main.o.1", "Employee", null);
    expect(result).toEqual({ ok: false, error: "Failed to fetch" });
  });
});
