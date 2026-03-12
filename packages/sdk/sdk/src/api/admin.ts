import type { Client, EndpointDescriptor } from "@openfoundry/client";
import { foundryPlatformFetch } from "@openfoundry/client";
import type { PageResponse } from "@openfoundry/pagination";
import type { User, Group, CreateUserRequest, ListParams } from "../types.js";

// ---------------------------------------------------------------------------
// Endpoint descriptors
// ---------------------------------------------------------------------------

const LIST_USERS: EndpointDescriptor = [
  "GET",
  "/v2/admin/users",
  {},
  "application/json",
  "application/json",
];

const GET_USER: EndpointDescriptor = [
  "GET",
  "/v2/admin/users/:userRid",
  {},
  "application/json",
  "application/json",
];

const CREATE_USER: EndpointDescriptor = [
  "POST",
  "/v2/admin/users",
  {},
  "application/json",
  "application/json",
];

const LIST_GROUPS: EndpointDescriptor = [
  "GET",
  "/v2/admin/groups",
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
// AdminApi
// ---------------------------------------------------------------------------

/**
 * API namespace for platform administration operations.
 */
export interface AdminApi {
  /**
   * List all users on the platform.
   */
  listUsers(params?: ListParams): Promise<PageResponse<User>>;

  /**
   * Get a single user by their resource identifier.
   */
  getUser(userRid: string): Promise<User>;

  /**
   * Create a new platform user.
   */
  createUser(body: CreateUserRequest): Promise<User>;

  /**
   * List all groups on the platform.
   */
  listGroups(params?: ListParams): Promise<PageResponse<Group>>;
}

/**
 * Creates the admin API namespace.
 */
export function createAdminApi(client: Client): AdminApi {
  return {
    async listUsers(params?: ListParams): Promise<PageResponse<User>> {
      return foundryPlatformFetch<PageResponse<User>>(
        client,
        LIST_USERS,
        { queryParams: toQueryParams(params) },
      );
    },

    async getUser(userRid: string): Promise<User> {
      return foundryPlatformFetch<User>(
        client,
        withPathParams(GET_USER, { userRid }),
      );
    },

    async createUser(body: CreateUserRequest): Promise<User> {
      return foundryPlatformFetch<User>(
        client,
        CREATE_USER,
        { body },
      );
    },

    async listGroups(params?: ListParams): Promise<PageResponse<Group>> {
      return foundryPlatformFetch<PageResponse<Group>>(
        client,
        LIST_GROUPS,
        { queryParams: toQueryParams(params) },
      );
    },
  };
}
