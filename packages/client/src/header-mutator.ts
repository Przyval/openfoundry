import type { FetchFn, TokenProvider } from "./types.js";

/**
 * Layer 1 (outermost): Adds the Bearer token `Authorization` header to every request.
 *
 * Wraps a fetch function and injects the token obtained from the given provider
 * before delegating to the inner fetch.
 */
export function createFetchHeaderMutator(
  innerFetch: FetchFn,
  tokenProvider: TokenProvider,
): FetchFn {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = await tokenProvider();

    const existingHeaders = new Headers(init?.headers);
    existingHeaders.set("Authorization", token.toAuthorizationHeader());

    return innerFetch(input, {
      ...init,
      headers: existingHeaders,
    });
  };
}
