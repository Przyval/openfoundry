import type { Client, EndpointDescriptor } from "@openfoundry/client";
import { foundryPlatformFetch } from "@openfoundry/client";
import type { PageResponse } from "@openfoundry/pagination";
import type {
  OntologyObject,
  ListObjectsParams,
  LoadObjectSetRequest,
  AggregateObjectsRequest,
  AggregationResponse,
} from "../types.js";

// ---------------------------------------------------------------------------
// Endpoint descriptors
// ---------------------------------------------------------------------------

const LIST_OBJECTS: EndpointDescriptor = [
  "GET",
  "/v2/ontologies/:ontologyRid/objects/:objectType",
  {},
  "application/json",
  "application/json",
];

const GET_OBJECT: EndpointDescriptor = [
  "GET",
  "/v2/ontologies/:ontologyRid/objects/:objectType/:primaryKey",
  {},
  "application/json",
  "application/json",
];

const CREATE_OBJECT: EndpointDescriptor = [
  "POST",
  "/v2/ontologies/:ontologyRid/objects/:objectType",
  {},
  "application/json",
  "application/json",
];

const UPDATE_OBJECT: EndpointDescriptor = [
  "PUT",
  "/v2/ontologies/:ontologyRid/objects/:objectType/:primaryKey",
  {},
  "application/json",
  "application/json",
];

const DELETE_OBJECT: EndpointDescriptor = [
  "DELETE",
  "/v2/ontologies/:ontologyRid/objects/:objectType/:primaryKey",
  {},
  "application/json",
  "application/json",
];

const LOAD_OBJECT_SET: EndpointDescriptor = [
  "POST",
  "/v2/ontologies/:ontologyRid/objectSets/loadObjects",
  {},
  "application/json",
  "application/json",
];

const AGGREGATE_OBJECTS: EndpointDescriptor = [
  "POST",
  "/v2/ontologies/:ontologyRid/objectSets/aggregate",
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

function toQueryParams(
  params?: ListObjectsParams,
): Record<string, string | string[] | undefined> | undefined {
  if (!params) return undefined;
  return {
    pageSize: params.pageSize?.toString(),
    pageToken: params.pageToken,
    orderBy: params.orderBy,
    properties: params.properties as string[] | undefined,
    excludeRid: params.excludeRid?.toString(),
  };
}

// ---------------------------------------------------------------------------
// ObjectsApi
// ---------------------------------------------------------------------------

/**
 * API namespace for ontology object CRUD operations.
 */
export interface ObjectsApi {
  /**
   * List objects of a given type within an ontology.
   */
  listObjects(
    ontologyRid: string,
    objectType: string,
    params?: ListObjectsParams,
  ): Promise<PageResponse<OntologyObject>>;

  /**
   * Get a single object by its primary key.
   */
  getObject(
    ontologyRid: string,
    objectType: string,
    primaryKey: string | number,
  ): Promise<OntologyObject>;

  /**
   * Create a new object of the given type.
   */
  createObject(
    ontologyRid: string,
    objectType: string,
    body: Record<string, unknown>,
  ): Promise<OntologyObject>;

  /**
   * Update an existing object by its primary key.
   */
  updateObject(
    ontologyRid: string,
    objectType: string,
    primaryKey: string | number,
    body: Record<string, unknown>,
  ): Promise<OntologyObject>;

  /**
   * Delete an object by its primary key.
   */
  deleteObject(
    ontologyRid: string,
    objectType: string,
    primaryKey: string | number,
  ): Promise<void>;

  /**
   * Load objects matching an object set definition.
   */
  loadObjectSet(
    ontologyRid: string,
    body: LoadObjectSetRequest,
  ): Promise<PageResponse<OntologyObject>>;

  /**
   * Perform an aggregation over an object set.
   */
  aggregate(
    ontologyRid: string,
    body: AggregateObjectsRequest,
  ): Promise<AggregationResponse>;
}

/**
 * Creates the objects API namespace.
 */
export function createObjectsApi(client: Client): ObjectsApi {
  return {
    async listObjects(
      ontologyRid: string,
      objectType: string,
      params?: ListObjectsParams,
    ): Promise<PageResponse<OntologyObject>> {
      return foundryPlatformFetch<PageResponse<OntologyObject>>(
        client,
        withPathParams(LIST_OBJECTS, { ontologyRid, objectType }),
        { queryParams: toQueryParams(params) },
      );
    },

    async getObject(
      ontologyRid: string,
      objectType: string,
      primaryKey: string | number,
    ): Promise<OntologyObject> {
      return foundryPlatformFetch<OntologyObject>(
        client,
        withPathParams(GET_OBJECT, {
          ontologyRid,
          objectType,
          primaryKey: String(primaryKey),
        }),
      );
    },

    async createObject(
      ontologyRid: string,
      objectType: string,
      body: Record<string, unknown>,
    ): Promise<OntologyObject> {
      return foundryPlatformFetch<OntologyObject>(
        client,
        withPathParams(CREATE_OBJECT, { ontologyRid, objectType }),
        { body },
      );
    },

    async updateObject(
      ontologyRid: string,
      objectType: string,
      primaryKey: string | number,
      body: Record<string, unknown>,
    ): Promise<OntologyObject> {
      return foundryPlatformFetch<OntologyObject>(
        client,
        withPathParams(UPDATE_OBJECT, {
          ontologyRid,
          objectType,
          primaryKey: String(primaryKey),
        }),
        { body },
      );
    },

    async deleteObject(
      ontologyRid: string,
      objectType: string,
      primaryKey: string | number,
    ): Promise<void> {
      await foundryPlatformFetch<void>(
        client,
        withPathParams(DELETE_OBJECT, {
          ontologyRid,
          objectType,
          primaryKey: String(primaryKey),
        }),
      );
    },

    async loadObjectSet(
      ontologyRid: string,
      body: LoadObjectSetRequest,
    ): Promise<PageResponse<OntologyObject>> {
      return foundryPlatformFetch<PageResponse<OntologyObject>>(
        client,
        withPathParams(LOAD_OBJECT_SET, { ontologyRid }),
        { body },
      );
    },

    async aggregate(
      ontologyRid: string,
      body: AggregateObjectsRequest,
    ): Promise<AggregationResponse> {
      return foundryPlatformFetch<AggregationResponse>(
        client,
        withPathParams(AGGREGATE_OBJECTS, { ontologyRid }),
        { body },
      );
    },
  };
}
