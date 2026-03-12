import type { EffectResult } from "../store/execution-log.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionEffectConfig {
  /** Base URL of the actions service (e.g. "http://localhost:8085"). */
  actionsServiceUrl: string;
  /** The action API name to execute. */
  actionApiName: string;
  /** Parameters to pass to the action. */
  parameters?: Record<string, unknown>;
  /** Ontology RID context for the action. */
  ontologyRid?: string;
}

// ---------------------------------------------------------------------------
// Execute action effect
// ---------------------------------------------------------------------------

/**
 * POST to the actions service to execute a Foundry action.
 */
export async function executeActionEffect(
  config: ActionEffectConfig,
): Promise<EffectResult> {
  const url = `${config.actionsServiceUrl}/api/v2/actions/execute`;
  const body = JSON.stringify({
    actionApiName: config.actionApiName,
    parameters: config.parameters ?? {},
    ontologyRid: config.ontologyRid,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(30_000),
    });

    if (response.ok) {
      const result = await response.json();
      return {
        effectType: "ACTION",
        status: "SUCCESS",
        detail: `Action "${config.actionApiName}" executed: ${JSON.stringify(result)}`,
      };
    }

    const errorText = await response.text().catch(() => "");
    return {
      effectType: "ACTION",
      status: "FAILURE",
      detail: `Action "${config.actionApiName}" failed with HTTP ${response.status}: ${errorText}`,
    };
  } catch (err) {
    return {
      effectType: "ACTION",
      status: "FAILURE",
      detail: `Action "${config.actionApiName}" failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
