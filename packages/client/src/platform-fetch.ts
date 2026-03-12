import type { Client, EndpointDescriptor, RequestOptions } from "./types.js";

/**
 * Executes a request against an OpenFoundry API endpoint.
 *
 * Takes an endpoint descriptor tuple and builds the full request, including
 * URL construction, content-type headers, body serialization, and query parameters.
 *
 * URL construction: `new URL("api" + endpointPath, baseUrl)`
 *
 * @param client - The configured OpenFoundry client.
 * @param descriptor - The endpoint descriptor tuple [method, path, flags, reqContentType, resContentType].
 * @param options - Optional request options (body, headers, query params, signal).
 * @returns The parsed response body, or the raw Response for non-JSON content types.
 */
export async function foundryPlatformFetch<T = unknown>(
  client: Client,
  descriptor: EndpointDescriptor,
  options: RequestOptions = {},
): Promise<T> {
  const [method, path, _flags, requestContentType, responseContentType] = descriptor;

  // Build URL: baseUrl + "/api" + path
  const url = new URL("api" + path, client.baseUrl + "/");
  appendQueryParams(url, options.queryParams);

  // Build headers
  const headers: Record<string, string> = {
    ...options.headers,
  };

  if (requestContentType !== "*/*") {
    headers["Content-Type"] = requestContentType;
  }

  if (responseContentType !== "*/*") {
    headers["Accept"] = responseContentType;
  }

  // Serialize body
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (requestContentType === "application/json") {
      body = JSON.stringify(options.body);
    } else if (
      typeof options.body === "string" ||
      options.body instanceof ArrayBuffer ||
      options.body instanceof Blob ||
      options.body instanceof FormData ||
      options.body instanceof ReadableStream ||
      options.body instanceof URLSearchParams
    ) {
      body = options.body as BodyInit;
    } else {
      body = JSON.stringify(options.body);
    }
  }

  const response = await client.fetch(url.toString(), {
    method,
    headers,
    body,
    signal: options.signal,
  });

  // No-content responses (204, 205) have no body to parse
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  // Parse response based on expected content type
  if (responseContentType === "application/json") {
    return await response.json() as T;
  }

  if (responseContentType === "application/octet-stream") {
    return response as unknown as T;
  }

  // For other content types, try JSON first, fall back to returning the response
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json() as T;
  }

  return response as unknown as T;
}

/**
 * Appends query parameters to a URL, handling arrays by repeating the key.
 */
function appendQueryParams(
  url: URL,
  params?: Record<string, string | string[] | undefined>,
): void {
  if (!params) return;

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const v of value) {
        url.searchParams.append(key, v);
      }
    } else {
      url.searchParams.set(key, value);
    }
  }
}
