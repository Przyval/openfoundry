import React from "react";
import { Button, NonIdealState } from "@blueprintjs/core";

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional callback invoked when an error is caught. */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Custom fallback UI. If not provided, a default error screen is shown. */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React class component that catches render errors in its subtree
 * and displays a friendly fallback UI.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const isDev =
      typeof process !== "undefined" && process.env.NODE_ENV === "development";

    return (
      <NonIdealState
        icon="error"
        title="Something went wrong"
        description={
          isDev && this.state.error ? (
            <div>
              <p>An unexpected error occurred while rendering this section.</p>
              <pre
                style={{
                  textAlign: "left",
                  maxWidth: 600,
                  overflow: "auto",
                  padding: 12,
                  background: "rgba(0,0,0,0.05)",
                  borderRadius: 4,
                  fontSize: 12,
                  marginTop: 8,
                }}
              >
                {this.state.error.message}
                {"\n"}
                {this.state.error.stack}
              </pre>
            </div>
          ) : (
            "An unexpected error occurred. Please try again."
          )
        }
        action={
          <Button
            icon="refresh"
            intent="primary"
            text="Try Again"
            onClick={this.handleReset}
          />
        }
      />
    );
  }
}
