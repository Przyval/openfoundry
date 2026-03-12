import type { FastifyInstance } from "fastify";
import type { FileStore } from "../../store/file-store.js";
import type { DatasetStore } from "../../store/dataset-store.js";
import { requirePermission } from "@openfoundry/permissions";
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
  app.get<{
    Params: { datasetRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/datasets/:datasetRid/files", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const datasetRid = request.params.datasetRid;
    datasetStore.getDataset(datasetRid);
    const files = fileStore.listFiles(datasetRid).map(serializeFile);
    return paginateArray(files, request.query);
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
