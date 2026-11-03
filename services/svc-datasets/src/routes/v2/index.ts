import type { FastifyInstance } from "fastify";
import type { ConnectivityStore } from "../../connectivity/store.js";
import type { DatasetReadWriteStore, DatasetStore } from "../../store/dataset-store.js";
import type { PipelineStore } from "../../store/pipeline-store.js";
import { connectivityRoutes } from "./connectivity.js";
import { datasetRoutes } from "./datasets.js";
import { fileRoutes, type FileReadWriteStore } from "./files.js";
import { pipelineRoutes } from "./pipelines.js";

export async function v2Routes(
  app: FastifyInstance,
  opts: {
    datasetStore: DatasetStore;
    fileStore: FileReadWriteStore;
    pipelineStore: PipelineStore;
    connectivityStore: ConnectivityStore;
  },
): Promise<void> {
  const routeOpts = {
    datasetStore: opts.datasetStore,
    fileStore: opts.fileStore,
  };

  await app.register(datasetRoutes, routeOpts);
  await app.register(fileRoutes, routeOpts);
  await app.register(pipelineRoutes, {
    pipelineStore: opts.pipelineStore,
  });
  await app.register(connectivityRoutes, {
    store: opts.connectivityStore,
    // The store may be the Postgres one at runtime; the interface awaits both.
    datasetStore: opts.datasetStore as DatasetReadWriteStore,
  });
}
