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
// Proxy
// ---------------------------------------------------------------------------

/**
 * Forward an incoming Fastify request to a downstream service and relay
 * the response back to the client.
 *
 * Behaviour:
 * - Preserves method, path, query string, headers, and body.
 * - Strips hop-by-hop headers from both the outgoing and incoming directions.
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
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === "host") continue; // let fetch set the correct Host
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
  const body = hasBody ? JSON.stringify(request.body) : undefined;

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
