import type { Client, EndpointDescriptor } from "@openfoundry/client";
import { foundryPlatformFetch } from "@openfoundry/client";
import type { PageResponse } from "@openfoundry/pagination";
import type { Dataset, CreateDatasetRequest, ListParams } from "../types.js";

// ---------------------------------------------------------------------------
// Endpoint descriptors
// ---------------------------------------------------------------------------

const LIST_DATASETS: EndpointDescriptor = [
  "GET",
  "/v2/datasets",
  {},
  "application/json",
  "application/json",
];

const GET_DATASET: EndpointDescriptor = [
  "GET",
  "/v2/datasets/:datasetRid",
  {},
  "application/json",
  "application/json",
];

const CREATE_DATASET: EndpointDescriptor = [
  "POST",
  "/v2/datasets",
  {},
  "application/json",
  "application/json",
];

const DELETE_DATASET: EndpointDescriptor = [
  "DELETE",
  "/v2/datasets/:datasetRid",
  {},
  "application/json",
  "application/json",
];

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function withPathParams(
  descriptor: EndpointDescriptor,
  params: Record<string, string>,
): EndpointDescriptor {
  let path = descriptor[1];
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, encodeURIComponent(value));
  }
  return [descriptor[0], path, descriptor[2], descriptor[3], descriptor[4]];
}

function toQueryParams(params?: ListParams): Record<string, string | undefined> | undefined {
  if (!params) return undefined;
  return {
    pageSize: params.pageSize?.toString(),
    pageToken: params.pageToken,
  };
}

// ---------------------------------------------------------------------------
// DatasetsApi
// ---------------------------------------------------------------------------

/**
 * API namespace for dataset operations.
 */
export interface DatasetsApi {
  /**
   * List all datasets accessible to the current user.
   */
  listDatasets(params?: ListParams): Promise<PageResponse<Dataset>>;

  /**
   * Get a single dataset by its resource identifier.
   */
  getDataset(datasetRid: string): Promise<Dataset>;

  /**
   * Create a new dataset.
   */
  createDataset(body: CreateDatasetRequest): Promise<Dataset>;

  /**
   * Delete a dataset by its resource identifier.
   */
  deleteDataset(datasetRid: string): Promise<void>;
}

/**
 * Creates the datasets API namespace.
 */
export function createDatasetsApi(client: Client): DatasetsApi {
  return {
    async listDatasets(params?: ListParams): Promise<PageResponse<Dataset>> {
      return foundryPlatformFetch<PageResponse<Dataset>>(
        client,
        LIST_DATASETS,
        { queryParams: toQueryParams(params) },
      );
    },

    async getDataset(datasetRid: string): Promise<Dataset> {
      return foundryPlatformFetch<Dataset>(
        client,
        withPathParams(GET_DATASET, { datasetRid }),
      );
    },

    async createDataset(body: CreateDatasetRequest): Promise<Dataset> {
      return foundryPlatformFetch<Dataset>(
        client,
        CREATE_DATASET,
        { body },
      );
    },

    async deleteDataset(datasetRid: string): Promise<void> {
      await foundryPlatformFetch<void>(
        client,
        withPathParams(DELETE_DATASET, { datasetRid }),
      );
    },
  };
}
