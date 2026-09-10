import type { FastifyInstance } from "fastify";
import { requirePermission } from "@openfoundry/permissions";
import { invalidArgument } from "@openfoundry/errors";
import type {
  DatasetReadWriteStore,
  TransactionType,
} from "../../store/dataset-store.js";
// `pageSize` / `pageToken` mean the same thing in both API versions, so the
// helper is shared rather than duplicated under `v1/`.
import { paginateArray } from "../v2/pagination-helpers.js";
import { toV1Branch, toV1Dataset, toV1Transaction } from "./serializers.js";

/**
 * The transaction types the store can open.
 *
 * v1 also declares `DELETE`, which `DatasetStore.openTransaction` has no
 * representation for. Accepting it would open an APPEND transaction under a
 * name the caller chose for its delete semantics, so it is refused instead.
 */
const SUPPORTED_TRANSACTION_TYPES = new Set(["APPEND", "UPDATE", "SNAPSHOT"]);

/**
 * The transaction type used when the caller does not name one.
 *
 * v1 types `transactionType` as optional where v2 requires it; Foundry opens an
 * APPEND transaction for the omitted case, and that is the least destructive of
 * the three the store supports.
 */
const DEFAULT_TRANSACTION_TYPE: TransactionType = "APPEND";

export async function datasetRoutesV1(
  app: FastifyInstance,
  opts: { datasetStore: DatasetReadWriteStore },
): Promise<void> {
  const { datasetStore } = opts;

  // -----------------------------------------------------------------------
  // Datasets
  // -----------------------------------------------------------------------

  // Create dataset
  app.post<{
    Body: { name: string; parentFolderRid: string };
  }>("/datasets", {
    preHandler: requirePermission("datasets:write"),
  }, async (request) => {
    const { name, parentFolderRid } = request.body ?? {};

    // Required in `datasets_models.CreateDatasetRequest`, and required again on
    // the way out: `Dataset.parentFolderRid` has no optional form, so a dataset
    // stored without one could not be serialized back as a conformant v1
    // response.
    if (!parentFolderRid) {
      throw invalidArgument("parentFolderRid", "is required");
    }

    return toV1Dataset(
      await datasetStore.createDataset({ name, parentFolderRid }),
    );
  });

  // Get dataset by RID
  app.get<{
    Params: { datasetRid: string };
  }>("/datasets/:datasetRid", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    return toV1Dataset(await datasetStore.getDataset(request.params.datasetRid));
  });

  // -----------------------------------------------------------------------
  // Branches
  // -----------------------------------------------------------------------

  // List branches
  app.get<{
    Params: { datasetRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/datasets/:datasetRid/branches", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const branches = await datasetStore.listBranches(request.params.datasetRid);
    return paginateArray(branches.map(toV1Branch), request.query);
  });

  // Create branch
  app.post<{
    Params: { datasetRid: string };
    Body: { branchId: string; transactionRid?: string };
  }>("/datasets/:datasetRid/branches", {
    preHandler: requirePermission("datasets:write"),
  }, async (request) => {
    const { branchId } = request.body ?? {};
    if (!branchId) {
      throw invalidArgument("branchId", "is required");
    }

    // `transactionRid` is accepted because v1 declares it, and ignored because
    // the store has no way to start a branch at a given transaction: see the
    // note on `V1Branch.transactionRid`. It is never echoed back, so a caller
    // that sends one is not told the branch was created at it.
    const branch = await datasetStore.createBranch(request.params.datasetRid, {
      name: branchId,
    });
    return toV1Branch(branch);
  });

  // Get branch by identifier
  app.get<{
    Params: { datasetRid: string; branchId: string };
  }>("/datasets/:datasetRid/branches/:branchId", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const branch = await datasetStore.getBranch(
      request.params.datasetRid,
      request.params.branchId,
    );
    return toV1Branch(branch);
  });

  // Delete branch
  app.delete<{
    Params: { datasetRid: string; branchId: string };
  }>("/datasets/:datasetRid/branches/:branchId", {
    preHandler: requirePermission("datasets:delete"),
  }, async (request, reply) => {
    await datasetStore.deleteBranch(
      request.params.datasetRid,
      request.params.branchId,
    );
    reply.status(204);
    return;
  });

  // -----------------------------------------------------------------------
  // Transactions
  // -----------------------------------------------------------------------

  // Open transaction
  app.post<{
    Params: { datasetRid: string };
    Querystring: { branchId?: string };
    Body: { transactionType?: string };
  }>("/datasets/:datasetRid/transactions", {
    preHandler: requirePermission("datasets:write"),
  }, async (request) => {
    const { datasetRid } = request.params;
    const requestedType = request.body?.transactionType;

    if (requestedType !== undefined && !SUPPORTED_TRANSACTION_TYPES.has(requestedType)) {
      throw invalidArgument(
        "transactionType",
        `must be one of APPEND, UPDATE, SNAPSHOT, got "${requestedType}"`,
      );
    }

    // `branchId` is a branch *name* in v1. Omitting it means the dataset's
    // default branch, which is what Foundry documents as `master` and what this
    // store creates as `main`; resolving it from the store rather than from a
    // constant keeps the two from drifting.
    const branchId = request.query.branchId;
    const branch = branchId
      ? await datasetStore.getBranch(datasetRid, branchId)
      : (await datasetStore.listBranches(datasetRid)).find((b) => b.isDefault);

    if (!branch) {
      throw invalidArgument("branchId", "the dataset has no default branch");
    }

    return toV1Transaction(
      await datasetStore.openTransaction(datasetRid, {
        branchRid: branch.rid,
        type:
          (requestedType as TransactionType | undefined) ??
          DEFAULT_TRANSACTION_TYPE,
      }),
    );
  });

  // Commit transaction
  app.post<{
    Params: { datasetRid: string; transactionRid: string };
  }>("/datasets/:datasetRid/transactions/:transactionRid/commit", {
    preHandler: requirePermission("datasets:write"),
  }, async (request) => {
    return toV1Transaction(
      await datasetStore.commitTransaction(
        request.params.datasetRid,
        request.params.transactionRid,
      ),
    );
  });

  // Abort transaction
  app.post<{
    Params: { datasetRid: string; transactionRid: string };
  }>("/datasets/:datasetRid/transactions/:transactionRid/abort", {
    preHandler: requirePermission("datasets:write"),
  }, async (request) => {
    return toV1Transaction(
      await datasetStore.abortTransaction(
        request.params.datasetRid,
        request.params.transactionRid,
      ),
    );
  });
}
