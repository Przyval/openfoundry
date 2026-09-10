import type { FastifyInstance } from "fastify";
import { requirePermission } from "@openfoundry/permissions";
import type { DatasetReadWriteStore } from "../../store/dataset-store.js";

/**
 * The file-store surface this route needs, satisfied by both `FileStore` and
 * the async `PgFileStore`. See `DatasetReadWriteStore` for why the result is
 * awaited rather than assumed synchronous.
 */
export interface FileDeleteStore {
  deleteFile(datasetRid: string, path: string): void | Promise<void>;
}

/**
 * The v1 file operations OpenFoundry can serve.
 *
 * Only the delete is here. v1's `File` model requires `updatedTime`, and
 * neither `FileStore` nor `PgFileStore` records when a file record was last
 * written — the Postgres table has `created_at` only, which does not move when
 * a path is re-uploaded, and `PgFileStore.putFile` already writes to an
 * `updated_at` column that no migration creates. Serving `GET .../files` or
 * `GET .../files/{filePath}` would therefore mean either omitting a required
 * field or inventing a timestamp, so those two operations are left unserved
 * until file records carry a write time.
 *
 * A Foundry `FilePath` contains slashes, so the path is matched as a wildcard —
 * the same shape the v2 file routes use, and the only one that can address a
 * nested file at all.
 *
 * The branch and transaction scoping parameters v1 declares on this operation
 * (`branchId`, `transactionRid`) are not accepted: `FileStore` is keyed by
 * `${datasetRid}::${path}` with no branch or transaction dimension, so a delete
 * scoped to either would remove the one and only copy while reporting that it
 * had removed a scoped one.
 */
export async function fileRoutesV1(
  app: FastifyInstance,
  opts: { datasetStore: DatasetReadWriteStore; fileStore: FileDeleteStore },
): Promise<void> {
  const { datasetStore, fileStore } = opts;

  app.delete<{
    Params: { datasetRid: string; "*": string };
  }>("/datasets/:datasetRid/files/*", {
    preHandler: requirePermission("datasets:delete"),
  }, async (request, reply) => {
    const { datasetRid } = request.params;
    await datasetStore.getDataset(datasetRid);
    await fileStore.deleteFile(datasetRid, request.params["*"]);
    reply.status(204);
    return;
  });
}
