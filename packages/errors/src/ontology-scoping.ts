/**
 * Rejection of the ontology scoping parameters OpenFoundry cannot serve.
 *
 * Foundry lets a caller scope an ontology read or write to a branch, to a
 * scenario, or to an ontology transaction. OpenFoundry models none of the
 * three: every "branch" in this repository is a *dataset* branch
 * (`dataset_branches`, `DatasetStore.branches`), the console's Scenarios page
 * keeps its scenarios in React state and persists nothing, and ontology
 * transactions have no representation at all. There is exactly one ontology
 * state and it has no name.
 *
 * So any value for these parameters names something that does not exist, and
 * the honest answer is the not-found error Foundry itself would return. The
 * alternative — accepting the parameter and serving the only state there is —
 * would tell a caller that asked for `branch=experiment` that its request was
 * honoured while handing back production data.
 *
 * Omitting a parameter keeps the endpoint's existing behaviour, which is also
 * what the Foundry clients do: their generated query parameters drop `None`
 * before the request is sent, so a caller that does not ask for a branch sends
 * nothing and is unaffected.
 *
 * This is product policy, not a permanent property of the API. If ontology
 * branches, scenarios or transactions are ever implemented, this module is the
 * single place the rejection has to be removed from.
 */

import { ErrorCode } from "./error-codes.js";
import { OpenFoundryApiError } from "./api-error.js";

/** The ontology scoping parameters, as they arrive on the query string. */
export interface OntologyScopingParams {
  branch?: string;
  scenarioRid?: string;
  transactionId?: string;
}

function notFoundError(
  errorName: string,
  parameter: string,
  value: string,
  message: string,
): OpenFoundryApiError {
  return new OpenFoundryApiError({
    errorCode: ErrorCode.NOT_FOUND,
    errorName,
    message,
    parameters: { [parameter]: value },
  });
}

/**
 * The error Foundry returns for a branch that cannot be resolved.
 *
 * Name, status and parameter shape follow `FoundryBranchNotFound` in the
 * generated SDK (`foundry_sdk/v2/core/errors.py`): a `NotFoundError` carrying
 * the requested branch.
 */
export function foundryBranchNotFound(branch: string): OpenFoundryApiError {
  return notFoundError(
    "FoundryBranchNotFound",
    "branch",
    branch,
    "The requested foundry branch could not be found, or the client token does not have access to it.",
  );
}

/**
 * The error for a scenario that cannot be resolved.
 *
 * The generated SDK declares no throwable errors on the scenario endpoints, so
 * the name follows the resource it addresses — `OntologyScenarioRid` — and the
 * `NOT_FOUND` / 404 shape the published error index uses for every other
 * missing resource.
 */
export function ontologyScenarioNotFound(scenarioRid: string): OpenFoundryApiError {
  return notFoundError(
    "OntologyScenarioNotFound",
    "scenarioRid",
    scenarioRid,
    "The requested ontology scenario could not be found, or the client token does not have access to it.",
  );
}

/**
 * The error for an ontology transaction that cannot be resolved.
 *
 * Named after `OntologyTransactionId` for the same reason as
 * {@link ontologyScenarioNotFound}. Distinct from the dataset `TransactionNotFound`
 * in the error index, which addresses a transaction on a dataset.
 */
export function ontologyTransactionNotFound(transactionId: string): OpenFoundryApiError {
  return notFoundError(
    "OntologyTransactionNotFound",
    "transactionId",
    transactionId,
    "The requested ontology transaction could not be found, or the client token does not have access to it.",
  );
}

/**
 * Rejects any ontology scoping parameter the caller actually supplied.
 *
 * Call this at the top of an ontology handler that declares these parameters.
 * An absent parameter — and an empty one, which names nothing either — passes
 * straight through and the handler behaves as it always has.
 */
export function rejectUnsupportedOntologyScoping(
  params: OntologyScopingParams,
): void {
  if (params.branch) {
    throw foundryBranchNotFound(params.branch);
  }
  if (params.scenarioRid) {
    throw ontologyScenarioNotFound(params.scenarioRid);
  }
  if (params.transactionId) {
    throw ontologyTransactionNotFound(params.transactionId);
  }
}
