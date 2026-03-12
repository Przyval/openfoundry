import type { HttpMethod } from "@openfoundry/conjure-ir";

const VALID_METHODS = new Set<string>(["GET", "POST", "PUT", "DELETE", "PATCH"]);

export interface ParsedHttp {
  method: HttpMethod;
  path: string;
}

/**
 * Parse an HTTP string of the form `"GET /api/v2/ontologies"` into its
 * method and path components.
 */
export function parseHttpString(httpStr: string): ParsedHttp {
  const trimmed = httpStr.trim();
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx < 0) {
    throw new Error(`Invalid HTTP string: expected "METHOD /path", got "${httpStr}"`);
  }

  const method = trimmed.slice(0, spaceIdx).toUpperCase();
  const path = trimmed.slice(spaceIdx + 1).trim();

  if (!VALID_METHODS.has(method)) {
    throw new Error(`Invalid HTTP method: "${method}"`);
  }
  if (path.length === 0 || path[0] !== "/") {
    throw new Error(`Invalid HTTP path: expected path starting with /, got "${path}"`);
  }

  return { method: method as HttpMethod, path };
}

/**
 * Extract path parameter names from a URL path template.
 * E.g. `/ontologies/{ontologyRid}/objects/{objectType}` → `["ontologyRid", "objectType"]`
 */
export function extractPathParams(path: string): string[] {
  const params: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(path)) !== null) {
    params.push(match[1]);
  }
  return params;
}
