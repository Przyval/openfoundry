import type { Client, EndpointDescriptor } from "@openfoundry/client";
import { foundryPlatformFetch } from "@openfoundry/client";
import type { PageResponse } from "@openfoundry/pagination";
import type {
  Ontology,
  ObjectType,
  ActionType,
  LinkType,
  InterfaceType,
  ListParams,
} from "../types.js";

// ---------------------------------------------------------------------------
// Endpoint descriptors
// ---------------------------------------------------------------------------

const LIST_ONTOLOGIES: EndpointDescriptor = [
  "GET",
  "/v2/ontologies",
  {},
  "application/json",
  "application/json",
];

const GET_ONTOLOGY: EndpointDescriptor = [
  "GET",
  "/v2/ontologies/:ontologyRid",
  {},
  "application/json",
  "application/json",
];

const LIST_OBJECT_TYPES: EndpointDescriptor = [
  "GET",
  "/v2/ontologies/:ontologyRid/objectTypes",
  {},
  "application/json",
  "application/json",
];

const GET_OBJECT_TYPE: EndpointDescriptor = [
  "GET",
  "/v2/ontologies/:ontologyRid/objectTypes/:apiName",
  {},
  "application/json",
  "application/json",
];

const LIST_ACTION_TYPES: EndpointDescriptor = [
  "GET",
  "/v2/ontologies/:ontologyRid/actionTypes",
  {},
  "application/json",
  "application/json",
];

const LIST_LINK_TYPES: EndpointDescriptor = [
  "GET",
  "/v2/ontologies/:ontologyRid/objectTypes/:objectTypeApiName/linkTypes",
  {},
  "application/json",
  "application/json",
];

const LIST_INTERFACE_TYPES: EndpointDescriptor = [
  "GET",
  "/v2/ontologies/:ontologyRid/interfaceTypes",
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
// OntologiesApi
// ---------------------------------------------------------------------------

/**
 * API namespace for ontology metadata operations.
 */
export interface OntologiesApi {
  /**
   * List all ontologies accessible to the current user.
   */
  listOntologies(params?: ListParams): Promise<PageResponse<Ontology>>;

  /**
   * Get a single ontology by its resource identifier.
   */
  getOntology(ontologyRid: string): Promise<Ontology>;

  /**
   * List all object types within an ontology.
   */
  listObjectTypes(ontologyRid: string, params?: ListParams): Promise<PageResponse<ObjectType>>;

  /**
   * Get a single object type by its API name.
   */
  getObjectType(ontologyRid: string, apiName: string): Promise<ObjectType>;

  /**
   * List all action types within an ontology.
   */
  listActionTypes(ontologyRid: string, params?: ListParams): Promise<PageResponse<ActionType>>;

  /**
   * List all link types for a given object type.
   */
  listLinkTypes(
    ontologyRid: string,
    objectTypeApiName: string,
    params?: ListParams,
  ): Promise<PageResponse<LinkType>>;

  /**
   * List all interface types within an ontology.
   */
  listInterfaceTypes(
    ontologyRid: string,
    params?: ListParams,
  ): Promise<PageResponse<InterfaceType>>;
}

/**
 * Creates the ontologies API namespace.
 */
export function createOntologiesApi(client: Client): OntologiesApi {
  return {
    async listOntologies(params?: ListParams): Promise<PageResponse<Ontology>> {
      return foundryPlatformFetch<PageResponse<Ontology>>(
        client,
        LIST_ONTOLOGIES,
        { queryParams: toQueryParams(params) },
      );
    },

    async getOntology(ontologyRid: string): Promise<Ontology> {
      return foundryPlatformFetch<Ontology>(
        client,
        withPathParams(GET_ONTOLOGY, { ontologyRid }),
      );
    },

    async listObjectTypes(
      ontologyRid: string,
      params?: ListParams,
    ): Promise<PageResponse<ObjectType>> {
      return foundryPlatformFetch<PageResponse<ObjectType>>(
        client,
        withPathParams(LIST_OBJECT_TYPES, { ontologyRid }),
        { queryParams: toQueryParams(params) },
      );
    },

    async getObjectType(ontologyRid: string, apiName: string): Promise<ObjectType> {
      return foundryPlatformFetch<ObjectType>(
        client,
        withPathParams(GET_OBJECT_TYPE, { ontologyRid, apiName }),
      );
    },

    async listActionTypes(
      ontologyRid: string,
      params?: ListParams,
    ): Promise<PageResponse<ActionType>> {
      return foundryPlatformFetch<PageResponse<ActionType>>(
        client,
        withPathParams(LIST_ACTION_TYPES, { ontologyRid }),
        { queryParams: toQueryParams(params) },
      );
    },

    async listLinkTypes(
      ontologyRid: string,
      objectTypeApiName: string,
      params?: ListParams,
    ): Promise<PageResponse<LinkType>> {
      return foundryPlatformFetch<PageResponse<LinkType>>(
        client,
        withPathParams(LIST_LINK_TYPES, { ontologyRid, objectTypeApiName }),
        { queryParams: toQueryParams(params) },
      );
    },

    async listInterfaceTypes(
      ontologyRid: string,
      params?: ListParams,
    ): Promise<PageResponse<InterfaceType>> {
      return foundryPlatformFetch<PageResponse<InterfaceType>>(
        client,
        withPathParams(LIST_INTERFACE_TYPES, { ontologyRid }),
        { queryParams: toQueryParams(params) },
      );
    },
  };
}
