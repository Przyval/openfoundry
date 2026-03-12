import type pg from "pg";
import { generateRid } from "@openfoundry/rid";
import { notFound, conflict, invalidArgument } from "@openfoundry/errors";
import type {
  StoredDataset,
  CreateDatasetInput,
  Branch,
  CreateBranchInput,
  Transaction,
  OpenTransactionInput,
  TransactionStatus,
  TransactionType,
} from "./dataset-store.js";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface DatasetRow {
  rid: string;
  name: string;
  description: string | null;
  parent_folder_rid: string | null;
  created_at: string;
  updated_at: string;
}

interface BranchRow {
  rid: string;
  dataset_rid: string;
  name: string;
  is_default: boolean;
  created_at: string;
}

interface TransactionRow {
  rid: string;
  dataset_rid: string;
  branch_rid: string;
  status: string;
  type: string;
  created_at: string;
  committed_at: string | null;
}

// ---------------------------------------------------------------------------
// Row to domain
// ---------------------------------------------------------------------------

function rowToBranch(row: BranchRow): Branch {
  return {
    rid: row.rid,
    name: row.name,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    rid: row.rid,
    branchRid: row.branch_rid,
    status: row.status as TransactionStatus,
    type: row.type as TransactionType,
    createdAt: row.created_at,
    committedAt: row.committed_at ?? undefined,
  };
}

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

// ---------------------------------------------------------------------------
// PgDatasetStore
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed dataset store.
 */
export class PgDatasetStore {
  constructor(private pool: pg.Pool) {}

  // -----------------------------------------------------------------------
  // Dataset CRUD
  // -----------------------------------------------------------------------

  async createDataset(input: CreateDatasetInput): Promise<StoredDataset> {
    const rid = generateRid("datasets", "dataset").toString();

    try {
      const { rows } = await this.pool.query<DatasetRow>({
        text: `INSERT INTO datasets (rid, name, description, parent_folder_rid)
               VALUES ($1, $2, $3, $4)
               RETURNING *`,
        values: [rid, input.name, input.description ?? null, input.parentFolderRid ?? null],
      });

      // Create a default "main" branch
      const branchRid = generateRid("datasets", "branch").toString();
      await this.pool.query({
        text: `INSERT INTO dataset_branches (rid, dataset_rid, name, is_default)
               VALUES ($1, $2, $3, TRUE)`,
        values: [branchRid, rid, "main"],
      });

      return this.hydrateDataset(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict("Dataset", `name "${input.name}" already exists`);
      }
      throw err;
    }
  }

  async getDataset(rid: string): Promise<StoredDataset> {
    const { rows } = await this.pool.query<DatasetRow>({
      text: `SELECT * FROM datasets WHERE rid = $1`,
      values: [rid],
    });

    if (rows.length === 0) {
      throw notFound("Dataset", rid);
    }
    return this.hydrateDataset(rows[0]);
  }

  async listDatasets(): Promise<StoredDataset[]> {
    const { rows } = await this.pool.query<DatasetRow>({
      text: `SELECT * FROM datasets ORDER BY created_at ASC`,
    });

    return Promise.all(rows.map((r) => this.hydrateDataset(r)));
  }

  async deleteDataset(rid: string): Promise<void> {
    const result = await this.pool.query({
      text: `DELETE FROM datasets WHERE rid = $1`,
      values: [rid],
    });

    if (result.rowCount === 0) {
      throw notFound("Dataset", rid);
    }
  }

  // -----------------------------------------------------------------------
  // Branch CRUD
  // -----------------------------------------------------------------------

  async createBranch(datasetRid: string, input: CreateBranchInput): Promise<Branch> {
    // Verify dataset exists
    await this.getDataset(datasetRid);

    const rid = generateRid("datasets", "branch").toString();

    try {
      const { rows } = await this.pool.query<BranchRow>({
        text: `INSERT INTO dataset_branches (rid, dataset_rid, name, is_default)
               VALUES ($1, $2, $3, FALSE)
               RETURNING *`,
        values: [rid, datasetRid, input.name],
      });

      return rowToBranch(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict(
          "Branch",
          `name "${input.name}" already exists in dataset ${datasetRid}`,
        );
      }
      throw err;
    }
  }

  async listBranches(datasetRid: string): Promise<Branch[]> {
    // Verify dataset exists
    await this.getDataset(datasetRid);

    const { rows } = await this.pool.query<BranchRow>({
      text: `SELECT * FROM dataset_branches WHERE dataset_rid = $1 ORDER BY name ASC`,
      values: [datasetRid],
    });

    return rows.map(rowToBranch);
  }

  async getBranch(datasetRid: string, branchName: string): Promise<Branch> {
    await this.getDataset(datasetRid);

    const { rows } = await this.pool.query<BranchRow>({
      text: `SELECT * FROM dataset_branches WHERE dataset_rid = $1 AND name = $2`,
      values: [datasetRid, branchName],
    });

    if (rows.length === 0) {
      throw notFound("Branch", branchName);
    }
    return rowToBranch(rows[0]);
  }

  async deleteBranch(datasetRid: string, branchName: string): Promise<void> {
    const branch = await this.getBranch(datasetRid, branchName);

    if (branch.isDefault) {
      throw invalidArgument("branchName", "cannot delete the default branch");
    }

    await this.pool.query({
      text: `DELETE FROM dataset_branches WHERE dataset_rid = $1 AND name = $2`,
      values: [datasetRid, branchName],
    });
  }

  // -----------------------------------------------------------------------
  // Transaction management
  // -----------------------------------------------------------------------

  async openTransaction(
    datasetRid: string,
    input: OpenTransactionInput,
  ): Promise<Transaction> {
    await this.getDataset(datasetRid);

    // Verify the branch exists
    const { rows: branchRows } = await this.pool.query<BranchRow>({
      text: `SELECT * FROM dataset_branches WHERE dataset_rid = $1 AND rid = $2`,
      values: [datasetRid, input.branchRid],
    });
    if (branchRows.length === 0) {
      throw notFound("Branch", input.branchRid);
    }

    const rid = generateRid("datasets", "transaction").toString();

    const { rows } = await this.pool.query<TransactionRow>({
      text: `INSERT INTO dataset_transactions (rid, dataset_rid, branch_rid, status, type)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
      values: [rid, datasetRid, input.branchRid, "OPEN", input.type],
    });

    return rowToTransaction(rows[0]);
  }

  async commitTransaction(
    datasetRid: string,
    transactionRid: string,
  ): Promise<Transaction> {
    await this.getDataset(datasetRid);

    const { rows } = await this.pool.query<TransactionRow>({
      text: `SELECT * FROM dataset_transactions WHERE dataset_rid = $1 AND rid = $2`,
      values: [datasetRid, transactionRid],
    });

    if (rows.length === 0) {
      throw notFound("Transaction", transactionRid);
    }
    if (rows[0].status !== "OPEN") {
      throw invalidArgument(
        "transactionRid",
        `transaction is already ${rows[0].status}`,
      );
    }

    const { rows: updated } = await this.pool.query<TransactionRow>({
      text: `UPDATE dataset_transactions
             SET status = $1, committed_at = NOW()
             WHERE rid = $2
             RETURNING *`,
      values: ["COMMITTED", transactionRid],
    });

    return rowToTransaction(updated[0]);
  }

  async abortTransaction(
    datasetRid: string,
    transactionRid: string,
  ): Promise<Transaction> {
    await this.getDataset(datasetRid);

    const { rows } = await this.pool.query<TransactionRow>({
      text: `SELECT * FROM dataset_transactions WHERE dataset_rid = $1 AND rid = $2`,
      values: [datasetRid, transactionRid],
    });

    if (rows.length === 0) {
      throw notFound("Transaction", transactionRid);
    }
    if (rows[0].status !== "OPEN") {
      throw invalidArgument(
        "transactionRid",
        `transaction is already ${rows[0].status}`,
      );
    }

    const { rows: updated } = await this.pool.query<TransactionRow>({
      text: `UPDATE dataset_transactions
             SET status = $1
             WHERE rid = $2
             RETURNING *`,
      values: ["ABORTED", transactionRid],
    });

    return rowToTransaction(updated[0]);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private async hydrateDataset(row: DatasetRow): Promise<StoredDataset> {
    const [branchResult, txResult] = await Promise.all([
      this.pool.query<BranchRow>({
        text: `SELECT * FROM dataset_branches WHERE dataset_rid = $1`,
        values: [row.rid],
      }),
      this.pool.query<TransactionRow>({
        text: `SELECT * FROM dataset_transactions WHERE dataset_rid = $1`,
        values: [row.rid],
      }),
    ]);

    const branches = new Map<string, Branch>();
    for (const br of branchResult.rows) {
      branches.set(br.name, rowToBranch(br));
    }

    const transactions = new Map<string, Transaction>();
    for (const tx of txResult.rows) {
      transactions.set(tx.rid, rowToTransaction(tx));
    }

    return {
      rid: row.rid,
      name: row.name,
      description: row.description ?? undefined,
      parentFolderRid: row.parent_folder_rid ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      branches,
      transactions,
    };
  }
}
