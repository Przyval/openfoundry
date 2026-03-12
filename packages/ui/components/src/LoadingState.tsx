import { NonIdealState, Spinner, Button } from "@blueprintjs/core";

export interface LoadingStateProps {
  message?: string;
}

export function LoadingState({
  message = "Loading...",
}: LoadingStateProps): JSX.Element {
  return <NonIdealState icon={<Spinner />} title={message} />;
}

export interface ErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title,
  message,
  onRetry,
}: ErrorStateProps): JSX.Element {
  return (
    <NonIdealState
      icon="error"
      title={title}
      description={message}
      action={
        onRetry ? (
          <Button icon="refresh" text="Retry" onClick={onRetry} />
        ) : undefined
      }
    />
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  title,
  description,
  action,
}: EmptyStateProps): JSX.Element {
  return (
    <NonIdealState
      icon="search"
      title={title}
      description={description}
      action={
        action ? (
          <Button text={action.label} onClick={action.onClick} intent="primary" />
        ) : undefined
      }
    />
  );
}
