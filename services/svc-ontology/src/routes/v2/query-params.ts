/**
 * Query parameter parsing shared by the ontology metadata endpoints.
 *
 * Foundry serialises boolean query parameters as the literal strings `true`
 * and `false`; anything else is a client mistake rather than a value to coerce.
 */

import { invalidArgument } from "@openfoundry/errors";

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
