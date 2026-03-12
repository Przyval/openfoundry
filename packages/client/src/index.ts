export { createClient } from "./client.js";
export { createFetchHeaderMutator } from "./header-mutator.js";
export { createRetryingFetch, type RetryOptions } from "./retrying-fetch.js";
export { createFetchOrThrow } from "./fetch-or-throw.js";
export { foundryPlatformFetch } from "./platform-fetch.js";

export type {
  FetchFn,
  TokenProvider,
  ClientOptions,
  RequestOptions,
  HttpMethod,
  ContentType,
  EndpointFlags,
  EndpointDescriptor,
  Client,
} from "./types.js";
