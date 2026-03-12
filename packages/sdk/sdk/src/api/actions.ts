import type { Client, EndpointDescriptor } from "@openfoundry/client";
import { foundryPlatformFetch } from "@openfoundry/client";
import type {
  ActionResult,
  ValidationResult,
  BatchResult,
  ApplyActionParams,
  ApplyBatchParams,
} from "../types.js";

// ---------------------------------------------------------------------------
// Endpoint descriptors
// ---------------------------------------------------------------------------

const APPLY_ACTION: EndpointDescriptor = [
  "POST",
  "/v2/ontologies/:ontologyRid/actions/:actionApiName/apply",
  {},
  "application/json",
  "application/json",
];

const VALIDATE_ACTION: EndpointDescriptor = [
  "POST",
  "/v2/ontologies/:ontologyRid/actions/:actionApiName/validate",
  {},
  "application/json",
  "application/json",
];

const APPLY_BATCH: EndpointDescriptor = [
  "POST",
  "/v2/ontologies/:ontologyRid/actions/:actionApiName/applyBatch",
  {},
  "application/json",
  "application/json",
];

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function withPathParams(
  descriptor: EndpointDescriptor,
  params: Record<string, string>,
): EndpointDescriptor {
  let path = descriptor[1];
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, encodeURIComponent(value));
  }
  return [descriptor[0], path, descriptor[2], descriptor[3], descriptor[4]];
}

// ---------------------------------------------------------------------------
// ActionsApi
// ---------------------------------------------------------------------------

/**
 * API namespace for ontology action operations.
 */
export interface ActionsApi {
  /**
   * Apply an action with the given parameters.
   */
  applyAction(
    ontologyRid: string,
    actionApiName: string,
    params: ApplyActionParams,
  ): Promise<ActionResult>;

  /**
   * Validate an action without applying it.
   */
  validateAction(
    ontologyRid: string,
    actionApiName: string,
    params: ApplyActionParams,
  ): Promise<ValidationResult>;

  /**
   * Apply an action in batch mode.
   */
  applyBatch(
    ontologyRid: string,
    actionApiName: string,
    batch: ApplyBatchParams,
  ): Promise<BatchResult>;
}

/**
 * Creates the actions API namespace.
 */
export function createActionsApi(client: Client): ActionsApi {
  return {
    async applyAction(
      ontologyRid: string,
      actionApiName: string,
      params: ApplyActionParams,
    ): Promise<ActionResult> {
      return foundryPlatformFetch<ActionResult>(
        client,
        withPathParams(APPLY_ACTION, { ontologyRid, actionApiName }),
        { body: params },
      );
    },

    async validateAction(
      ontologyRid: string,
      actionApiName: string,
      params: ApplyActionParams,
    ): Promise<ValidationResult> {
      return foundryPlatformFetch<ValidationResult>(
        client,
        withPathParams(VALIDATE_ACTION, { ontologyRid, actionApiName }),
        { body: params },
      );
    },

    async applyBatch(
      ontologyRid: string,
      actionApiName: string,
      batch: ApplyBatchParams,
    ): Promise<BatchResult> {
      return foundryPlatformFetch<BatchResult>(
        client,
        withPathParams(APPLY_BATCH, { ontologyRid, actionApiName }),
        { body: batch },
      );
    },
  };
}
