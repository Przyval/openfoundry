import type { FastifyInstance } from "fastify";
import type { FunctionStore } from "../../store/function-store.js";
import { executeFunction } from "../../executor.js";

// ---------------------------------------------------------------------------
// Pagination helper (lightweight, no external dep)
// ---------------------------------------------------------------------------

function paginate<T>(items: T[], query: { pageSize?: string; pageToken?: string }) {
  const pageSize = Math.min(Math.max(parseInt(query.pageSize ?? "100", 10) || 100, 1), 1000);
  const offset = query.pageToken ? parseInt(query.pageToken, 10) || 0 : 0;
  const slice = items.slice(offset, offset + pageSize);
  const nextOffset = offset + pageSize;
  return {
    data: slice,
    ...(nextOffset < items.length ? { nextPageToken: String(nextOffset) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function functionRoutes(
  app: FastifyInstance,
  opts: { store: FunctionStore },
): Promise<void> {
  const { store } = opts;

  // List functions (paginated)
  app.get<{
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/functions", async (request) => {
    const all = store.listFunctions();
    return paginate(all, request.query);
  });

  // Register function
  app.post<{
    Body: {
      apiName: string;
      displayName: string;
      description: string;
      code: string;
      parameters?: Array<{ name: string; type: string; description?: string; required?: boolean }>;
      returnType?: string;
    };
  }>("/functions", async (request, reply) => {
    const fn = store.registerFunction(request.body);
    reply.status(201);
    return fn;
  });

  // Get function
  app.get<{
    Params: { functionRid: string };
  }>("/functions/:functionRid", async (request) => {
    return store.getFunction(request.params.functionRid);
  });

  // Update function
  app.put<{
    Params: { functionRid: string };
    Body: {
      displayName?: string;
      description?: string;
      code?: string;
      parameters?: Array<{ name: string; type: string; description?: string; required?: boolean }>;
      returnType?: string;
      status?: "ACTIVE" | "DISABLED";
    };
  }>("/functions/:functionRid", async (request) => {
    return store.updateFunction(request.params.functionRid, request.body);
  });

  // Delete function
  app.delete<{
    Params: { functionRid: string };
  }>("/functions/:functionRid", async (request, reply) => {
    store.deleteFunction(request.params.functionRid);
    reply.status(204);
    return;
  });

  // Execute function
  app.post<{
    Params: { functionRid: string };
    Body: { args?: Record<string, unknown> };
  }>("/functions/:functionRid/execute", async (request) => {
    const fn = store.getFunction(request.params.functionRid);
    const result = await executeFunction(fn, request.body.args ?? {});
    return result;
  });
}
