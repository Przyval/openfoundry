/**
 * Conjure wire format serialization and deserialization.
 *
 * Implements the Conjure JSON serialization rules for all Conjure types.
 */

import { toWireDatetime, fromWireDatetime } from "./datetime.js";
import { toWireBase64, fromWireBase64 } from "./binary.js";
import { assertSafeLong } from "./safe-long.js";

/**
 * Conjure type discriminator for wire format operations.
 */
export enum ConjureType {
  STRING = "STRING",
  INTEGER = "INTEGER",
  DOUBLE = "DOUBLE",
  BOOLEAN = "BOOLEAN",
  SAFELONG = "SAFELONG",
  DATETIME = "DATETIME",
  RID = "RID",
  BEARERTOKEN = "BEARERTOKEN",
  BINARY = "BINARY",
  ANY = "ANY",
  LIST = "LIST",
  SET = "SET",
  MAP = "MAP",
  OPTIONAL = "OPTIONAL",
  OBJECT = "OBJECT",
}

/**
 * Serializes a runtime value into its Conjure wire (JSON-safe) representation.
 *
 * Rules:
 * - STRING, INTEGER, DOUBLE, BOOLEAN, RID: pass through
 * - SAFELONG: validated then passed as number
 * - DATETIME: Date → ISO 8601 string
 * - BEARERTOKEN: redacted to "{REDACTED}"
 * - BINARY: Uint8Array → base64 string
 * - LIST / SET: recursed (SET treated as array)
 * - MAP: recursed over entries
 * - OPTIONAL: null/undefined → null, otherwise recurse
 * - OBJECT: recursed over own properties
 * - ANY: pass through
 */
export function serializeConjureValue(
  value: unknown,
  type: ConjureType,
): unknown {
  switch (type) {
    case ConjureType.STRING:
    case ConjureType.INTEGER:
    case ConjureType.DOUBLE:
    case ConjureType.BOOLEAN:
    case ConjureType.RID:
      return value;

    case ConjureType.SAFELONG: {
      const n = value as number;
      assertSafeLong(n);
      return n;
    }

    case ConjureType.DATETIME: {
      if (value instanceof Date) {
        return toWireDatetime(value);
      }
      // If already a string, pass through
      return value;
    }

    case ConjureType.BEARERTOKEN:
      return "{REDACTED}";

    case ConjureType.BINARY: {
      if (value instanceof Uint8Array) {
        return toWireBase64(value);
      }
      return value;
    }

    case ConjureType.LIST:
    case ConjureType.SET: {
      if (!Array.isArray(value)) {
        return value;
      }
      return value.map((item) => serializeConjureValue(item, ConjureType.ANY));
    }

    case ConjureType.MAP: {
      if (value === null || value === undefined || typeof value !== "object") {
        return value;
      }
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = serializeConjureValue(v, ConjureType.ANY);
      }
      return result;
    }

    case ConjureType.OPTIONAL: {
      if (value === null || value === undefined) {
        return null;
      }
      return serializeConjureValue(value, ConjureType.ANY);
    }

    case ConjureType.OBJECT: {
      if (value === null || value === undefined || typeof value !== "object") {
        return value;
      }
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        obj[k] = serializeConjureValue(v, ConjureType.ANY);
      }
      return obj;
    }

    case ConjureType.ANY:
    default: {
      if (value instanceof Date) {
        return toWireDatetime(value);
      }
      if (value instanceof Uint8Array) {
        return toWireBase64(value);
      }
      if (Array.isArray(value)) {
        return value.map((item) =>
          serializeConjureValue(item, ConjureType.ANY),
        );
      }
      if (value !== null && value !== undefined && typeof value === "object") {
        const obj: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(
          value as Record<string, unknown>,
        )) {
          obj[k] = serializeConjureValue(v, ConjureType.ANY);
        }
        return obj;
      }
      return value;
    }
  }
}

/**
 * Deserializes a Conjure wire (JSON) value back into a runtime value.
 *
 * Rules:
 * - STRING, INTEGER, DOUBLE, BOOLEAN, RID: pass through
 * - SAFELONG: validated
 * - DATETIME: ISO 8601 string → Date
 * - BEARERTOKEN: pass through (string on the wire)
 * - BINARY: base64 string → Uint8Array
 * - LIST / SET: recursed
 * - MAP: recursed over entries
 * - OPTIONAL: null → null, otherwise recurse
 * - OBJECT: recursed over own properties
 * - ANY: pass through
 */
export function deserializeConjureValue(
  wire: unknown,
  type: ConjureType,
): unknown {
  switch (type) {
    case ConjureType.STRING:
    case ConjureType.INTEGER:
    case ConjureType.DOUBLE:
    case ConjureType.BOOLEAN:
    case ConjureType.RID:
    case ConjureType.BEARERTOKEN:
      return wire;

    case ConjureType.SAFELONG: {
      const n = wire as number;
      assertSafeLong(n);
      return n;
    }

    case ConjureType.DATETIME: {
      if (typeof wire === "string") {
        return fromWireDatetime(wire);
      }
      return wire;
    }

    case ConjureType.BINARY: {
      if (typeof wire === "string") {
        return fromWireBase64(wire);
      }
      return wire;
    }

    case ConjureType.LIST:
    case ConjureType.SET: {
      if (!Array.isArray(wire)) {
        return wire;
      }
      return wire.map((item) =>
        deserializeConjureValue(item, ConjureType.ANY),
      );
    }

    case ConjureType.MAP: {
      if (wire === null || wire === undefined || typeof wire !== "object") {
        return wire;
      }
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(wire as Record<string, unknown>)) {
        result[k] = deserializeConjureValue(v, ConjureType.ANY);
      }
      return result;
    }

    case ConjureType.OPTIONAL: {
      if (wire === null || wire === undefined) {
        return null;
      }
      return deserializeConjureValue(wire, ConjureType.ANY);
    }

    case ConjureType.OBJECT: {
      if (wire === null || wire === undefined || typeof wire !== "object") {
        return wire;
      }
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(wire as Record<string, unknown>)) {
        obj[k] = deserializeConjureValue(v, ConjureType.ANY);
      }
      return obj;
    }

    case ConjureType.ANY:
    default:
      return wire;
  }
}
