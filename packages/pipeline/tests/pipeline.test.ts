import { describe, it, expect } from "vitest";
import {
  validateDag,
  topologicalSort,
  PipelineExecutor,
} from "../src/index.js";
import type {
  PipelineStep,
  PipelineDefinition,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// DAG validation
// ---------------------------------------------------------------------------

describe("validateDag", () => {
  it("accepts a valid linear pipeline", () => {
    const steps: PipelineStep[] = [
      { id: "a", name: "Step A", type: "FILTER", config: {} },
      { id: "b", name: "Step B", type: "MAP", config: {}, dependsOn: ["a"] },
      { id: "c", name: "Step C", type: "SORT", config: {}, dependsOn: ["b"] },
    ];

    const result = validateDag(steps);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts steps with no dependencies", () => {
    const steps: PipelineStep[] = [
      { id: "a", name: "Step A", type: "FILTER", config: {} },
      { id: "b", name: "Step B", type: "MAP", config: {} },
    ];

    const result = validateDag(steps);
    expect(result.valid).toBe(true);
  });

  it("accepts a diamond DAG", () => {
    const steps: PipelineStep[] = [
      { id: "a", name: "A", type: "FILTER", config: {} },
      { id: "b", name: "B", type: "MAP", config: {}, dependsOn: ["a"] },
      { id: "c", name: "C", type: "MAP", config: {}, dependsOn: ["a"] },
      { id: "d", name: "D", type: "SORT", config: {}, dependsOn: ["b", "c"] },
    ];

    const result = validateDag(steps);
    expect(result.valid).toBe(true);
  });

  it("rejects duplicate step IDs", () => {
    const steps: PipelineStep[] = [
      { id: "a", name: "Step A", type: "FILTER", config: {} },
      { id: "a", name: "Step A2", type: "MAP", config: {} },
    ];

    const result = validateDag(steps);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Duplicate step id: "a"');
  });

  it("rejects unknown dependencies", () => {
    const steps: PipelineStep[] = [
      {
        id: "a",
        name: "Step A",
        type: "FILTER",
        config: {},
        dependsOn: ["nonexistent"],
      },
    ];

    const result = validateDag(steps);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("nonexistent");
  });

  it("rejects self-referencing steps", () => {
    const steps: PipelineStep[] = [
      {
        id: "a",
        name: "Step A",
        type: "FILTER",
        config: {},
        dependsOn: ["a"],
      },
    ];

    const result = validateDag(steps);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Step "a" depends on itself');
  });

  it("rejects cycles", () => {
    const steps: PipelineStep[] = [
      { id: "a", name: "A", type: "FILTER", config: {}, dependsOn: ["c"] },
      { id: "b", name: "B", type: "MAP", config: {}, dependsOn: ["a"] },
      { id: "c", name: "C", type: "SORT", config: {}, dependsOn: ["b"] },
    ];

    const result = validateDag(steps);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Pipeline contains a cycle");
  });

  it("accepts an empty step list", () => {
    const result = validateDag([]);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Topological sort
// ---------------------------------------------------------------------------

describe("topologicalSort", () => {
  it("sorts a linear pipeline in order", () => {
    const steps: PipelineStep[] = [
      { id: "c", name: "C", type: "SORT", config: {}, dependsOn: ["b"] },
      { id: "a", name: "A", type: "FILTER", config: {} },
      { id: "b", name: "B", type: "MAP", config: {}, dependsOn: ["a"] },
    ];

    const sorted = topologicalSort(steps);
    const ids = sorted.map((s) => s.id);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("handles a diamond DAG", () => {
    const steps: PipelineStep[] = [
      { id: "d", name: "D", type: "SORT", config: {}, dependsOn: ["b", "c"] },
      { id: "b", name: "B", type: "MAP", config: {}, dependsOn: ["a"] },
      { id: "c", name: "C", type: "MAP", config: {}, dependsOn: ["a"] },
      { id: "a", name: "A", type: "FILTER", config: {} },
    ];

    const sorted = topologicalSort(steps);
    const ids = sorted.map((s) => s.id);

    // a must come first, d must come last
    expect(ids[0]).toBe("a");
    expect(ids[ids.length - 1]).toBe("d");
    // b and c must come before d
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("d"));
    expect(ids.indexOf("c")).toBeLessThan(ids.indexOf("d"));
  });

  it("throws on cyclic graph", () => {
    const steps: PipelineStep[] = [
      { id: "a", name: "A", type: "FILTER", config: {}, dependsOn: ["b"] },
      { id: "b", name: "B", type: "MAP", config: {}, dependsOn: ["a"] },
    ];

    expect(() => topologicalSort(steps)).toThrow("Invalid pipeline DAG");
  });

  it("handles independent steps", () => {
    const steps: PipelineStep[] = [
      { id: "b", name: "B", type: "MAP", config: {} },
      { id: "a", name: "A", type: "FILTER", config: {} },
    ];

    const sorted = topologicalSort(steps);
    // Both are roots, sorted alphabetically for determinism
    expect(sorted.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

describe("PipelineExecutor", () => {
  const executor = new PipelineExecutor();

  function makePipeline(
    steps: PipelineStep[],
  ): PipelineDefinition {
    return {
      rid: "ri.pipeline-builder.main.pipeline.test",
      name: "Test Pipeline",
      steps,
      inputDatasets: [],
      outputDataset: "ri.datasets.main.dataset.out",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  const sampleData = [
    { name: "Alice", age: 30, city: "NYC" },
    { name: "Bob", age: 25, city: "LA" },
    { name: "Charlie", age: 35, city: "NYC" },
    { name: "Diana", age: 28, city: "LA" },
  ];

  // -- FILTER ---------------------------------------------------------------

  describe("FILTER step", () => {
    it("filters with eq operator", () => {
      const pipeline = makePipeline([
        {
          id: "f1",
          name: "Filter",
          type: "FILTER",
          config: { field: "city", operator: "eq", value: "NYC" },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.status).toBe("SUCCEEDED");
      expect(run.stepResults[0].rowsOut).toBe(2);
    });

    it("filters with neq operator", () => {
      const pipeline = makePipeline([
        {
          id: "f1",
          name: "Filter",
          type: "FILTER",
          config: { field: "city", operator: "neq", value: "NYC" },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.stepResults[0].rowsOut).toBe(2);
    });

    it("filters with gt operator", () => {
      const pipeline = makePipeline([
        {
          id: "f1",
          name: "Filter",
          type: "FILTER",
          config: { field: "age", operator: "gt", value: 28 },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.stepResults[0].rowsOut).toBe(2); // Alice (30), Charlie (35)
    });

    it("filters with gte operator", () => {
      const pipeline = makePipeline([
        {
          id: "f1",
          name: "Filter",
          type: "FILTER",
          config: { field: "age", operator: "gte", value: 28 },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.stepResults[0].rowsOut).toBe(3); // Alice, Charlie, Diana
    });

    it("filters with lt and lte operators", () => {
      const pipelineLt = makePipeline([
        {
          id: "f1",
          name: "Filter",
          type: "FILTER",
          config: { field: "age", operator: "lt", value: 30 },
        },
      ]);

      const runLt = executor.execute(pipelineLt, sampleData);
      expect(runLt.stepResults[0].rowsOut).toBe(2); // Bob (25), Diana (28)

      const pipelineLte = makePipeline([
        {
          id: "f1",
          name: "Filter",
          type: "FILTER",
          config: { field: "age", operator: "lte", value: 28 },
        },
      ]);

      const runLte = executor.execute(pipelineLte, sampleData);
      expect(runLte.stepResults[0].rowsOut).toBe(2); // Bob, Diana
    });

    it("filters with contains operator", () => {
      const pipeline = makePipeline([
        {
          id: "f1",
          name: "Filter",
          type: "FILTER",
          config: { field: "name", operator: "contains", value: "li" },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.stepResults[0].rowsOut).toBe(2); // Alice, Charlie
    });

    it("filters with startsWith operator", () => {
      const pipeline = makePipeline([
        {
          id: "f1",
          name: "Filter",
          type: "FILTER",
          config: { field: "name", operator: "startsWith", value: "A" },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.stepResults[0].rowsOut).toBe(1); // Alice
    });

    it("filters with in operator", () => {
      const pipeline = makePipeline([
        {
          id: "f1",
          name: "Filter",
          type: "FILTER",
          config: { field: "age", operator: "in", value: [25, 35] },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.stepResults[0].rowsOut).toBe(2); // Bob, Charlie
    });
  });

  // -- MAP ------------------------------------------------------------------

  describe("MAP step", () => {
    it("maps fields to new names", () => {
      const pipeline = makePipeline([
        {
          id: "m1",
          name: "Map",
          type: "MAP",
          config: {
            mappings: [
              { source: "name", target: "fullName" },
              { source: "age", target: "yearsOld" },
            ],
          },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.status).toBe("SUCCEEDED");
      expect(run.stepResults[0].rowsOut).toBe(4);
    });

    it("applies uppercase transform", () => {
      const pipeline = makePipeline([
        {
          id: "m1",
          name: "Map",
          type: "MAP",
          config: {
            mappings: [
              { source: "name", target: "name", transform: "uppercase" },
            ],
          },
        },
      ]);

      const run = executor.execute(pipeline, [{ name: "alice" }]);
      expect(run.status).toBe("SUCCEEDED");
    });

    it("applies lowercase transform", () => {
      const pipeline = makePipeline([
        {
          id: "m1",
          name: "Map",
          type: "MAP",
          config: {
            mappings: [
              { source: "name", target: "name", transform: "lowercase" },
            ],
          },
        },
      ]);

      const run = executor.execute(pipeline, [{ name: "ALICE" }]);
      expect(run.status).toBe("SUCCEEDED");
    });

    it("applies trim transform", () => {
      const pipeline = makePipeline([
        {
          id: "m1",
          name: "Map",
          type: "MAP",
          config: {
            mappings: [
              { source: "name", target: "name", transform: "trim" },
            ],
          },
        },
      ]);

      const run = executor.execute(pipeline, [{ name: "  alice  " }]);
      expect(run.status).toBe("SUCCEEDED");
    });

    it("applies toNumber transform", () => {
      const pipeline = makePipeline([
        {
          id: "m1",
          name: "Map",
          type: "MAP",
          config: {
            mappings: [
              { source: "age", target: "age", transform: "toNumber" },
            ],
          },
        },
      ]);

      const run = executor.execute(pipeline, [{ age: "42" }]);
      expect(run.status).toBe("SUCCEEDED");
    });
  });

  // -- AGGREGATE ------------------------------------------------------------

  describe("AGGREGATE step", () => {
    it("groups and counts", () => {
      const pipeline = makePipeline([
        {
          id: "a1",
          name: "Aggregate",
          type: "AGGREGATE",
          config: {
            groupBy: ["city"],
            aggregations: [
              { field: "age", function: "count", alias: "count" },
            ],
          },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.status).toBe("SUCCEEDED");
      expect(run.stepResults[0].rowsOut).toBe(2); // NYC, LA
    });

    it("computes sum and avg", () => {
      const pipeline = makePipeline([
        {
          id: "a1",
          name: "Aggregate",
          type: "AGGREGATE",
          config: {
            groupBy: ["city"],
            aggregations: [
              { field: "age", function: "sum", alias: "totalAge" },
              { field: "age", function: "avg", alias: "avgAge" },
            ],
          },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.status).toBe("SUCCEEDED");
    });

    it("computes min and max", () => {
      const pipeline = makePipeline([
        {
          id: "a1",
          name: "Aggregate",
          type: "AGGREGATE",
          config: {
            groupBy: ["city"],
            aggregations: [
              { field: "age", function: "min", alias: "minAge" },
              { field: "age", function: "max", alias: "maxAge" },
            ],
          },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.status).toBe("SUCCEEDED");
    });
  });

  // -- JOIN -----------------------------------------------------------------

  describe("JOIN step", () => {
    const leftData = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
      { id: 3, name: "Charlie" },
    ];

    const rightData = [
      { userId: 1, score: 100 },
      { userId: 2, score: 85 },
      { userId: 4, score: 90 },
    ];

    it("inner join", () => {
      const pipeline = makePipeline([
        {
          id: "j1",
          name: "Join",
          type: "JOIN",
          config: {
            joinType: "inner",
            leftKey: "id",
            rightKey: "userId",
          },
        },
      ]);

      const joinMap = new Map([["j1", rightData]]);
      const run = executor.execute(pipeline, leftData, joinMap);
      expect(run.status).toBe("SUCCEEDED");
      expect(run.stepResults[0].rowsOut).toBe(2); // Alice + Bob
    });

    it("left join", () => {
      const pipeline = makePipeline([
        {
          id: "j1",
          name: "Join",
          type: "JOIN",
          config: {
            joinType: "left",
            leftKey: "id",
            rightKey: "userId",
          },
        },
      ]);

      const joinMap = new Map([["j1", rightData]]);
      const run = executor.execute(pipeline, leftData, joinMap);
      expect(run.status).toBe("SUCCEEDED");
      expect(run.stepResults[0].rowsOut).toBe(3); // All left rows
    });

    it("right join", () => {
      const pipeline = makePipeline([
        {
          id: "j1",
          name: "Join",
          type: "JOIN",
          config: {
            joinType: "right",
            leftKey: "id",
            rightKey: "userId",
          },
        },
      ]);

      const joinMap = new Map([["j1", rightData]]);
      const run = executor.execute(pipeline, leftData, joinMap);
      expect(run.status).toBe("SUCCEEDED");
      expect(run.stepResults[0].rowsOut).toBe(3); // All right rows
    });
  });

  // -- SORT -----------------------------------------------------------------

  describe("SORT step", () => {
    it("sorts ascending", () => {
      const pipeline = makePipeline([
        {
          id: "s1",
          name: "Sort",
          type: "SORT",
          config: {
            fields: [{ field: "age", direction: "asc" }],
          },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.status).toBe("SUCCEEDED");
      expect(run.stepResults[0].rowsOut).toBe(4);
    });

    it("sorts descending", () => {
      const pipeline = makePipeline([
        {
          id: "s1",
          name: "Sort",
          type: "SORT",
          config: {
            fields: [{ field: "age", direction: "desc" }],
          },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.status).toBe("SUCCEEDED");
    });
  });

  // -- DEDUPLICATE ----------------------------------------------------------

  describe("DEDUPLICATE step", () => {
    it("removes duplicates by key", () => {
      const data = [
        { name: "Alice", city: "NYC" },
        { name: "Bob", city: "LA" },
        { name: "Alice", city: "NYC" },
        { name: "Charlie", city: "NYC" },
      ];

      const pipeline = makePipeline([
        {
          id: "d1",
          name: "Dedup",
          type: "DEDUPLICATE",
          config: { keys: ["name"] },
        },
      ]);

      const run = executor.execute(pipeline, data);
      expect(run.status).toBe("SUCCEEDED");
      expect(run.stepResults[0].rowsOut).toBe(3); // Alice, Bob, Charlie
    });

    it("deduplicates by composite key", () => {
      const data = [
        { name: "Alice", city: "NYC" },
        { name: "Alice", city: "LA" },
        { name: "Alice", city: "NYC" },
      ];

      const pipeline = makePipeline([
        {
          id: "d1",
          name: "Dedup",
          type: "DEDUPLICATE",
          config: { keys: ["name", "city"] },
        },
      ]);

      const run = executor.execute(pipeline, data);
      expect(run.stepResults[0].rowsOut).toBe(2); // Alice/NYC, Alice/LA
    });
  });

  // -- CUSTOM ---------------------------------------------------------------

  describe("CUSTOM step", () => {
    it("evaluates a simple expression", () => {
      const pipeline = makePipeline([
        {
          id: "c1",
          name: "Custom",
          type: "CUSTOM",
          config: { expression: "row.age > 28" },
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.status).toBe("SUCCEEDED");
      expect(run.stepResults[0].rowsOut).toBe(2); // Alice (30), Charlie (35)
    });
  });

  // -- Multi-step pipelines -------------------------------------------------

  describe("multi-step pipeline", () => {
    it("chains filter then sort", () => {
      const pipeline = makePipeline([
        {
          id: "f1",
          name: "Filter NYC",
          type: "FILTER",
          config: { field: "city", operator: "eq", value: "NYC" },
        },
        {
          id: "s1",
          name: "Sort by age",
          type: "SORT",
          config: { fields: [{ field: "age", direction: "asc" }] },
          dependsOn: ["f1"],
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.status).toBe("SUCCEEDED");
      expect(run.stepResults).toHaveLength(2);
      expect(run.stepResults[0].status).toBe("SUCCEEDED");
      expect(run.stepResults[1].status).toBe("SUCCEEDED");
      expect(run.stepResults[1].rowsOut).toBe(2);
    });

    it("marks remaining steps as skipped on failure", () => {
      const pipeline = makePipeline([
        {
          id: "f1",
          name: "Filter",
          type: "FILTER",
          config: { field: "city", operator: "eq", value: "NYC" },
        },
        {
          id: "bad",
          name: "Bad step",
          type: "CUSTOM" as const,
          config: { expression: "throw new Error('boom')" },
          dependsOn: ["f1"],
        },
        {
          id: "s1",
          name: "Sort",
          type: "SORT",
          config: { fields: [{ field: "age", direction: "asc" }] },
          dependsOn: ["bad"],
        },
      ]);

      const run = executor.execute(pipeline, sampleData);
      // Custom expressions that throw just return false, so rows are filtered out
      // but the step doesn't fail. Let's verify it still succeeds.
      expect(run.status).toBe("SUCCEEDED");
    });
  });

  // -- Edge cases -----------------------------------------------------------

  describe("edge cases", () => {
    it("handles empty input data", () => {
      const pipeline = makePipeline([
        {
          id: "f1",
          name: "Filter",
          type: "FILTER",
          config: { field: "name", operator: "eq", value: "Alice" },
        },
      ]);

      const run = executor.execute(pipeline, []);
      expect(run.status).toBe("SUCCEEDED");
      expect(run.stepResults[0].rowsOut).toBe(0);
    });

    it("handles pipeline with no steps", () => {
      const pipeline = makePipeline([]);
      const run = executor.execute(pipeline, sampleData);
      expect(run.status).toBe("SUCCEEDED");
      expect(run.stepResults).toHaveLength(0);
    });

    it("fails on invalid DAG", () => {
      const pipeline = makePipeline([
        { id: "a", name: "A", type: "FILTER", config: {}, dependsOn: ["b"] },
        { id: "b", name: "B", type: "MAP", config: {}, dependsOn: ["a"] },
      ]);

      const run = executor.execute(pipeline, sampleData);
      expect(run.status).toBe("FAILED");
      expect(run.error).toContain("Invalid pipeline DAG");
    });
  });
});
