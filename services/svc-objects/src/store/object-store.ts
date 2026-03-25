import type { Filter } from "@openfoundry/object-set";
import type { Aggregation } from "@openfoundry/object-set";
import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";
import {
  encodePageToken,
  decodePageToken,
  type PageToken,
} from "@openfoundry/pagination";
import { writeFileSync, readFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredObject {
  rid: string;
  objectType: string;
  primaryKey: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ListOptions {
  pageSize?: number;
  pageToken?: string;
}

export interface ListResult {
  data: StoredObject[];
  nextPageToken?: string;
  totalCount: number;
}

export interface AggregationResult {
  type: string;
  property?: string;
  value: number;
}

export interface OrderByClause {
  field: string;
  direction: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// Filter evaluator
// ---------------------------------------------------------------------------

export function evaluateFilter(
  obj: StoredObject,
  filter: Filter,
): boolean {
  switch (filter.type) {
    case "AND":
      return filter.filters.every((f) => evaluateFilter(obj, f));

    case "OR":
      return filter.filters.some((f) => evaluateFilter(obj, f));

    case "NOT":
      return !evaluateFilter(obj, filter.filter);

    case "EQUALS":
      return obj.properties[filter.property] === filter.value;

    case "CONTAINS": {
      const val = obj.properties[filter.property];
      return typeof val === "string" && val.includes(filter.value);
    }

    case "STARTS_WITH": {
      const val = obj.properties[filter.property];
      return typeof val === "string" && val.startsWith(filter.value);
    }

    case "GT": {
      const val = obj.properties[filter.property];
      return typeof val === typeof filter.value && (val as number) > (filter.value as number);
    }

    case "GTE": {
      const val = obj.properties[filter.property];
      return typeof val === typeof filter.value && (val as number) >= (filter.value as number);
    }

    case "LT": {
      const val = obj.properties[filter.property];
      return typeof val === typeof filter.value && (val as number) < (filter.value as number);
    }

    case "LTE": {
      const val = obj.properties[filter.property];
      return typeof val === typeof filter.value && (val as number) <= (filter.value as number);
    }

    case "IS_NULL":
      return (
        obj.properties[filter.property] === null ||
        obj.properties[filter.property] === undefined
      );

    case "HAS_PROPERTY":
      return (
        filter.property in obj.properties &&
        obj.properties[filter.property] !== undefined &&
        obj.properties[filter.property] !== null
      );

    case "IN_SET": {
      const val = obj.properties[filter.property];
      return filter.values.includes(val as string | number | boolean);
    }

    case "RANGE": {
      const val = obj.properties[filter.property] as number;
      if (typeof val !== "number") return false;
      if (filter.gt !== undefined && val <= (filter.gt as number)) return false;
      if (filter.gte !== undefined && val < (filter.gte as number)) return false;
      if (filter.lt !== undefined && val >= (filter.lt as number)) return false;
      if (filter.lte !== undefined && val > (filter.lte as number)) return false;
      return true;
    }

    default:
      // Unsupported filter types pass through (return true)
      return true;
  }
}

// ---------------------------------------------------------------------------
// Aggregation evaluator
// ---------------------------------------------------------------------------

export function evaluateAggregation(
  objects: StoredObject[],
  aggregation: Aggregation,
): AggregationResult {
  switch (aggregation.type) {
    case "COUNT":
      return { type: "COUNT", value: objects.length };

    case "MIN": {
      const nums = objects
        .map((o) => o.properties[aggregation.property])
        .filter((v): v is number => typeof v === "number");
      return {
        type: "MIN",
        property: aggregation.property,
        value: nums.length > 0 ? Math.min(...nums) : 0,
      };
    }

    case "MAX": {
      const nums = objects
        .map((o) => o.properties[aggregation.property])
        .filter((v): v is number => typeof v === "number");
      return {
        type: "MAX",
        property: aggregation.property,
        value: nums.length > 0 ? Math.max(...nums) : 0,
      };
    }

    case "SUM": {
      const nums = objects
        .map((o) => o.properties[aggregation.property])
        .filter((v): v is number => typeof v === "number");
      return {
        type: "SUM",
        property: aggregation.property,
        value: nums.reduce((a, b) => a + b, 0),
      };
    }

    case "AVG": {
      const nums = objects
        .map((o) => o.properties[aggregation.property])
        .filter((v): v is number => typeof v === "number");
      return {
        type: "AVG",
        property: aggregation.property,
        value: nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0,
      };
    }

    default:
      return { type: aggregation.type, value: 0 };
  }
}

// ---------------------------------------------------------------------------
// ObjectStore
// ---------------------------------------------------------------------------

/**
 * In-memory object store. Objects are organized by objectType, then by primaryKey.
 */
export class ObjectStore {
  /** Map<objectType, Map<primaryKey, StoredObject>> */
  private readonly objects = new Map<string, Map<string, StoredObject>>();
  private readonly DATA_FILE = "/tmp/openfoundry-data/object-store.json";

  constructor() {
    this.loadFromDisk();
  }

  // -----------------------------------------------------------------------
  // Persistence helpers
  // -----------------------------------------------------------------------

  private saveToDisk(): void {
    try {
      const dir = dirname(this.DATA_FILE);
      mkdirSync(dir, { recursive: true });

      const plain: Record<string, Record<string, StoredObject>> = {};
      for (const [objectType, typeMap] of this.objects) {
        plain[objectType] = Object.fromEntries(typeMap);
      }

      const tmpFile = this.DATA_FILE + ".tmp";
      writeFileSync(tmpFile, JSON.stringify(plain, null, 2), "utf-8");
      renameSync(tmpFile, this.DATA_FILE);
    } catch {
      // Best-effort persistence — don't crash the service
    }
  }

  private loadFromDisk(): void {
    try {
      if (!existsSync(this.DATA_FILE)) return;

      const raw = readFileSync(this.DATA_FILE, "utf-8");
      const plain = JSON.parse(raw) as Record<string, Record<string, StoredObject>>;

      for (const [objectType, entries] of Object.entries(plain)) {
        this.objects.set(objectType, new Map(Object.entries(entries)));
      }
    } catch {
      // If file is missing or corrupt, start with empty store
    }
  }

  private getTypeMap(objectType: string): Map<string, StoredObject> {
    let map = this.objects.get(objectType);
    if (!map) {
      map = new Map();
      this.objects.set(objectType, map);
    }
    return map;
  }

  createObject(
    objectType: string,
    primaryKey: string,
    properties: Record<string, unknown>,
  ): StoredObject {
    const typeMap = this.getTypeMap(objectType);
    if (typeMap.has(primaryKey)) {
      throw conflict(
        `${objectType}:${primaryKey}`,
        "object with this primary key already exists",
      );
    }

    const now = new Date().toISOString();
    const rid = generateRid("phonograph2-objects", "object").toString();
    const obj: StoredObject = {
      rid,
      objectType,
      primaryKey,
      properties,
      createdAt: now,
      updatedAt: now,
    };
    typeMap.set(primaryKey, obj);
    this.saveToDisk();
    return obj;
  }

  getObject(objectType: string, primaryKey: string): StoredObject {
    const typeMap = this.objects.get(objectType);
    const obj = typeMap?.get(primaryKey);
    if (!obj) {
      throw notFound("Object", `${objectType}:${primaryKey}`);
    }
    return obj;
  }

  updateObject(
    objectType: string,
    primaryKey: string,
    properties: Record<string, unknown>,
  ): StoredObject {
    const obj = this.getObject(objectType, primaryKey);
    const updated: StoredObject = {
      ...obj,
      properties: { ...obj.properties, ...properties },
      updatedAt: new Date().toISOString(),
    };
    this.getTypeMap(objectType).set(primaryKey, updated);
    this.saveToDisk();
    return updated;
  }

  deleteObject(objectType: string, primaryKey: string): void {
    const typeMap = this.objects.get(objectType);
    if (!typeMap?.has(primaryKey)) {
      throw notFound("Object", `${objectType}:${primaryKey}`);
    }
    typeMap.delete(primaryKey);
    this.saveToDisk();
  }

  listObjects(objectType: string, options: ListOptions = {}): ListResult {
    const typeMap = this.objects.get(objectType);
    const allObjects = typeMap ? Array.from(typeMap.values()) : [];
    const totalCount = allObjects.length;
    const pageSize = options.pageSize ?? 100;

    let offset = 0;
    if (options.pageToken) {
      const cursor = decodePageToken(options.pageToken as PageToken);
      offset = cursor.offset;
    }

    // Fetch one extra to detect next page
    const slice = allObjects.slice(offset, offset + pageSize + 1);
    const hasMore = slice.length > pageSize;
    const data = hasMore ? slice.slice(0, pageSize) : slice;

    const result: ListResult = { data, totalCount };
    if (hasMore) {
      result.nextPageToken = encodePageToken({ offset: offset + pageSize });
    }
    return result;
  }

  /**
   * Returns all objects of a given type that match the filter.
   */
  queryObjects(objectType: string, filter?: Filter): StoredObject[] {
    const typeMap = this.objects.get(objectType);
    if (!typeMap) return [];

    const all = Array.from(typeMap.values());
    if (!filter) return all;
    return all.filter((obj) => evaluateFilter(obj, filter));
  }

  /**
   * Returns all objects of a given type (for use in ObjectSet resolution).
   */
  allObjects(objectType: string): StoredObject[] {
    const typeMap = this.objects.get(objectType);
    return typeMap ? Array.from(typeMap.values()) : [];
  }

  /**
   * Gets objects by explicit primary keys.
   */
  getObjectsByKeys(objectType: string, primaryKeys: string[]): StoredObject[] {
    const typeMap = this.objects.get(objectType);
    if (!typeMap) return [];
    return primaryKeys
      .map((pk) => typeMap.get(pk))
      .filter((o): o is StoredObject => o !== undefined);
  }
}
