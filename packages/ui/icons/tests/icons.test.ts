import { describe, it, expect } from "vitest";

/**
 * Tests for @openfoundry/ui-icons.
 *
 * Since these tests run in a Node environment without a full React DOM,
 * we test exports, the icon map, and component function signatures.
 */

describe("@openfoundry/ui-icons", () => {
  it("exports iconMap object", async () => {
    const { iconMap } = await import("../src/icon-map.js");
    expect(iconMap).toBeDefined();
    expect(typeof iconMap).toBe("object");
  });

  it("iconMap contains expected foundry domain entries", async () => {
    const { iconMap } = await import("../src/icon-map.js");
    expect(iconMap.ontology).toBe("diagram-tree");
    expect(iconMap.objectType).toBe("cube");
    expect(iconMap.actionType).toBe("play");
    expect(iconMap.linkType).toBe("link");
    expect(iconMap.dataset).toBe("database");
    expect(iconMap.user).toBe("person");
    expect(iconMap.group).toBe("people");
  });

  it("iconMap contains common action entries", async () => {
    const { iconMap } = await import("../src/icon-map.js");
    expect(iconMap.add).toBe("plus");
    expect(iconMap.delete).toBe("trash");
    expect(iconMap.edit).toBe("edit");
    expect(iconMap.refresh).toBe("refresh");
    expect(iconMap.search).toBe("search");
    expect(iconMap.filter).toBe("filter");
    expect(iconMap.download).toBe("download");
    expect(iconMap.upload).toBe("upload");
  });

  it("iconMap has at least 20 entries", async () => {
    const { iconMap } = await import("../src/icon-map.js");
    expect(Object.keys(iconMap).length).toBeGreaterThanOrEqual(20);
  });

  it("exports FoundryIcon component function", async () => {
    const { FoundryIcon } = await import("../src/FoundryIcon.js");
    expect(typeof FoundryIcon).toBe("function");
  });

  it("FoundryIcon accepts a single props argument", async () => {
    const { FoundryIcon } = await import("../src/FoundryIcon.js");
    expect(FoundryIcon.length).toBe(1);
  });

  it("index barrel re-exports all public symbols", async () => {
    const mod = await import("../src/index.js");
    expect(mod.iconMap).toBeDefined();
    expect(typeof mod.FoundryIcon).toBe("function");
  });

  it("all iconMap values are non-empty strings", async () => {
    const { iconMap } = await import("../src/icon-map.js");
    for (const [key, value] of Object.entries(iconMap)) {
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
    }
  });
});
