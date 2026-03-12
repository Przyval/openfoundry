import type { PageToken } from "./page-token.js";
import type { PageResponse } from "./page-response.js";

/**
 * Create an AsyncIterable that automatically follows `nextPageToken` to
 * iterate through all pages returned by `fetcher`.
 *
 * @param fetcher - An async function that fetches a single page given an optional page token.
 * @returns An AsyncIterable yielding every item across all pages.
 */
export function paginate<T>(
  fetcher: (token?: PageToken) => Promise<PageResponse<T>>,
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      let currentToken: PageToken | undefined;
      let buffer: T[] = [];
      let bufferIndex = 0;
      let done = false;

      return {
        async next(): Promise<IteratorResult<T>> {
          // Serve from buffer if available
          if (bufferIndex < buffer.length) {
            return { value: buffer[bufferIndex++], done: false };
          }

          // No more pages to fetch
          if (done) {
            return { value: undefined as unknown as T, done: true };
          }

          // Fetch next page
          const page = await fetcher(currentToken);
          buffer = page.data;
          bufferIndex = 0;

          if (page.nextPageToken) {
            currentToken = page.nextPageToken;
          } else {
            done = true;
          }

          if (buffer.length === 0) {
            return { value: undefined as unknown as T, done: true };
          }

          return { value: buffer[bufferIndex++], done: false };
        },
      };
    },
  };
}

/**
 * Collect all items from an AsyncIterable into an array.
 *
 * @param iterable - The async iterable to consume.
 * @param limit - Optional maximum number of items to collect.
 * @returns A promise resolving to the collected items.
 */
export async function collectAll<T>(
  iterable: AsyncIterable<T>,
  limit?: number,
): Promise<T[]> {
  const results: T[] = [];
  for await (const item of iterable) {
    results.push(item);
    if (limit !== undefined && results.length >= limit) {
      break;
    }
  }
  return results;
}
