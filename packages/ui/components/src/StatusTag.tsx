import { Tag, Intent } from "@blueprintjs/core";

export interface StatusTagProps {
  status: string;
  intent?: "none" | "primary" | "success" | "warning" | "danger";
}

const STATUS_INTENT_MAP: Record<string, Intent> = {
  ACTIVE: Intent.SUCCESS,
  RUNNING: Intent.SUCCESS,
  HEALTHY: Intent.SUCCESS,
  COMPLETED: Intent.SUCCESS,
  INACTIVE: Intent.NONE,
  PAUSED: Intent.NONE,
  DISABLED: Intent.NONE,
  PENDING: Intent.PRIMARY,
  PROCESSING: Intent.PRIMARY,
  IN_PROGRESS: Intent.PRIMARY,
  WARNING: Intent.WARNING,
  DEGRADED: Intent.WARNING,
  UNSTABLE: Intent.WARNING,
  ERROR: Intent.DANGER,
  FAILED: Intent.DANGER,
  CRITICAL: Intent.DANGER,
  DELETED: Intent.DANGER,
};

function resolveIntent(status: string, explicitIntent?: StatusTagProps["intent"]): Intent {
  if (explicitIntent && explicitIntent !== "none") {
    return explicitIntent as Intent;
  }
  return STATUS_INTENT_MAP[status.toUpperCase()] ?? Intent.NONE;
}

export function StatusTag({ status, intent }: StatusTagProps): JSX.Element {
  return (
    <Tag intent={resolveIntent(status, intent)} minimal round>
      {status}
    </Tag>
  );
}
