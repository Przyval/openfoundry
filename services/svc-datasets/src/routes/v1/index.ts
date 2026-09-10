import type { FastifyInstance } from "fastify";
import type { DatasetReadWriteStore } from "../../store/dataset-store.js";
import { datasetRoutesV1 } from "./datasets.js";
import { fileRoutesV1, type FileDeleteStore } from "./files.js";

/**
 * The `/api/v1` dataset surface.
 *
 * Registered alongside the v2 routes and reading the same stores, but with its
 * own serializers: the two versions disagree about the `Branch` model and about
 * what `GET .../files/{filePath}` returns, so nothing is shared but the data.
 */
export async function v1Routes(
  app: FastifyInstance,
  opts: { datasetStore: DatasetReadWriteStore; fileStore: FileDeleteStore },
): Promise<void> {
  // Each child gets a freshly built options object: `opts` still carries the
  // `prefix` this plugin was registered with, and passing it through would
  // apply that prefix a second time.
  await app.register(datasetRoutesV1, { datasetStore: opts.datasetStore });
  await app.register(fileRoutesV1, {
    datasetStore: opts.datasetStore,
    fileStore: opts.fileStore,
  });
}
