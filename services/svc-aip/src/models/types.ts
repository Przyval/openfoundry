/**
 * Wire shapes of the Foundry `models` v2 section, as `foundry_sdk/v2/models/models.py`
 * declares them, plus the records the model store keeps.
 *
 * Only the shapes of the operations this service serves are declared; see
 * `routes/v2/models.ts` for which those are and why the rest are not.
 */

// ---------------------------------------------------------------------------
// ModelApi - the declared inputs and outputs of a model version
// ---------------------------------------------------------------------------

/** `core_models.UnsupportedType`, which doubles as a data type and as an input/output. */
export interface UnsupportedType {
  type: "unsupported";
  unsupportedType: string;
  params: Record<string, string>;
}

export type ModelApiDataType =
  | { type: "date" }
  | { type: "boolean" }
  | { type: "string" }
  | { type: "double" }
  | { type: "integer" }
  | { type: "float" }
  | { type: "long" }
  | { type: "timestamp" }
  | { type: "any" }
  | { type: "array"; itemType: ModelApiDataType }
  | { type: "map"; keyType: ModelApiDataType; valueType: ModelApiDataType }
  | UnsupportedType;

export interface ModelApiColumn {
  name: string;
  required?: boolean;
  dataType: ModelApiDataType;
}

export interface ModelApiParameterType {
  type: "parameter";
  name: string;
  required?: boolean;
  dataType: ModelApiDataType;
}

export type ModelApiTabularFormat = "PANDAS" | "SPARK";

export interface ModelApiTabularType {
  type: "tabular";
  name: string;
  required?: boolean;
  columns: ModelApiColumn[];
  format?: ModelApiTabularFormat;
}

/** `ModelApiInput` and `ModelApiOutput` are the same union. */
export type ModelApiIo = ModelApiParameterType | ModelApiTabularType | UnsupportedType;

export interface ModelApi {
  inputs: ModelApiIo[];
  outputs: ModelApiIo[];
}

// ---------------------------------------------------------------------------
// Model versions
// ---------------------------------------------------------------------------

/** `ModelFiles` is an alias of `DillModelFiles`: a base64 dill-serialized function. */
export interface DillModelFiles {
  type: "dill";
  serializedModelFunction: string;
}

/**
 * The `ModelVersionSource` variants this service can truthfully record.
 *
 * A version created through `POST /v2/models/{modelRid}/versions` is the `sdk`
 * variant ("Model version created via the SDK"), and one copied by
 * `promoteVersion` is the `promoted` variant naming what it was copied from.
 * The code-repository, code-workspace, Model Studio, containerized and external
 * variants each name a subsystem that would have produced the version, and
 * none of those exists here.
 */
export type ModelVersionSource =
  | { type: "sdk" }
  | { type: "promoted"; previousModelRid: string; previousModelVersionRid: string };

// ---------------------------------------------------------------------------
// Stored records
// ---------------------------------------------------------------------------

/**
 * Models and Model Studios are both filesystem resources placed in a folder,
 * and a display name may be used once per folder across resource types.
 * They are kept as one kind of record so that rule can be enforced in one place.
 */
export type ModelResourceType = "MODEL" | "MODEL_STUDIO";

export interface ModelResourceRecord {
  rid: string;
  resourceType: ModelResourceType;
  displayName: string;
  parentFolderRid: string;
  /** ISO-8601, millisecond precision. */
  createdTime: string;
}

export interface ModelVersionRecord {
  rid: string;
  modelRid: string;
  /** The model branch the version was created on or promoted to. */
  branch: string;
  modelApi: ModelApi;
  condaRequirements: string[];
  backingRepositories: string[];
  /** Kept so a promoted copy carries the model it was copied from. Never served. */
  modelFiles: DillModelFiles;
  source: ModelVersionSource;
  /** ISO-8601, millisecond precision. */
  createdTime: string;
}
