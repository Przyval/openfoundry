import { generateRid } from "@openfoundry/rid";

// ---------------------------------------------------------------------------
// Execution status & record
// ---------------------------------------------------------------------------

export type ExecutionStatus = "RUNNING" | "SUCCEEDED" | "FAILED";

export interface ActionExecution {
  /** Unique RID for this execution. */
  readonly rid: string;

  /** API name of the action that was executed. */
  readonly actionApiName: string;

  /** Parameters passed to the action. */
  readonly parameters: Record<string, unknown>;

  /** Current status. */
  status: ExecutionStatus;

  /** When the execution started. */
  readonly startedAt: string;

  /** When the execution completed (success or failure). */
  completedAt?: string;

  /** Result payload on success. */
  result?: Record<string, unknown>;

  /** Error message on failure. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Action log
// ---------------------------------------------------------------------------

/**
 * In-memory log of action executions.
 */
export class ActionLog {
  private readonly executions = new Map<string, ActionExecution>();
  private readonly byAction = new Map<string, string[]>();

  /**
   * Log the start of an action execution.
   * Returns the new execution record with a generated RID.
   */
  logStart(actionApiName: string, parameters: Record<string, unknown>): ActionExecution {
    const rid = generateRid("actions", "execution").toString();
    const execution: ActionExecution = {
      rid,
      actionApiName,
      parameters,
      status: "RUNNING",
      startedAt: new Date().toISOString(),
    };

    this.executions.set(rid, execution);

    const list = this.byAction.get(actionApiName) ?? [];
    list.push(rid);
    this.byAction.set(actionApiName, list);

    return execution;
  }

  /**
   * Mark an execution as succeeded.
   */
  logComplete(rid: string, result?: Record<string, unknown>): void {
    const execution = this.executions.get(rid);
    if (!execution) return;
    execution.status = "SUCCEEDED";
    execution.completedAt = new Date().toISOString();
    execution.result = result;
  }

  /**
   * Mark an execution as failed.
   */
  logFailure(rid: string, error: string): void {
    const execution = this.executions.get(rid);
    if (!execution) return;
    execution.status = "FAILED";
    execution.completedAt = new Date().toISOString();
    execution.error = error;
  }

  /**
   * Retrieve an execution by its RID.
   */
  getExecution(rid: string): ActionExecution | undefined {
    return this.executions.get(rid);
  }

  /**
   * List executions for a given action API name, with optional pagination.
   */
  listExecutions(
    actionApiName: string,
    options: { pageSize?: number; pageToken?: string } = {},
  ): { data: ActionExecution[]; nextPageToken?: string } {
    const { pageSize = 25, pageToken } = options;
    const rids = this.byAction.get(actionApiName) ?? [];

    let startIndex = 0;
    if (pageToken) {
      const idx = rids.indexOf(pageToken);
      if (idx >= 0) startIndex = idx + 1;
    }

    const slice = rids.slice(startIndex, startIndex + pageSize);
    const data = slice
      .map((rid) => this.executions.get(rid))
      .filter((e): e is ActionExecution => e !== undefined);

    const nextPageToken =
      startIndex + pageSize < rids.length
        ? rids[startIndex + pageSize - 1]
        : undefined;

    return { data, nextPageToken };
  }
}
