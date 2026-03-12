import { useCallback, useEffect, useRef, useState } from "react";

export interface UseRetryOptions {
  /** Maximum number of retry attempts. Default: 3 */
  maxRetries?: number;
  /** Base delay between retries in ms. Default: 1000 */
  delay?: number;
  /** Backoff strategy. Default: 'linear' */
  backoff?: "linear" | "exponential";
}

export interface UseRetryResult<T> {
  /** Execute the async operation with retry logic. */
  execute: (operation: () => Promise<T>) => Promise<T | undefined>;
  /** Whether a retry is currently in progress. */
  isRetrying: boolean;
  /** Current attempt number (0 = first try, 1 = first retry, etc.). */
  attempt: number;
  /** The last error encountered, if any. */
  error: Error | null;
  /** Reset the retry state. */
  reset: () => void;
}

/**
 * Hook that wraps async operations with configurable retry logic.
 * Automatically aborts pending retries on unmount.
 */
export function useRetry<T = unknown>(
  options: UseRetryOptions = {},
): UseRetryResult<T> {
  const { maxRetries = 3, delay = 1000, backoff = "linear" } = options;

  const [isRetrying, setIsRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  const abortRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current = true;
    };
  }, []);

  const reset = useCallback(() => {
    setIsRetrying(false);
    setAttempt(0);
    setError(null);
    abortRef.current = false;
  }, []);

  const execute = useCallback(
    async (operation: () => Promise<T>): Promise<T | undefined> => {
      abortRef.current = false;
      setError(null);
      setAttempt(0);
      setIsRetrying(false);

      for (let i = 0; i <= maxRetries; i++) {
        if (abortRef.current || !mountedRef.current) return undefined;

        try {
          if (mountedRef.current) setAttempt(i);
          const result = await operation();
          if (mountedRef.current) {
            setIsRetrying(false);
            setError(null);
          }
          return result;
        } catch (err) {
          const error =
            err instanceof Error ? err : new Error(String(err));

          if (!mountedRef.current || abortRef.current) return undefined;

          if (i < maxRetries) {
            setIsRetrying(true);
            setError(error);

            const retryDelay =
              backoff === "exponential"
                ? delay * Math.pow(2, i)
                : delay * (i + 1);

            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, retryDelay);
              // Check abort periodically isn't needed; we check after await
              void timer;
            });
          } else {
            // All retries exhausted
            if (mountedRef.current) {
              setIsRetrying(false);
              setError(error);
            }
            throw error;
          }
        }
      }

      return undefined;
    },
    [maxRetries, delay, backoff],
  );

  return { execute, isRetrying, attempt, error, reset };
}
