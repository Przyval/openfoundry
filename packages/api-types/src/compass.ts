/**
 * Types for the Compass Service API.
 * Derived from conjure/compass-service.yml.
 */
import type { Rid, PageToken, Timestamp } from "./common.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type ResourceType = "FOLDER" | "PROJECT" | "DATASET" | "ONTOLOGY" | "FILE";

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

/** A resource in the Compass filesystem hierarchy */
export interface Resource {
  rid: Rid;
  type: ResourceType;
  name: string;
  path: string;
  parentRid?: Rid;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy?: string;
  markings?: string[];
}

export interface CreateResourceRequest {
  type: ResourceType;
  name: string;
  parentRid?: Rid;
  description?: string;
  createdBy?: string;
  markings?: string[];
}

export interface UpdateResourceRequest {
  name?: string;
  parentRid?: Rid;
  description?: string;
  markings?: string[];
}

export interface ListResourcesResponse {
  data: Resource[];
  nextPageToken?: PageToken;
}
