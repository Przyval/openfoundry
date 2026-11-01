/**
 * The Foundry `models` v2 contract, run against both persistence backends.
 *
 * Every "only breaks on Postgres" defect this repository has paid for passed
 * an in-memory suite first, so this file is written once and executed against
 * each store: the in-memory one always, and Postgres whenever
 * `MODELS_TEST_DATABASE_URL` names a reachable database:
 *
 *     MODELS_TEST_DATABASE_URL=postgres://openfoundry@localhost:5432/openfoundry \
 *       pnpm --filter @openfoundry/svc-aip test
 *
 * The Postgres run executes once per schema source - `scripts/migrate.sql`,
 * which Docker Compose loads, and `db/migrations/`, which `pnpm db:migrate`
 * applies - each built from scratch in its own Postgres schema, so a column or
 * constraint the store needs that either source lacks fails here rather than
 * in production. It drops and recreates those schemas and a test role, so
 * point it at a scratch database.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { createServer } from "../src/server.js";
import { ConversationStore } from "../src/store/conversation-store.js";
import { EmbeddingStore } from "../src/store/embedding-store.js";
import { MockLlmClient } from "../src/llm/mock-client.js";
import { MemoryModelStore, type ModelStore } from "../src/models/model-store.js";
import { PgModelStore } from "../src/models/pg-model-store.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
  llmProvider: "mock",
  llmApiKey: "",
  llmBaseUrl: "",
  llmModel: "",
  embeddingModel: "",
} as const;

const PG_URL = process.env.MODELS_TEST_DATABASE_URL ?? "";

interface BackendUnderTest {
  name: string;
  enabled: boolean;
  setup(): Promise<void>;
  fresh(): Promise<ModelStore>;
  teardown(): Promise<void>;
}

const memoryBackend: BackendUnderTest = {
  name: "memory",
  enabled: true,
  async setup() {},
  async fresh() {
    return new MemoryModelStore();
  },
  async teardown() {},
};

/** A role that, unlike the suite's own login, is subject to row-level security. */
const TENANT_ROLE = "ml_models_tenant_test";

interface SchemaSource {
  name: string;
  schema: string;
  files: string[];
}

const SCHEMA_SOURCES: SchemaSource[] = [
  { name: "scripts/migrate.sql", schema: "ml_test_compose", files: ["scripts/migrate.sql"] },
  {
    name: "db/migrations",
    schema: "ml_test_migrations",
    files: ["db/migrations/001_initial.sql", "db/migrations/012_models.sql"],
  },
];

/** Builds `source` from nothing in its own schema and opens a pool onto it. */
async function buildSchema(source: SchemaSource): Promise<pg.Pool> {
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  try {
    await admin.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext`);
    await admin.query(`DROP SCHEMA IF EXISTS ${source.schema} CASCADE; CREATE SCHEMA ${source.schema}`);
    await admin.query(`SET search_path TO ${source.schema}, public`);
    for (const file of source.files) {
      await admin.query(readFileSync(path.join(REPO_ROOT, file), "utf8"));
    }
  } finally {
    await admin.end();
  }
  return new pg.Pool({
    connectionString: PG_URL,
    options: `-c search_path=${source.schema},public`,
  });
}

async function dropSchema(source: SchemaSource): Promise<void> {
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${source.schema} CASCADE`);
  } finally {
    await admin.end();
  }
}

function postgresBackend(source: SchemaSource): BackendUnderTest {
  let pool: pg.Pool | undefined;
  return {
    name: `postgres, ${source.name}`,
    enabled: PG_URL !== "",
    async setup() {
      pool = await buildSchema(source);
    },
    async fresh() {
      await pool?.query("TRUNCATE ml_model_versions, ml_resources");
      return new PgModelStore(pool as pg.Pool);
    },
    async teardown() {
      await pool?.end();
      pool = undefined;
      await dropSchema(source);
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FOLDER = "ri.compass.main.folder.11111111-1111-4111-8111-111111111111";
const OTHER_FOLDER = "ri.compass.main.folder.22222222-2222-4222-8222-222222222222";

/** A real, if tiny, base64 payload: dill's framing is opaque to this service. */
const DILL = Buffer.from("not really dill, but valid base64").toString("base64");

const MODEL_API = {
  inputs: [
    {
      type: "tabular",
      name: "df_in",
      columns: [
        { name: "age", dataType: { type: "integer" } },
        { name: "tags", required: false, dataType: { type: "array", itemType: { type: "string" } } },
      ],
      format: "PANDAS",
    },
    {
      type: "parameter",
      name: "threshold",
      required: true,
      dataType: { type: "double" },
    },
  ],
  outputs: [
    {
      type: "parameter",
      name: "scores",
      dataType: {
        type: "map",
        keyType: { type: "string" },
        valueType: { type: "double" },
      },
    },
    { type: "unsupported", unsupportedType: "torchTensor", params: { dtype: "float32" } },
  ],
};

function versionBody(overrides: Record<string, unknown> = {}) {
  return {
    modelFiles: { type: "dill", serializedModelFunction: DILL },
    backingRepositories: ["ri.stemma.main.repository.r1"],
    condaRequirements: ["scikit-learn=1.4.2", "pandas"],
    modelApi: MODEL_API,
    ...overrides,
  };
}

/** Every operation the section declares that this service does not serve. */
const UNSERVED: [method: "GET" | "POST" | "PUT", path: string][] = [
  ["GET", "/api/v2/models/M/experiments/E"],
  ["POST", "/api/v2/models/M/experiments/search"],
  ["GET", "/api/v2/models/M/experiments/E/artifactTables/T/json"],
  ["GET", "/api/v2/models/M/experiments/E/artifactTables/T/parquet"],
  ["GET", "/api/v2/models/M/experiments/E/series/S/json"],
  ["GET", "/api/v2/models/M/experiments/E/series/S/parquet"],
  ["POST", "/api/v2/models/liveDeployments"],
  ["POST", "/api/v2/models/liveDeployments/D/disable"],
  ["GET", "/api/v2/models/liveDeployments/D"],
  ["GET", "/api/v2/models/liveDeployments"],
  ["PUT", "/api/v2/models/liveDeployments/D"],
  ["POST", "/api/v2/models/liveDeployments/D/start"],
  ["POST", "/api/v2/models/liveDeployments/D/transformJson"],
  ["POST", "/api/v2/models/M/function"],
  ["GET", "/api/v2/models/M/function"],
  ["PUT", "/api/v2/models/M/function"],
  ["POST", "/api/v2/models/modelStudios/S/launch"],
  ["POST", "/api/v2/models/modelStudios/S/configVersions"],
  ["GET", "/api/v2/models/modelStudios/S/configVersions/1"],
  ["GET", "/api/v2/models/modelStudios/S/configVersions/latest"],
  ["GET", "/api/v2/models/modelStudios/S/configVersions"],
  ["GET", "/api/v2/models/modelStudios/S/runs"],
  ["GET", "/api/v2/models/modelStudioTrainers/T"],
  ["GET", "/api/v2/models/modelStudioTrainers"],
];

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

for (const backend of [memoryBackend, ...SCHEMA_SOURCES.map(postgresBackend)]) {
  describe.skipIf(!backend.enabled)(`models v2 (${backend.name})`, () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      await backend.setup();
    });

    afterAll(async () => {
      await app?.close();
      await backend.teardown();
    });

    beforeEach(async () => {
      await app?.close();
      app = await createServer({
        config: TEST_CONFIG,
        llmClient: new MockLlmClient(),
        conversationStore: new ConversationStore(),
        embeddingStore: new EmbeddingStore(),
        modelStore: await backend.fresh(),
      });
    });

    function call(
      method: "GET" | "POST" | "PUT",
      url: string,
      payload?: unknown,
      preview: string | null = "true",
    ) {
      const query = preview === null ? "" : `${url.includes("?") ? "&" : "?"}preview=${preview}`;
      return app.inject({
        method,
        url: `${url}${query}`,
        ...(payload === undefined ? {} : { payload: payload as object }),
      });
    }

    async function createModel(name = "churn", parentFolderRid = FOLDER): Promise<string> {
      const res = await call("POST", "/api/v2/models", { name, parentFolderRid });
      expect(res.statusCode).toBe(200);
      return res.json().rid;
    }

    async function createVersion(modelRid: string, overrides: Record<string, unknown> = {}) {
      const res = await call("POST", `/api/v2/models/${modelRid}/versions`, versionBody(overrides));
      expect(res.statusCode).toBe(200);
      return res.json();
    }

    // -- preview -----------------------------------------------------------

    describe("preview", () => {
      const served: [method: "GET" | "POST", url: string, payload?: unknown][] = [
        ["POST", "/api/v2/models", { name: "m", parentFolderRid: FOLDER }],
        ["GET", "/api/v2/models/ri.models.main.model.x"],
        ["POST", "/api/v2/models/ri.models.main.model.x/promoteVersion", { sourceModelVersionRid: "x" }],
        ["POST", "/api/v2/models/ri.models.main.model.x/versions", versionBody()],
        ["GET", "/api/v2/models/ri.models.main.model.x/versions/ri.models.main.model-version.y"],
        ["GET", "/api/v2/models/ri.models.main.model.x/versions"],
        ["POST", "/api/v2/models/modelStudios", { name: "s", parentFolderRid: FOLDER }],
        ["GET", "/api/v2/models/modelStudios/ri.models.main.model-studio.x"],
      ];

      it("refuses every served operation without preview=true, as Foundry does", async () => {
        for (const [method, url, payload] of served) {
          for (const preview of [null, "false", "1"]) {
            const res = await call(method, url, payload, preview);
            expect(res.statusCode, `${method} ${url} preview=${preview}`).toBe(400);
            expect(res.json()).toMatchObject({
              errorCode: "INVALID_ARGUMENT",
              errorName: "ApiFeaturePreviewUsageOnly",
            });
          }
        }
      });

      it("writes nothing when the preview check refuses a create", async () => {
        await call("POST", "/api/v2/models", { name: "gated", parentFolderRid: FOLDER }, null);
        const res = await call("POST", "/api/v2/models", { name: "gated", parentFolderRid: FOLDER });
        expect(res.statusCode).toBe(200);
      });
    });

    // -- Model -------------------------------------------------------------

    describe("Model", () => {
      it("creates a model and serves exactly the Model shape", async () => {
        const res = await call("POST", "/api/v2/models", { name: "churn", parentFolderRid: FOLDER });
        expect(res.statusCode).toBe(200);
        const model = res.json();
        expect(Object.keys(model)).toEqual(["rid"]);
        expect(model.rid).toMatch(/^ri\.models\.main\.model\.[0-9a-f-]{36}$/);

        const got = await call("GET", `/api/v2/models/${model.rid}`);
        expect(got.statusCode).toBe(200);
        expect(got.json()).toEqual(model);
      });

      it("answers ModelNotFound with the modelRid parameter", async () => {
        const rid = "ri.models.main.model.00000000-0000-4000-8000-000000000000";
        const res = await call("GET", `/api/v2/models/${rid}`);
        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({
          errorCode: "NOT_FOUND",
          errorName: "ModelNotFound",
          parameters: { modelRid: rid },
        });
      });

      it("rejects display names Foundry rejects, and accepts the longest it allows", async () => {
        for (const name of ["", ".", "..", "a/b", "x".repeat(701)]) {
          const res = await call("POST", "/api/v2/models", { name, parentFolderRid: FOLDER });
          expect(res.statusCode, JSON.stringify(name)).toBe(400);
          expect(res.json()).toMatchObject({
            errorName: "InvalidDisplayName",
            parameters: { displayName: name },
          });
        }
        await createModel("x".repeat(700));
        await createModel("a.b ..c");
      });

      it("requires parentFolderRid to be a folder RID", async () => {
        for (const parentFolderRid of [
          undefined,
          "",
          "not-a-rid",
          "ri.foundry.main.dataset.d1",
          "ri.compass.main.resource.r1",
        ]) {
          const res = await call("POST", "/api/v2/models", { name: "m", parentFolderRid });
          expect(res.statusCode, String(parentFolderRid)).toBe(400);
          expect(res.json().errorName).toBe("InvalidArgument");
        }
        const missingName = await call("POST", "/api/v2/models", { parentFolderRid: FOLDER });
        expect(missingName.statusCode).toBe(400);
        const notObject = await call("POST", "/api/v2/models", [1, 2]);
        expect(notObject.statusCode).toBe(400);
      });

      it("enforces one display name per folder, across models and studios", async () => {
        await createModel("churn", FOLDER);

        const dup = await call("POST", "/api/v2/models", { name: "churn", parentFolderRid: FOLDER });
        expect(dup.statusCode).toBe(409);
        expect(dup.json()).toMatchObject({
          errorCode: "CONFLICT",
          errorName: "ResourceNameAlreadyExists",
          parameters: { parentFolderRid: FOLDER, displayName: "churn" },
        });

        const studio = await call("POST", "/api/v2/models/modelStudios", {
          name: "churn",
          parentFolderRid: FOLDER,
        });
        expect(studio.statusCode).toBe(409);
        expect(studio.json().errorName).toBe("ResourceNameAlreadyExists");

        await createModel("churn", OTHER_FOLDER);
        await createModel("Churn", FOLDER);
      });

      it("lets exactly one of two simultaneous same-name creates win", async () => {
        const results = await Promise.all(
          Array.from({ length: 5 }, () =>
            call("POST", "/api/v2/models", { name: "race", parentFolderRid: FOLDER }),
          ),
        );
        const statuses = results.map((res) => res.statusCode).sort();
        expect(statuses).toEqual([200, 409, 409, 409, 409]);
      });
    });

    // -- Model Version -----------------------------------------------------

    describe("ModelVersion", () => {
      it("creates a version and serves exactly the ModelVersion shape", async () => {
        const modelRid = await createModel();
        const before = Date.now();
        const version = await createVersion(modelRid);

        expect(Object.keys(version).sort()).toEqual([
          "backingRepositories",
          "condaRequirements",
          "createdTime",
          "modelApi",
          "rid",
          "source",
        ]);
        expect(version.rid).toMatch(/^ri\.models\.main\.model-version\.[0-9a-f-]{36}$/);
        expect(version.modelApi).toEqual(MODEL_API);
        expect(version.condaRequirements).toEqual(["scikit-learn=1.4.2", "pandas"]);
        expect(version.backingRepositories).toEqual(["ri.stemma.main.repository.r1"]);
        expect(version.source).toEqual({ type: "sdk" });
        expect(Date.parse(version.createdTime)).toBeGreaterThanOrEqual(before - 1);
        expect(version.createdTime).toBe(new Date(version.createdTime).toISOString());

        const got = await call("GET", `/api/v2/models/${modelRid}/versions/${version.rid}`);
        expect(got.statusCode).toBe(200);
        expect(got.json()).toEqual(version);
      });

      it("serves the model API back in exactly the declared shape", async () => {
        const modelRid = await createModel();
        const version = await createVersion(modelRid, {
          modelApi: {
            inputs: [
              {
                type: "parameter",
                name: "x",
                dataType: { type: "long", extra: true },
                somethingElse: "dropped",
              },
            ],
            outputs: [],
            notAField: 1,
          },
        });
        expect(version.modelApi).toEqual({
          inputs: [{ type: "parameter", name: "x", dataType: { type: "long" } }],
          outputs: [],
        });
      });

      it("rejects an invalid model API with InvalidModelApi", async () => {
        const modelRid = await createModel();
        const cases: [errorType: string, modelApi: unknown][] = [
          ["MALFORMED", undefined],
          ["MALFORMED", { inputs: [] }],
          ["MALFORMED", { inputs: {}, outputs: [] }],
          ["UNKNOWN_TYPE", { inputs: [{ type: "image", name: "a" }], outputs: [] }],
          [
            "UNKNOWN_TYPE",
            { inputs: [{ type: "parameter", name: "a", dataType: { type: "tensor" } }], outputs: [] },
          ],
          ["MALFORMED", { inputs: [{ type: "parameter", name: "a" }], outputs: [] }],
          [
            "EMPTY_NAME",
            { inputs: [{ type: "parameter", name: "", dataType: { type: "string" } }], outputs: [] },
          ],
          [
            "DUPLICATE_NAME",
            {
              inputs: [
                { type: "parameter", name: "a", dataType: { type: "string" } },
                { type: "tabular", name: "a", columns: [] },
              ],
              outputs: [],
            },
          ],
          [
            "DUPLICATE_NAME",
            {
              inputs: [
                {
                  type: "tabular",
                  name: "t",
                  columns: [
                    { name: "c", dataType: { type: "string" } },
                    { name: "c", dataType: { type: "double" } },
                  ],
                },
              ],
              outputs: [],
            },
          ],
          [
            "MALFORMED",
            { inputs: [{ type: "tabular", name: "t", columns: [], format: "ARROW" }], outputs: [] },
          ],
          [
            "MALFORMED",
            {
              inputs: [{ type: "parameter", name: "a", required: "yes", dataType: { type: "string" } }],
              outputs: [],
            },
          ],
          [
            "MALFORMED",
            {
              inputs: [{ type: "unsupported", unsupportedType: "x", params: { n: 1 } }],
              outputs: [],
            },
          ],
          [
            "MALFORMED",
            {
              inputs: [{ type: "parameter", name: "a", dataType: { type: "array" } }],
              outputs: [],
            },
          ],
        ];
        for (const [errorType, modelApi] of cases) {
          const res = await call(
            "POST",
            `/api/v2/models/${modelRid}/versions`,
            versionBody({ modelApi }),
          );
          expect(res.statusCode, JSON.stringify(modelApi)).toBe(400);
          expect(res.json()).toMatchObject({
            errorName: "InvalidModelApi",
            parameters: { errorType },
          });
          expect(typeof res.json().parameters.message).toBe("string");
        }
      });

      it("bounds how deeply data types may nest", async () => {
        const modelRid = await createModel();
        let deep: Record<string, unknown> = { type: "string" };
        for (let i = 0; i < 40; i++) deep = { type: "array", itemType: deep };
        const res = await call(
          "POST",
          `/api/v2/models/${modelRid}/versions`,
          versionBody({
            modelApi: { inputs: [{ type: "parameter", name: "a", dataType: deep }], outputs: [] },
          }),
        );
        expect(res.statusCode).toBe(400);
        expect(res.json().parameters.errorType).toBe("TOO_DEEP");
      });

      it("accepts and promotes a model of several megabytes", async () => {
        const staging = await createModel("big-staging");
        const prod = await createModel("big-prod");
        const serializedModelFunction = Buffer.alloc(5 * 1024 * 1024, 7).toString("base64");
        const version = await createVersion(staging, {
          modelFiles: { type: "dill", serializedModelFunction },
        });
        const promoted = await call("POST", `/api/v2/models/${prod}/promoteVersion`, {
          sourceModelVersionRid: version.rid,
        });
        expect(promoted.statusCode).toBe(200);
        expect(promoted.json().source.previousModelVersionRid).toBe(version.rid);
      });

      it("validates the model files, repositories and requirements", async () => {
        const modelRid = await createModel();
        const cases: Record<string, unknown>[] = [
          { modelFiles: undefined },
          { modelFiles: { type: "pickle", serializedModelFunction: DILL } },
          { modelFiles: { type: "dill", serializedModelFunction: "" } },
          { modelFiles: { type: "dill", serializedModelFunction: "not base64!" } },
          { modelFiles: { type: "dill", serializedModelFunction: "abc" } },
          { backingRepositories: undefined },
          { backingRepositories: ["not-a-rid"] },
          { backingRepositories: [7] },
          { condaRequirements: undefined },
          { condaRequirements: "pandas" },
          { condaRequirements: [""] },
        ];
        for (const overrides of cases) {
          const res = await call("POST", `/api/v2/models/${modelRid}/versions`, versionBody(overrides));
          expect(res.statusCode, JSON.stringify(overrides)).toBe(400);
          expect(res.json().errorName).toBe("InvalidArgument");
        }
        const list = await call("GET", `/api/v2/models/${modelRid}/versions`);
        expect(list.json()).toEqual({ data: [] });
      });

      it("answers ModelNotFound when creating or listing versions of an unknown model", async () => {
        const rid = "ri.models.main.model.missing";
        const create = await call("POST", `/api/v2/models/${rid}/versions`, versionBody());
        expect(create.statusCode).toBe(404);
        expect(create.json()).toMatchObject({ errorName: "ModelNotFound", parameters: { modelRid: rid } });
        const list = await call("GET", `/api/v2/models/${rid}/versions`);
        expect(list.statusCode).toBe(404);
        expect(list.json().errorName).toBe("ModelNotFound");
      });

      it("serves a version only under the model it belongs to", async () => {
        const a = await createModel("a");
        const b = await createModel("b");
        const version = await createVersion(a);
        const res = await call("GET", `/api/v2/models/${b}/versions/${version.rid}`);
        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({
          errorName: "ModelVersionNotFound",
          parameters: { modelRid: b, modelVersionRid: version.rid },
        });
      });

      it("lists versions oldest first and pages through them with tokens", async () => {
        const modelRid = await createModel();
        const created: string[] = [];
        for (let i = 0; i < 5; i++) created.push((await createVersion(modelRid)).rid);

        const all = await call("GET", `/api/v2/models/${modelRid}/versions`);
        expect(all.statusCode).toBe(200);
        expect(all.json().data.map((v: { rid: string }) => v.rid)).toEqual(created);
        expect(all.json().nextPageToken).toBeUndefined();

        const seen: string[] = [];
        let token: string | undefined;
        let pages = 0;
        do {
          const res = await call(
            "GET",
            `/api/v2/models/${modelRid}/versions?pageSize=2${token ? `&pageToken=${token}` : ""}`,
          );
          expect(res.statusCode).toBe(200);
          const page = res.json();
          expect(page.data.length).toBeLessThanOrEqual(2);
          seen.push(...page.data.map((v: { rid: string }) => v.rid));
          token = page.nextPageToken;
          pages++;
        } while (token);
        expect(pages).toBe(3);
        expect(seen).toEqual(created);
      });

      it("keeps a page boundary stable when a version is added mid-paging", async () => {
        const modelRid = await createModel();
        const created: string[] = [];
        for (let i = 0; i < 3; i++) created.push((await createVersion(modelRid)).rid);
        const first = (await call("GET", `/api/v2/models/${modelRid}/versions?pageSize=2`)).json();
        created.push((await createVersion(modelRid)).rid);
        const second = (
          await call(
            "GET",
            `/api/v2/models/${modelRid}/versions?pageSize=2&pageToken=${first.nextPageToken}`,
          )
        ).json();
        expect([...first.data, ...second.data].map((v: { rid: string }) => v.rid)).toEqual(created);
      });

      it("rejects malformed paging and branch parameters", async () => {
        const modelRid = await createModel();
        for (const query of [
          "pageSize=0",
          "pageSize=-1",
          "pageSize=1.5",
          "pageSize=abc",
          "pageToken=%%%",
          `pageToken=${Buffer.from(JSON.stringify({ offset: -1 })).toString("base64url")}`,
          `pageToken=${Buffer.from(JSON.stringify({ offset: 1.5 })).toString("base64url")}`,
          "branch=",
        ]) {
          const res = await call("GET", `/api/v2/models/${modelRid}/versions?${query}`);
          expect(res.statusCode, query).toBe(400);
        }
      });
    });

    // -- promoteVersion ----------------------------------------------------

    describe("promoteVersion", () => {
      it("copies a version to another model as a new version naming its origin", async () => {
        const staging = await createModel("staging");
        const prod = await createModel("prod");
        const original = await createVersion(staging);

        const res = await call("POST", `/api/v2/models/${prod}/promoteVersion`, {
          sourceModelVersionRid: original.rid,
        });
        expect(res.statusCode).toBe(200);
        const promoted = res.json();
        expect(promoted.rid).not.toBe(original.rid);
        expect(promoted.modelApi).toEqual(original.modelApi);
        expect(promoted.condaRequirements).toEqual(original.condaRequirements);
        expect(promoted.backingRepositories).toEqual(original.backingRepositories);
        expect(promoted.source).toEqual({
          type: "promoted",
          previousModelRid: staging,
          previousModelVersionRid: original.rid,
        });

        // It is the latest version on the default branch of the target...
        const prodList = (await call("GET", `/api/v2/models/${prod}/versions`)).json();
        expect(prodList.data.map((v: { rid: string }) => v.rid)).toEqual([promoted.rid]);
        const got = await call("GET", `/api/v2/models/${prod}/versions/${promoted.rid}`);
        expect(got.json()).toEqual(promoted);
        // ...and the source model is untouched.
        const stagingList = (await call("GET", `/api/v2/models/${staging}/versions`)).json();
        expect(stagingList.data.map((v: { rid: string }) => v.rid)).toEqual([original.rid]);
      });

      it("promotes onto the requested branch, and the branch filter lists it alone", async () => {
        const modelRid = await createModel();
        const v1 = await createVersion(modelRid);
        const promoted = (
          await call("POST", `/api/v2/models/${modelRid}/promoteVersion`, {
            sourceModelVersionRid: v1.rid,
            branch: "release",
          })
        ).json();

        const master = (await call("GET", `/api/v2/models/${modelRid}/versions`)).json();
        expect(master.data.map((v: { rid: string }) => v.rid)).toEqual([v1.rid]);
        const explicitMaster = (
          await call("GET", `/api/v2/models/${modelRid}/versions?branch=master`)
        ).json();
        expect(explicitMaster).toEqual(master);
        const release = (
          await call("GET", `/api/v2/models/${modelRid}/versions?branch=release`)
        ).json();
        expect(release.data.map((v: { rid: string }) => v.rid)).toEqual([promoted.rid]);
        const none = (await call("GET", `/api/v2/models/${modelRid}/versions?branch=nope`)).json();
        expect(none).toEqual({ data: [] });
      });

      it("names the immediate source when a promoted version is promoted again", async () => {
        const a = await createModel("a");
        const b = await createModel("b");
        const c = await createModel("c");
        const v = await createVersion(a);
        const vb = (
          await call("POST", `/api/v2/models/${b}/promoteVersion`, { sourceModelVersionRid: v.rid })
        ).json();
        const vc = (
          await call("POST", `/api/v2/models/${c}/promoteVersion`, { sourceModelVersionRid: vb.rid })
        ).json();
        expect(vc.source).toEqual({
          type: "promoted",
          previousModelRid: b,
          previousModelVersionRid: vb.rid,
        });
      });

      it("answers ModelNotFound and ModelVersionNotFound, and validates its body", async () => {
        const modelRid = await createModel();
        const version = await createVersion(modelRid);

        const noModel = await call(
          "POST",
          "/api/v2/models/ri.models.main.model.missing/promoteVersion",
          { sourceModelVersionRid: version.rid },
        );
        expect(noModel.statusCode).toBe(404);
        expect(noModel.json().errorName).toBe("ModelNotFound");

        const noVersion = await call("POST", `/api/v2/models/${modelRid}/promoteVersion`, {
          sourceModelVersionRid: "ri.models.main.model-version.missing",
        });
        expect(noVersion.statusCode).toBe(404);
        expect(noVersion.json()).toMatchObject({
          errorName: "ModelVersionNotFound",
          parameters: { modelVersionRid: "ri.models.main.model-version.missing" },
        });
        // The source version is looked up by RID alone, never on this model.
        expect(noVersion.json().parameters).not.toHaveProperty("modelRid");

        for (const body of [{}, { sourceModelVersionRid: 3 }, { sourceModelVersionRid: version.rid, branch: "" }]) {
          const res = await call("POST", `/api/v2/models/${modelRid}/promoteVersion`, body);
          expect(res.statusCode, JSON.stringify(body)).toBe(400);
        }
        const list = (await call("GET", `/api/v2/models/${modelRid}/versions`)).json();
        expect(list.data).toHaveLength(1);
      });
    });

    // -- Model Studio ------------------------------------------------------

    describe("ModelStudio", () => {
      it("creates a studio and serves exactly the ModelStudio shape", async () => {
        const before = Date.now();
        const res = await call("POST", "/api/v2/models/modelStudios", {
          name: "Churn studio",
          parentFolderRid: FOLDER,
        });
        expect(res.statusCode).toBe(200);
        const studio = res.json();
        expect(Object.keys(studio).sort()).toEqual(["createdTime", "folderRid", "rid"]);
        expect(studio.rid).toMatch(/^ri\.models\.main\.model-studio\.[0-9a-f-]{36}$/);
        expect(studio.folderRid).toBe(FOLDER);
        expect(Date.parse(studio.createdTime)).toBeGreaterThanOrEqual(before - 1);

        const got = await call("GET", `/api/v2/models/modelStudios/${studio.rid}`);
        expect(got.statusCode).toBe(200);
        expect(got.json()).toEqual(studio);
      });

      it("answers ModelStudioNotFound with the studioRid parameter", async () => {
        const rid = "ri.models.main.model-studio.missing";
        const res = await call("GET", `/api/v2/models/modelStudios/${rid}`);
        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({
          errorName: "ModelStudioNotFound",
          parameters: { studioRid: rid },
        });
      });

      it("rejects a bad create with InvalidModelStudioCreateRequest or InvalidDisplayName", async () => {
        for (const body of [
          [],
          { parentFolderRid: FOLDER },
          { name: 3, parentFolderRid: FOLDER },
          { name: "s" },
          { name: "s", parentFolderRid: "ri.foundry.main.dataset.d1" },
        ]) {
          const res = await call("POST", "/api/v2/models/modelStudios", body);
          expect(res.statusCode, JSON.stringify(body)).toBe(400);
          expect(res.json().errorName).toBe("InvalidModelStudioCreateRequest");
        }
        const res = await call("POST", "/api/v2/models/modelStudios", {
          name: "a/b",
          parentFolderRid: FOLDER,
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().errorName).toBe("InvalidDisplayName");
      });

      it("never serves a studio as a model or a model as a studio", async () => {
        const modelRid = await createModel("m");
        const studio = (
          await call("POST", "/api/v2/models/modelStudios", { name: "s", parentFolderRid: FOLDER })
        ).json();
        expect((await call("GET", `/api/v2/models/${studio.rid}`)).statusCode).toBe(404);
        expect((await call("GET", `/api/v2/models/modelStudios/${modelRid}`)).statusCode).toBe(404);
        const version = await call("POST", `/api/v2/models/${studio.rid}/versions`, versionBody());
        expect(version.statusCode).toBe(404);
      });
    });

    // -- Request errors ----------------------------------------------------

    it("reports a malformed or oversized body as the caller's error, not a 500", async () => {
      const malformed = await app.inject({
        method: "POST",
        url: "/api/v2/models?preview=true",
        headers: { "content-type": "application/json" },
        payload: "{not json",
      });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json()).toMatchObject({ errorCode: "INVALID_ARGUMENT", errorName: "InvalidRequest" });

      // Only version creation carries a model; everything else keeps the default limit.
      const oversized = await call("POST", "/api/v2/models", {
        name: "x".repeat(2 * 1024 * 1024),
        parentFolderRid: FOLDER,
      });
      expect(oversized.statusCode).toBe(413);
      expect(oversized.json()).toMatchObject({ errorCode: "CUSTOM_CLIENT", errorName: "InvalidRequest" });
    });

    // -- Unserved operations -----------------------------------------------

    it("serves none of the 24 operations that need a missing subsystem", async () => {
      expect(UNSERVED).toHaveLength(24);
      for (const [method, url] of UNSERVED) {
        const res = await call(method, url, method === "GET" ? undefined : {});
        expect(res.statusCode, `${method} ${url}`).toBe(404);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Tenant isolation (Postgres only: the in-memory store serves one tenant)
// ---------------------------------------------------------------------------

for (const source of SCHEMA_SOURCES) {
  describe.skipIf(PG_URL === "")(`models v2 tenant isolation (postgres, ${source.name})`, () => {
    let admin: pg.Pool;
    let tenantPool: pg.Pool;
    const apps: FastifyInstance[] = [];

    beforeAll(async () => {
      admin = await buildSchema(source);
      await admin.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TENANT_ROLE}') THEN
            CREATE ROLE ${TENANT_ROLE} NOLOGIN;
          END IF;
        END $$;
        GRANT ${TENANT_ROLE} TO CURRENT_USER;
        GRANT USAGE ON SCHEMA ${source.schema} TO ${TENANT_ROLE};
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${source.schema} TO ${TENANT_ROLE};
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA ${source.schema} TO ${TENANT_ROLE};
        INSERT INTO organizations (rid, display_name) VALUES ('org:a', 'A'), ('org:b', 'B')
          ON CONFLICT (rid) DO NOTHING;
      `);
      tenantPool = new pg.Pool({
        connectionString: PG_URL,
        options: `-c search_path=${source.schema},public -c role=${TENANT_ROLE}`,
      });
    });

    afterAll(async () => {
      await Promise.all(apps.map((app) => app.close()));
      await tenantPool?.end();
      await admin?.end();
      await dropSchema(source);
      const client = new pg.Client({ connectionString: PG_URL });
      await client.connect();
      await client.query(`DROP ROLE IF EXISTS ${TENANT_ROLE}`).finally(() => client.end());
    });

    beforeEach(async () => {
      await admin.query("TRUNCATE ml_model_versions, ml_resources");
    });

    async function appFor(orgRid?: string): Promise<FastifyInstance> {
      const app = await createServer({
        config: TEST_CONFIG,
        llmClient: new MockLlmClient(),
        conversationStore: new ConversationStore(),
        embeddingStore: new EmbeddingStore(),
        modelStore: new PgModelStore(tenantPool, orgRid),
      });
      apps.push(app);
      return app;
    }

    function call(app: FastifyInstance, method: "GET" | "POST", url: string, payload?: object) {
      return app.inject({
        method,
        url: `${url}${url.includes("?") ? "&" : "?"}preview=true`,
        ...(payload === undefined ? {} : { payload }),
      });
    }

    it("serves each organization only its own models, versions and studios", async () => {
      const a = await appFor("org:a");
      const b = await appFor("org:b");

      const model = (await call(a, "POST", "/api/v2/models", { name: "churn", parentFolderRid: FOLDER })).json();
      const version = (await call(a, "POST", `/api/v2/models/${model.rid}/versions`, versionBody())).json();
      const studio = (
        await call(a, "POST", "/api/v2/models/modelStudios", { name: "s", parentFolderRid: FOLDER })
      ).json();

      expect((await call(a, "GET", `/api/v2/models/${model.rid}`)).statusCode).toBe(200);
      expect((await call(b, "GET", `/api/v2/models/${model.rid}`)).statusCode).toBe(404);
      expect((await call(b, "GET", `/api/v2/models/${model.rid}/versions`)).statusCode).toBe(404);
      expect((await call(b, "GET", `/api/v2/models/modelStudios/${studio.rid}`)).statusCode).toBe(404);

      const own = (await call(b, "POST", "/api/v2/models", { name: "mine", parentFolderRid: FOLDER })).json();
      const promote = await call(b, "POST", `/api/v2/models/${own.rid}/promoteVersion`, {
        sourceModelVersionRid: version.rid,
      });
      expect(promote.statusCode).toBe(404);
      expect(promote.json().errorName).toBe("ModelVersionNotFound");

      // Sorted on this side, not with ORDER BY: Postgres orders text by the
      // database collation, which differs from JS string order on glibc.
      const byRid = (x: { rid: string }, y: { rid: string }) => (x.rid < y.rid ? -1 : 1);
      const { rows } = await admin.query(
        "SELECT rid, org_rid FROM ml_resources UNION ALL SELECT rid, org_rid FROM ml_model_versions",
      );
      expect(rows.sort(byRid)).toEqual(
        [
          { rid: model.rid, org_rid: "org:a" },
          { rid: version.rid, org_rid: "org:a" },
          { rid: studio.rid, org_rid: "org:a" },
          { rid: own.rid, org_rid: "org:b" },
        ].sort(byRid),
      );
    });

    it("makes a display name single-use per folder within an organization, not across them", async () => {
      const a = await appFor("org:a");
      const b = await appFor("org:b");
      const body = { name: "churn", parentFolderRid: FOLDER };

      expect((await call(a, "POST", "/api/v2/models", body)).statusCode).toBe(200);
      expect((await call(b, "POST", "/api/v2/models", body)).statusCode).toBe(200);
      const clash = await call(a, "POST", "/api/v2/models/modelStudios", body);
      expect(clash.statusCode).toBe(409);
      expect(clash.json().errorName).toBe("ResourceNameAlreadyExists");
    });

    it("gives a store with no organization nothing to read and nowhere to write", async () => {
      const a = await appFor("org:a");
      const model = (await call(a, "POST", "/api/v2/models", { name: "churn", parentFolderRid: FOLDER })).json();

      const unscoped = new PgModelStore(tenantPool);
      expect(await unscoped.getResource(model.rid, "MODEL")).toBeUndefined();
      await expect(
        unscoped.createResource({
          rid: "ri.models.main.model.unscoped",
          resourceType: "MODEL",
          displayName: "x",
          parentFolderRid: FOLDER,
          createdTime: new Date().toISOString(),
        }),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
}
