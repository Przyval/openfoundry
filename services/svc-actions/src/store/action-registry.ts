import type { PropertyType, ModifiedEntity } from "@openfoundry/ontology-schema";

// ---------------------------------------------------------------------------
// Parameter definition
// ---------------------------------------------------------------------------

export interface ParameterDef {
  /** The data type of this parameter. */
  readonly type: PropertyType;

  /** Whether this parameter is required. */
  readonly required: boolean;

  /** Human-readable description. */
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Action context & result
// ---------------------------------------------------------------------------

/**
 * Context provided to action handlers during execution.
 */
export interface ActionContext {
  /** The ontology RID under which this action is executed. */
  readonly ontologyRid: string;

  /** The API name of the action being executed. */
  readonly actionApiName: string;
}

/**
 * Result returned by an action handler.
 */
export interface ActionResult {
  /** Optional result payload from the action. */
  readonly result?: Record<string, unknown>;
}

/**
 * Handler function invoked when an action is applied.
 */
export type ActionHandler = (
  params: Record<string, unknown>,
  context: ActionContext,
) => Promise<ActionResult>;

// ---------------------------------------------------------------------------
// Registered action
// ---------------------------------------------------------------------------

export interface RegisteredAction {
  /** Unique API name for the action. */
  readonly apiName: string;

  /** Human-readable display name. */
  readonly displayName: string;

  /** Parameters accepted by this action, keyed by parameter name. */
  readonly parameters: Map<string, ParameterDef>;

  /** Object types this action may create or modify, keyed by apiName. */
  readonly modifiedEntities: Record<string, ModifiedEntity>;

  /** Lifecycle status. */
  readonly status: "ACTIVE" | "EXPERIMENTAL" | "DEPRECATED";

  /** Optional handler invoked on apply. */
  handler?: ActionHandler;
}

// ---------------------------------------------------------------------------
// Action registry
// ---------------------------------------------------------------------------

/**
 * In-memory registry of action type definitions.
 */
export class ActionRegistry {
  private readonly actions = new Map<string, RegisteredAction>();

  /**
   * Register a new action type. Overwrites any existing registration with
   * the same apiName.
   */
  registerAction(action: RegisteredAction): void {
    this.actions.set(action.apiName, action);
  }

  /**
   * Retrieve an action by its API name, or `undefined` if not found.
   */
  getAction(apiName: string): RegisteredAction | undefined {
    return this.actions.get(apiName);
  }

  /**
   * List all registered actions.
   */
  listActions(): RegisteredAction[] {
    return Array.from(this.actions.values());
  }

  /**
   * Attach or replace the handler for an existing action.
   * Returns `false` if no action with the given apiName exists.
   */
  setHandler(apiName: string, handler: ActionHandler): boolean {
    const action = this.actions.get(apiName);
    if (!action) return false;
    action.handler = handler;
    return true;
  }
}
