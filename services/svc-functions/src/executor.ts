import type { StoredFunction } from "./store/function-store.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FunctionResult {
  output: unknown;
  duration: number;
  logs: string[];
}

// ---------------------------------------------------------------------------
// Executor — basic sandboxed function execution
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Execute a stored function with the given arguments.
 *
 * Uses `new Function()` for basic execution with a timeout guard.
 * Captures console.log output during execution.
 */
export async function executeFunction(
  fn: StoredFunction,
  args: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<FunctionResult> {
  if (fn.status === "DISABLED") {
    throw new Error(`Function "${fn.apiName}" is disabled`);
  }

  const logs: string[] = [];

  // Build a mock console that captures log output
  const mockConsole = {
    log: (...msgArgs: unknown[]) => {
      logs.push(msgArgs.map(String).join(" "));
    },
    warn: (...msgArgs: unknown[]) => {
      logs.push(`[WARN] ${msgArgs.map(String).join(" ")}`);
    },
    error: (...msgArgs: unknown[]) => {
      logs.push(`[ERROR] ${msgArgs.map(String).join(" ")}`);
    },
  };

  const start = performance.now();

  const result = await new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Function execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      // Construct a function that receives `args` and `console` as parameters
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const executor = new Function("args", "console", fn.code);
      const output = executor(args, mockConsole);

      // Handle async functions
      if (output instanceof Promise) {
        output
          .then((val: unknown) => {
            clearTimeout(timer);
            resolve(val);
          })
          .catch((err: unknown) => {
            clearTimeout(timer);
            reject(err);
          });
      } else {
        clearTimeout(timer);
        resolve(output);
      }
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });

  const duration = Math.round(performance.now() - start);

  return { output: result, duration, logs };
}
