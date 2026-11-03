import { invalidArgument } from "@openfoundry/errors";
import {
  fileAtLeastCountFilterInvalidMinCount,
  fileImportCustomFilterCannotBeUsedToCreateOrUpdateFileImports,
  fileImportNotSupportedForConnection,
  fileSizeFilterGreaterThanCannotBeNegative,
  fileSizeFilterInvalidGreaterThanAndLessThanRange,
  fileSizeFilterLessThanMustBeOneByteOrLarger,
  fileSizeFilterMissingGreaterThanAndLessThan,
  filesCountLimitFilterInvalidLimit,
  invalidVirtualTableConnection,
  tableImportNotSupportedForConnection,
} from "./errors.js";
import {
  byType,
  compact,
  list,
  oneOf,
  optionalBool,
  optionalStr,
  requiredInt,
  str,
} from "./parse.js";
import type { ConnectionRecord, Json } from "./types.js";

// -- File imports -------------------------------------------------------------

const FILE_IMPORT_MODES = ["SNAPSHOT", "APPEND", "UPDATE"] as const;

/** Only S3 and SMB connections hold files to import. */
export function requireFileImports(connection: ConnectionRecord): void {
  const type = connection.configuration.type;
  if (type !== "s3" && type !== "smb") throw fileImportNotSupportedForConnection(connection.rid);
}

export interface FileImportFields {
  importMode: string;
  displayName: string;
  subfolder?: string;
  fileImportFilters: Json[];
}

/** The fields a create and a replace share. */
export function parseFileImportFields(body: Json): FileImportFields {
  return {
    importMode: oneOf(body, "importMode", "", FILE_IMPORT_MODES),
    displayName: str(body, "displayName", ""),
    subfolder: optionalStr(body, "subfolder", ""),
    fileImportFilters: list(body.fileImportFilters, "fileImportFilters").map((f, i) =>
      fileFilter(f, `fileImportFilters[${i}]`),
    ),
  };
}

function regex(o: Json, path: string): string {
  const value = str(o, "regex", `${path}.`);
  try {
    new RegExp(value);
  } catch {
    throw invalidArgument(`${path}.regex`, "is not a valid regular expression");
  }
  return value;
}

/** A `SizeBytes` is a long: a JSON number or a decimal string. */
function sizeBytes(raw: unknown, path: string): number {
  const n = typeof raw === "string" && /^-?\d+$/.test(raw) ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isSafeInteger(n)) {
    throw invalidArgument(path, "must be an integer number of bytes");
  }
  return n;
}

function fileFilter(raw: unknown, path: string): Json {
  return byType(raw, path, {
    pathMatchesFilter: (o, p) => ({ regex: regex(o, p), type: "pathMatchesFilter" }),
    pathNotMatchesFilter: (o, p) => ({ regex: regex(o, p), type: "pathNotMatchesFilter" }),
    anyPathMatchesFilter: (o, p) => ({ regex: regex(o, p), type: "anyPathMatchesFilter" }),
    filesCountLimitFilter: (o, p) => {
      const filesCount = requiredInt(o, "filesCount", `${p}.`);
      if (filesCount < 1) throw filesCountLimitFilterInvalidLimit(filesCount);
      return { filesCount, type: "filesCountLimitFilter" };
    },
    atLeastCountFilter: (o, p) => {
      const minFilesCount = requiredInt(o, "minFilesCount", `${p}.`);
      if (minFilesCount < 1) throw fileAtLeastCountFilterInvalidMinCount(minFilesCount);
      return { minFilesCount, type: "atLeastCountFilter" };
    },
    changedSinceLastUploadFilter: (o, p) => ({
      fileProperties: list(o.fileProperties, `${p}.fileProperties`).map((v, i) => {
        if (v !== "LAST_MODIFIED" && v !== "SIZE") {
          throw invalidArgument(`${p}.fileProperties[${i}]`, "must be one of LAST_MODIFIED, SIZE");
        }
        return v;
      }),
      type: "changedSinceLastUploadFilter",
    }),
    lastModifiedAfterFilter: (o, p) => {
      const after = o.afterTimestamp;
      if (after !== undefined && after !== null) {
        if (typeof after !== "string" || Number.isNaN(Date.parse(after))) {
          throw invalidArgument(`${p}.afterTimestamp`, "must be an ISO-8601 timestamp");
        }
      }
      return compact({ afterTimestamp: after ?? undefined, type: "lastModifiedAfterFilter" });
    },
    fileSizeFilter: (o, p) => {
      const gt = o.gt === undefined || o.gt === null ? undefined : sizeBytes(o.gt, `${p}.gt`);
      const lt = o.lt === undefined || o.lt === null ? undefined : sizeBytes(o.lt, `${p}.lt`);
      if (gt === undefined && lt === undefined) throw fileSizeFilterMissingGreaterThanAndLessThan();
      if (gt !== undefined && gt < 0) throw fileSizeFilterGreaterThanCannotBeNegative(gt);
      if (lt !== undefined && lt < 1) throw fileSizeFilterLessThanMustBeOneByteOrLarger(lt);
      if (gt !== undefined && lt !== undefined && gt >= lt) {
        throw fileSizeFilterInvalidGreaterThanAndLessThanRange(gt, lt);
      }
      return compact({ gt: o.gt ?? undefined, lt: o.lt ?? undefined, type: "fileSizeFilter" });
    },
    // A custom filter is something the platform writes; a caller may not.
    customFilter: () => {
      throw fileImportCustomFilterCannotBeUsedToCreateOrUpdateFileImports();
    },
  });
}

// -- Table imports ------------------------------------------------------------

const TABLE_IMPORT_MODES = ["SNAPSHOT", "APPEND"] as const;

export interface TableImportFields {
  importMode: string;
  displayName: string;
  allowSchemaChanges?: boolean;
  config: Json;
}

export function parseTableImportFields(body: Json): TableImportFields {
  return {
    importMode: oneOf(body, "importMode", "", TABLE_IMPORT_MODES),
    displayName: str(body, "displayName", ""),
    allowSchemaChanges: optionalBool(body, "allowSchemaChanges", ""),
    config: tableConfig(body.config),
  };
}

const TABLE_CONFIG_TYPES = [
  "databricksImportConfig",
  "jdbcImportConfig",
  "microsoftSqlServerImportConfig",
  "postgreSqlImportConfig",
  "microsoftAccessImportConfig",
  "snowflakeImportConfig",
  "oracleImportConfig",
] as const;

function tableConfig(raw: unknown): Json {
  const table = Object.fromEntries(
    TABLE_CONFIG_TYPES.map((type) => [
      type,
      (o: Json, path: string): Json => {
        const initial =
          o.initialIncrementalState === undefined || o.initialIncrementalState === null
            ? undefined
            : incrementalState(o.initialIncrementalState, `${path}.initialIncrementalState`);
        return compact({
          query: str(o, "query", `${path}.`),
          initialIncrementalState: initial,
          type,
        });
      },
    ]),
  );
  return byType(raw, "config", table);
}

function incrementalState(raw: unknown, path: string): Json {
  const column = (o: Json) => str(o, "columnName", `${path}.`);
  const value = (o: Json) => o.currentValue;
  const bad = (what: string) => invalidArgument(`${path}.currentValue`, `must be ${what}`);
  return byType(raw, path, {
    stringColumnInitialIncrementalState: (o) => {
      if (typeof value(o) !== "string") throw bad("a string");
      return { columnName: column(o), currentValue: value(o), type: "stringColumnInitialIncrementalState" };
    },
    dateColumnInitialIncrementalState: (o) => {
      const v = value(o);
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
        throw bad("a date (YYYY-MM-DD)");
      }
      return { columnName: column(o), currentValue: v, type: "dateColumnInitialIncrementalState" };
    },
    integerColumnInitialIncrementalState: (o) => {
      const v = value(o);
      if (typeof v !== "number" || !Number.isInteger(v) || v < -(2 ** 31) || v >= 2 ** 31) {
        throw bad("a 32-bit integer");
      }
      return { columnName: column(o), currentValue: v, type: "integerColumnInitialIncrementalState" };
    },
    longColumnInitialIncrementalState: (o) => {
      const v = value(o);
      if (!(typeof v === "number" && Number.isSafeInteger(v)) && !(typeof v === "string" && /^-?\d+$/.test(v))) {
        throw bad("an integer or a decimal integer string");
      }
      return { columnName: column(o), currentValue: v, type: "longColumnInitialIncrementalState" };
    },
    decimalColumnInitialIncrementalState: (o) => {
      const v = value(o);
      if (!(typeof v === "number" && Number.isFinite(v)) && !(typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))) {
        throw bad("a number or a decimal string");
      }
      return { columnName: column(o), currentValue: v, type: "decimalColumnInitialIncrementalState" };
    },
    timestampColumnInitialIncrementalState: (o) => {
      const v = value(o);
      if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw bad("an ISO-8601 timestamp");
      return { columnName: column(o), currentValue: v, type: "timestampColumnInitialIncrementalState" };
    },
  });
}

/**
 * Which table import configs a connection can serve. A JDBC connection runs the
 * generic `jdbcImportConfig` and, from its URL, the one database-specific
 * config that matches its driver.
 */
export function requireTableImportConfig(connection: ConnectionRecord, config: Json): void {
  const importType = String(config.type);
  const type = connection.configuration.type;
  let allowed: string[] = [];
  if (type === "snowflake") allowed = ["snowflakeImportConfig"];
  else if (type === "databricks") allowed = ["databricksImportConfig"];
  else if (type === "jdbc") {
    allowed = ["jdbcImportConfig"];
    const url = String(connection.configuration.url).toLowerCase();
    if (url.startsWith("jdbc:postgresql:")) allowed.push("postgreSqlImportConfig");
    else if (url.startsWith("jdbc:sqlserver:")) allowed.push("microsoftSqlServerImportConfig");
    else if (url.startsWith("jdbc:oracle:")) allowed.push("oracleImportConfig");
    else if (url.startsWith("jdbc:ucanaccess:")) allowed.push("microsoftAccessImportConfig");
  }
  if (!allowed.includes(importType)) {
    throw tableImportNotSupportedForConnection(connection.rid, importType);
  }
}

// -- Virtual tables -----------------------------------------------------------

export interface VirtualTableFields {
  name: string;
  parentRid: string;
  config: Json;
  markings?: string[];
}

export function parseVirtualTable(body: Json): VirtualTableFields {
  const config = byType<Json>(body.config, "config", {
    snowflake: (o) => ({
      database: str(o, "database", "config."),
      schema: str(o, "schema", "config."),
      table: str(o, "table", "config."),
      type: "snowflake",
    }),
    unity: (o) => ({
      catalog: str(o, "catalog", "config."),
      schema: str(o, "schema", "config."),
      table: str(o, "table", "config."),
      type: "unity",
    }),
    glue: (o) => ({
      database: str(o, "database", "config."),
      table: str(o, "table", "config."),
      type: "glue",
    }),
    delta: (o) => ({ path: str(o, "path", "config."), type: "delta" }),
    iceberg: (o) =>
      compact({
        tableIdentifier: str(o, "tableIdentifier", "config."),
        warehousePath: optionalStr(o, "warehousePath", "config."),
        type: "iceberg",
      }),
    files: (o) => ({
      format: oneOf(o, "format", "config.", ["AVRO", "CSV", "PARQUET"] as const),
      path: str(o, "path", "config."),
      type: "files",
    }),
    bigquery: (o) => ({
      project: str(o, "project", "config."),
      dataset: str(o, "dataset", "config."),
      table: str(o, "table", "config."),
      type: "bigquery",
    }),
  });
  let markings: string[] | undefined;
  if (body.markings !== undefined && body.markings !== null) {
    markings = list(body.markings, "markings").map((m, i) => {
      if (typeof m !== "string" || m.trim() === "") {
        throw invalidArgument(`markings[${i}]`, "must be a marking id");
      }
      return m;
    });
  }
  return { name: str(body, "name", ""), parentRid: str(body, "parentRid", ""), config, markings };
}

/** The virtual table config types each connection type can register tables from. */
const VIRTUAL_TABLE_SOURCES: Record<string, readonly string[]> = {
  snowflake: ["snowflake"],
  databricks: ["unity", "delta", "iceberg", "files"],
  s3: ["glue", "delta", "iceberg", "files"],
};

export function requireVirtualTableSource(connection: ConnectionRecord, config: Json): void {
  const connectionType = String(connection.configuration.type);
  const allowed = VIRTUAL_TABLE_SOURCES[connectionType] ?? [];
  if (!allowed.includes(String(config.type))) {
    throw invalidVirtualTableConnection(
      connection.rid,
      "INVALID_SOURCE_TYPE",
    );
  }
}

