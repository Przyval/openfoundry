import type { FastifyInstance } from "fastify";
import { requirePermission } from "@openfoundry/permissions";
import { invalidArgument } from "@openfoundry/errors";
import type { DatasetReadWriteStore } from "../../store/dataset-store.js";
import type { StoredFile } from "../../store/file-store.js";
import { paginateArray } from "../v2/pagination-helpers.js";
import { toV1File } from "./serializers.js";

/**
 * The file-store surface this route needs, satisfied by both `FileStore` and
 * the async `PgFileStore`. See `DatasetReadWriteStore` for why the result is
 * awaited rather than assumed synchronous.
 */
export interface FileReadDeleteStore {
  getFile(datasetRid: string, path: string): StoredFile | Promise<StoredFile>;
  listFiles(datasetRid: string): StoredFile[] | Promise<StoredFile[]>;
  deleteFile(datasetRid: string, path: string): void | Promise<void>;
}

/**
 * The transaction- and branch-scoping parameters v1 declares on every file
 * operation.
 *
 * They are declared here and refused rather than ignored. A file record is
 * keyed by `${datasetRid}::${path}` with no branch or transaction dimension, so
 * there is exactly one copy of a path and it belongs to whichever write landed
 * last. Serving a request scoped to `branchId=experiment` out of that one copy
 * would report a scoped answer while handing back the only state there is - and
 * on a delete it would remove that state outright. Silently dropping the
 * parameter is the same lie with no error attached.
 *
 * Omitting them is unaffected: the Foundry clients drop `None` query parameters
 * before sending, so a caller that does not ask for a scope sends nothing.
 *
 * This is a property of the store, not of v1. Per-transaction file versions
 * would let these be served, and this is the one place the refusal lives.
 *
 * Each route spells its own subset out inline rather than reusing this type:
 * the query parameters a route declares are read straight off the route
 * generic, by Fastify's validation and by the route inventory alike, and
 * neither follows a type alias.
 */
interface FileScopingParams {
  branchId?: string;
  startTransactionRid?: string;
  endTransactionRid?: string;
  transactionRid?: string;
}

function rejectUnservableScoping(query: FileScopingParams): void {
  for (const name of [
    "branchId",
    "startTransactionRid",
    "endTransactionRid",
    "transactionRid",
  ] as const) {
    if (query[name] !== undefined && query[name] !== "") {
      throw invalidArgument(
        name,
        "is not supported: file records carry no branch or transaction dimension, " +
          "so a scoped request cannot be answered from the single copy of a path",
      );
    }
  }
}

/**
 * The v1 file operations.
 *
 * `File` requires `updatedTime` in both API versions, which the file stores now
 * record on every write, so the read operations serve the full model rather
 * than an abbreviated one.
 *
 * `POST /datasets/{rid}/files:upload` is still unserved. v1 uploads into a named
 * transaction (`transactionRid`, or `transactionType` to open one), and a store
 * that keeps one record per path cannot place a file in a transaction that a
 * later write to the same path would silently take over.
 *
 * A Foundry `FilePath` contains slashes, so the path is matched as a wildcard -
 * the same shape the v2 file routes use, and the only one that can address a
 * nested file at all.
 */
export async function fileRoutesV1(
  app: FastifyInstance,
  opts: { datasetStore: DatasetReadWriteStore; fileStore: FileReadDeleteStore },
): Promise<void> {
  const { datasetStore, fileStore } = opts;

  // List files (registered before the wildcard route so it is not swallowed)
  app.get<{
    Params: { datasetRid: string };
    Querystring: {
      branchId?: string;
      startTransactionRid?: string;
      endTransactionRid?: string;
      pageSize?: string;
      pageToken?: string;
    };
  }>("/datasets/:datasetRid/files", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const { datasetRid } = request.params;
    rejectUnservableScoping(request.query);
    await datasetStore.getDataset(datasetRid);

    const files = await fileStore.listFiles(datasetRid);
    return paginateArray(files.map(toV1File), request.query);
  });

  // Get file metadata
  app.get<{
    Params: { datasetRid: string; "*": string };
    Querystring: {
      branchId?: string;
      startTransactionRid?: string;
      endTransactionRid?: string;
    };
  }>("/datasets/:datasetRid/files/*", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const { datasetRid } = request.params;
    rejectUnservableScoping(request.query);
    await datasetStore.getDataset(datasetRid);

    return toV1File(await fileStore.getFile(datasetRid, request.params["*"]));
  });

  app.delete<{
    Params: { datasetRid: string; "*": string };
    Querystring: { branchId?: string; transactionRid?: string };
  }>("/datasets/:datasetRid/files/*", {
    preHandler: requirePermission("datasets:delete"),
  }, async (request, reply) => {
    const { datasetRid } = request.params;
    rejectUnservableScoping(request.query);
    await datasetStore.getDataset(datasetRid);
    await fileStore.deleteFile(datasetRid, request.params["*"]);
    reply.status(204);
    return;
  });
}
