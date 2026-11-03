import type { FastifyInstance, FastifyRequest } from "fastify";
import { invalidArgument } from "@openfoundry/errors";
import { type PageToken, decodePageToken, encodePageToken, normalizePageRequest } from "@openfoundry/pagination";
import {
  ROOT_RESOURCE,
  evaluateEach,
  grantCreatorOwner,
  requireCaller,
  requirePermission,
} from "@openfoundry/permissions";
import { generateRid } from "@openfoundry/rid";
import { folderRid, parseCreateConnection, parseExportSettings, ridString } from "../../connectivity/config.js";
import {
  apiFeaturePreviewUsageOnly,
  connectionNotFound,
  driverContentMustBeUploadedAsJar,
  fileImportNotFound,
  secretNamesDoNotExist,
  tableImportNotFound,
  uploadCustomJdbcDriverNotSupportForConnection,
} from "../../connectivity/errors.js";
import {
  parseFileImportFields,
  parseTableImportFields,
  parseVirtualTable,
  requireFileImports,
  requireTableImportConfig,
  requireVirtualTableSource,
} from "../../connectivity/imports.js";
import { compact, list, obj, optionalStr, str, stringMap } from "../../connectivity/parse.js";
import type { ConnectivityStore } from "../../connectivity/store.js";
import type { ConnectionRecord, ImportKind, ImportRecord, Json } from "../../connectivity/types.js";
import type { DatasetReadWriteStore } from "../../store/dataset-store.js";

/**
 * The Foundry `connectivity` v2 section (`foundry_sdk/v2/connectivity/`).
 *
 * 18 of the section's 20 operations are served: Connection create, get,
 * getConfiguration, getConfigurationBatch, updateExportSettings,
 * updateSecrets and uploadCustomJdbcDrivers; File Import create, get, list, replace and delete; Table
 * Import create, get, list, replace and delete; and Virtual Table create. Every
 * one is a preview endpoint in Foundry, so every one refuses a request without
 * `preview=true` with `ApiFeaturePreviewUsageOnly`.
 *
 * Two are not served, and answer 404: File Import `execute` and Table Import
 * `execute` (`POST .../fileImports/{rid}/execute`, `.../tableImports/{rid}/execute`).
 * They return the `BuildRid` of a build that pulls the data from the external
 * system into the dataset. There is no build system and no connector runtime
 * here, so the RID could only be invented, and the import would never have run.
 *
 * Parameters that are stored but cannot take full effect:
 *
 *  - `parentFolderRid` and a virtual table's `parentRid` must be folder RIDs and
 *    scope the per-folder name rules, but whether the folder exists is not
 *    checked: no folder tree is served to check it against.
 *  - A virtual table's `markings` are stored as given; no Marking catalogue is
 *    consulted.
 *  - `snowflake` `externalOauth` and `databricks` `workflowIdentityFederation`
 *    authentication are rejected: their read form carries an OIDC issuer URL,
 *    which this platform has none to name.
 *
 * Permissions follow the platform model: a connection is a resource, and
 * reading it needs `datasets:read`, changing it `datasets:write`. Export
 * settings need Owner (Foundry restricts them to the Information Security
 * Officer). An import also needs `datasets:write` on its target dataset.
 */
/** The largest driver jar accepted. */
const DRIVER_UPLOAD_LIMIT = 64 * 1024 * 1024;
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export async function connectivityRoutes(
  app: FastifyInstance,
  opts: { store: ConnectivityStore; datasetStore: DatasetReadWriteStore },
): Promise<void> {
  const { store, datasetStore } = opts;

  // Registered inside this plugin, so it guards these routes and nothing else.
  app.addHook("onRequest", async (request) => {
    const { preview } = request.query as { preview?: string };
    if (preview !== "true") throw apiFeaturePreviewUsageOnly();
  });

  // A driver arrives as the raw bytes of a jar, not as JSON.
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: DRIVER_UPLOAD_LIMIT },
    (_request, body, done) => done(null, body),
  );

  const onConnection = {
    resource: (request: FastifyRequest) => [
      (request.params as { connectionRid: string }).connectionRid,
      ROOT_RESOURCE,
    ],
  };
  const read = requirePermission("datasets:read", onConnection);
  const write = requirePermission("datasets:write", onConnection);
  const del = requirePermission("datasets:delete", onConnection);
  const owner = requirePermission("resource:manage-roles", onConnection);
  // A create names its target in the body; the permission model keys on that RID.
  const onBody = (field: string) => ({
    resource: (request: FastifyRequest) => {
      const value = (request.body as Json | undefined)?.[field];
      return typeof value === "string" ? [value, ROOT_RESOURCE] : [ROOT_RESOURCE];
    },
  });
  const writeDataset = requirePermission("datasets:write", onBody("datasetRid"));

  // -- Connection ------------------------------------------------------------

  app.post<{ Querystring: { preview?: string } }>(
    "/connectivity/connections",
    { preHandler: requirePermission("datasets:write", onBody("parentFolderRid")) },
    async (request) => {
      const parsed = parseCreateConnection(request.body);
      const record = await store.createConnection(
        {
          rid: generateRid("magritte", "source").toString(),
          parentFolderRid: parsed.parentFolderRid,
          displayName: parsed.displayName,
          // Foundry creates a source with exports off.
          exportSettings: { exportsEnabled: false, exportEnabledWithoutMarkingsValidation: false },
          worker: parsed.worker,
          configuration: parsed.configuration,
          createdTime: new Date().toISOString(),
        },
        parsed.secrets,
      );
      await grantCreatorOwner(request, record.rid);
      return toConnection(record);
    },
  );

  app.get<{ Params: { connectionRid: string } }>(
    "/connectivity/connections/:connectionRid",
    { preHandler: read },
    async (request) => toConnection(await requireConnection(store, request.params.connectionRid)),
  );

  app.get<{ Params: { connectionRid: string } }>(
    "/connectivity/connections/:connectionRid/getConfiguration",
    { preHandler: read },
    async (request) =>
      (await requireConnection(store, request.params.connectionRid)).configuration,
  );

  app.post<{ Querystring: { preview?: string } }>(
    "/connectivity/connections/getConfigurationBatch",
    { preHandler: requireCaller },
    async (request) => {
      const elements = list(request.body, "body");
      if (elements.length > 200) {
        throw invalidArgument("body", "holds at most 200 connections per request");
      }
      const rids = [
        ...new Set(
          elements.map((element, i) =>
            ridString(str(obj(element, `body[${i}]`), "connectionRid", `body[${i}].`), `body[${i}].connectionRid`),
          ),
        ),
      ];
      const found = (await Promise.all(rids.map((rid) => store.getConnection(rid)))).filter(
        (c): c is ConnectionRecord => c !== undefined,
      );
      // Connections the caller may not read are left out, as Foundry leaves them out.
      const identity = request.identity;
      const allowed = identity
        ? await evaluateEach(
            request.server.authorization,
            identity,
            "datasets:read",
            found.map((c) => [c.rid, ROOT_RESOURCE]),
          )
        : found.map(() => true);
      return {
        data: Object.fromEntries(
          found.filter((_, i) => allowed[i]).map((c) => [c.rid, c.configuration]),
        ),
      };
    },
  );

  app.post<{ Params: { connectionRid: string } }>(
    "/connectivity/connections/:connectionRid/updateExportSettings",
    { preHandler: owner },
    async (request, reply) => {
      await requireConnection(store, request.params.connectionRid);
      const body = obj(request.body, "body");
      await store.setExportSettings(
        request.params.connectionRid,
        parseExportSettings(body.exportSettings, "exportSettings"),
      );
      return reply.status(204).send();
    },
  );

  app.post<{ Params: { connectionRid: string } }>(
    "/connectivity/connections/:connectionRid/updateSecrets",
    { preHandler: write },
    async (request, reply) => {
      const { connectionRid } = request.params;
      await requireConnection(store, connectionRid);
      const secrets = stringMap(obj(request.body, "body").secrets, "secrets");
      const held = new Set(await store.secretNames(connectionRid));
      const unknown = Object.keys(secrets).filter((name) => !held.has(name));
      if (unknown.length > 0) throw secretNamesDoNotExist(connectionRid, unknown);
      for (const [name, value] of Object.entries(secrets)) {
        if (value === "") throw invalidArgument(`secrets.${name}`, "cannot be empty");
      }
      await store.updateSecrets(
        connectionRid,
        Object.entries(secrets).map(([name, value]) => ({ name, value })),
      );
      return reply.status(204).send();
    },
  );

  app.post<{
    Params: { connectionRid: string };
    Querystring: { fileName?: string; preview?: string };
  }>(
    "/connectivity/connections/:connectionRid/uploadCustomJdbcDrivers",
    { preHandler: write, bodyLimit: DRIVER_UPLOAD_LIMIT },
    async (request) => {
      const { connectionRid } = request.params;
      const connection = await requireConnection(store, connectionRid);
      const connectionType = String(connection.configuration.type);
      if (connectionType !== "jdbc") throw uploadCustomJdbcDriverNotSupportForConnection(connectionType);
      const fileName = request.query.fileName;
      if (fileName === undefined || fileName.trim() === "") {
        throw invalidArgument("fileName", "is required");
      }
      const content = request.body;
      // A jar is a zip archive: it opens with the local-file-header signature.
      if (
        !fileName.toLowerCase().endsWith(".jar") ||
        fileName.includes("/") ||
        fileName.includes("\\") ||
        !Buffer.isBuffer(content) ||
        !content.subarray(0, 4).equals(ZIP_SIGNATURE)
      ) {
        throw driverContentMustBeUploadedAsJar(fileName);
      }
      return toConnection(await store.addJdbcDriver(connectionRid, fileName, content));
    },
  );

  // -- File imports ----------------------------------------------------------

  app.post<{ Params: { connectionRid: string } }>(
    "/connectivity/connections/:connectionRid/fileImports",
    { preHandler: [write, writeDataset] },
    async (request) => {
      const connection = await requireConnection(store, request.params.connectionRid);
      requireFileImports(connection);
      const body = obj(request.body, "body");
      const fields = parseFileImportFields(body);
      const target = await resolveTarget(datasetStore, body);
      const record = await store.createImport({
        rid: generateRid("magritte", "file-import").toString(),
        kind: "file",
        connectionRid: connection.rid,
        data: compact({ ...target, ...fields }),
      });
      return toImport(record);
    },
  );

  app.get<{ Params: { connectionRid: string; fileImportRid: string } }>(
    "/connectivity/connections/:connectionRid/fileImports/:fileImportRid",
    { preHandler: read },
    async (request) =>
      toImport(await requireImport(store, "file", request.params.connectionRid, request.params.fileImportRid)),
  );

  app.get<{
    Params: { connectionRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/connectivity/connections/:connectionRid/fileImports", { preHandler: read }, async (request) =>
    listImports(store, "file", request.params.connectionRid, request.query),
  );

  app.put<{ Params: { connectionRid: string; fileImportRid: string } }>(
    "/connectivity/connections/:connectionRid/fileImports/:fileImportRid",
    { preHandler: write },
    async (request) => {
      const { connectionRid, fileImportRid } = request.params;
      await requireConnection(store, connectionRid);
      const existing = await requireImport(store, "file", connectionRid, fileImportRid);
      const fields = parseFileImportFields(obj(request.body, "body"));
      // The dataset and branch are fixed at creation; a replace changes the rest.
      const { datasetRid, branchName } = existing.data;
      return toImport(
        await store.replaceImport({ ...existing, data: compact({ datasetRid, branchName, ...fields }) }),
      );
    },
  );

  app.delete<{ Params: { connectionRid: string; fileImportRid: string } }>(
    "/connectivity/connections/:connectionRid/fileImports/:fileImportRid",
    { preHandler: del },
    async (request, reply) => {
      const { connectionRid, fileImportRid } = request.params;
      await requireConnection(store, connectionRid);
      await requireImport(store, "file", connectionRid, fileImportRid);
      await store.deleteImport("file", connectionRid, fileImportRid);
      return reply.status(204).send();
    },
  );

  // -- Table imports ---------------------------------------------------------

  app.post<{ Params: { connectionRid: string } }>(
    "/connectivity/connections/:connectionRid/tableImports",
    { preHandler: [write, writeDataset] },
    async (request) => {
      const connection = await requireConnection(store, request.params.connectionRid);
      const body = obj(request.body, "body");
      const fields = parseTableImportFields(body);
      requireTableImportConfig(connection, fields.config);
      const target = await resolveTarget(datasetStore, body);
      const record = await store.createImport({
        rid: generateRid("magritte", "table-import").toString(),
        kind: "table",
        connectionRid: connection.rid,
        // Foundry documents `allowSchemaChanges` as false for a new table import.
        data: compact({ ...target, ...fields, allowSchemaChanges: fields.allowSchemaChanges ?? false }),
      });
      return toImport(record);
    },
  );

  app.get<{ Params: { connectionRid: string; tableImportRid: string } }>(
    "/connectivity/connections/:connectionRid/tableImports/:tableImportRid",
    { preHandler: read },
    async (request) =>
      toImport(await requireImport(store, "table", request.params.connectionRid, request.params.tableImportRid)),
  );

  app.get<{
    Params: { connectionRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/connectivity/connections/:connectionRid/tableImports", { preHandler: read }, async (request) =>
    listImports(store, "table", request.params.connectionRid, request.query),
  );

  app.put<{ Params: { connectionRid: string; tableImportRid: string } }>(
    "/connectivity/connections/:connectionRid/tableImports/:tableImportRid",
    { preHandler: write },
    async (request) => {
      const { connectionRid, tableImportRid } = request.params;
      const connection = await requireConnection(store, connectionRid);
      const existing = await requireImport(store, "table", connectionRid, tableImportRid);
      const fields = parseTableImportFields(obj(request.body, "body"));
      requireTableImportConfig(connection, fields.config);
      const { datasetRid, branchName } = existing.data;
      return toImport(
        await store.replaceImport({
          ...existing,
          data: compact({
            datasetRid,
            branchName,
            ...fields,
            // Left out of a replace, the setting stays as it was.
            allowSchemaChanges: fields.allowSchemaChanges ?? existing.data.allowSchemaChanges,
          }),
        }),
      );
    },
  );

  app.delete<{ Params: { connectionRid: string; tableImportRid: string } }>(
    "/connectivity/connections/:connectionRid/tableImports/:tableImportRid",
    { preHandler: del },
    async (request, reply) => {
      const { connectionRid, tableImportRid } = request.params;
      await requireConnection(store, connectionRid);
      await requireImport(store, "table", connectionRid, tableImportRid);
      await store.deleteImport("table", connectionRid, tableImportRid);
      return reply.status(204).send();
    },
  );

  // -- Virtual tables --------------------------------------------------------

  app.post<{ Params: { connectionRid: string } }>(
    "/connectivity/connections/:connectionRid/virtualTables",
    { preHandler: write },
    async (request) => {
      const connection = await requireConnection(store, request.params.connectionRid);
      const fields = parseVirtualTable(obj(request.body, "body"));
      folderRid(fields.parentRid, "parentRid");
      requireVirtualTableSource(connection, fields.config);
      const record = await store.createVirtualTable({
        rid: generateRid("foundry", "table").toString(),
        connectionRid: connection.rid,
        ...fields,
      });
      return compact({
        rid: record.rid,
        name: record.name,
        parentRid: record.parentRid,
        config: record.config,
        markings: record.markings,
      });
    },
  );
}

// -- Helpers -------------------------------------------------------------------

async function requireConnection(store: ConnectivityStore, rid: string): Promise<ConnectionRecord> {
  const connection = await store.getConnection(rid);
  if (!connection) throw connectionNotFound(rid);
  return connection;
}

async function requireImport(
  store: ConnectivityStore,
  kind: ImportKind,
  connectionRid: string,
  rid: string,
): Promise<ImportRecord> {
  await requireConnection(store, connectionRid);
  const record = await store.getImport(kind, connectionRid, rid);
  if (!record) throw (kind === "file" ? fileImportNotFound : tableImportNotFound)(connectionRid, rid);
  return record;
}

/** The dataset (and optional branch) an import writes into must exist. */
async function resolveTarget(
  datasetStore: DatasetReadWriteStore,
  body: Json,
): Promise<{ datasetRid: string; branchName?: string }> {
  const datasetRid = str(body, "datasetRid", "");
  await datasetStore.getDataset(datasetRid);
  const branchName = optionalStr(body, "branchName", "");
  if (branchName !== undefined) await datasetStore.getBranch(datasetRid, branchName);
  return compact({ datasetRid, branchName }) as { datasetRid: string; branchName?: string };
}

async function listImports(
  store: ConnectivityStore,
  kind: ImportKind,
  connectionRid: string,
  query: { pageSize?: string; pageToken?: string },
): Promise<{ data: Json[]; nextPageToken?: string }> {
  await requireConnection(store, connectionRid);
  const { pageSize, offset } = pageRequest(query);
  // One extra row says whether another page exists without a count query.
  const rows = await store.listImports(kind, connectionRid, offset, pageSize + 1);
  const data = rows.slice(0, pageSize).map(toImport);
  return rows.length > pageSize
    ? { data, nextPageToken: encodePageToken({ offset: offset + pageSize }) }
    : { data };
}

function pageRequest(query: { pageSize?: string; pageToken?: string }): {
  pageSize: number;
  offset: number;
} {
  let pageSize: number | undefined;
  if (query.pageSize !== undefined && query.pageSize !== "") {
    pageSize = Number(query.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1) {
      throw invalidArgument("pageSize", `must be a positive integer, got "${query.pageSize}"`);
    }
  }
  const request = normalizePageRequest({ pageSize });
  if (query.pageToken === undefined || query.pageToken === "") {
    return { pageSize: request.pageSize, offset: 0 };
  }
  let offset: number;
  try {
    offset = decodePageToken(query.pageToken as PageToken).offset;
  } catch (err) {
    throw invalidArgument("pageToken", err instanceof Error ? err.message : "is not a valid page token");
  }
  // The cursor is client-held; a fractional or negative offset is no token this
  // service minted, and Postgres would reject it as a bigint.
  if (!Number.isInteger(offset) || offset < 0) {
    throw invalidArgument("pageToken", "is not a valid page token");
  }
  return { pageSize: request.pageSize, offset };
}

function toConnection(record: ConnectionRecord): Json {
  return {
    rid: record.rid,
    parentFolderRid: record.parentFolderRid,
    displayName: record.displayName,
    exportSettings: record.exportSettings,
    worker: record.worker,
    configuration: record.configuration,
  };
}

function toImport(record: ImportRecord): Json {
  return { rid: record.rid, connectionRid: record.connectionRid, ...record.data };
}
