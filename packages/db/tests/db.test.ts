import { describe, it, expect } from "vitest";
import { QueryBuilder, sql } from "../src/query-builder.js";
import {
  toPgTimestamp,
  fromPgTimestamp,
  jsonbSet,
  paginate,
} from "../src/helpers.js";

// ---------------------------------------------------------------------------
// QueryBuilder tests
// ---------------------------------------------------------------------------

describe("QueryBuilder", () => {
  it("builds a simple SELECT query", () => {
    const q = new QueryBuilder().select("*").from("users").build();
    expect(q.text).toBe("SELECT * FROM users");
    expect(q.values).toEqual([]);
  });

  it("builds SELECT with specific columns", () => {
    const q = new QueryBuilder()
      .select(["id", "name", "email"])
      .from("users")
      .build();
    expect(q.text).toBe("SELECT id, name, email FROM users");
    expect(q.values).toEqual([]);
  });

  it("builds SELECT with WHERE clause and parameterised values", () => {
    const q = new QueryBuilder()
      .select("*")
      .from("users")
      .where("id = ?", 42)
      .build();
    expect(q.text).toBe("SELECT * FROM users WHERE id = $1");
    expect(q.values).toEqual([42]);
  });

  it("chains andWhere and orWhere", () => {
    const q = new QueryBuilder()
      .select("*")
      .from("objects")
      .where("object_type_rid = ?", "type-1")
      .andWhere("primary_key = ?", "pk-1")
      .orWhere("primary_key = ?", "pk-2")
      .build();
    expect(q.text).toBe(
      "SELECT * FROM objects WHERE object_type_rid = $1 AND primary_key = $2 OR primary_key = $3",
    );
    expect(q.values).toEqual(["type-1", "pk-1", "pk-2"]);
  });

  it("builds SELECT with ORDER BY, LIMIT and OFFSET", () => {
    const q = new QueryBuilder()
      .select("*")
      .from("users")
      .orderBy("created_at", "DESC")
      .limit(10)
      .offset(20)
      .build();
    expect(q.text).toBe(
      "SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    );
    expect(q.values).toEqual([10, 20]);
  });

  it("builds INSERT query with RETURNING", () => {
    const q = new QueryBuilder()
      .insertInto("ontologies", {
        rid: "rid-1",
        api_name: "myOntology",
        display_name: "My Ontology",
      })
      .returning()
      .build();
    expect(q.text).toBe(
      "INSERT INTO ontologies (rid, api_name, display_name) VALUES ($1, $2, $3) RETURNING *",
    );
    expect(q.values).toEqual(["rid-1", "myOntology", "My Ontology"]);
  });

  it("builds INSERT with specific RETURNING columns", () => {
    const q = new QueryBuilder()
      .insertInto("users", { rid: "u-1", username: "alice" })
      .returning(["rid", "username"])
      .build();
    expect(q.text).toBe(
      "INSERT INTO users (rid, username) VALUES ($1, $2) RETURNING rid, username",
    );
    expect(q.values).toEqual(["u-1", "alice"]);
  });

  it("builds UPDATE query with WHERE", () => {
    const q = new QueryBuilder()
      .update("users", { email: "new@example.com", display_name: "New Name" })
      .where("rid = ?", "rid-1")
      .returning()
      .build();
    expect(q.text).toBe(
      "UPDATE users SET email = $1, display_name = $2 WHERE rid = $3 RETURNING *",
    );
    expect(q.values).toEqual(["new@example.com", "New Name", "rid-1"]);
  });

  it("builds DELETE query with WHERE", () => {
    const q = new QueryBuilder()
      .deleteFrom("users")
      .where("rid = ?", "rid-1")
      .build();
    expect(q.text).toBe("DELETE FROM users WHERE rid = $1");
    expect(q.values).toEqual(["rid-1"]);
  });

  it("handles multiple ? placeholders in a single WHERE", () => {
    const q = new QueryBuilder()
      .select("*")
      .from("object_types")
      .where("ontology_rid = ? AND api_name = ?", "ont-1", "Employee")
      .build();
    expect(q.text).toBe(
      "SELECT * FROM object_types WHERE ontology_rid = $1 AND api_name = $2",
    );
    expect(q.values).toEqual(["ont-1", "Employee"]);
  });

  it("sql() returns a new QueryBuilder", () => {
    const builder = sql();
    expect(builder).toBeInstanceOf(QueryBuilder);
  });
});

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

describe("paginate", () => {
  it("applies LIMIT and OFFSET to a query builder", () => {
    const q = new QueryBuilder().select("*").from("objects");
    paginate(q, 25, 50);
    const built = q.build();
    expect(built.text).toBe("SELECT * FROM objects LIMIT $1 OFFSET $2");
    expect(built.values).toEqual([25, 50]);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe("toPgTimestamp", () => {
  it("converts a Date to an ISO-8601 string", () => {
    const d = new Date("2025-06-15T12:30:00.000Z");
    expect(toPgTimestamp(d)).toBe("2025-06-15T12:30:00.000Z");
  });
});

describe("fromPgTimestamp", () => {
  it("parses a timestamp string to a Date", () => {
    const d = fromPgTimestamp("2025-06-15T12:30:00.000Z");
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2025);
  });
});

describe("jsonbSet", () => {
  it("serialises an object to a JSON string", () => {
    const result = jsonbSet({ status: "active", count: 5 });
    expect(result).toBe('{"status":"active","count":5}');
  });

  it("handles empty objects", () => {
    expect(jsonbSet({})).toBe("{}");
  });
});
