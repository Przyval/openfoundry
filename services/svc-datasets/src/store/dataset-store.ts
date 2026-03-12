import { generateRid } from "@openfoundry/rid";
import { notFound, conflict, invalidArgument } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransactionStatus = "OPEN" | "COMMITTED" | "ABORTED";
export type TransactionType = "UPDATE" | "APPEND" | "SNAPSHOT";

export interface Branch {
  rid: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

export interface Transaction {
  rid: string;
  branchRid: string;
  status: TransactionStatus;
  type: TransactionType;
  createdAt: string;
  committedAt?: string;
}

export interface StoredDataset {
  rid: string;
  name: string;
  description?: string;
  parentFolderRid?: string;
  createdAt: string;
  updatedAt: string;
  branches: Map<string, Branch>;
  transactions: Map<string, Transaction>;
}

export interface CreateDatasetInput {
  name: string;
  description?: string;
  parentFolderRid?: string;
}

export interface CreateBranchInput {
  name: string;
}

export interface OpenTransactionInput {
  branchRid: string;
  type: TransactionType;
}

// ---------------------------------------------------------------------------
// DatasetStore — in-memory storage for dataset entities
// ---------------------------------------------------------------------------

export class DatasetStore {
  private readonly datasets = new Map<string, StoredDataset>();

  // -----------------------------------------------------------------------
  // Dataset CRUD
  // -----------------------------------------------------------------------

  createDataset(input: CreateDatasetInput): StoredDataset {
    // Check for duplicate name
    for (const ds of this.datasets.values()) {
      if (ds.name === input.name) {
        throw conflict("Dataset", `name "${input.name}" already exists`);
      }
    }

    const rid = generateRid("datasets", "dataset").toString();
    const now = new Date().toISOString();

    const dataset: StoredDataset = {
      rid,
      name: input.name,
      description: input.description,
      parentFolderRid: input.parentFolderRid,
      createdAt: now,
      updatedAt: now,
      branches: new Map(),
      transactions: new Map(),
    };

    // Create a default "main" branch
    const branchRid = generateRid("datasets", "branch").toString();
    dataset.branches.set("main", {
      rid: branchRid,
      name: "main",
      isDefault: true,
      createdAt: now,
    });

    this.datasets.set(rid, dataset);
    return dataset;
  }

  getDataset(rid: string): StoredDataset {
    const dataset = this.datasets.get(rid);
    if (!dataset) {
      throw notFound("Dataset", rid);
    }
    return dataset;
  }

  listDatasets(): StoredDataset[] {
    return Array.from(this.datasets.values());
  }

  deleteDataset(rid: string): void {
    if (!this.datasets.has(rid)) {
      throw notFound("Dataset", rid);
    }
    this.datasets.delete(rid);
  }

  // -----------------------------------------------------------------------
  // Branch CRUD
  // -----------------------------------------------------------------------

  createBranch(datasetRid: string, input: CreateBranchInput): Branch {
    const dataset = this.getDataset(datasetRid);

    if (dataset.branches.has(input.name)) {
      throw conflict(
        "Branch",
        `name "${input.name}" already exists in dataset ${datasetRid}`,
      );
    }

    const rid = generateRid("datasets", "branch").toString();
    const branch: Branch = {
      rid,
      name: input.name,
      isDefault: false,
      createdAt: new Date().toISOString(),
    };

    dataset.branches.set(input.name, branch);
    return branch;
  }

  listBranches(datasetRid: string): Branch[] {
    const dataset = this.getDataset(datasetRid);
    return Array.from(dataset.branches.values());
  }

  getBranch(datasetRid: string, branchName: string): Branch {
    const dataset = this.getDataset(datasetRid);
    const branch = dataset.branches.get(branchName);
    if (!branch) {
      throw notFound("Branch", branchName);
    }
    return branch;
  }

  deleteBranch(datasetRid: string, branchName: string): void {
    const dataset = this.getDataset(datasetRid);
    const branch = dataset.branches.get(branchName);
    if (!branch) {
      throw notFound("Branch", branchName);
    }
    if (branch.isDefault) {
      throw invalidArgument("branchName", "cannot delete the default branch");
    }
    dataset.branches.delete(branchName);
  }

  // -----------------------------------------------------------------------
  // Transaction management
  // -----------------------------------------------------------------------

  openTransaction(datasetRid: string, input: OpenTransactionInput): Transaction {
    const dataset = this.getDataset(datasetRid);

    // Verify the branch exists
    let branchFound = false;
    for (const branch of dataset.branches.values()) {
      if (branch.rid === input.branchRid) {
        branchFound = true;
        break;
      }
    }
    if (!branchFound) {
      throw notFound("Branch", input.branchRid);
    }

    const rid = generateRid("datasets", "transaction").toString();
    const transaction: Transaction = {
      rid,
      branchRid: input.branchRid,
      status: "OPEN",
      type: input.type,
      createdAt: new Date().toISOString(),
    };

    dataset.transactions.set(rid, transaction);
    return transaction;
  }

  commitTransaction(datasetRid: string, transactionRid: string): Transaction {
    const dataset = this.getDataset(datasetRid);
    const transaction = dataset.transactions.get(transactionRid);
    if (!transaction) {
      throw notFound("Transaction", transactionRid);
    }
    if (transaction.status !== "OPEN") {
      throw invalidArgument(
        "transactionRid",
        `transaction is already ${transaction.status}`,
      );
    }

    transaction.status = "COMMITTED";
    transaction.committedAt = new Date().toISOString();
    return transaction;
  }

  abortTransaction(datasetRid: string, transactionRid: string): Transaction {
    const dataset = this.getDataset(datasetRid);
    const transaction = dataset.transactions.get(transactionRid);
    if (!transaction) {
      throw notFound("Transaction", transactionRid);
    }
    if (transaction.status !== "OPEN") {
      throw invalidArgument(
        "transactionRid",
        `transaction is already ${transaction.status}`,
      );
    }

    transaction.status = "ABORTED";
    return transaction;
  }
}
