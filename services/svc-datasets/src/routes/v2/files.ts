import type { FastifyInstance } from "fastify";
import type { FileStore } from "../../store/file-store.js";
import type { DatasetStore } from "../../store/dataset-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { customClient, notFound } from "@openfoundry/errors";
import { paginateArray } from "./pagination-helpers.js";

/** Serialize a file to the wire format (without content). */
function serializeFile(file: { path: string; size: number; contentType: string; transactionRid: string }) {
  return {
    path: file.path,
    size: file.size,
    contentType: file.contentType,
    transactionRid: file.transactionRid,
  };
}

export async function fileRoutes(
  app: FastifyInstance,
  opts: { datasetStore: DatasetStore; fileStore: FileStore },
): Promise<void> {
  const { datasetStore, fileStore } = opts;

  // Add a content type parser for all content types to handle raw body
  app.addContentTypeParser("*", function (_request, payload, done) {
    const chunks: Buffer[] = [];
    payload.on("data", (chunk: Buffer) => chunks.push(chunk));
    payload.on("end", () => done(null, Buffer.concat(chunks)));
    payload.on("error", done);
  });

  // List files (must be registered before the wildcard route)
  //
  // Foundry scopes this listing three ways, all of which resolve against the
  // dataset's own branches and transactions:
  //   - `branchName`         files written by transactions on that branch
  //   - `endTransactionRid`  files up to and including that transaction
  //   - `startTransactionRid` + `endTransactionRid`  files in that range
  // plus `pathPrefix`, which filters on the file path itself.
  app.get<{
    Params: { datasetRid: string };
    Querystring: {
      pageSize?: string;
      pageToken?: string;
      branchName?: string;
      pathPrefix?: string;
      startTransactionRid?: string;
      endTransactionRid?: string;
    };
  }>("/datasets/:datasetRid/files", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const datasetRid = request.params.datasetRid;
    const { branchName, pathPrefix, startTransactionRid, endTransactionRid } =
      request.query;

    const dataset = datasetStore.getDataset(datasetRid);

    if (pathPrefix !== undefined && pathPrefix.startsWith("/")) {
      throw customClient(
        400,
        "InvalidFilePath",
        "The provided file path is invalid. Check that the path does not start with a leading slash.",
      );
    }

    let branchRid: string | undefined;
    if (branchName !== undefined) {
      if (branchName === "" || /^ri\./.test(branchName)) {
        throw customClient(
          400,
          "InvalidBranchName",
          "The requested branch name cannot be used. Branch names cannot be empty and must not look like RIDs or UUIDs.",
        );
      }
      const branch = dataset.branches.get(branchName);
      if (!branch) {
        throw notFound("Branch", branchName);
      }
      branchRid = branch.rid;
    }

    // Transactions are ordered by the position they were opened in rather than
    // by their timestamp: several can be opened within the same millisecond,
    // which would leave a timestamp comparison unable to separate them.
    const transactionOrder = new Map(
      [...dataset.transactions.keys()].map((rid, index) => [rid, index]),
    );

    // Resolve the bounds first so an unknown rid is reported as such rather
    // than silently matching nothing.
    const resolveOrdinal = (rid: string) => {
      const ordinal = transactionOrder.get(rid);
      if (ordinal === undefined) {
        throw notFound("Transaction", rid);
      }
      return ordinal;
    };
    const endOrdinal =
      endTransactionRid !== undefined ? resolveOrdinal(endTransactionRid) : undefined;
    const startOrdinal =
      startTransactionRid !== undefined
        ? resolveOrdinal(startTransactionRid)
        : undefined;

    const files = fileStore.listFiles(datasetRid).filter((file) => {
      if (pathPrefix !== undefined && !file.path.startsWith(pathPrefix)) {
        return false;
      }

      // Files uploaded outside a transaction carry no transaction rid. They
      // belong to the dataset's latest view on every branch, so they survive a
      // branch filter but cannot fall inside a transaction range.
      const transaction = file.transactionRid
        ? dataset.transactions.get(file.transactionRid)
        : undefined;

      if (branchRid !== undefined && transaction && transaction.branchRid !== branchRid) {
        return false;
      }

      if (startOrdinal !== undefined || endOrdinal !== undefined) {
        if (!transaction) return false;
        const ordinal = transactionOrder.get(transaction.rid);
        if (ordinal === undefined) return false;
        if (startOrdinal !== undefined && ordinal < startOrdinal) return false;
        if (endOrdinal !== undefined && ordinal > endOrdinal) return false;
      }

      return true;
    });

    return paginateArray(files.map(serializeFile), request.query);
  });

  // Upload file (raw body)
  app.put<{
    Params: { datasetRid: string; "*": string };
  }>("/datasets/:datasetRid/files/*", {
    preHandler: requirePermission("datasets:write"),
  }, async (request, reply) => {
    const datasetRid = request.params.datasetRid;
    // Ensure dataset exists
    datasetStore.getDataset(datasetRid);

    const filePath = request.params["*"];
    const body = request.body as Buffer | string | null;
    const content =
      body instanceof Buffer
        ? new Uint8Array(body)
        : new TextEncoder().encode(String(body ?? ""));
    const contentType =
      (request.headers["content-type"] as string) ?? "application/octet-stream";

    const file = fileStore.putFile(
      datasetRid,
      filePath,
      content,
      contentType,
      "", // transactionRid is optional for direct upload
    );
    reply.status(201);
    return serializeFile(file);
  });

  // Download file
  app.get<{
    Params: { datasetRid: string; "*": string };
  }>("/datasets/:datasetRid/files/*", {
    preHandler: requirePermission("datasets:read"),
  }, async (request, reply) => {
    const datasetRid = request.params.datasetRid;
    const filePath = request.params["*"];

    datasetStore.getDataset(datasetRid);
    const file = fileStore.getFile(datasetRid, filePath);
    reply.header("content-type", file.contentType);
    return Buffer.from(file.content);
  });

  // Delete file
  app.delete<{
    Params: { datasetRid: string; "*": string };
  }>("/datasets/:datasetRid/files/*", {
    preHandler: requirePermission("datasets:delete"),
  }, async (request, reply) => {
    const datasetRid = request.params.datasetRid;
    const filePath = request.params["*"];
    datasetStore.getDataset(datasetRid);
    fileStore.deleteFile(datasetRid, filePath);
    reply.status(204);
    return;
  });
}
