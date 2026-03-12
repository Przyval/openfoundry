import type { FastifyInstance } from "fastify";
import type { NotificationStore } from "../../store/notification-store.js";

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

export async function notificationRoutes(
  app: FastifyInstance,
  opts: { notificationStore: NotificationStore },
): Promise<void> {
  const { notificationStore } = opts;

  // List notifications
  app.get<{
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/notifications", async (request) => {
    const all = notificationStore.listNotifications();
    return paginate(all, request.query);
  });

  // Mark notification as read
  app.put<{
    Params: { rid: string };
  }>("/notifications/:rid/read", async (request) => {
    return notificationStore.markRead(request.params.rid);
  });
}
