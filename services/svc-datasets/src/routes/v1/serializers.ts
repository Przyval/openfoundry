/**
 * Wire serializers for the v1 dataset models.
 *
 * v1 and v2 are not the same API with a different prefix. `Branch` is the
 * clearest case: v1 names the branch `branchId`, v2 names it `name`, and a
 * client generated against v1 reads neither field out of the other's response.
 * These functions project the store's own shapes onto the v1 models declared in
 * `foundry_sdk/v1/datasets/models.py`, so nothing here depends on what the v2
 * routes happen to emit.
 */

import type {
  Branch,
  StoredDataset,
  Transaction,
} from "../../store/dataset-store.js";

/** `datasets_models.Branch` — the branch identifier is its name. */
export interface V1Branch {
  branchId: string;
  /**
   * Foundry documents this as the most recent OPEN or COMMITTED transaction on
   * the branch. Never populated here: `openTransaction` records a `branchRid`
   * on the transaction but neither store reads it back in a defined order —
   * `PgDatasetStore` selects `dataset_transactions` with no `ORDER BY`, and
   * `createdAt` collides at millisecond resolution — so "most recent" cannot be
   * identified. The field is optional in v1, so it is omitted rather than
   * guessed at.
   */
  transactionRid?: string;
}

/** `datasets_models.Dataset`. */
export interface V1Dataset {
  rid: string;
  name: string;
  parentFolderRid: string;
}

/** `datasets_models.Transaction`. */
export interface V1Transaction {
  rid: string;
  transactionType: string;
  status: string;
  createdTime: string;
  closedTime?: string;
}

export function toV1Branch(branch: Branch): V1Branch {
  return { branchId: branch.name };
}

/**
 * `parentFolderRid` is required in v1, which is why the create route refuses a
 * request that omits it: a dataset stored without a parent folder could not be
 * serialized back as a conformant `Dataset`.
 */
export function toV1Dataset(dataset: StoredDataset): V1Dataset {
  return {
    rid: dataset.rid,
    name: dataset.name,
    parentFolderRid: dataset.parentFolderRid ?? "",
  };
}

/**
 * A transaction closes when it is committed or aborted. The store timestamps
 * only the commit, so an aborted transaction reports no `closedTime`; the field
 * is optional in v1.
 */
export function toV1Transaction(transaction: Transaction): V1Transaction {
  return {
    rid: transaction.rid,
    transactionType: transaction.type,
    status: transaction.status,
    createdTime: transaction.createdAt,
    ...(transaction.committedAt !== undefined
      ? { closedTime: transaction.committedAt }
      : {}),
  };
}
