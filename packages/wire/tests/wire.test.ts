import { describe, it, expect } from "vitest";
import {
  SAFE_LONG_MIN,
  SAFE_LONG_MAX,
  isSafeLong,
  assertSafeLong,
  toWireDatetime,
  fromWireDatetime,
  isValidWireDatetime,
  toWireBase64,
  fromWireBase64,
  ConjureType,
  serializeConjureValue,
  deserializeConjureValue,
  serializeQueryParam,
  buildQueryString,
  serializeRequestBody,
  deserializeResponseBody,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// SafeLong
// ---------------------------------------------------------------------------
describe("SafeLong", () => {
  it("accepts integers within the safe range", () => {
    expect(isSafeLong(0)).toBe(true);
    expect(isSafeLong(42)).toBe(true);
    expect(isSafeLong(-42)).toBe(true);
    expect(isSafeLong(SAFE_LONG_MAX)).toBe(true);
    expect(isSafeLong(SAFE_LONG_MIN)).toBe(true);
  });

  it("rejects values outside the safe range", () => {
    expect(isSafeLong(SAFE_LONG_MAX + 1)).toBe(false);
    expect(isSafeLong(SAFE_LONG_MIN - 1)).toBe(false);
  });

  it("rejects non-integer numbers", () => {
    expect(isSafeLong(1.5)).toBe(false);
    expect(isSafeLong(NaN)).toBe(false);
    expect(isSafeLong(Infinity)).toBe(false);
  });

  it("assertSafeLong throws for unsafe values", () => {
    expect(() => assertSafeLong(1.5)).toThrow(RangeError);
    expect(() => assertSafeLong(SAFE_LONG_MAX + 1)).toThrow(RangeError);
    expect(() => assertSafeLong(NaN)).toThrow(RangeError);
  });

  it("assertSafeLong does not throw for valid values", () => {
    expect(() => assertSafeLong(0)).not.toThrow();
    expect(() => assertSafeLong(SAFE_LONG_MAX)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// DateTime
// ---------------------------------------------------------------------------
describe("DateTime", () => {
  it("round-trips a Date through wire format", () => {
    const original = new Date("2024-06-15T12:30:45.123Z");
    const wire = toWireDatetime(original);
    const parsed = fromWireDatetime(wire);
    expect(parsed.getTime()).toBe(original.getTime());
  });

  it("produces ISO 8601 output with Z suffix", () => {
    const date = new Date("2024-01-01T00:00:00.000Z");
    const wire = toWireDatetime(date);
    expect(wire).toBe("2024-01-01T00:00:00.000Z");
  });

  it("validates ISO 8601 strings", () => {
    expect(isValidWireDatetime("2024-06-15T12:30:45.123Z")).toBe(true);
    expect(isValidWireDatetime("2024-06-15T12:30:45Z")).toBe(true);
    expect(isValidWireDatetime("2024-06-15T12:30:45+05:00")).toBe(true);
    expect(isValidWireDatetime("not-a-date")).toBe(false);
    expect(isValidWireDatetime("2024-06-15")).toBe(false);
  });

  it("throws on invalid datetime strings", () => {
    expect(() => fromWireDatetime("not-a-date")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Binary (base64)
// ---------------------------------------------------------------------------
describe("Binary base64", () => {
  it("round-trips binary data", () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const encoded = toWireBase64(original);
    const decoded = fromWireBase64(encoded);
    expect(decoded).toEqual(original);
  });

  it("encodes to correct base64", () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(toWireBase64(data)).toBe("SGVsbG8=");
  });

  it("handles empty buffers", () => {
    const empty = new Uint8Array(0);
    const encoded = toWireBase64(empty);
    expect(encoded).toBe("");
    const decoded = fromWireBase64(encoded);
    expect(decoded.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Conjure serialization
// ---------------------------------------------------------------------------
describe("Conjure serialization", () => {
  it("passes through string values", () => {
    expect(serializeConjureValue("hello", ConjureType.STRING)).toBe("hello");
    expect(deserializeConjureValue("hello", ConjureType.STRING)).toBe("hello");
  });

  it("passes through integer values", () => {
    expect(serializeConjureValue(42, ConjureType.INTEGER)).toBe(42);
    expect(deserializeConjureValue(42, ConjureType.INTEGER)).toBe(42);
  });

  it("passes through boolean values", () => {
    expect(serializeConjureValue(true, ConjureType.BOOLEAN)).toBe(true);
  });

  it("validates safelong on serialization", () => {
    expect(serializeConjureValue(42, ConjureType.SAFELONG)).toBe(42);
    expect(() =>
      serializeConjureValue(1.5, ConjureType.SAFELONG),
    ).toThrow();
  });

  it("serializes datetime as ISO 8601", () => {
    const date = new Date("2024-06-15T12:00:00.000Z");
    const wire = serializeConjureValue(date, ConjureType.DATETIME);
    expect(wire).toBe("2024-06-15T12:00:00.000Z");
  });

  it("deserializes datetime from ISO 8601", () => {
    const result = deserializeConjureValue(
      "2024-06-15T12:00:00.000Z",
      ConjureType.DATETIME,
    );
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe("2024-06-15T12:00:00.000Z");
  });

  it("redacts bearer tokens on serialization", () => {
    expect(serializeConjureValue("secret-token", ConjureType.BEARERTOKEN)).toBe(
      "{REDACTED}",
    );
  });

  it("serializes binary to base64", () => {
    const data = new Uint8Array([1, 2, 3]);
    const wire = serializeConjureValue(data, ConjureType.BINARY);
    expect(typeof wire).toBe("string");
    const restored = deserializeConjureValue(
      wire,
      ConjureType.BINARY,
    ) as Uint8Array;
    expect(restored).toEqual(data);
  });

  it("handles optional null/undefined", () => {
    expect(serializeConjureValue(null, ConjureType.OPTIONAL)).toBe(null);
    expect(serializeConjureValue(undefined, ConjureType.OPTIONAL)).toBe(null);
    expect(deserializeConjureValue(null, ConjureType.OPTIONAL)).toBe(null);
  });

  it("handles optional with value", () => {
    expect(serializeConjureValue("hello", ConjureType.OPTIONAL)).toBe("hello");
  });

  it("serializes lists recursively", () => {
    const result = serializeConjureValue([1, 2, 3], ConjureType.LIST);
    expect(result).toEqual([1, 2, 3]);
  });

  it("serializes objects recursively", () => {
    const obj = { a: 1, b: "two" };
    const result = serializeConjureValue(obj, ConjureType.OBJECT);
    expect(result).toEqual({ a: 1, b: "two" });
  });

  it("serializes Dates inside ANY type", () => {
    const date = new Date("2024-01-01T00:00:00.000Z");
    const wire = serializeConjureValue(date, ConjureType.ANY);
    expect(wire).toBe("2024-01-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------
describe("Query parameters", () => {
  it("serializes simple key-value pairs", () => {
    expect(serializeQueryParam("key", "value")).toBe("key=value");
    expect(serializeQueryParam("num", 42)).toBe("num=42");
  });

  it("serializes arrays as repeated params", () => {
    const result = serializeQueryParam("ids", [1, 2, 3]);
    expect(result).toBe("ids=1&ids=2&ids=3");
  });

  it("serializes dates as ISO strings", () => {
    const date = new Date("2024-01-01T00:00:00.000Z");
    const result = serializeQueryParam("ts", date);
    expect(result).toContain("2024-01-01");
  });

  it("returns empty string for undefined/null", () => {
    expect(serializeQueryParam("key", undefined)).toBe("");
    expect(serializeQueryParam("key", null)).toBe("");
  });

  it("builds query string omitting undefined values", () => {
    const result = buildQueryString({
      a: "1",
      b: undefined,
      c: "3",
    });
    expect(result).toBe("a=1&c=3");
  });

  it("returns empty string for all-undefined params", () => {
    expect(buildQueryString({ a: undefined })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Request/response body
// ---------------------------------------------------------------------------
describe("Request/response body", () => {
  it("serializes objects to JSON", () => {
    const body = { name: "test", count: 5 };
    const json = serializeRequestBody(body);
    expect(json).toBe('{"name":"test","count":5}');
  });

  it("returns undefined for undefined body", () => {
    expect(serializeRequestBody(undefined)).toBeUndefined();
  });

  it("serializes null to 'null'", () => {
    expect(serializeRequestBody(null)).toBe("null");
  });

  it("serializes Dates in request body to ISO strings", () => {
    const body = { ts: new Date("2024-01-01T00:00:00.000Z") };
    const json = serializeRequestBody(body);
    expect(json).toContain("2024-01-01T00:00:00.000Z");
  });

  it("deserializes JSON and revives date strings", () => {
    const json = '{"ts":"2024-06-15T12:00:00.000Z","name":"test"}';
    const result = deserializeResponseBody<{ ts: Date; name: string }>(json);
    expect(result.ts).toBeInstanceOf(Date);
    expect(result.name).toBe("test");
  });

  it("deserializes plain values without date strings", () => {
    const json = '{"count":42,"label":"hello"}';
    const result = deserializeResponseBody<{ count: number; label: string }>(json);
    expect(result.count).toBe(42);
    expect(result.label).toBe("hello");
  });
});
