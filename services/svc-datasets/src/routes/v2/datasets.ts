import type { FastifyInstance } from "fastify";
import type { DatasetStore, StoredDataset } from "../../store/dataset-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { paginateArray } from "./pagination-helpers.js";

/** Serialize a StoredDataset to the wire format. */
function serializeDataset(ds: StoredDataset) {
  return {
    rid: ds.rid,
    name: ds.name,
    description: ds.description,
    parentFolderRid: ds.parentFolderRid,
    createdAt: ds.createdAt,
    updatedAt: ds.updatedAt,
  };
}

export async function datasetRoutes(
  app: FastifyInstance,
  opts: { datasetStore: DatasetStore },
): Promise<void> {
  const { datasetStore } = opts;

  // -----------------------------------------------------------------------
  // Dataset CRUD
  // -----------------------------------------------------------------------

  // List datasets (paginated)
  app.get<{
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/datasets", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const all = datasetStore.listDatasets().map(serializeDataset);
    return paginateArray(all, request.query);
  });

  // Create dataset
  app.post<{
    Body: { name: string; description?: string; parentFolderRid?: string };
  }>("/datasets", {
    preHandler: requirePermission("datasets:write"),
  }, async (request, reply) => {
    const dataset = datasetStore.createDataset(request.body);
    reply.status(201);
    return serializeDataset(dataset);
  });

  // Get dataset by RID
  app.get<{
    Params: { datasetRid: string };
  }>("/datasets/:datasetRid", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const dataset = datasetStore.getDataset(request.params.datasetRid);
    return serializeDataset(dataset);
  });

  // Delete dataset
  app.delete<{
    Params: { datasetRid: string };
  }>("/datasets/:datasetRid", {
    preHandler: requirePermission("datasets:delete"),
  }, async (request, reply) => {
    datasetStore.deleteDataset(request.params.datasetRid);
    reply.status(204);
    return;
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
    const branches = datasetStore.listBranches(request.params.datasetRid);
    return paginateArray(branches, request.query);
  });

  // Create branch
  app.post<{
    Params: { datasetRid: string };
    Body: { name: string };
  }>("/datasets/:datasetRid/branches", {
    preHandler: requirePermission("datasets:write"),
  }, async (request, reply) => {
    const branch = datasetStore.createBranch(
      request.params.datasetRid,
      request.body,
    );
    reply.status(201);
    return branch;
  });

  // Get branch by name
  app.get<{
    Params: { datasetRid: string; branchName: string };
  }>("/datasets/:datasetRid/branches/:branchName", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    return datasetStore.getBranch(
      request.params.datasetRid,
      request.params.branchName,
    );
  });

  // Delete branch
  app.delete<{
    Params: { datasetRid: string; branchName: string };
  }>("/datasets/:datasetRid/branches/:branchName", {
    preHandler: requirePermission("datasets:delete"),
  }, async (request, reply) => {
    datasetStore.deleteBranch(
      request.params.datasetRid,
      request.params.branchName,
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
    Querystring: { branchName?: string };
    Body: {
      branchRid?: string;
      type?: "UPDATE" | "APPEND" | "SNAPSHOT";
      transactionType?: "UPDATE" | "APPEND" | "SNAPSHOT";
    };
  }>("/datasets/:datasetRid/transactions", {
    preHandler: requirePermission("datasets:write"),
  }, async (request, reply) => {
    const { datasetRid } = request.params;
    let { branchRid, type } = request.body;

    // SDK compat: accept transactionType as alias for type
    if (!type && request.body.transactionType) {
      type = request.body.transactionType;
    }

    // SDK compat: resolve branchName query param to branchRid
    if (!branchRid && request.query.branchName) {
      const branch = datasetStore.getBranch(datasetRid, request.query.branchName);
      branchRid = branch.rid;
    }

    const transaction = datasetStore.openTransaction(datasetRid, {
      branchRid: branchRid!,
      type: type!,
    });
    reply.status(201);
    return transaction;
  });

  // Commit transaction
  app.post<{
    Params: { datasetRid: string; transactionRid: string };
  }>(
    "/datasets/:datasetRid/transactions/:transactionRid/commit",
    {
      preHandler: requirePermission("datasets:write"),
    },
    async (request) => {
      return datasetStore.commitTransaction(
        request.params.datasetRid,
        request.params.transactionRid,
      );
    },
  );

  // Abort transaction
  app.post<{
    Params: { datasetRid: string; transactionRid: string };
  }>(
    "/datasets/:datasetRid/transactions/:transactionRid/abort",
    {
      preHandler: requirePermission("datasets:write"),
    },
    async (request) => {
      return datasetStore.abortTransaction(
        request.params.datasetRid,
        request.params.transactionRid,
      );
    },
  );
}
