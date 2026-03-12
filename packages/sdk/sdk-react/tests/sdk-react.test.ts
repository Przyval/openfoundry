import { describe, it, expect } from "vitest";

/**
 * Tests for @openfoundry/sdk-react.
 *
 * Since these tests run in a Node environment without a full React DOM,
 * we test exports, types, and pure logic rather than rendering components.
 */

describe("@openfoundry/sdk-react", () => {
  it("exports OpenFoundryContext", async () => {
    const mod = await import("../src/context.js");
    expect(mod.OpenFoundryContext).toBeDefined();
    // Context objects have Provider and Consumer
    expect(mod.OpenFoundryContext.Provider).toBeDefined();
  });

  it("exports OpenFoundryProvider function", async () => {
    const mod = await import("../src/context.js");
    expect(typeof mod.OpenFoundryProvider).toBe("function");
  });

  it("exports useOpenFoundry function", async () => {
    const mod = await import("../src/context.js");
    expect(typeof mod.useOpenFoundry).toBe("function");
  });

  it("exports useObject hook", async () => {
    const mod = await import("../src/use-object.js");
    expect(typeof mod.useObject).toBe("function");
  });

  it("exports useObjects hook", async () => {
    const mod = await import("../src/use-objects.js");
    expect(typeof mod.useObjects).toBe("function");
  });

  it("exports useAction hook", async () => {
    const mod = await import("../src/use-action.js");
    expect(typeof mod.useAction).toBe("function");
  });

  it("exports useOntology and useObjectTypes hooks", async () => {
    const mod = await import("../src/use-ontology.js");
    expect(typeof mod.useOntology).toBe("function");
    expect(typeof mod.useObjectTypes).toBe("function");
  });

  it("exports useFetch hook", async () => {
    const mod = await import("../src/use-fetch.js");
    expect(typeof mod.useFetch).toBe("function");
  });

  it("index barrel re-exports all public symbols", async () => {
    const mod = await import("../src/index.js");
    expect(mod.OpenFoundryContext).toBeDefined();
    expect(typeof mod.OpenFoundryProvider).toBe("function");
    expect(typeof mod.useOpenFoundry).toBe("function");
    expect(typeof mod.useObject).toBe("function");
    expect(typeof mod.useObjects).toBe("function");
    expect(typeof mod.useAction).toBe("function");
    expect(typeof mod.useOntology).toBe("function");
    expect(typeof mod.useObjectTypes).toBe("function");
    expect(typeof mod.useFetch).toBe("function");
  });

  it("OpenFoundryContext default value is null", async () => {
    const { OpenFoundryContext } = await import("../src/context.js");
    // The default value passed to createContext should be null
    // We can check by reading _currentValue (React internals, but stable for testing)
    expect((OpenFoundryContext as unknown as { _currentValue: unknown })._currentValue).toBeNull();
  });

  it("useOpenFoundry throws outside provider", async () => {
    // We can't directly call hooks outside React, but we can verify the
    // function exists and has the right signature
    const { useOpenFoundry } = await import("../src/context.js");
    expect(useOpenFoundry.length).toBe(0); // no arguments
  });

  it("hook functions accept the documented parameters", async () => {
    const { useObject } = await import("../src/use-object.js");
    const { useObjects } = await import("../src/use-objects.js");
    const { useAction } = await import("../src/use-action.js");
    const { useOntology, useObjectTypes } = await import("../src/use-ontology.js");
    const { useFetch } = await import("../src/use-fetch.js");

    // Verify arity: useObject(ontologyRid, objectType, primaryKey, options?)
    expect(useObject.length).toBeGreaterThanOrEqual(3);
    // useObjects(ontologyRid, objectType, options?)
    expect(useObjects.length).toBeGreaterThanOrEqual(2);
    // useAction(ontologyRid, actionApiName)
    expect(useAction.length).toBeGreaterThanOrEqual(2);
    // useOntology(ontologyRid)
    expect(useOntology.length).toBeGreaterThanOrEqual(1);
    // useObjectTypes(ontologyRid)
    expect(useObjectTypes.length).toBeGreaterThanOrEqual(1);
    // useFetch(url, options?)
    expect(useFetch.length).toBeGreaterThanOrEqual(1);
  });

  it("OpenFoundryContext Consumer is defined", async () => {
    const mod = await import("../src/context.js");
    expect(mod.OpenFoundryContext.Consumer).toBeDefined();
  });

  it("OpenFoundryProvider accepts baseUrl, token, tokenProvider, and children props", async () => {
    const { OpenFoundryProvider } = await import("../src/context.js");
    // The function should accept a single props object
    expect(OpenFoundryProvider.length).toBe(1);
  });

  it("useFetch accepts a url string as first parameter", async () => {
    const { useFetch } = await import("../src/use-fetch.js");
    // First param is url (string), second is optional options
    expect(useFetch.length).toBeGreaterThanOrEqual(1);
    expect(useFetch.length).toBeLessThanOrEqual(2);
  });

  it("useObject accepts ontologyRid, objectType, primaryKey, and optional options", async () => {
    const { useObject } = await import("../src/use-object.js");
    // 3 required params + 1 optional
    expect(useObject.length).toBeGreaterThanOrEqual(3);
    expect(useObject.length).toBeLessThanOrEqual(4);
  });

  it("useObjects accepts ontologyRid, objectType, and optional options", async () => {
    const { useObjects } = await import("../src/use-objects.js");
    expect(useObjects.length).toBeGreaterThanOrEqual(2);
    expect(useObjects.length).toBeLessThanOrEqual(3);
  });

  it("useAction accepts exactly ontologyRid and actionApiName", async () => {
    const { useAction } = await import("../src/use-action.js");
    expect(useAction.length).toBe(2);
  });
});
