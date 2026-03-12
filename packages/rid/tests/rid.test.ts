import { describe, expect, it } from "vitest";
import { Rid } from "../src/rid.js";
import { generateRid, generateDeterministicRid } from "../src/rid-generator.js";
import { KnownServices } from "../src/known-services.js";

// -----------------------------------------------------------------------------
// Parsing
// -----------------------------------------------------------------------------

describe("Rid.parse", () => {
  it("parses a simple RID", () => {
    const rid = Rid.parse("ri.compass.main.folder.abc123");
    expect(rid.service).toBe("compass");
    expect(rid.instance).toBe("main");
    expect(rid.type).toBe("folder");
    expect(rid.locator).toBe("abc123");
  });

  it("parses a RID with a multi-segment locator", () => {
    const rid = Rid.parse(
      "ri.phonograph2-objects.main.object.v4.abc123.encoded-key",
    );
    expect(rid.service).toBe("phonograph2-objects");
    expect(rid.type).toBe("object");
    expect(rid.locator).toBe("v4.abc123.encoded-key");
  });

  it("parses ontology object-type RID", () => {
    const rid = Rid.parse("ri.ontology.main.object-type.Employee");
    expect(rid.service).toBe("ontology");
    expect(rid.type).toBe("object-type");
    expect(rid.locator).toBe("Employee");
  });

  it("parses highbury cluster RID", () => {
    const rid = Rid.parse("ri.highbury.main.cluster.1");
    expect(rid.service).toBe("highbury");
    expect(rid.type).toBe("cluster");
    expect(rid.locator).toBe("1");
  });

  it("parses apollo environment RID", () => {
    const rid = Rid.parse("ri.apollo.main.environment.abc123");
    expect(rid.service).toBe("apollo");
    expect(rid.type).toBe("environment");
    expect(rid.locator).toBe("abc123");
  });

  // Invalid inputs ---------------------------------------------------------

  it("throws on empty string", () => {
    expect(() => Rid.parse("")).toThrow("non-empty string");
  });

  it("throws on wrong prefix", () => {
    expect(() => Rid.parse("rn.compass.main.folder.abc123")).toThrow(
      'Invalid RID prefix',
    );
  });

  it("throws on too few segments", () => {
    expect(() => Rid.parse("ri.compass.main")).toThrow("at least 5");
  });

  it("throws on invalid service characters", () => {
    expect(() => Rid.parse("ri.COM_PASS.main.folder.abc123")).toThrow(
      "Invalid RID service",
    );
  });

  it("throws on empty locator", () => {
    expect(() => Rid.parse("ri.compass.main.folder.")).toThrow("locator");
  });

  it("throws on non-string input", () => {
    expect(() => Rid.parse(null as unknown as string)).toThrow(
      "non-empty string",
    );
  });
});

// -----------------------------------------------------------------------------
// Creation
// -----------------------------------------------------------------------------

describe("Rid.create", () => {
  it("creates a valid RID", () => {
    const rid = Rid.create("compass", "main", "folder", "abc123");
    expect(rid.toString()).toBe("ri.compass.main.folder.abc123");
  });

  it("rejects invalid service", () => {
    expect(() => Rid.create("BAD!", "main", "folder", "abc")).toThrow(
      "service",
    );
  });

  it("rejects invalid type", () => {
    expect(() => Rid.create("compass", "main", "FOLDER", "abc")).toThrow(
      "type",
    );
  });

  it("rejects empty locator", () => {
    expect(() => Rid.create("compass", "main", "folder", "")).toThrow(
      "locator",
    );
  });
});

// -----------------------------------------------------------------------------
// toString / toJSON
// -----------------------------------------------------------------------------

describe("Rid serialization", () => {
  it("toString round-trips through parse", () => {
    const original = "ri.phonograph2-objects.main.object.v4.abc123.encoded-key";
    const rid = Rid.parse(original);
    expect(rid.toString()).toBe(original);
  });

  it("toJSON returns the string form", () => {
    const rid = Rid.create("compass", "main", "folder", "abc123");
    expect(JSON.stringify({ rid })).toBe(
      '{"rid":"ri.compass.main.folder.abc123"}',
    );
  });
});

// -----------------------------------------------------------------------------
// Equality
// -----------------------------------------------------------------------------

describe("Rid.equals", () => {
  it("returns true for identical RIDs", () => {
    const a = Rid.parse("ri.compass.main.folder.abc123");
    const b = Rid.parse("ri.compass.main.folder.abc123");
    expect(a.equals(b)).toBe(true);
  });

  it("returns true for same reference", () => {
    const a = Rid.parse("ri.compass.main.folder.abc123");
    expect(a.equals(a)).toBe(true);
  });

  it("returns false for different locators", () => {
    const a = Rid.parse("ri.compass.main.folder.abc123");
    const b = Rid.parse("ri.compass.main.folder.xyz789");
    expect(a.equals(b)).toBe(false);
  });

  it("returns false for different services", () => {
    const a = Rid.parse("ri.compass.main.folder.abc123");
    const b = Rid.parse("ri.ontology.main.folder.abc123");
    expect(a.equals(b)).toBe(false);
  });

  it("returns false when compared to a non-Rid", () => {
    const a = Rid.parse("ri.compass.main.folder.abc123");
    expect(a.equals("ri.compass.main.folder.abc123")).toBe(false);
    expect(a.equals(null)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Immutability
// -----------------------------------------------------------------------------

describe("Rid immutability", () => {
  it("is frozen", () => {
    const rid = Rid.create("compass", "main", "folder", "abc123");
    expect(Object.isFrozen(rid)).toBe(true);
  });

  it("prevents property assignment", () => {
    const rid = Rid.create("compass", "main", "folder", "abc123");
    expect(() => {
      (rid as Record<string, unknown>)["service"] = "hacked";
    }).toThrow();
  });
});

// -----------------------------------------------------------------------------
// Generation
// -----------------------------------------------------------------------------

describe("generateRid", () => {
  it("produces a valid RID with a UUID locator", () => {
    const rid = generateRid("compass", "folder");
    expect(rid.service).toBe("compass");
    expect(rid.instance).toBe("main");
    expect(rid.type).toBe("folder");
    // UUID v4 pattern
    expect(rid.locator).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("accepts a custom instance", () => {
    const rid = generateRid("compass", "folder", "staging");
    expect(rid.instance).toBe("staging");
  });

  it("produces unique locators", () => {
    const a = generateRid("compass", "folder");
    const b = generateRid("compass", "folder");
    expect(a.equals(b)).toBe(false);
  });
});

describe("generateDeterministicRid", () => {
  it("produces the same RID for the same content", () => {
    const a = generateDeterministicRid("ontology", "object-type", "Employee");
    const b = generateDeterministicRid("ontology", "object-type", "Employee");
    expect(a.equals(b)).toBe(true);
  });

  it("produces different RIDs for different content", () => {
    const a = generateDeterministicRid("ontology", "object-type", "Employee");
    const b = generateDeterministicRid("ontology", "object-type", "Manager");
    expect(a.equals(b)).toBe(false);
  });

  it("locator is a hex sha-256 hash", () => {
    const rid = generateDeterministicRid("ontology", "object-type", "test");
    expect(rid.locator).toMatch(/^[0-9a-f]{64}$/);
  });
});

// -----------------------------------------------------------------------------
// KnownServices
// -----------------------------------------------------------------------------

describe("KnownServices", () => {
  it("contains expected service identifiers", () => {
    expect(KnownServices.COMPASS).toBe("compass");
    expect(KnownServices.ONTOLOGY).toBe("ontology");
    expect(KnownServices.PHONOGRAPH2_OBJECTS).toBe("phonograph2-objects");
    expect(KnownServices.HIGHBURY).toBe("highbury");
    expect(KnownServices.APOLLO).toBe("apollo");
    expect(KnownServices.MULTIPASS).toBe("multipass");
    expect(KnownServices.BLOBSTER).toBe("blobster");
    expect(KnownServices.MIO).toBe("mio");
    expect(KnownServices.DATASETS).toBe("datasets");
    expect(KnownServices.STEMMA).toBe("stemma");
  });

  it("values are valid RID service segments", () => {
    for (const value of Object.values(KnownServices)) {
      expect(() => Rid.create(value, "main", "test", "x")).not.toThrow();
    }
  });
});
