/** A JSON object as it travels on the wire. */
export type Json = Record<string, unknown>;

/** A secret to store: the name the API shows for it, and its plaintext value. */
export interface SecretWrite {
  name: string;
  value: string;
}

/**
 * A Connection as the API serves it. `configuration` is the *read* form: an
 * encrypted property is `{ type: "asSecretName", value }`, never its plaintext.
 */
export interface ConnectionRecord {
  rid: string;
  parentFolderRid: string;
  displayName: string;
  exportSettings: { exportsEnabled: boolean; exportEnabledWithoutMarkingsValidation: boolean };
  worker: Json;
  configuration: Json;
  createdTime: string;
}

export type ImportKind = "file" | "table";

/**
 * A file import or table import. `data` is every wire field except `rid` and
 * `connectionRid`, so a replace swaps the mutable ones and keeps `datasetRid`
 * and `branchName`, which Foundry does not let a replace change.
 */
export interface ImportRecord {
  rid: string;
  kind: ImportKind;
  connectionRid: string;
  data: Json;
}

export interface VirtualTableRecord {
  rid: string;
  connectionRid: string;
  name: string;
  parentRid: string;
  config: Json;
  markings?: string[];
}
