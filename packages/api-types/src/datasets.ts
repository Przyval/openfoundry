/**
 * Types for the Dataset Service API.
 * Derived from conjure/dataset-service.yml.
 */
import type { Rid, PageToken, Timestamp } from "./common.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type TransactionType = "UPDATE" | "APPEND" | "SNAPSHOT";

export type TransactionStatus = "OPEN" | "COMMITTED" | "ABORTED";

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

/** A dataset resource that contains files organized in branches and transactions */
export interface Dataset {
  rid: Rid;
  name: string;
  description?: string;
  parentFolderRid?: Rid;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateDatasetRequest {
  name: string;
  description?: string;
  parentFolderRid?: Rid;
}

export interface ListDatasetsResponse {
  data: Dataset[];
  nextPageToken?: PageToken;
}

// ---------------------------------------------------------------------------
// Branch
// ---------------------------------------------------------------------------

/** A named branch within a dataset */
export interface Branch {
  rid: Rid;
  name: string;
  datasetRid: Rid;
  createdAt: Timestamp;
}

export interface CreateBranchRequest {
  name: string;
}

export interface ListBranchesResponse {
  data: Branch[];
  nextPageToken?: PageToken;
}

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

/** A transaction represents an atomic unit of changes to a dataset */
export interface Transaction {
  rid: Rid;
  datasetRid: Rid;
  branchRid: Rid;
  type: TransactionType;
  status: TransactionStatus;
  createdAt: Timestamp;
  closedAt?: Timestamp;
}

export interface OpenTransactionRequest {
  branchRid: Rid;
  type: TransactionType;
}

// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

/** Metadata about a file in a dataset (content not included) */
export interface DatasetFile {
  path: string;
  size: number;
  contentType: string;
  transactionRid: string;
}

export interface ListFilesResponse {
  data: DatasetFile[];
  nextPageToken?: PageToken;
}
