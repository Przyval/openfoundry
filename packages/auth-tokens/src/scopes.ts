/**
 * OAuth scope definitions matching the Palantir platform's API scopes.
 *
 * Scopes follow the pattern `api:<resource>-<access>` where access is
 * either `read` or `write`. Write scopes implicitly include their
 * corresponding read scope for authorisation checks.
 */

export const Scope = {
  // Ontology
  ONTOLOGIES_READ: "api:ontologies-read",
  ONTOLOGIES_WRITE: "api:ontologies-write",

  // Datasets
  DATASETS_READ: "api:datasets-read",
  DATASETS_WRITE: "api:datasets-write",

  // Administration
  ADMIN_READ: "api:admin-read",
  ADMIN_WRITE: "api:admin-write",

  // AIP Agents
  AIP_AGENTS_READ: "api:aip-agents-read",
  AIP_AGENTS_WRITE: "api:aip-agents-write",

  // Media
  MEDIA_READ: "api:media-read",
  MEDIA_WRITE: "api:media-write",

  // Streams
  STREAMS_READ: "api:streams-read",
  STREAMS_WRITE: "api:streams-write",

  // Functions
  FUNCTIONS_READ: "api:functions-read",
  FUNCTIONS_WRITE: "api:functions-write",

  // Third-party applications
  THIRD_PARTY_APPS_READ: "api:third-party-apps-read",
  THIRD_PARTY_APPS_WRITE: "api:third-party-apps-write",

  // Connectivity / sources
  CONNECTIVITY_READ: "api:connectivity-read",
  CONNECTIVITY_WRITE: "api:connectivity-write",
} as const;

export type Scope = (typeof Scope)[keyof typeof Scope];

/**
 * Map from a write scope to its implied read scope.
 * Used to check whether a write grant also satisfies a read requirement.
 */
const WRITE_IMPLIES_READ: Record<string, string> = {
  [Scope.ONTOLOGIES_WRITE]: Scope.ONTOLOGIES_READ,
  [Scope.DATASETS_WRITE]: Scope.DATASETS_READ,
  [Scope.ADMIN_WRITE]: Scope.ADMIN_READ,
  [Scope.AIP_AGENTS_WRITE]: Scope.AIP_AGENTS_READ,
  [Scope.MEDIA_WRITE]: Scope.MEDIA_READ,
  [Scope.STREAMS_WRITE]: Scope.STREAMS_READ,
  [Scope.FUNCTIONS_WRITE]: Scope.FUNCTIONS_READ,
  [Scope.THIRD_PARTY_APPS_WRITE]: Scope.THIRD_PARTY_APPS_READ,
  [Scope.CONNECTIVITY_WRITE]: Scope.CONNECTIVITY_READ,
};

/**
 * Expand a set of scopes by adding implied read scopes for any write scopes.
 */
export function expandScopes(scopes: readonly string[]): string[] {
  const expanded = new Set(scopes);
  for (const scope of scopes) {
    const implied = WRITE_IMPLIES_READ[scope];
    if (implied) {
      expanded.add(implied);
    }
  }
  return [...expanded];
}

/**
 * Build a space-separated scope string from an array of scope values.
 */
export function buildScopeString(scopes: readonly string[]): string {
  return scopes.join(" ");
}

/**
 * Check whether a set of granted scopes satisfies a required scope,
 * accounting for write-implies-read semantics.
 */
export function satisfiesScope(
  grantedScopes: readonly string[],
  requiredScope: string,
): boolean {
  const expanded = expandScopes(grantedScopes);
  return expanded.includes(requiredScope);
}
