/**
 * Turning a failed API response into something an operator can act on.
 *
 * Services answer with OpenFoundry's error envelope (`errorName` plus the
 * `parameters` that named the failing thing) and no prose `message`, so the
 * console has to phrase the failure itself.
 */

interface ErrorEnvelope {
  errorName: string;
  parameters: Record<string, unknown>;
}

function asEnvelope(body: unknown): ErrorEnvelope | null {
  if (typeof body !== "object" || body === null) return null;
  const { errorName, parameters } = body as Record<string, unknown>;
  if (typeof errorName !== "string") return null;
  return {
    errorName,
    parameters:
      typeof parameters === "object" && parameters !== null
        ? (parameters as Record<string, unknown>)
        : {},
  };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** "GroupMember" -> "Group member". */
function spaceCase(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function describeEnvelope(envelope: ErrorEnvelope): string | null {
  const { errorName, parameters } = envelope;

  if (errorName.endsWith("NotFound")) {
    const entityId = str(parameters.entityId);
    const entityType =
      str(parameters.entityType) ?? errorName.slice(0, -"NotFound".length);
    if (entityId) return `${spaceCase(entityType)} not found: ${entityId}`;
  }

  if (errorName === "PermissionDenied") {
    const action = str(parameters.action);
    const resource = str(parameters.resource);
    if (action && resource) {
      return `Permission denied: you cannot ${action} ${resource}.`;
    }
  }

  if (errorName === "Conflict") {
    const resource = str(parameters.resource);
    const reason = str(parameters.reason);
    if (resource && reason) return `${resource} ${reason}.`;
  }

  if (errorName === "InvalidArgument") {
    const param = str(parameters.param);
    const reason = str(parameters.reason);
    if (param && reason) return `Invalid ${param}: ${reason}.`;
  }

  if (errorName === "ValidationError") {
    const errors = parameters.validationErrors;
    const first = Array.isArray(errors) ? errors[0] : undefined;
    const message =
      typeof first === "object" && first !== null
        ? str((first as Record<string, unknown>).message)
        : undefined;
    return message
      ? `The request was rejected as invalid: ${message}.`
      : "The request was rejected as invalid.";
  }

  return null;
}

/** Phrase a failed response body, falling back to the status code. */
export function describeApiError(status: number, body: unknown): string {
  const envelope = asEnvelope(body);
  const described = envelope ? describeEnvelope(envelope) : null;
  if (described) return described;
  if (envelope) return `${envelope.errorName} (HTTP ${status}).`;
  return `Request failed with HTTP ${status}.`;
}

/** Read a failed response and phrase what went wrong. */
export async function apiErrorMessage(res: Response): Promise<string> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return describeApiError(res.status, body);
}
