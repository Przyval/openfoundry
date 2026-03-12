/**
 * Types for the Admin Service API.
 * Derived from conjure/admin-service.yml.
 */
import type { Rid, PageToken, Timestamp } from "./common.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

/** A user in the platform */
export interface User {
  rid: Rid;
  username: string;
  email: string;
  displayName: string;
  attributes?: Record<string, string>;
  status: UserStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  displayName: string;
  attributes?: Record<string, string>;
}

export interface UpdateUserRequest {
  email?: string;
  displayName?: string;
  attributes?: Record<string, string>;
  status?: UserStatus;
}

export interface ListUsersResponse {
  data: User[];
  nextPageToken?: PageToken;
}

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------

/** A group of users for access control */
export interface Group {
  rid: Rid;
  name: string;
  description?: string;
  memberCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
}

export interface ListGroupsResponse {
  data: Group[];
  nextPageToken?: PageToken;
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

/** Represents a user's membership in a group */
export interface GroupMembership {
  groupRid: Rid;
  userRid: Rid;
}

export interface AddMemberRequest {
  userRid: Rid;
}

/** Summary of a group member (subset of User) */
export interface GroupMemberSummary {
  rid: Rid;
  username: string;
  email: string;
  displayName: string;
  status: UserStatus;
}

/** Summary of a group a user belongs to */
export interface UserGroupSummary {
  rid: Rid;
  name: string;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
