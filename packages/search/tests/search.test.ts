import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySearchEngine } from "../src/in-memory-search.js";
import type { IndexableEntity, SearchQuery } from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ENTITIES: IndexableEntity[] = [
  {
    rid: "ri.ontology.1",
    entityType: "ONTOLOGY",
    title: "Flight Tracker",
    description: "Tracks commercial flights in real time",
    content: "flight-tracker",
  },
  {
    rid: "ri.ontology.2",
    entityType: "ONTOLOGY",
    title: "Supply Chain",
    description: "End-to-end supply chain management ontology",
    content: "supply-chain",
  },
  {
    rid: "ri.dataset.1",
    entityType: "DATASET",
    title: "Airport Codes",
    description: "IATA and ICAO airport codes worldwide",
    content: "airport-codes.csv",
  },
  {
    rid: "ri.dataset.2",
    entityType: "DATASET",
    title: "Flight Routes",
    description: "All commercial flight routes",
  },
  {
    rid: "ri.user.1",
    entityType: "USER",
    title: "Alice Johnson",
    description: "alice@example.com",
    content: "alice",
  },
  {
    rid: "ri.user.2",
    entityType: "USER",
    title: "Bob Smith",
    description: "bob@example.com",
    content: "bob",
  },
  {
    rid: "ri.function.1",
    entityType: "FUNCTION",
    title: "computeFlightDelay",
    description: "Computes the average flight delay for an airport",
    content: "compute-flight-delay",
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InMemorySearchEngine", () => {
  let engine: InMemorySearchEngine;

  beforeEach(async () => {
    engine = new InMemorySearchEngine();
    for (const entity of ENTITIES) {
      await engine.indexEntity(entity);
    }
  });

  // -----------------------------------------------------------------------
  // Basic search
  // -----------------------------------------------------------------------

  it("should return results matching a single term", async () => {
    const response = await engine.search({ query: "flight" });
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.totalCount).toBeGreaterThan(0);
    expect(response.query).toBe("flight");
    expect(response.durationMs).toBeGreaterThanOrEqual(0);

    // All results should mention "flight" somewhere
    for (const result of response.results) {
      const text = [result.title, result.description, result.highlight]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      expect(text).toContain("flight");
    }
  });

  it("should return results matching multiple terms", async () => {
    const response = await engine.search({ query: "airport codes" });
    expect(response.results.length).toBeGreaterThan(0);
    // The "Airport Codes" dataset should rank highest (matches both terms in title)
    expect(response.results[0].rid).toBe("ri.dataset.1");
  });

  it("should return an empty result set for unmatched queries", async () => {
    const response = await engine.search({ query: "zzzznonexistentzzzz" });
    expect(response.results).toEqual([]);
    expect(response.totalCount).toBe(0);
  });

  it("should be case-insensitive", async () => {
    const response = await engine.search({ query: "FLIGHT" });
    expect(response.results.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Entity type filtering
  // -----------------------------------------------------------------------

  it("should filter by a single entity type", async () => {
    const response = await engine.search({
      query: "flight",
      entityTypes: ["DATASET"],
    });

    expect(response.results.length).toBeGreaterThan(0);
    for (const result of response.results) {
      expect(result.entityType).toBe("DATASET");
    }
  });

  it("should filter by multiple entity types", async () => {
    const response = await engine.search({
      query: "flight",
      entityTypes: ["DATASET", "FUNCTION"],
    });

    for (const result of response.results) {
      expect(["DATASET", "FUNCTION"]).toContain(result.entityType);
    }
  });

  it("should return empty results when filtering to non-matching entity type", async () => {
    const response = await engine.search({
      query: "flight",
      entityTypes: ["GROUP"],
    });
    expect(response.results).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Pagination (limit & offset)
  // -----------------------------------------------------------------------

  it("should respect the limit parameter", async () => {
    const response = await engine.search({ query: "flight", limit: 2 });
    expect(response.results.length).toBeLessThanOrEqual(2);
    // totalCount should reflect all matches, not just the page
    expect(response.totalCount).toBeGreaterThanOrEqual(response.results.length);
  });

  it("should respect the offset parameter", async () => {
    const all = await engine.search({ query: "flight", limit: 100 });
    const page2 = await engine.search({ query: "flight", limit: 2, offset: 2 });

    expect(page2.results.length).toBeLessThanOrEqual(2);
    if (all.totalCount > 2) {
      expect(page2.results[0].rid).toBe(all.results[2].rid);
    }
  });

  it("should clamp limit to MAX_LIMIT", async () => {
    const response = await engine.search({ query: "flight", limit: 9999 });
    expect(response.results.length).toBeLessThanOrEqual(100);
  });

  // -----------------------------------------------------------------------
  // Scoring
  // -----------------------------------------------------------------------

  it("should score title matches higher than description matches", async () => {
    const response = await engine.search({ query: "alice" });
    expect(response.results.length).toBeGreaterThan(0);
    // "Alice Johnson" has "alice" in title (weight 3) + content (weight 1)
    expect(response.results[0].rid).toBe("ri.user.1");
    expect(response.results[0].score).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Highlights
  // -----------------------------------------------------------------------

  it("should include highlights with <mark> tags", async () => {
    const response = await engine.search({ query: "alice" });
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0].highlight).toContain("<mark>");
    expect(response.results[0].highlight).toContain("</mark>");
  });

  // -----------------------------------------------------------------------
  // Index management
  // -----------------------------------------------------------------------

  it("should index a new entity and find it", async () => {
    await engine.indexEntity({
      rid: "ri.dataset.new",
      entityType: "DATASET",
      title: "Unique Zebra Dataset",
      description: "Contains zebra data",
    });

    const response = await engine.search({ query: "zebra" });
    expect(response.results.length).toBe(1);
    expect(response.results[0].rid).toBe("ri.dataset.new");
  });

  it("should update an existing entity on re-index", async () => {
    await engine.indexEntity({
      rid: "ri.ontology.1",
      entityType: "ONTOLOGY",
      title: "Renamed Ontology",
      description: "Updated description",
    });

    const response = await engine.search({ query: "Renamed" });
    expect(response.results.length).toBe(1);
    expect(response.results[0].rid).toBe("ri.ontology.1");
    expect(response.results[0].title).toBe("Renamed Ontology");
  });

  it("should remove an entity from the index", async () => {
    await engine.removeEntity("ri.ontology.1");

    const response = await engine.search({ query: "Flight Tracker" });
    const rids = response.results.map((r) => r.rid);
    expect(rids).not.toContain("ri.ontology.1");
  });

  it("should handle removing a non-existent entity gracefully", async () => {
    // Should not throw
    await engine.removeEntity("ri.nonexistent.999");
  });

  // -----------------------------------------------------------------------
  // reindexAll
  // -----------------------------------------------------------------------

  it("should report the number of indexed entities", async () => {
    const result = await engine.reindexAll();
    expect(result.indexed).toBe(ENTITIES.length);
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it("should handle empty query string", async () => {
    const response = await engine.search({ query: "" });
    expect(response.results).toEqual([]);
    expect(response.totalCount).toBe(0);
  });

  it("should handle whitespace-only query", async () => {
    const response = await engine.search({ query: "   " });
    expect(response.results).toEqual([]);
    expect(response.totalCount).toBe(0);
  });

  it("should handle special regex characters in query", async () => {
    // Should not throw
    const response = await engine.search({ query: "test.*+?^${}()|[]" });
    expect(response.totalCount).toBe(0);
  });
});
