import { describe, it, expect, beforeEach } from "vitest";
import { ObjectSetQueryEngine } from "../src/query-engine.js";
import type {
  ObjectSetDefinition,
  WhereClause,
  AggregationDef,
  GroupByDef,
} from "../src/query-engine.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEmployee(
  id: string,
  firstName: string,
  lastName: string,
  department: string,
  salary: number,
  extra?: Record<string, unknown>,
) {
  return {
    rid: `ri.objects.employee.${id}`,
    objectType: "Employee",
    primaryKey: id,
    properties: {
      id,
      firstName,
      lastName,
      department,
      salary,
      ...extra,
    },
  };
}

const EMPLOYEES = [
  makeEmployee("1", "Alice", "Smith", "Engineering", 120000),
  makeEmployee("2", "Bob", "Jones", "Engineering", 110000),
  makeEmployee("3", "Charlie", "Brown", "Marketing", 95000),
  makeEmployee("4", "Diana", "Prince", "Marketing", 105000),
  makeEmployee("5", "Eve", "Wilson", "Sales", 90000),
  makeEmployee("6", "Frank", "Castle", "Engineering", 130000, { email: null }),
  makeEmployee("7", "Grace", "Hopper", "Engineering", 150000, { title: "Director" }),
];

let engine: ObjectSetQueryEngine;

beforeEach(() => {
  engine = new ObjectSetQueryEngine();
});

// ---------------------------------------------------------------------------
// ObjectSet evaluation
// ---------------------------------------------------------------------------

describe("ObjectSetQueryEngine.evaluate", () => {
  it("returns all objects for a base set", () => {
    const def: ObjectSetDefinition = { type: "base", objectType: "Employee" };
    const result = engine.evaluate(EMPLOYEES, def);
    expect(result).toHaveLength(7);
  });

  it("filters objects with a where clause (eq)", () => {
    const def: ObjectSetDefinition = {
      type: "filter",
      objectSet: { type: "base", objectType: "Employee" },
      where: { type: "eq", field: "department", value: "Engineering" },
    };
    const result = engine.evaluate(EMPLOYEES, def);
    expect(result).toHaveLength(4);
    result.forEach((r) => {
      expect((r.properties as Record<string, unknown>).department).toBe("Engineering");
    });
  });

  it("supports union of two sets", () => {
    const def: ObjectSetDefinition = {
      type: "union",
      objectSets: [
        {
          type: "filter",
          objectSet: { type: "base", objectType: "Employee" },
          where: { type: "eq", field: "department", value: "Engineering" },
        },
        {
          type: "filter",
          objectSet: { type: "base", objectType: "Employee" },
          where: { type: "eq", field: "department", value: "Sales" },
        },
      ],
    };
    const result = engine.evaluate(EMPLOYEES, def);
    expect(result).toHaveLength(5); // 4 eng + 1 sales
  });

  it("supports intersect", () => {
    const def: ObjectSetDefinition = {
      type: "intersect",
      objectSets: [
        {
          type: "filter",
          objectSet: { type: "base", objectType: "Employee" },
          where: { type: "eq", field: "department", value: "Engineering" },
        },
        {
          type: "filter",
          objectSet: { type: "base", objectType: "Employee" },
          where: { type: "gte", field: "salary", value: 125000 },
        },
      ],
    };
    const result = engine.evaluate(EMPLOYEES, def);
    expect(result).toHaveLength(2); // Frank 130k, Grace 150k
  });

  it("supports subtract", () => {
    const def: ObjectSetDefinition = {
      type: "subtract",
      objectSets: [
        { type: "base", objectType: "Employee" },
        {
          type: "filter",
          objectSet: { type: "base", objectType: "Employee" },
          where: { type: "eq", field: "department", value: "Engineering" },
        },
      ],
    };
    const result = engine.evaluate(EMPLOYEES, def);
    expect(result).toHaveLength(3); // Marketing + Sales
  });

  it("supports static set", () => {
    const def: ObjectSetDefinition = {
      type: "static",
      objectType: "Employee",
      primaryKeys: ["1", "3", "5"],
    };
    const result = engine.evaluate(EMPLOYEES, def);
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Where clause evaluation - all filter operators
// ---------------------------------------------------------------------------

describe("ObjectSetQueryEngine.evaluateWhere", () => {
  const obj = {
    properties: {
      name: "Alice Smith",
      age: 30,
      department: "Engineering",
      salary: 120000,
      email: "alice@example.com",
      tags: ["senior", "lead"],
      title: null,
    },
  };

  it("eq - matches equal values", () => {
    expect(engine.evaluateWhere(obj, { type: "eq", field: "department", value: "Engineering" })).toBe(true);
    expect(engine.evaluateWhere(obj, { type: "eq", field: "department", value: "Marketing" })).toBe(false);
  });

  it("neq - matches non-equal values", () => {
    expect(engine.evaluateWhere(obj, { type: "neq", field: "department", value: "Marketing" })).toBe(true);
    expect(engine.evaluateWhere(obj, { type: "neq", field: "department", value: "Engineering" })).toBe(false);
  });

  it("gt - greater than comparison", () => {
    expect(engine.evaluateWhere(obj, { type: "gt", field: "salary", value: 100000 })).toBe(true);
    expect(engine.evaluateWhere(obj, { type: "gt", field: "salary", value: 120000 })).toBe(false);
    expect(engine.evaluateWhere(obj, { type: "gt", field: "salary", value: 150000 })).toBe(false);
  });

  it("gte - greater than or equal comparison", () => {
    expect(engine.evaluateWhere(obj, { type: "gte", field: "salary", value: 120000 })).toBe(true);
    expect(engine.evaluateWhere(obj, { type: "gte", field: "salary", value: 120001 })).toBe(false);
  });

  it("lt - less than comparison", () => {
    expect(engine.evaluateWhere(obj, { type: "lt", field: "salary", value: 150000 })).toBe(true);
    expect(engine.evaluateWhere(obj, { type: "lt", field: "salary", value: 120000 })).toBe(false);
  });

  it("lte - less than or equal comparison", () => {
    expect(engine.evaluateWhere(obj, { type: "lte", field: "salary", value: 120000 })).toBe(true);
    expect(engine.evaluateWhere(obj, { type: "lte", field: "salary", value: 119999 })).toBe(false);
  });

  it("contains - string containment", () => {
    expect(engine.evaluateWhere(obj, { type: "contains", field: "name", value: "Alice" })).toBe(true);
    expect(engine.evaluateWhere(obj, { type: "contains", field: "name", value: "Bob" })).toBe(false);
  });

  it("startsWith - string prefix", () => {
    expect(engine.evaluateWhere(obj, { type: "startsWith", field: "name", value: "Alice" })).toBe(true);
    expect(engine.evaluateWhere(obj, { type: "startsWith", field: "name", value: "Smith" })).toBe(false);
  });

  it("endsWith - string suffix", () => {
    expect(engine.evaluateWhere(obj, { type: "endsWith", field: "name", value: "Smith" })).toBe(true);
    expect(engine.evaluateWhere(obj, { type: "endsWith", field: "name", value: "Alice" })).toBe(false);
  });

  it("isNull - null/undefined check", () => {
    expect(engine.evaluateWhere(obj, { type: "isNull", field: "title" })).toBe(true);
    expect(engine.evaluateWhere(obj, { type: "isNull", field: "nonexistent" })).toBe(true);
    expect(engine.evaluateWhere(obj, { type: "isNull", field: "name" })).toBe(false);
  });

  it("in - value in set", () => {
    expect(
      engine.evaluateWhere(obj, {
        type: "in",
        field: "department",
        values: ["Engineering", "Marketing"],
      }),
    ).toBe(true);
    expect(
      engine.evaluateWhere(obj, {
        type: "in",
        field: "department",
        values: ["Sales", "Marketing"],
      }),
    ).toBe(false);
  });

  it("and - logical AND", () => {
    const where: WhereClause = {
      type: "and",
      value: [
        { type: "eq", field: "department", value: "Engineering" },
        { type: "gte", field: "salary", value: 100000 },
      ],
    } as unknown as WhereClause;
    expect(engine.evaluateWhere(obj, where)).toBe(true);

    const failing: WhereClause = {
      type: "and",
      value: [
        { type: "eq", field: "department", value: "Marketing" },
        { type: "gte", field: "salary", value: 100000 },
      ],
    } as unknown as WhereClause;
    expect(engine.evaluateWhere(obj, failing)).toBe(false);
  });

  it("or - logical OR", () => {
    const where: WhereClause = {
      type: "or",
      value: [
        { type: "eq", field: "department", value: "Marketing" },
        { type: "gte", field: "salary", value: 100000 },
      ],
    } as unknown as WhereClause;
    expect(engine.evaluateWhere(obj, where)).toBe(true);
  });

  it("not - logical NOT", () => {
    const where: WhereClause = {
      type: "not",
      value: { type: "eq", field: "department", value: "Marketing" },
    } as unknown as WhereClause;
    expect(engine.evaluateWhere(obj, where)).toBe(true);

    const notEng: WhereClause = {
      type: "not",
      value: { type: "eq", field: "department", value: "Engineering" },
    } as unknown as WhereClause;
    expect(engine.evaluateWhere(obj, notEng)).toBe(false);
  });

  it("handles complex nested filters", () => {
    const where: WhereClause = {
      type: "and",
      value: [
        {
          type: "or",
          value: [
            { type: "eq", field: "department", value: "Engineering" },
            { type: "eq", field: "department", value: "Marketing" },
          ],
        },
        { type: "gte", field: "salary", value: 100000 },
        {
          type: "not",
          value: { type: "eq", field: "age", value: 25 },
        },
      ],
    } as unknown as WhereClause;
    expect(engine.evaluateWhere(obj, where)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

describe("ObjectSetQueryEngine.aggregate", () => {
  it("computes count aggregation", () => {
    const aggs: AggregationDef[] = [{ type: "count", name: "total" }];
    const result = engine.aggregate(EMPLOYEES, aggs);
    expect(result).toHaveLength(1);
    expect(result[0].metrics.total).toBe(7);
  });

  it("computes sum aggregation", () => {
    const aggs: AggregationDef[] = [{ type: "sum", field: "salary", name: "totalSalary" }];
    const result = engine.aggregate(EMPLOYEES, aggs);
    expect(result[0].metrics.totalSalary).toBe(
      120000 + 110000 + 95000 + 105000 + 90000 + 130000 + 150000,
    );
  });

  it("computes avg aggregation", () => {
    const aggs: AggregationDef[] = [{ type: "avg", field: "salary", name: "avgSalary" }];
    const result = engine.aggregate(EMPLOYEES, aggs);
    const expectedAvg = (120000 + 110000 + 95000 + 105000 + 90000 + 130000 + 150000) / 7;
    expect(result[0].metrics.avgSalary).toBeCloseTo(expectedAvg);
  });

  it("computes min and max aggregations", () => {
    const aggs: AggregationDef[] = [
      { type: "min", field: "salary", name: "minSalary" },
      { type: "max", field: "salary", name: "maxSalary" },
    ];
    const result = engine.aggregate(EMPLOYEES, aggs);
    expect(result[0].metrics.minSalary).toBe(90000);
    expect(result[0].metrics.maxSalary).toBe(150000);
  });

  it("computes multiple aggregations at once", () => {
    const aggs: AggregationDef[] = [
      { type: "count", name: "total" },
      { type: "avg", field: "salary", name: "avgSalary" },
      { type: "sum", field: "salary", name: "totalSalary" },
      { type: "min", field: "salary", name: "minSalary" },
      { type: "max", field: "salary", name: "maxSalary" },
    ];
    const result = engine.aggregate(EMPLOYEES, aggs);
    expect(result[0].metrics.total).toBe(7);
    expect(result[0].metrics.minSalary).toBe(90000);
    expect(result[0].metrics.maxSalary).toBe(150000);
  });

  it("groups by a field", () => {
    const aggs: AggregationDef[] = [
      { type: "count", name: "total" },
      { type: "avg", field: "salary", name: "avgSalary" },
    ];
    const groupBy: GroupByDef[] = [{ field: "department", type: "exact" }];
    const result = engine.aggregate(EMPLOYEES, aggs, groupBy);

    expect(result.length).toBe(3); // Engineering, Marketing, Sales

    const engGroup = result.find((r) => r.group.department === "Engineering");
    expect(engGroup).toBeDefined();
    expect(engGroup!.metrics.total).toBe(4);

    const marketingGroup = result.find((r) => r.group.department === "Marketing");
    expect(marketingGroup).toBeDefined();
    expect(marketingGroup!.metrics.total).toBe(2);

    const salesGroup = result.find((r) => r.group.department === "Sales");
    expect(salesGroup).toBeDefined();
    expect(salesGroup!.metrics.total).toBe(1);
  });

  it("handles empty objects array", () => {
    const aggs: AggregationDef[] = [
      { type: "count", name: "total" },
      { type: "avg", field: "salary", name: "avgSalary" },
    ];
    const result = engine.aggregate([], aggs);
    expect(result[0].metrics.total).toBe(0);
    expect(result[0].metrics.avgSalary).toBe(0);
  });

  it("computes distinct count", () => {
    const aggs: AggregationDef[] = [
      { type: "exact_distinct", field: "department", name: "uniqueDepts" },
    ];
    const result = engine.aggregate(EMPLOYEES, aggs);
    expect(result[0].metrics.uniqueDepts).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

describe("ObjectSetQueryEngine.search", () => {
  it("searches across specified fields", () => {
    const result = engine.search(EMPLOYEES, {
      query: "alice",
      fields: ["firstName", "lastName"],
    });
    expect(result.data).toHaveLength(1);
    expect((result.data[0].properties as Record<string, unknown>).firstName).toBe("Alice");
  });

  it("searches across all fields when none specified", () => {
    const result = engine.search(EMPLOYEES, {
      query: "Engineering",
    });
    expect(result.data).toHaveLength(4);
  });

  it("supports multi-word search (any term matches)", () => {
    const result = engine.search(EMPLOYEES, {
      query: "alice engineering",
      fields: ["firstName", "department"],
    });
    // Alice matches "alice" (and is also in Engineering), Bob/Frank/Grace match "engineering"
    expect(result.totalCount).toBe(4); // Alice + Bob + Frank + Grace
  });

  it("sorts results by field", () => {
    const result = engine.search(EMPLOYEES, {
      query: "Engineering",
      fields: ["department"],
      orderBy: { field: "lastName", direction: "asc" },
    });
    const names = result.data.map(
      (d) => (d.properties as Record<string, unknown>).lastName,
    );
    expect(names).toEqual(["Castle", "Hopper", "Jones", "Smith"]);
  });

  it("paginates search results", () => {
    const page1 = engine.search(EMPLOYEES, {
      query: "Engineering",
      fields: ["department"],
      pageSize: 2,
    });
    expect(page1.data).toHaveLength(2);
    expect(page1.totalCount).toBe(4);

    const page2 = engine.search(EMPLOYEES, {
      query: "Engineering",
      fields: ["department"],
      pageSize: 2,
      pageToken: "2",
    });
    expect(page2.data).toHaveLength(2);
  });

  it("returns empty for no matches", () => {
    const result = engine.search(EMPLOYEES, {
      query: "nonexistentxyz",
      fields: ["firstName"],
    });
    expect(result.data).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: evaluate + aggregate
// ---------------------------------------------------------------------------

describe("Integration: evaluate then aggregate", () => {
  it("filters then aggregates", () => {
    const def: ObjectSetDefinition = {
      type: "filter",
      objectSet: { type: "base", objectType: "Employee" },
      where: { type: "eq", field: "department", value: "Engineering" },
    };

    const filtered = engine.evaluate(EMPLOYEES, def);
    expect(filtered).toHaveLength(4);

    const aggs: AggregationDef[] = [
      { type: "count", name: "total" },
      { type: "avg", field: "salary", name: "avgSalary" },
    ];
    const result = engine.aggregate(filtered, aggs);
    expect(result[0].metrics.total).toBe(4);
    expect(result[0].metrics.avgSalary).toBe((120000 + 110000 + 130000 + 150000) / 4);
  });
});
