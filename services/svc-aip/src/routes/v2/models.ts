import type { FastifyInstance } from "fastify";
import { invalidArgument } from "@openfoundry/errors";
import {
  type PageToken,
  decodePageToken,
  encodePageToken,
  normalizePageRequest,
} from "@openfoundry/pagination";
import { Rid, generateRid } from "@openfoundry/rid";
import {
  apiFeaturePreviewUsageOnly,
  invalidDisplayName,
  invalidModelStudioCreateRequest,
  modelNotFound,
  modelStudioNotFound,
  modelVersionNotFound,
} from "../../models/errors.js";
import { parseModelApi } from "../../models/model-api.js";
import type { ModelStore } from "../../models/model-store.js";
import type {
  DillModelFiles,
  ModelResourceRecord,
  ModelVersionRecord,
} from "../../models/types.js";

/**
 * The Foundry `models` v2 section (`foundry_sdk/v2/models/`).
 *
 * 8 of the section's 32 operations are served here: Model create and get,
 * `promoteVersion`, Model Version create, get and list, and Model Studio create
 * and get. Every one of them is a preview endpoint in Foundry, so every one
 * refuses a request without `preview=true` with `ApiFeaturePreviewUsageOnly`,
 * exactly as Foundry does.
 *
 * The other 24 need a subsystem OpenFoundry does not have, and serving them
 * would mean answering with a required field that names nothing real:
 *
 *  - Live deployments, all 7 operations (`POST/GET /v2/models/liveDeployments`,
 *    `GET/PUT /v2/models/liveDeployments/{rid}`, and `.../start`, `.../disable`,
 *    `.../transformJson`): a live deployment is a set of running replicas that
 *    load a model version and answer inference requests. There is no model
 *    runtime here - nothing can load a dill-serialized Python function and its
 *    conda environment - so `LiveDeploymentStatus.state` and `isReady` could
 *    only be invented, and `transformJson` could only return invented output.
 *  - Model functions, all 3 operations (`POST/GET/PUT /v2/models/{rid}/function`):
 *    `ModelFunction.functionRid` and `functionVersion` name a published Foundry
 *    Function that executes the model, which needs the same missing runtime.
 *  - Experiments, all 6 operations (`GET .../experiments/{rid}`, `POST
 *    .../experiments/search`, and the `json`/`parquet` reads of experiment
 *    series and artifact tables): experiments are written by the training-side
 *    logging library while a model trains. The public API has no operation that
 *    creates one and there is no training runtime to log one, so every read
 *    would answer about data that cannot exist.
 *  - Model Studio trainers, both operations (`GET /v2/models/modelStudioTrainers`
 *    and `/{trainerId}`): the trainer catalogue is the set of training
 *    algorithms the platform can run. There are none to list, and inventing
 *    entries would advertise training that does not happen.
 *  - Model Studio config versions, all 4 operations (create, get, `latest`,
 *    list under `.../modelStudios/{rid}/configVersions`): a config version must
 *    name a `trainerId` from that catalogue and records the resolved
 *    `TrainerVersionLocator`, so with no trainers none can be created.
 *  - Model Studio `launch` and the runs listing (`POST .../modelStudios/{rid}/launch`,
 *    `GET .../modelStudios/{rid}/runs`): a run is a training build, and
 *    `ModelStudioRun.buildRid` and `jobRid` name a build and a job that no build
 *    system here would have started.
 *
 * Two parameters are stored but cannot take full effect, and say so here rather
 * than pretending otherwise:
 *
 *  - `parentFolderRid` must be a folder RID (`ri.compass.<instance>.folder.<id>`)
 *    and scopes the per-folder display-name rule, but whether that folder
 *    exists is not checked: no folder tree is served to check it against.
 *  - `condaRequirements` is stored and served back verbatim, and is never
 *    solved: solving an environment is part of running the model.
 */
export async function modelRoutes(
  app: FastifyInstance,
  opts: { store: ModelStore },
): Promise<void> {
  const { store } = opts;

  // Registered inside this plugin, so it guards these routes and nothing else.
  app.addHook("onRequest", async (request) => {
    const { preview } = request.query as { preview?: string };
    if (preview !== "true") throw apiFeaturePreviewUsageOnly();
  });

  // -- Model -----------------------------------------------------------------

  app.post<{
    Querystring: { preview?: string };
    Body: { name: string; parentFolderRid: string };
  }>("/models", async (request) => {
    const body = bodyObject(request.body);
    const name = requireString(body.name, "name");
    const parentFolderRid = requireString(body.parentFolderRid, "parentFolderRid");
    const model = await store.createResource({
      rid: generateRid("models", "model").toString(),
      resourceType: "MODEL",
      displayName: displayName(name),
      parentFolderRid: folderRid(parentFolderRid),
      createdTime: new Date().toISOString(),
    });
    return toModel(model);
  });

  app.get<{
    Params: { modelRid: string };
    Querystring: { preview?: string };
  }>("/models/:modelRid", async (request) => {
    return toModel(await requireModel(store, request.params.modelRid));
  });

  app.post<{
    Params: { modelRid: string };
    Querystring: { preview?: string };
    Body: { sourceModelVersionRid: string; branch?: string };
  }>("/models/:modelRid/promoteVersion", async (request) => {
    const { modelRid } = request.params;
    const target = await requireModel(store, modelRid);
    const body = bodyObject(request.body);
    const sourceRid = requireString(body.sourceModelVersionRid, "sourceModelVersionRid");
    const branch = optionalBranch(body.branch, "branch");
    const source = await store.getVersion(sourceRid);
    if (!source) throw modelVersionNotFound(modelRid, sourceRid);

    const promoted = await store.createVersion({
      rid: generateRid("models", "model-version").toString(),
      modelRid: target.rid,
      branch,
      modelApi: source.modelApi,
      condaRequirements: source.condaRequirements,
      backingRepositories: source.backingRepositories,
      modelFiles: source.modelFiles,
      source: {
        type: "promoted",
        previousModelRid: source.modelRid,
        previousModelVersionRid: source.rid,
      },
      createdTime: new Date().toISOString(),
    });
    return toModelVersion(promoted);
  });

  // -- Model Version ---------------------------------------------------------

  app.post<{
    Params: { modelRid: string };
    Querystring: { preview?: string };
    Body: {
      modelFiles: DillModelFiles;
      backingRepositories: string[];
      condaRequirements: string[];
      modelApi: unknown;
    };
  }>("/models/:modelRid/versions", { bodyLimit: MODEL_VERSION_BODY_LIMIT }, async (request) => {
    const model = await requireModel(store, request.params.modelRid);
    const body = bodyObject(request.body);
    const version = await store.createVersion({
      rid: generateRid("models", "model-version").toString(),
      modelRid: model.rid,
      // The request has no branch: a new version lands on the default branch,
      // which is also what the version listing reads when given none.
      branch: DEFAULT_BRANCH,
      modelApi: parseModelApi(body.modelApi),
      condaRequirements: condaRequirements(body.condaRequirements),
      backingRepositories: ridList(body.backingRepositories, "backingRepositories"),
      modelFiles: modelFiles(body.modelFiles),
      source: { type: "sdk" },
      createdTime: new Date().toISOString(),
    });
    return toModelVersion(version);
  });

  app.get<{
    Params: { modelRid: string; modelVersionRid: string };
    Querystring: { preview?: string };
  }>("/models/:modelRid/versions/:modelVersionRid", async (request) => {
    const { modelRid, modelVersionRid } = request.params;
    const version = await store.getVersion(modelVersionRid);
    if (!version || version.modelRid !== modelRid) {
      throw modelVersionNotFound(modelRid, modelVersionRid);
    }
    return toModelVersion(version);
  });

  app.get<{
    Params: { modelRid: string };
    Querystring: { branch?: string; pageSize?: string; pageToken?: string; preview?: string };
  }>("/models/:modelRid/versions", async (request) => {
    const model = await requireModel(store, request.params.modelRid);
    const branch = optionalBranch(request.query.branch, "branch");
    const { pageSize, offset } = pageRequest(request.query);
    // One extra row says whether another page exists without a count query.
    const rows = await store.listVersions(model.rid, branch, offset, pageSize + 1);
    const data = rows.slice(0, pageSize).map(toModelVersion);
    return rows.length > pageSize
      ? { data, nextPageToken: encodePageToken({ offset: offset + pageSize }) }
      : { data };
  });

  // -- Model Studio ----------------------------------------------------------

  app.post<{
    Querystring: { preview?: string };
    Body: { name: string; parentFolderRid: string };
  }>("/models/modelStudios", async (request) => {
    const body = request.body as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw invalidModelStudioCreateRequest("The request body must be a JSON object.");
    }
    const { name, parentFolderRid } = body as Record<string, unknown>;
    if (typeof name !== "string") {
      throw invalidModelStudioCreateRequest("`name` is required and must be a string.");
    }
    if (typeof parentFolderRid !== "string" || !isFolderRid(parentFolderRid)) {
      throw invalidModelStudioCreateRequest(
        "`parentFolderRid` is required and must be a folder RID (ri.compass.<instance>.folder.<id>).",
      );
    }
    const studio = await store.createResource({
      rid: generateRid("models", "model-studio").toString(),
      resourceType: "MODEL_STUDIO",
      displayName: displayName(name),
      parentFolderRid,
      createdTime: new Date().toISOString(),
    });
    return toModelStudio(studio);
  });

  app.get<{
    Params: { modelStudioRid: string };
    Querystring: { preview?: string };
  }>("/models/modelStudios/:modelStudioRid", async (request) => {
    const { modelStudioRid } = request.params;
    const studio = await store.getResource(modelStudioRid, "MODEL_STUDIO");
    if (!studio) throw modelStudioNotFound(modelStudioRid);
    return toModelStudio(studio);
  });
}

// ---------------------------------------------------------------------------
// Serializers - exactly the fields `foundry_sdk/v2/models/models.py` declares
// ---------------------------------------------------------------------------

function toModel(model: ModelResourceRecord) {
  return { rid: model.rid };
}

/**
 * `linkedExperiment` is optional and always absent: no experiment can exist
 * here (see the module comment), so there is never one to link.
 */
function toModelVersion(version: ModelVersionRecord) {
  return {
    rid: version.rid,
    modelApi: version.modelApi,
    condaRequirements: version.condaRequirements,
    backingRepositories: version.backingRepositories,
    createdTime: version.createdTime,
    source: version.source,
  };
}

function toModelStudio(studio: ModelResourceRecord) {
  return {
    rid: studio.rid,
    folderRid: studio.parentFolderRid,
    createdTime: studio.createdTime,
  };
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

/**
 * The request carries the serialized model itself, base64-encoded, and real
 * models are megabytes, far past Fastify's 1 MiB default. The gateway's
 * models proxy allows the same (`svc-gateway/src/routes/v2/models.ts`).
 */
export const MODEL_VERSION_BODY_LIMIT = 64 * 1024 * 1024;

/** "Defaults to master on most enrollments", in the SDK's words. */
const DEFAULT_BRANCH = "master";

/** `InvalidDisplayName`'s own limit. */
const MAX_DISPLAY_NAME_LENGTH = 700;

async function requireModel(store: ModelStore, modelRid: string) {
  const model = await store.getResource(modelRid, "MODEL");
  if (!model) throw modelNotFound(modelRid);
  return model;
}

function bodyObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw invalidArgument("body", "must be a JSON object");
  }
  return raw as Record<string, unknown>;
}

function requireString(raw: unknown, param: string): string {
  if (typeof raw !== "string") {
    throw invalidArgument(param, "is required and must be a string");
  }
  return raw;
}

function displayName(name: string): string {
  if (
    name === "" ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.length > MAX_DISPLAY_NAME_LENGTH
  ) {
    throw invalidDisplayName(name);
  }
  return name;
}

function isFolderRid(raw: string): boolean {
  try {
    const rid = Rid.parse(raw);
    return rid.service === "compass" && rid.type === "folder";
  } catch {
    return false;
  }
}

function folderRid(raw: string): string {
  if (!isFolderRid(raw)) {
    throw invalidArgument(
      "parentFolderRid",
      "must be a folder RID (ri.compass.<instance>.folder.<id>)",
    );
  }
  return raw;
}

function optionalBranch(raw: unknown, param: string): string {
  if (raw === undefined || raw === null) return DEFAULT_BRANCH;
  if (typeof raw !== "string" || raw === "") {
    throw invalidArgument(param, "must be a non-empty branch name");
  }
  return raw;
}

function ridList(raw: unknown, param: string): string[] {
  if (!Array.isArray(raw)) {
    throw invalidArgument(param, "is required and must be an array of RIDs");
  }
  return raw.map((entry, i) => {
    if (typeof entry !== "string") {
      throw invalidArgument(`${param}[${i}]`, "must be a RID string");
    }
    try {
      return Rid.parse(entry).toString();
    } catch (err) {
      throw invalidArgument(`${param}[${i}]`, err instanceof Error ? err.message : "is not a RID");
    }
  });
}

function condaRequirements(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw invalidArgument("condaRequirements", "is required and must be an array of strings");
  }
  return raw.map((entry, i) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw invalidArgument(`condaRequirements[${i}]`, "must be a non-empty package spec");
    }
    return entry;
  });
}

/**
 * Standard (not URL-safe), padded base64: what the SDK's `ModelFiles` asks for.
 *
 * A single flat character class plus a length check, not a grouped `(...{4})*`
 * pattern: a serialized model is megabytes long, and a quantified group
 * overflows V8's regex backtracking stack on input that size.
 */
const BASE64_ALPHABET = /^[A-Za-z0-9+/]*={0,2}$/;

function isBase64(value: string): boolean {
  return value.length % 4 === 0 && BASE64_ALPHABET.test(value);
}

function modelFiles(raw: unknown): DillModelFiles {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw invalidArgument("modelFiles", "is required and must be an object");
  }
  const { type, serializedModelFunction } = raw as Record<string, unknown>;
  if (type !== "dill") {
    throw invalidArgument("modelFiles.type", `must be "dill", got ${JSON.stringify(type)}`);
  }
  if (
    typeof serializedModelFunction !== "string" ||
    serializedModelFunction === "" ||
    !isBase64(serializedModelFunction)
  ) {
    throw invalidArgument(
      "modelFiles.serializedModelFunction",
      "must be a non-empty base64-encoded dill-serialized model function",
    );
  }
  return { type: "dill", serializedModelFunction };
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
    throw invalidArgument(
      "pageToken",
      err instanceof Error ? err.message : "is not a valid page token",
    );
  }
  // The cursor is client-held; a fractional or negative offset is no token
  // this service minted, and Postgres would reject it as a bigint.
  if (!Number.isInteger(offset) || offset < 0) {
    throw invalidArgument("pageToken", "is not a valid page token");
  }
  return { pageSize: request.pageSize, offset };
}
