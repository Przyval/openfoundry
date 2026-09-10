/**
 * Query parameter parsing for the Foundry ontology object read endpoints.
 *
 * The shapes here follow the contract published in the generated
 * `foundry-platform-python` SDK and the API reference at
 * palantir.com/docs/foundry/api, not OpenFoundry convention:
 *
 * - list values (`select`) arrive exploded — `select=a&select=b` — because that
 *   is how the official clients serialize a `list<...>` query parameter.
 * - booleans arrive as the literal strings `true` / `false`.
 * - `orderBy` is a single comma-delimited command string, each term prefixed
 *   with `properties.` or its shorthand `p.`, optionally suffixed `:asc` or
 *   `:desc`.
 */

import { customClient, invalidArgument, safeArg } from "@openfoundry/errors";
import type { StoredObject } from "../../store/object-store.js";

/** One parsed term of an `orderBy` command. */
export interface OrderByTerm {
  property: string;
  direction: "asc" | "desc";
}

/**
 * Parses a Foundry boolean query parameter.
 *
 * Only the literal strings `true` and `false` are accepted, matching what the
 * official clients emit. Anything else is a client error rather than a silently
 * coerced `false`, so a caller who sends `snapshot=yes` learns that the flag was
 * not honoured.
 */
export function parseBooleanParam(
  name: string,
  raw: string | boolean | undefined,
): boolean | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (typeof raw === "boolean") return raw;
  const value = raw.toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  throw invalidArgument(name, `must be "true" or "false", got "${raw}"`);
}

/**
 * Parses a `pageSize` query parameter.
 *
 * A value that is not a positive integer is a client mistake: left alone, `abc`
 * reaches the slice as NaN and yields an empty page reported as a successful
 * listing, and `0` yields a next-page token identical to the cursor it was cut
 * from, which a paging client follows forever.
 */
export function parsePageSize(
  raw: string | number | undefined,
): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw invalidArgument("pageSize", `must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

/**
 * Normalises an exploded list query parameter into an array.
 *
 * `select=a&select=b` reaches Fastify as `["a", "b"]`; a single occurrence
 * reaches it as a bare string. Returns `undefined` when the parameter was
 * omitted, which the Foundry contract distinguishes from an empty selection:
 * omitting `select` returns every property.
 */
export function parseListParam(
  raw: string | string[] | undefined,
): string[] | undefined {
  if (raw === undefined) return undefined;
  const values = (Array.isArray(raw) ? raw : [raw]).filter((v) => v !== "");
  return values.length > 0 ? values : undefined;
}

/**
 * Parses an `orderBy` command into its ordered terms.
 *
 * Format, per the API reference:
 *
 *     orderBy=properties.{property}:{sortDirection},properties.{property}:...
 *
 * `p.` is an accepted shorthand for `properties.`, and a term with no explicit
 * direction sorts ascending.
 */
export function parseOrderBy(raw: string | undefined): OrderByTerm[] | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;

  const terms: OrderByTerm[] = [];
  for (const rawTerm of raw.split(",")) {
    const term = rawTerm.trim();
    if (term === "") continue;

    const [field, ...rest] = term.split(":");
    if (rest.length > 1) {
      throw invalidArgument(
        "orderBy",
        `term "${term}" has more than one sort direction`,
      );
    }

    const direction = (rest[0] ?? "asc").trim().toLowerCase();
    if (direction !== "asc" && direction !== "desc") {
      throw invalidArgument(
        "orderBy",
        `sort direction must be "asc" or "desc", got "${rest[0]}"`,
      );
    }

    const match = /^(?:properties|p)\.(.+)$/.exec(field.trim());
    if (!match) {
      throw invalidArgument(
        "orderBy",
        `property "${field.trim()}" must be prefixed with "properties." or "p."`,
      );
    }

    terms.push({ property: match[1], direction });
  }

  return terms.length > 0 ? terms : undefined;
}

/**
 * Rejects `select` / `orderBy` property names the object type does not declare.
 *
 * Foundry answers an unknown property with `PropertiesNotFound`; without this
 * check `select=nmae` returns 200 with `properties: {}` and `orderBy=p.nmae`
 * returns 200 in insertion order, both telling the client its request was
 * honoured when it was not.
 *
 * The declaration is the only admissible source. A property the type declares
 * but no object has populated is legitimate and must be served as absent, so
 * the data can never stand in for the declaration. `declared` is `undefined`
 * when no declaration is available, and then no name can be called unknown and
 * no check is made.
 *
 * `objectTypes` may name more than one type, as an object-set union does. The
 * message then lists them all, but the machine-readable `objectType` parameter
 * is emitted only for a single type, because the contract types it as one api
 * name and a joined list would name no type at all.
 */
export function assertPropertiesExist(
  objectTypes: string | readonly string[],
  declared: ReadonlySet<string> | undefined,
  properties: readonly string[] | undefined,
): void {
  if (!declared || !properties || properties.length === 0) return;

  const unknown = properties.filter((name) => !declared.has(name));
  if (unknown.length === 0) return;

  const names = typeof objectTypes === "string" ? [objectTypes] : objectTypes;
  const quoted = (values: readonly string[]) =>
    values.map((v) => `"${v}"`).join(", ");

  throw customClient(
    404,
    "PropertiesNotFound",
    `The properties ${quoted(unknown)} were not found on object type ${quoted(names)}.`,
    [
      ...(names.length === 1 ? [safeArg("objectType", names[0])] : []),
      safeArg("properties", unknown),
    ],
  );
}

/**
 * Sorts objects by the parsed `orderBy` terms.
 *
 * Null and undefined property values sort last in both directions, so that
 * reversing the direction never promotes a missing value to the front.
 */
export function applyOrderBy(
  objects: StoredObject[],
  terms: OrderByTerm[],
): StoredObject[] {
  return [...objects].sort((a, b) => {
    for (const { property, direction } of terms) {
      const aVal = a.properties[property];
      const bVal = b.properties[property];

      const aMissing = aVal === undefined || aVal === null;
      const bMissing = bVal === undefined || bVal === null;
      if (aMissing && bMissing) continue;
      if (aMissing) return 1;
      if (bMissing) return -1;
      if (aVal === bVal) continue;

      const cmp = (aVal as number | string) < (bVal as number | string) ? -1 : 1;
      return direction === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

/**
 * Projects each object down to the selected properties.
 *
 * Omitting `select` returns every property, which is the documented default.
 */
export function applySelect(
  objects: StoredObject[],
  select: string[] | undefined,
): StoredObject[] {
  if (!select || select.length === 0) return objects;
  return objects.map((obj) => {
    const properties: Record<string, unknown> = {};
    for (const property of select) {
      if (property in obj.properties) {
        properties[property] = obj.properties[property];
      }
    }
    return { ...obj, properties };
  });
}

/**
 * Drops the object's resource identifier from the response.
 *
 * Foundry describes `excludeRid` as excluding the `__rid` property; OpenFoundry
 * carries that identifier as the top-level `rid` field, so that is what is
 * withheld.
 */
export function applyExcludeRid<T extends { rid: string }>(
  objects: T[],
  excludeRid: boolean | undefined,
): Array<T | Omit<T, "rid">> {
  if (excludeRid !== true) return objects;
  return objects.map(({ rid: _rid, ...rest }) => rest);
}

/**
 * Resolves how far into the collection a snapshot-consistent listing may read.
 *
 * The first page of a `snapshot=true` listing freezes the collection at its
 * current size; every later page reads that boundary back out of the page token
 * so the same frozen view is served throughout. Returns `undefined` when the
 * caller did not ask for snapshot consistency, in which case each page sees the
 * latest data.
 *
 * A count rather than a timestamp: the stores append new entries at the end, so
 * a size is an exact boundary, whereas two items written in the same
 * millisecond would leave a timestamp boundary ambiguous.
 */
export function resolveSnapshotSize(
  snapshot: boolean | undefined,
  cursorSnapshotSize: number | undefined,
  currentSize: number,
): number | undefined {
  if (cursorSnapshotSize !== undefined) return cursorSnapshotSize;
  return snapshot === true ? currentSize : undefined;
}

/**
 * Restricts a listing to the items that were already there when paging began.
 *
 * This is what makes `snapshot=true` stable across pages: entries appended
 * after paging started cannot shift the offsets of the ones already being read.
 * Items removed mid-paging still disappear — the stores keep no tombstones, so
 * a snapshot view cannot resurrect them.
 */
export function applySnapshot<T>(
  items: T[],
  snapshotSize: number | undefined,
): T[] {
  if (snapshotSize === undefined) return items;
  return items.slice(0, snapshotSize);
}

/**
 * One clause of a request body's `orderBy`, as the Foundry contract types it.
 *
 * Distinct from the store's `OrderByClause`, whose direction is already resolved
 * and therefore required.
 */
export interface BodyOrderByClause {
  field: string;
  direction?: "asc" | "desc";
}

function isOrderByClause(value: unknown): value is BodyOrderByClause {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const { field, direction } = value as Record<string, unknown>;
  if (typeof field !== "string") return false;
  return direction === undefined || direction === "asc" || direction === "desc";
}

/**
 * Checks that a body value the contract types as `list<string>` really is one.
 *
 * A request body is unvalidated JSON, so nothing stops a client sending another
 * shape for `select`. The names are then mapped over and used to index each
 * object's properties, which on a wrong shape fails as a 500 InternalError or,
 * worse, is silently ignored and answered 200 as though the projection had been
 * applied. Both mislead the client about what it received, so a malformed value
 * is a client error naming the parameter.
 */
export function assertStringListBody(
  name: string,
  raw: unknown,
): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.some((value) => typeof value !== "string")) {
    throw invalidArgument(name, "must be a list of property names");
  }
  return raw as string[];
}

/**
 * Checks that a body `orderBy` is the single clause its operation declares.
 *
 * See {@link assertStringListBody} for why a malformed body value is answered
 * as a client error rather than crashed on or ignored.
 */
export function assertOrderByClauseBody(
  name: string,
  raw: unknown,
): BodyOrderByClause | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isOrderByClause(raw)) {
    throw invalidArgument(
      name,
      'must be an object { field, direction? } whose direction is "asc" or "desc"',
    );
  }
  return raw;
}

/**
 * Checks that a body `orderBy` is the list of clauses its operation declares.
 *
 * See {@link assertStringListBody} for why a malformed body value is answered
 * as a client error rather than crashed on or ignored.
 */
export function assertOrderByClauseListBody(
  name: string,
  raw: unknown,
): BodyOrderByClause[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || !raw.every(isOrderByClause)) {
    throw invalidArgument(
      name,
      'must be a list of { field, direction? } clauses whose direction is "asc" or "desc"',
    );
  }
  return raw;
}
