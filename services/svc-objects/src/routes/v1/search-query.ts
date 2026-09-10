/**
 * Evaluation of a v1 `SearchJsonQuery`.
 *
 * v1 and v2 do not share a search grammar. v1 has fourteen filter variants -
 * `prefix`, `phrase`, `allTerms`, `anyTerm` among them - where v2 has
 * twenty-eight differently named ones, and the two disagree about the variants
 * whose names *do* match: v1 `contains` tests an array for a member, while the
 * `contains` the shared query engine implements is a string substring test
 * (v2's `containsAllTerms` is what routes through it). Translating v1 onto the
 * engine's clause vocabulary would therefore answer `contains` against the
 * wrong operator, so v1 queries are evaluated directly here instead.
 *
 * Every variant of `ontologies_models.SearchJsonQuery` is implemented. A shape
 * that is not one of them is a client error rather than a filter that quietly
 * matches everything.
 */

import { invalidArgument } from "@openfoundry/errors";

/** One node of a v1 `SearchJsonQuery`. */
export interface V1SearchQuery {
  type: string;
  field?: string;
  value?: unknown;
  fuzzy?: boolean;
}

const COMPARISON_TYPES = new Set(["lt", "lte", "gt", "gte"]);
const TERM_TYPES = new Set(["allTerms", "anyTerm"]);

/**
 * Orders two property values.
 *
 * Numbers compare numerically and everything else by its string form, which
 * orders ISO-8601 dates and timestamps correctly because they are
 * lexicographically ordered by construction.
 */
function compare(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left === right ? 0 : left < right ? -1 : 1;
  }
  const a = String(left);
  const b = String(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

/** The whitespace-separated words of a value, lower-cased for comparison. */
function terms(value: unknown): string[] {
  return String(value ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term !== "");
}

function requireField(query: V1SearchQuery): string {
  if (typeof query.field !== "string" || query.field === "") {
    throw invalidArgument("query", `a "${query.type}" filter requires a field`);
  }
  return query.field;
}

function subQueries(query: V1SearchQuery): V1SearchQuery[] {
  if (!Array.isArray(query.value)) {
    throw invalidArgument(
      "query",
      `a "${query.type}" filter requires a list of sub-queries in "value"`,
    );
  }
  return query.value as V1SearchQuery[];
}

/**
 * The property names a query reads, so the caller can be told about a
 * misspelled one instead of silently receiving no matches.
 */
export function queryFields(query: V1SearchQuery | undefined): string[] {
  if (!query || typeof query.type !== "string") return [];
  if (query.type === "and" || query.type === "or") {
    return (Array.isArray(query.value) ? (query.value as V1SearchQuery[]) : [])
      .flatMap(queryFields);
  }
  if (query.type === "not") {
    return queryFields(query.value as V1SearchQuery | undefined);
  }
  return typeof query.field === "string" ? [query.field] : [];
}

/**
 * Whether one object's properties satisfy a v1 search query.
 *
 * `fuzzy` is refused rather than ignored: `allTerms` and `anyTerm` are matched
 * on exact words here, so honouring a request for fuzzy matching would mean
 * returning fewer objects than the caller asked for while reporting success.
 */
export function matchesV1Query(
  properties: Record<string, unknown>,
  query: V1SearchQuery,
): boolean {
  if (!query || typeof query.type !== "string") {
    throw invalidArgument("query", "each filter must carry a type");
  }

  if (query.type === "and") {
    return subQueries(query).every((sub) => matchesV1Query(properties, sub));
  }
  if (query.type === "or") {
    return subQueries(query).some((sub) => matchesV1Query(properties, sub));
  }
  if (query.type === "not") {
    return !matchesV1Query(properties, query.value as V1SearchQuery);
  }

  if (TERM_TYPES.has(query.type) && query.fuzzy === true) {
    throw invalidArgument(
      "query",
      `fuzzy matching is not implemented; send "${query.type}" without "fuzzy" for exact term matching`,
    );
  }

  const field = requireField(query);
  const actual = properties[field];

  switch (query.type) {
    case "eq":
      return actual === query.value;

    case "isNull":
      if (typeof query.value !== "boolean") {
        throw invalidArgument(
          "query",
          'an "isNull" filter requires a boolean "value"',
        );
      }
      return (actual === null || actual === undefined) === query.value;

    case "contains":
      // v1 `ContainsQuery`: "the specified array contains a value".
      return Array.isArray(actual) && actual.includes(query.value);

    case "prefix":
      return (
        typeof actual === "string" && actual.startsWith(String(query.value))
      );

    case "phrase":
      // v1 `PhraseQuery`: the value appears in the field as a substring.
      return typeof actual === "string" && actual.includes(String(query.value));

    case "allTerms": {
      const haystack = terms(actual);
      return terms(query.value).every((term) => haystack.includes(term));
    }

    case "anyTerm": {
      const haystack = terms(actual);
      return terms(query.value).some((term) => haystack.includes(term));
    }

    default:
      if (COMPARISON_TYPES.has(query.type)) {
        if (actual === null || actual === undefined) return false;
        const order = compare(actual, query.value);
        return query.type === "lt"
          ? order < 0
          : query.type === "lte"
            ? order <= 0
            : query.type === "gt"
              ? order > 0
              : order >= 0;
      }
      throw invalidArgument("query", `unknown filter type "${query.type}"`);
  }
}
