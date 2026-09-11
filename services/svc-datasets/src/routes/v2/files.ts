import type { FastifyInstance } from "fastify";
import type { StoredFile } from "../../store/file-store.js";
import type { DatasetReadWriteStore } from "../../store/dataset-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { customClient } from "@openfoundry/errors";
import { paginateArray } from "./pagination-helpers.js";

/**
 * The file-store surface these routes need.
 *
 * Satisfied by both the synchronous `FileStore` and the fully asynchronous
 * `PgFileStore`, which is why every result is awaited: reading one without
 * awaiting it serves a pending promise as a 200 against Postgres while every
 * in-memory test still passes.
 */
export interface FileReadWriteStore {
  putFile(
    datasetRid: string,
    path: string,
    content: Uint8Array,
    contentType: string,
    transactionRid: string,
  ): StoredFile | Promise<StoredFile>;
  getFile(datasetRid: string, path: string): StoredFile | Promise<StoredFile>;
  listFiles(datasetRid: string): StoredFile[] | Promise<StoredFile[]>;
  deleteFile(datasetRid: string, path: string): void | Promise<void>;
}

/**
 * `datasets_models.File` as v2 declares it
 * (`foundry_sdk/v2/datasets/models.py:107`): the size is `sizeBytes`, and
 * `updatedTime` is required.
 *
 * The store's `contentType` has no place in the Foundry model and is not
 * emitted; a client generated against the SDK cannot read it, and a field
 * Foundry never sends is as much a wire-shape divergence as a missing one.
 * It is still served where it belongs, as the `content-type` header on the
 * file download.
 */
export interface V2File {
  path: string;
  transactionRid: string;
  sizeBytes: number;
  updatedTime: string;
}

function serializeFile(file: StoredFile): V2File {
  return {
    path: file.path,
    transactionRid: file.transactionRid,
    sizeBytes: file.size,
    updatedTime: file.updatedTime,
  };
}

export async function fileRoutes(
  app: FastifyInstance,
  opts: { datasetStore: DatasetReadWriteStore; fileStore: FileReadWriteStore },
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
  // Only `pathPrefix` scopes this listing. Foundry also scopes it by
  // `branchName` and a `startTransactionRid`/`endTransactionRid` range, but
  // `FileStore` is keyed by `${datasetRid}::${path}`, so re-uploading a path
  // overwrites the record and only the newest transaction survives. Serving
  // those parameters needs per-transaction file versions - new storage, not
  // parameter completion - and until the store has them the filters would
  // answer an empty set for any path that was ever rewritten.
  app.get<{
    Params: { datasetRid: string };
    Querystring: {
      pageSize?: string;
      pageToken?: string;
      pathPrefix?: string;
    };
  }>("/datasets/:datasetRid/files", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const datasetRid = request.params.datasetRid;
    const { pathPrefix } = request.query;

    await datasetStore.getDataset(datasetRid);

    if (pathPrefix !== undefined && pathPrefix.startsWith("/")) {
      throw customClient(
        400,
        "InvalidFilePath",
        "The provided file path is invalid. Check that the path does not start with a leading slash.",
      );
    }

    const files = (await fileStore.listFiles(datasetRid)).filter(
        (file) => pathPrefix === undefined || file.path.startsWith(pathPrefix),
      );

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
    await datasetStore.getDataset(datasetRid);

    const filePath = request.params["*"];
    const body = request.body as Buffer | string | null;
    const content =
      body instanceof Buffer
        ? new Uint8Array(body)
        : new TextEncoder().encode(String(body ?? ""));
    const contentType =
      (request.headers["content-type"] as string) ?? "application/octet-stream";

    const file = await fileStore.putFile(
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

    await datasetStore.getDataset(datasetRid);
    const file = await fileStore.getFile(datasetRid, filePath);
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
    await datasetStore.getDataset(datasetRid);
    await fileStore.deleteFile(datasetRid, filePath);
    reply.status(204);
    return;
  });
}
