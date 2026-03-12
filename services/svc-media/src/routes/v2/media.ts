import type { FastifyInstance } from "fastify";
import type { IMediaStore } from "../../store/media-store.js";

// ---------------------------------------------------------------------------
// Pagination helper
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

export async function mediaRoutes(
  app: FastifyInstance,
  opts: { store: IMediaStore },
): Promise<void> {
  const { store } = opts;

  // Upload media (raw body with Content-Type header)
  app.post("/media/upload", async (request, reply) => {
    const contentType = (request.headers["content-type"] as string) ?? "application/octet-stream";
    const filename = (request.headers["x-filename"] as string) ?? `upload-${Date.now()}`;
    const uploadedBy = request.headers["x-uploaded-by"] as string | undefined;

    const rawBody = await request.body as Buffer;
    const content = new Uint8Array(rawBody);

    const entry = await store.store(filename, contentType, content, {}, uploadedBy);

    reply.status(201);
    return {
      rid: entry.rid,
      filename: entry.filename,
      contentType: entry.contentType,
      size: entry.size,
      metadata: entry.metadata,
      uploadedBy: entry.uploadedBy,
      createdAt: entry.createdAt,
    };
  });

  // Download media (returns binary with Content-Type)
  app.get<{
    Params: { mediaRid: string };
  }>("/media/:mediaRid", async (request, reply) => {
    const entry = await store.get(request.params.mediaRid);
    reply
      .header("content-type", entry.contentType)
      .header("content-disposition", `attachment; filename="${entry.filename}"`)
      .header("content-length", entry.size);
    return reply.send(Buffer.from(entry.content));
  });

  // Get metadata
  app.get<{
    Params: { mediaRid: string };
  }>("/media/:mediaRid/metadata", async (request) => {
    return await store.getMetadata(request.params.mediaRid);
  });

  // Update metadata
  app.put<{
    Params: { mediaRid: string };
    Body: Record<string, string>;
  }>("/media/:mediaRid/metadata", async (request) => {
    return await store.updateMetadata(request.params.mediaRid, request.body);
  });

  // Delete media
  app.delete<{
    Params: { mediaRid: string };
  }>("/media/:mediaRid", async (request, reply) => {
    await store.delete(request.params.mediaRid);
    reply.status(204);
    return;
  });

  // List media (paginated)
  app.get<{
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/media", async (request) => {
    const rawList = await store.list();
    const all = rawList.map((entry) => ({
      rid: entry.rid,
      filename: entry.filename,
      contentType: entry.contentType,
      size: entry.size,
      metadata: entry.metadata,
      uploadedBy: entry.uploadedBy,
      createdAt: entry.createdAt,
    }));
    return paginate(all, request.query);
  });
}
