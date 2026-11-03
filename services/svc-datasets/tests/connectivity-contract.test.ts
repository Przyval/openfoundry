/**
 * The Foundry `connectivity` v2 contract (`foundry_sdk/v2/connectivity/`), run
 * against both persistence backends: the in-memory store, and the Postgres one
 * on a PGlite database built from each schema source (`scripts/migrate.sql`,
 * which Docker Compose loads, and `db/migrations/`, which `pnpm db:migrate`
 * applies). A column or constraint the Postgres store needs that either source
 * lacks fails here rather than in production.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { createPgConfig } from "@electric-sql/pglite/node-postgres";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite-pgvector";
import { FileAuthorizationStore, ROOT_RESOURCE, setEnforcePermissions } from "@openfoundry/permissions";
import { createServer } from "../src/server.js";
import { DatasetStore } from "../src/store/dataset-store.js";
import { FileStore } from "../src/store/file-store.js";
import { PgConnectivityStore } from "../src/connectivity/pg-store.js";
import { SecretBox } from "../src/connectivity/secrets.js";
import { type ConnectivityStore, MemoryConnectivityStore } from "../src/connectivity/store.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const TEST_CONFIG = { port: 0, host: "127.0.0.1", logLevel: "silent", nodeEnv: "test" } as const;
const BOX = SecretBox.withKey(Buffer.alloc(32, 7));

interface Backend {
  name: string;
  setup(): Promise<void>;
  fresh(): Promise<ConnectivityStore>;
  teardown(): Promise<void>;
}

const memoryBackend: Backend = {
  name: "memory",
  async setup() {},
  async fresh() {
    return new MemoryConnectivityStore(BOX);
  },
  async teardown() {},
};

function migrationFiles(): string[] {
  const dir = path.join(REPO_ROOT, "db/migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(dir, f));
}

function postgresBackend(source: string, files: () => string[]): Backend {
  let db: PGlite;
  let pool: pg.Pool;
  return {
    name: `postgres, ${source}`,
    async setup() {
      db = await PGlite.create({ extensions: { citext, pgcrypto, pg_trgm, vector } });
      for (const file of files()) await db.exec(readFileSync(file, "utf8"));
      pool = new pg.Pool(createPgConfig(db));
    },
    async fresh() {
      await pool.query(
        "TRUNCATE connectivity_virtual_tables, connectivity_imports, connectivity_secrets, connectivity_jdbc_drivers, connectivity_connections",
      );
      return new PgConnectivityStore(pool, BOX);
    },
    async teardown() {
      await pool?.end();
      await db?.close();
    },
  };
}

const BACKENDS: Backend[] = [
  memoryBackend,
  postgresBackend("db/migrations", migrationFiles),
  postgresBackend("scripts/migrate.sql", () => [path.join(REPO_ROOT, "scripts/migrate.sql")]),
];

// -- Fixtures ------------------------------------------------------------------

const FOLDER = "ri.compass.main.folder.11111111-1111-4111-8111-111111111111";
const OTHER_FOLDER = "ri.compass.main.folder.22222222-2222-4222-8222-222222222222";
const ADMIN = { "x-user-id": "admin", "x-user-platform-admin": "true" };
const WORKER = { type: "foundryWorker", networkEgressPolicyRids: [] };
const BASE = "/api/v2/connectivity/connections";
const Q = "?preview=true";

const JDBC_PG = {
  type: "jdbc",
  url: "jdbc:postgresql://db.example.com:5432/sales",
  driverClass: "org.postgresql.Driver",
  jdbcProperties: { ssl: "true" },
  credentials: { type: "basic", username: "etl", password: { type: "asPlaintextValue", value: "hunter2" } },
};
const S3 = {
  type: "s3",
  bucketUrl: "s3://acme-data/raw",
  region: "eu-west-1",
  authenticationMode: {
    type: "awsAccessKey",
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: { type: "asPlaintextValue", value: "s3cr3t" },
  },
};

describe.each(BACKENDS)("connectivity on $name", (backend) => {
  let app: FastifyInstance;
  let store: ConnectivityStore;
  let datasetRid: string;
  let datasetStore: DatasetStore;

  beforeAll(() => backend.setup(), 60_000);
  afterAll(() => backend.teardown());

  beforeEach(async () => {
    store = await backend.fresh();
    datasetStore = new DatasetStore();
    datasetRid = datasetStore.createDataset({ name: "orders" }).rid;
    app = await createServer({
      authorizationStore: new FileAuthorizationStore(null),
      config: TEST_CONFIG,
      datasetStore,
      fileStore: new FileStore(),
      connectivityStore: store,
    });
  });

  const call = (
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    payload?: unknown,
    headers: Record<string, string> = ADMIN,
  ) => app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) });

  async function createConnection(configuration: unknown, displayName = "source", folder = FOLDER) {
    const res = await call("POST", `${BASE}${Q}`, {
      parentFolderRid: folder,
      displayName,
      worker: WORKER,
      configuration,
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json();
  }

  // -- Connection ------------------------------------------------------------

  it("refuses every operation without preview=true", async () => {
    const res = await call("GET", `${BASE}/ri.magritte.main.source.x`);
    expect(res.statusCode).toBe(400);
    expect(res.json().errorName).toBe("ApiFeaturePreviewUsageOnly");
  });

  it("creates a connection and serves it with secrets as names, never values", async () => {
    const created = await createConnection(JDBC_PG);
    expect(created).toEqual({
      rid: expect.stringMatching(/^ri\.magritte\.main\.source\./),
      parentFolderRid: FOLDER,
      displayName: "source",
      exportSettings: { exportsEnabled: false, exportEnabledWithoutMarkingsValidation: false },
      worker: WORKER,
      configuration: {
        type: "jdbc",
        url: JDBC_PG.url,
        driverClass: "org.postgresql.Driver",
        uploadedJdbcDrivers: [],
        jdbcProperties: { ssl: "true" },
        credentials: {
          type: "basic",
          username: "etl",
          password: { type: "asSecretName", value: "credentials.password" },
        },
      },
    });
    expect(JSON.stringify(created)).not.toContain("hunter2");
    expect(await store.secretNames(created.rid)).toEqual(["credentials.password"]);

    const got = await call("GET", `${BASE}/${created.rid}${Q}`);
    expect(got.json()).toEqual(created);
    const config = await call("GET", `${BASE}/${created.rid}/getConfiguration${Q}`);
    expect(config.json()).toEqual(created.configuration);
  });

  it("serves each connection type and keeps what the caller sent", async () => {
    const s3 = await createConnection(
      { ...S3, maxConnections: 20, matchSubfolderExactly: true, stsRoleConfiguration: { roleArn: "arn:aws:iam::1:role/r", roleSessionName: "of" } },
      "s3",
    );
    expect(s3.configuration).toMatchObject({
      type: "s3",
      bucketUrl: "s3://acme-data/raw",
      maxConnections: 20,
      matchSubfolderExactly: true,
      authenticationMode: { secretAccessKey: { type: "asSecretName", value: "authenticationMode.secretAccessKey" } },
    });

    const rest = await createConnection(
      {
        type: "rest",
        domains: [
          { host: "api.example.com", auth: { type: "bearerToken", bearerToken: { type: "asPlaintextValue", value: "tok" } } },
        ],
        additionalSecrets: { type: "asSecretsWithPlaintextValues", secrets: { SALT: "pepper" } },
      },
      "rest",
    );
    expect(rest.configuration.additionalSecrets).toEqual({ type: "asSecretsNames", secretNames: ["SALT"] });
    expect((await store.secretNames(rest.rid)).sort()).toEqual(["SALT", "domains[0].auth.bearerToken"]);

    const snowflake = await createConnection(
      {
        type: "snowflake",
        accountIdentifier: "acme-xy123",
        warehouse: "WH",
        jdbcProperties: {},
        authenticationMode: { type: "keyPair", user: "svc", privateKey: { type: "asPlaintextValue", value: "pem" } },
      },
      "snow",
    );
    expect(snowflake.configuration.authenticationMode.privateKey).toEqual({
      type: "asSecretName",
      value: "authenticationMode.privateKey",
    });

    const databricks = await createConnection(
      {
        type: "databricks",
        hostName: "adb-1.azuredatabricks.net",
        httpPath: "/sql/1.0/warehouses/abc",
        jdbcProperties: {},
        authentication: { type: "personalAccessToken", personalAccessToken: { type: "asPlaintextValue", value: "dapi" } },
      },
      "dbx",
    );
    expect(databricks.configuration.type).toBe("databricks");

    const smb = await createConnection(
      {
        type: "smb",
        hostname: "files.example.com",
        port: 445,
        share: "reports",
        auth: { type: "usernamePassword", username: "u", password: { type: "asPlaintextValue", value: "p" } },
      },
      "smb",
    );
    expect(smb.configuration).toMatchObject({ type: "smb", share: "reports", port: 445 });
  });

  it("rejects what Foundry rejects, by Foundry's error name", async () => {
    const attempt = async (patch: Record<string, unknown>, configuration: unknown = JDBC_PG) => {
      const res = await call("POST", `${BASE}${Q}`, {
        parentFolderRid: FOLDER,
        displayName: "bad",
        worker: WORKER,
        configuration,
        ...patch,
      });
      expect(res.statusCode).toBe(400);
      return res.json().errorName as string;
    };
    expect(await attempt({ worker: { type: "unknownWorker" } })).toBe("UnknownWorkerCannotBeUsedForCreatingOrUpdatingConnections");
    expect(await attempt({ displayName: "  " })).toBe("PropertyCannotBeBlank");
    expect(await attempt({}, { ...JDBC_PG, credentials: { type: "basic", username: "u", password: { type: "asSecretName", value: "x" } } })).toBe(
      "EncryptedPropertyMustBeSpecifiedAsPlaintextValue",
    );
    expect(await attempt({}, { type: "rest", domains: [] })).toBe("PropertyCannotBeEmpty");
    expect(
      await attempt({}, { type: "rest", domains: [{ host: "a.example.com", scheme: "HTTP", auth: { type: "oauth2" } }] }),
    ).toBe("DomainMustUseHttpsWithAuthentication");
    expect(await attempt({}, { type: "rest", domains: [{ host: "https://a.example.com" }] })).toBe("HostNameCannotHaveProtocolOrPort");
    expect(await attempt({}, { type: "rest", domains: [{ host: "a.example.com", port: 70000 }] })).toBe("PortNotInRange");
    expect(
      await attempt({}, { type: "rest", domains: [{ host: "a" }], additionalSecrets: { type: "asSecretsNames", secretNames: ["a"] } }),
    ).toBe("AdditionalSecretsMustBeSpecifiedAsPlaintextValueMap");
    expect(
      await attempt({}, { type: "smb", hostname: "h", share: "a/b", auth: { type: "usernamePassword", username: "u", password: { type: "asPlaintextValue", value: "p" } } }),
    ).toBe("InvalidShareName");
    expect(await attempt({ parentFolderRid: "ri.compass.main.project.x" })).toBe("InvalidArgument");
  });

  it("refuses a second connection with the same name in one folder, not in another", async () => {
    await createConnection(S3, "dup");
    const clash = await call("POST", `${BASE}${Q}`, { parentFolderRid: FOLDER, displayName: "dup", worker: WORKER, configuration: S3 });
    expect(clash.statusCode).toBe(409);
    expect(clash.json().errorName).toBe("ResourceNameAlreadyExists");
    await createConnection(S3, "dup", OTHER_FOLDER);
  });

  it("answers ConnectionNotFound for a connection that does not exist", async () => {
    const res = await call("GET", `${BASE}/ri.magritte.main.source.none${Q}`);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ errorName: "ConnectionNotFound", parameters: { connectionRid: "ri.magritte.main.source.none" } });
  });

  it("returns the configurations of the connections that exist, in a batch", async () => {
    const a = await createConnection(S3, "a");
    const b = await createConnection(JDBC_PG, "b");
    const res = await call("POST", `${BASE}/getConfigurationBatch${Q}`, [
      { connectionRid: a.rid },
      { connectionRid: b.rid },
      { connectionRid: "ri.magritte.main.source.gone" },
    ]);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ data: { [a.rid]: a.configuration, [b.rid]: b.configuration } });

    const tooMany = await call("POST", `${BASE}/getConfigurationBatch${Q}`, Array.from({ length: 201 }, () => ({ connectionRid: a.rid })));
    expect(tooMany.statusCode).toBe(400);
  });

  it("updates export settings", async () => {
    const c = await createConnection(S3);
    const settings = { exportsEnabled: true, exportEnabledWithoutMarkingsValidation: false };
    const res = await call("POST", `${BASE}/${c.rid}/updateExportSettings${Q}`, { exportSettings: settings });
    expect(res.statusCode).toBe(204);
    expect((await call("GET", `${BASE}/${c.rid}${Q}`)).json().exportSettings).toEqual(settings);

    const bad = await call("POST", `${BASE}/${c.rid}/updateExportSettings${Q}`, { exportSettings: { exportsEnabled: true } });
    expect(bad.statusCode).toBe(400);
  });

  it("updates only secrets the connection already holds", async () => {
    const c = await createConnection(JDBC_PG);
    const ok = await call("POST", `${BASE}/${c.rid}/updateSecrets${Q}`, { secrets: { "credentials.password": "rotated" } });
    expect(ok.statusCode).toBe(204);

    const unknown = await call("POST", `${BASE}/${c.rid}/updateSecrets${Q}`, { secrets: { "credentials.password": "x", nope: "y" } });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({ errorName: "SecretNamesDoNotExist", parameters: { secretNames: ["nope"] } });
  });

  // -- File imports ----------------------------------------------------------

  it("creates, reads, lists, replaces and deletes a file import", async () => {
    const c = await createConnection(S3);
    const url = `${BASE}/${c.rid}/fileImports`;
    const created = await call("POST", `${url}${Q}`, {
      datasetRid,
      importMode: "SNAPSHOT",
      displayName: "daily",
      branchName: "main",
      subfolder: "orders/",
      fileImportFilters: [
        { type: "pathMatchesFilter", regex: ".*\\.csv" },
        { type: "fileSizeFilter", gt: 10, lt: 1000 },
        { type: "filesCountLimitFilter", filesCount: 5 },
      ],
    });
    expect(created.statusCode, created.body).toBe(200);
    const imp = created.json();
    expect(imp).toMatchObject({
      rid: expect.stringMatching(/^ri\.magritte\.main\.file-import\./),
      connectionRid: c.rid,
      datasetRid,
      branchName: "main",
      displayName: "daily",
      importMode: "SNAPSHOT",
      subfolder: "orders/",
    });
    expect(imp.fileImportFilters).toHaveLength(3);

    expect((await call("GET", `${url}/${imp.rid}${Q}`)).json()).toEqual(imp);

    const replaced = await call("PUT", `${url}/${imp.rid}${Q}`, {
      importMode: "APPEND",
      displayName: "hourly",
      fileImportFilters: [],
    });
    expect(replaced.statusCode, replaced.body).toBe(200);
    expect(replaced.json()).toEqual({
      rid: imp.rid,
      connectionRid: c.rid,
      datasetRid,
      branchName: "main",
      displayName: "hourly",
      importMode: "APPEND",
      fileImportFilters: [],
    });

    const del = await call("DELETE", `${url}/${imp.rid}${Q}`);
    expect(del.statusCode).toBe(204);
    const gone = await call("GET", `${url}/${imp.rid}${Q}`);
    expect(gone.statusCode).toBe(404);
    expect(gone.json().errorName).toBe("FileImportNotFound");
  });

  it("pages a connection's file imports in creation order", async () => {
    const c = await createConnection(S3);
    const url = `${BASE}/${c.rid}/fileImports`;
    for (const name of ["one", "two", "three"]) {
      await call("POST", `${url}${Q}`, { datasetRid, importMode: "SNAPSHOT", displayName: name, fileImportFilters: [] });
    }
    const first = (await call("GET", `${url}${Q}&pageSize=2`)).json();
    expect(first.data.map((i: { displayName: string }) => i.displayName)).toEqual(["one", "two"]);
    expect(first.nextPageToken).toBeTruthy();
    const second = (await call("GET", `${url}${Q}&pageSize=2&pageToken=${first.nextPageToken}`)).json();
    expect(second.data.map((i: { displayName: string }) => i.displayName)).toEqual(["three"]);
    expect(second.nextPageToken).toBeUndefined();
  });

  it("validates file imports against their connection, dataset and filters", async () => {
    const jdbc = await createConnection(JDBC_PG, "j");
    const s3 = await createConnection(S3, "s");
    const body = { datasetRid, importMode: "SNAPSHOT", displayName: "x", fileImportFilters: [] };

    const unsupported = await call("POST", `${BASE}/${jdbc.rid}/fileImports${Q}`, body);
    expect(unsupported.json().errorName).toBe("FileImportNotSupportedForConnection");

    const noDataset = await call("POST", `${BASE}/${s3.rid}/fileImports${Q}`, { ...body, datasetRid: "ri.datasets.main.dataset.nope" });
    expect(noDataset.statusCode).toBe(404);
    const noBranch = await call("POST", `${BASE}/${s3.rid}/fileImports${Q}`, { ...body, branchName: "ghost" });
    expect(noBranch.statusCode).toBe(404);

    const filters: [unknown, string][] = [
      [{ type: "customFilter", config: {} }, "FileImportCustomFilterCannotBeUsedToCreateOrUpdateFileImports"],
      [{ type: "filesCountLimitFilter", filesCount: 0 }, "FilesCountLimitFilterInvalidLimit"],
      [{ type: "atLeastCountFilter", minFilesCount: 0 }, "FileAtLeastCountFilterInvalidMinCount"],
      [{ type: "fileSizeFilter" }, "FileSizeFilterMissingGreaterThanAndLessThan"],
      [{ type: "fileSizeFilter", gt: -1 }, "FileSizeFilterGreaterThanCannotBeNegative"],
      [{ type: "fileSizeFilter", lt: 0 }, "FileSizeFilterLessThanMustBeOneByteOrLarger"],
      [{ type: "fileSizeFilter", gt: 5, lt: 5 }, "FileSizeFilterInvalidGreaterThanAndLessThanRange"],
    ];
    for (const [filter, errorName] of filters) {
      const res = await call("POST", `${BASE}/${s3.rid}/fileImports${Q}`, { ...body, fileImportFilters: [filter] });
      expect(res.statusCode).toBe(400);
      expect(res.json().errorName).toBe(errorName);
    }
  });

  // -- Table imports ---------------------------------------------------------

  it("creates, reads, lists, replaces and deletes a table import", async () => {
    const c = await createConnection(JDBC_PG);
    const url = `${BASE}/${c.rid}/tableImports`;
    const created = await call("POST", `${url}${Q}`, {
      datasetRid,
      importMode: "APPEND",
      displayName: "orders",
      config: {
        type: "postgreSqlImportConfig",
        query: "SELECT * FROM orders",
        initialIncrementalState: { type: "integerColumnInitialIncrementalState", columnName: "id", currentValue: 0 },
      },
    });
    expect(created.statusCode, created.body).toBe(200);
    const imp = created.json();
    expect(imp).toMatchObject({
      rid: expect.stringMatching(/^ri\.magritte\.main\.table-import\./),
      connectionRid: c.rid,
      datasetRid,
      displayName: "orders",
      importMode: "APPEND",
      allowSchemaChanges: false,
      config: { type: "postgreSqlImportConfig", query: "SELECT * FROM orders" },
    });
    expect((await call("GET", `${url}/${imp.rid}${Q}`)).json()).toEqual(imp);
    expect((await call("GET", `${url}${Q}`)).json()).toEqual({ data: [imp] });

    const replaced = await call("PUT", `${url}/${imp.rid}${Q}`, {
      importMode: "SNAPSHOT",
      displayName: "orders-full",
      allowSchemaChanges: true,
      config: { type: "jdbcImportConfig", query: "SELECT 1" },
    });
    expect(replaced.statusCode, replaced.body).toBe(200);
    expect(replaced.json()).toEqual({
      rid: imp.rid,
      connectionRid: c.rid,
      datasetRid,
      displayName: "orders-full",
      importMode: "SNAPSHOT",
      allowSchemaChanges: true,
      config: { type: "jdbcImportConfig", query: "SELECT 1" },
    });

    expect((await call("DELETE", `${url}/${imp.rid}${Q}`)).statusCode).toBe(204);
    const gone = await call("GET", `${url}/${imp.rid}${Q}`);
    expect(gone.json().errorName).toBe("TableImportNotFound");
  });

  it("accepts only the table import configs a connection can serve", async () => {
    const jdbc = await createConnection(JDBC_PG, "j");
    const s3 = await createConnection(S3, "s");
    const body = (type: string) => ({ datasetRid, importMode: "SNAPSHOT", displayName: "x", config: { type, query: "q" } });

    for (const type of ["oracleImportConfig", "snowflakeImportConfig", "microsoftSqlServerImportConfig"]) {
      const res = await call("POST", `${BASE}/${jdbc.rid}/tableImports${Q}`, body(type));
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ errorName: "TableImportNotSupportedForConnection", parameters: { tableImportType: type } });
    }
    const onS3 = await call("POST", `${BASE}/${s3.rid}/tableImports${Q}`, body("jdbcImportConfig"));
    expect(onS3.json().errorName).toBe("TableImportNotSupportedForConnection");
    const blank = await call("POST", `${BASE}/${jdbc.rid}/tableImports${Q}`, { ...body("jdbcImportConfig"), config: { type: "jdbcImportConfig", query: " " } });
    expect(blank.json().errorName).toBe("PropertyCannotBeBlank");
  });

  // -- Virtual tables --------------------------------------------------------

  it("registers a virtual table on a connection that can back it, once per name", async () => {
    const snow = await createConnection(
      { type: "snowflake", accountIdentifier: "a", jdbcProperties: {}, authenticationMode: { type: "basic", username: "u", password: { type: "asPlaintextValue", value: "p" } } },
      "snow",
    );
    const url = `${BASE}/${snow.rid}/virtualTables${Q}`;
    const body = { name: "orders", parentRid: FOLDER, markings: ["m-1"], config: { type: "snowflake", database: "D", schema: "S", table: "T" } };
    const created = await call("POST", url, body);
    expect(created.statusCode, created.body).toBe(200);
    expect(created.json()).toEqual({
      rid: expect.stringMatching(/^ri\.foundry\.main\.table\./),
      name: "orders",
      parentRid: FOLDER,
      markings: ["m-1"],
      config: body.config,
    });

    const clash = await call("POST", url, body);
    expect(clash.statusCode).toBe(409);
    expect(clash.json().errorName).toBe("VirtualTableAlreadyExists");

    const wrongSource = await call("POST", url, { ...body, name: "other", config: { type: "delta", path: "s3://x" } });
    expect(wrongSource.json().errorName).toBe("InvalidVirtualTableConnection");
  });

  it("does not serve the operations that need a build system", async () => {
    const c = await createConnection(S3);
    for (const [method, url] of [
      ["POST", `${BASE}/${c.rid}/fileImports/x/execute${Q}`],
      ["POST", `${BASE}/${c.rid}/tableImports/x/execute${Q}`],
    ] as const) {
      expect((await call(method, url)).statusCode).toBe(404);
    }
  });

  // -- JDBC drivers ----------------------------------------------------------

  it("keeps an uploaded driver jar and lists it on the connection", async () => {
    const c = await createConnection(JDBC_PG);
    const jar = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("driver bytes")]);
    const upload = (rid: string, fileName: string, body: Buffer) =>
      app.inject({
        method: "POST",
        url: `${BASE}/${rid}/uploadCustomJdbcDrivers${Q}&fileName=${fileName}`,
        headers: { ...ADMIN, "content-type": "application/octet-stream" },
        payload: body,
      });

    const res = await upload(c.rid, "pg.jar", jar);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ ...c, configuration: { ...c.configuration, uploadedJdbcDrivers: ["pg.jar"] } });
    expect((await call("GET", `${BASE}/${c.rid}${Q}`)).json().configuration.uploadedJdbcDrivers).toEqual(["pg.jar"]);

    const twice = await upload(c.rid, "pg.jar", jar);
    expect(twice.statusCode).toBe(409);
    expect(twice.json().errorName).toBe("DriverJarAlreadyExists");
    expect((await upload(c.rid, "second.jar", jar)).json().configuration.uploadedJdbcDrivers).toEqual(["pg.jar", "second.jar"]);

    expect((await upload(c.rid, "notes.txt", jar)).json().errorName).toBe("DriverContentMustBeUploadedAsJar");
    expect((await upload(c.rid, "fake.jar", Buffer.from("plain text"))).json().errorName).toBe("DriverContentMustBeUploadedAsJar");
    const s3 = await createConnection(S3, "s3");
    const wrong = await upload(s3.rid, "pg.jar", jar);
    expect(wrong.json()).toMatchObject({ errorName: "UploadCustomJdbcDriverNotSupportForConnection", parameters: { connectionType: "s3" } });
    expect((await upload("ri.magritte.main.source.none", "pg.jar", jar)).statusCode).toBe(404);
  });

  // -- Permissions -----------------------------------------------------------

  describe("permissions", () => {
    const authz = new FileAuthorizationStore(null);
    const grant = (principalId: string, roleId: "viewer" | "editor" | "owner", resourceRid: string) =>
      authz.addGrant({
        resourceRid,
        principalType: "user",
        principalId,
        roleId,
        grantedBy: "test",
        grantedAt: new Date().toISOString(),
      });
    const as = (id: string) => ({ "x-user-id": id });

    beforeAll(async () => {
      await grant("viewer", "viewer", ROOT_RESOURCE);
      await grant("editor", "editor", ROOT_RESOURCE);
      setEnforcePermissions(true);
    });
    afterAll(() => setEnforcePermissions(false));

    beforeEach(async () => {
      app = await createServer({
        authorizationStore: authz,
        config: TEST_CONFIG,
        datasetStore,
        fileStore: new FileStore(),
        connectivityStore: store,
      });
    });

    it("lets a viewer read a connection but not change it, and an editor create one and own it", async () => {
      const created = await call("POST", `${BASE}${Q}`, { parentFolderRid: FOLDER, displayName: "p", worker: WORKER, configuration: S3 }, as("editor"));
      expect(created.statusCode, created.body).toBe(200);
      const rid = created.json().rid as string;

      expect((await call("GET", `${BASE}/${rid}${Q}`, undefined, as("viewer"))).statusCode).toBe(200);
      const denied = await call("POST", `${BASE}/${rid}/updateSecrets${Q}`, { secrets: {} }, as("viewer"));
      expect(denied.statusCode).toBe(403);
      const noCreate = await call("POST", `${BASE}${Q}`, { parentFolderRid: FOLDER, displayName: "q", worker: WORKER, configuration: S3 }, as("viewer"));
      expect(noCreate.statusCode).toBe(403);

      // The creator became Owner of the connection they made.
      const settings = { exportSettings: { exportsEnabled: true, exportEnabledWithoutMarkingsValidation: false } };
      expect((await call("POST", `${BASE}/${rid}/updateExportSettings${Q}`, settings, as("editor"))).statusCode).toBe(204);
      expect((await call("POST", `${BASE}/${rid}/updateExportSettings${Q}`, settings, as("viewer"))).statusCode).toBe(403);
    });

    it("needs write on the target dataset to import into it", async () => {
      const created = await call("POST", `${BASE}${Q}`, { parentFolderRid: FOLDER, displayName: "r", worker: WORKER, configuration: S3 }, as("editor"));
      const rid = created.json().rid as string;
      await grant("carol", "editor", rid); // writes the connection, holds nothing on the dataset
      const res = await call(
        "POST",
        `${BASE}/${rid}/fileImports${Q}`,
        { datasetRid, importMode: "SNAPSHOT", displayName: "x", fileImportFilters: [] },
        as("carol"),
      );
      expect(res.statusCode).toBe(403);
    });

    it("leaves a connection the caller cannot read out of a batch", async () => {
      const mine = (await call("POST", `${BASE}${Q}`, { parentFolderRid: FOLDER, displayName: "m", worker: WORKER, configuration: S3 }, as("editor"))).json();
      const res = await call("POST", `${BASE}/getConfigurationBatch${Q}`, [{ connectionRid: mine.rid }], as("nobody"));
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: {} });
    });

    it("inherits the parent folder's Markings on every read of a connection", async () => {
      const folder = "ri.compass.main.folder.33333333-3333-4333-8333-333333333333";
      const c = (await call("POST", `${BASE}${Q}`, { parentFolderRid: folder, displayName: "f", worker: WORKER, configuration: S3 }, ADMIN)).json();
      expect((await call("GET", `${BASE}/${c.rid}${Q}`, undefined, as("viewer"))).statusCode).toBe(200);
      await authz.setPolicy({ resourceRid: folder, organizations: [], markings: ["secret"] });

      expect((await call("GET", `${BASE}/${c.rid}${Q}`, undefined, as("viewer"))).statusCode).toBe(403);
      expect((await call("GET", `${BASE}/${c.rid}/getConfiguration${Q}`, undefined, as("viewer"))).statusCode).toBe(403);
      const batch = await call("POST", `${BASE}/getConfigurationBatch${Q}`, [{ connectionRid: c.rid }], as("viewer"));
      expect(batch.json()).toEqual({ data: {} });
      const cleared = { "x-user-id": "viewer", "x-user-markings": "secret" };
      expect((await call("GET", `${BASE}/${c.rid}${Q}`, undefined, cleared)).statusCode).toBe(200);
    });

    it("checks the virtual table's folder and the Markings it applies", async () => {
      const snow = (await call(
        "POST",
        `${BASE}${Q}`,
        {
          parentFolderRid: FOLDER,
          displayName: "vt",
          worker: WORKER,
          configuration: { type: "snowflake", accountIdentifier: "a", jdbcProperties: {}, authenticationMode: { type: "basic", username: "u", password: { type: "asPlaintextValue", value: "p" } } },
        },
        as("editor"),
      )).json();
      const url = `${BASE}/${snow.rid}/virtualTables${Q}`;
      const config = { type: "snowflake", database: "D", schema: "S", table: "T" };
      const restricted = "ri.compass.main.folder.44444444-4444-4444-8444-444444444444";
      await authz.setPolicy({ resourceRid: restricted, organizations: [], markings: ["secret"] });

      expect((await call("POST", url, { name: "a", parentRid: restricted, config }, as("editor"))).statusCode).toBe(403);
      expect((await call("POST", url, { name: "b", parentRid: OTHER_FOLDER, markings: ["pii"], config }, as("editor"))).statusCode).toBe(403);
      const held = await call("POST", url, { name: "c", parentRid: OTHER_FOLDER, markings: ["pii"], config }, { "x-user-id": "editor", "x-user-markings": "pii" });
      expect(held.statusCode, held.body).toBe(200);
      expect((await call("POST", url, { name: "d", parentRid: OTHER_FOLDER, markings: ["pii"], config }, ADMIN)).statusCode).toBe(200);
    });
  });
});
