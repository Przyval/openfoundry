import type { FastifyRequest, FastifyReply } from "fastify";

// ---------------------------------------------------------------------------
// Hop-by-hop headers that must not be forwarded (RFC 2616 Section 13.5.1)
// ---------------------------------------------------------------------------

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

// ---------------------------------------------------------------------------
// Client-asserted identity headers
// ---------------------------------------------------------------------------

/**
 * Headers by which a caller asserts *who it is* rather than *what it wants*.
 *
 * Downstream services treat these as trusted: the permission middleware in
 * `@openfoundry/permissions` reads `x-user-roles` and grants whatever those
 * roles imply. They are therefore only ever safe when a trusted hop sets them
 * from a verified token, and never safe to forward from the public edge.
 *
 * The gateway is that edge, so it drops every `x-user-*` header arriving from
 * a client. Nothing legitimate sends them today: the console authenticates
 * with `Authorization: Bearer`, and the seed and sync scripts talk to the
 * service ports directly rather than through this proxy.
 *
 * This only removes an inbound trust. It does not grant anyone access, and it
 * does not populate the headers either - see the note in `middleware/auth.ts`
 * about `request.claims` never being set.
 *
 * Known consequence: role-based enforcement does NOT work after this change.
 * What was removed is fake enforcement - a client could assert its own roles -
 * and real enforcement waits on the gateway task that validates JWTs and sets
 * these headers from validated claims. Until that trusted hop exists, running
 * with `ENFORCE_PERMISSIONS=true` makes every gateway-proxied route answer 403,
 * because the permission hook sees neither `x-user-id` nor `request.claims`.
 * That is known and accepted, not an oversight.
 */
const CLIENT_ASSERTED_IDENTITY_PREFIX = "x-user-";

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

/**
 * Forward an incoming Fastify request to a downstream service and relay
 * the response back to the client.
 *
 * Behaviour:
 * - Preserves method, path, query string, headers, and body.
 * - Strips hop-by-hop headers from both the outgoing and incoming directions.
 * - Strips client-asserted `x-user-*` identity headers from the outgoing direction.
 * - Injects `X-Forwarded-For` and `X-Request-Id` headers.
 * - Returns 502 Bad Gateway when the target is unreachable.
 */
export async function proxyRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  targetBaseUrl: string,
): Promise<void> {
  // Build the target URL preserving the original path and query string.
  const url = new URL(request.url, targetBaseUrl);

  // Build outgoing headers, stripping hop-by-hop entries.
  const outgoingHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerKey)) continue;
    if (lowerKey === "host") continue; // let fetch set the correct Host
    // Never forward a caller's own claim about its identity or roles.
    if (lowerKey.startsWith(CLIENT_ASSERTED_IDENTITY_PREFIX)) continue;
    if (value !== undefined) {
      outgoingHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
    }
  }

  // Inject proxy headers
  const clientIp =
    request.ip ?? (request.socket?.remoteAddress as string | undefined) ?? "unknown";
  outgoingHeaders["x-forwarded-for"] = outgoingHeaders["x-forwarded-for"]
    ? `${outgoingHeaders["x-forwarded-for"]}, ${clientIp}`
    : clientIp;
  outgoingHeaders["x-request-id"] = request.id as string;

  // Determine body — only send body for methods that typically carry one.
  const hasBody = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  let body: string | undefined;
  if (hasBody && request.body !== undefined && request.body !== null) {
    // If the body is already a string (e.g. form-urlencoded or raw text),
    // forward it as-is. Otherwise JSON-serialize the parsed object.
    body = typeof request.body === "string"
      ? request.body
      : JSON.stringify(request.body);
  }

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      method: request.method,
      headers: outgoingHeaders,
      body,
      // Prevent fetch from following redirects — let the client handle them.
      redirect: "manual",
    });
  } catch (err: unknown) {
    request.log.error({ err, target: url.toString() }, "Upstream service unreachable");
    reply.code(502).send({
      errorCode: "BAD_GATEWAY",
      errorName: "BadGateway",
      errorInstanceId: crypto.randomUUID(),
      parameters: {},
      statusCode: 502,
    });
    return;
  }

  // Relay status code
  reply.code(upstream.status);

  // Relay response headers, stripping hop-by-hop
  for (const [key, value] of upstream.headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    reply.header(key, value);
  }

  // Relay body
  const responseBody = await upstream.text();
  reply.send(responseBody);
}
