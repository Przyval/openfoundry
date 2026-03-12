/**
 * Types for the Action Service API.
 * Derived from conjure/action-service.yml.
 */
import type { Rid, PageToken, Timestamp } from "./common.js";

// ---------------------------------------------------------------------------
// Execution status
// ---------------------------------------------------------------------------

export type ActionExecutionStatus = "RUNNING" | "SUCCEEDED" | "FAILED";

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/** Request to apply (execute) an action */
export interface ActionApplyRequest {
  parameters: Record<string, unknown>;
}

/** Result of a successful action execution */
export interface ActionApplyResponse {
  rid: Rid;
  status: ActionExecutionStatus;
  result?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationError {
  field?: string;
  message: string;
}

/** Result of validating action parameters */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

// ---------------------------------------------------------------------------
// Action execution record
// ---------------------------------------------------------------------------

export interface ActionExecution {
  rid: Rid;
  actionApiName: string;
  parameters: Record<string, unknown>;
  status: ActionExecutionStatus;
  result?: Record<string, unknown>;
  error?: string;
  startedAt: Timestamp;
  completedAt?: Timestamp;
}

export interface ListExecutionsResponse {
  data: ActionExecution[];
  nextPageToken?: PageToken;
}

// ---------------------------------------------------------------------------
// Batch apply
// ---------------------------------------------------------------------------

export interface BatchApplyRequestItem {
  parameters: Record<string, unknown>;
}

export interface BatchApplyRequest {
  requests: BatchApplyRequestItem[];
}

export interface BatchApplyResultItem {
  rid: Rid;
  status: ActionExecutionStatus;
  result?: Record<string, unknown>;
  error?: string;
}

export interface BatchApplyResponse {
  results: BatchApplyResultItem[];
}
