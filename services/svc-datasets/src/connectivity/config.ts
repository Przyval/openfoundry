import { invalidArgument } from "@openfoundry/errors";
import { Rid } from "@openfoundry/rid";
import {
  additionalSecretsMustBeSpecifiedAsPlaintextValueMap,
  domainMustUseHttpsWithAuthentication,
  encryptedPropertyMustBeSpecifiedAsPlaintextValue,
  invalidShareName,
  unknownWorkerCannotBeUsedForCreatingOrUpdatingConnections,
} from "./errors.js";
import {
  byType,
  compact,
  hostName,
  list,
  nonEmptyList,
  obj,
  oneOf,
  optionalBool,
  optionalInt,
  optionalObj,
  optionalOneOf,
  optionalStr,
  port,
  requiredBool,
  requiredPort,
  str,
  stringMap,
} from "./parse.js";
import type { Json, SecretWrite } from "./types.js";

/**
 * Turns the body of "create connection" into what is stored and what is served.
 *
 * The request carries secrets (`asPlaintextValue`); the connection a caller
 * reads back never does. Each plaintext becomes a named secret - the name is
 * the property's path inside `configuration`, e.g. `credentials.password` - and
 * the configuration keeps `{ type: "asSecretName", value: <that name> }`, which
 * is how Foundry shows an encrypted property.
 */
export interface ParsedConnection {
  parentFolderRid: string;
  displayName: string;
  worker: Json;
  configuration: Json;
  secrets: SecretWrite[];
}

export function parseCreateConnection(raw: unknown): ParsedConnection {
  const body = obj(raw, "body");
  const parentFolderRid = folderRid(str(body, "parentFolderRid", ""));
  const displayName = str(body, "displayName", "");
  const worker = byType(body.worker, "worker", {
    foundryWorker: (o, path) => ({
      type: "foundryWorker",
      networkEgressPolicyRids: list(o.networkEgressPolicyRids, `${path}.networkEgressPolicyRids`).map(
        (rid, i) => ridString(rid, `${path}.networkEgressPolicyRids[${i}]`),
      ),
    }),
    unknownWorker: () => {
      throw unknownWorkerCannotBeUsedForCreatingOrUpdatingConnections();
    },
  });

  const ctx: Ctx = { secrets: [] };
  const configuration = byType<Json>(body.configuration, "configuration", {
    s3: (o) => s3(o, ctx),
    rest: (o) => rest(o, ctx),
    snowflake: (o) => snowflake(o, ctx),
    databricks: (o) => databricks(o, ctx),
    smb: (o) => smb(o, ctx),
    jdbc: (o) => jdbc(o, ctx),
  });
  return { parentFolderRid, displayName, worker, configuration, secrets: ctx.secrets };
}

interface Ctx {
  secrets: SecretWrite[];
}

const FOLDER_RID = /^ri\.compass\.[^.]+\.folder\.[^.]+$/;

export function folderRid(raw: string, param = "parentFolderRid"): string {
  if (!FOLDER_RID.test(raw)) {
    throw invalidArgument(param, "must be a folder RID (ri.compass.<instance>.folder.<id>)");
  }
  return raw;
}

export function ridString(raw: unknown, path: string): string {
  if (typeof raw !== "string") throw invalidArgument(path, "must be a RID string");
  try {
    return Rid.parse(raw).toString();
  } catch (err) {
    throw invalidArgument(path, err instanceof Error ? err.message : "is not a RID");
  }
}

// -- Encrypted properties ------------------------------------------------------

/**
 * An `EncryptedProperty`. A new connection holds no secret yet, so the only
 * valid form is a plaintext value; naming an existing secret has nothing to
 * refer to.
 */
function encrypted(raw: unknown, path: string, ctx: Ctx): Json {
  const o = obj(raw, path);
  if (o.type === "asSecretName") throw encryptedPropertyMustBeSpecifiedAsPlaintextValue(path);
  if (o.type !== "asPlaintextValue") {
    throw invalidArgument(`${path}.type`, "must be asPlaintextValue");
  }
  const value = str(o, "value", `${path}.`);
  const name = path.replace(/^configuration\./, "");
  addSecret(ctx, name, value);
  return { type: "asSecretName", value: name };
}

function addSecret(ctx: Ctx, name: string, value: string): void {
  if (ctx.secrets.some((s) => s.name === name)) {
    throw invalidArgument(name, "names a secret that is already defined");
  }
  ctx.secrets.push({ name, value });
}

function basic(o: Json, path: string, ctx: Ctx): Json {
  return {
    username: str(o, "username", `${path}.`),
    password: encrypted(o.password, `${path}.password`, ctx),
    type: "basic",
  };
}

function optionalBasic(raw: unknown, path: string, ctx: Ctx): Json | undefined {
  const o = optionalObj(raw, path);
  return o && byType(o, path, { basic: (b) => basic(b, path, ctx) });
}

// -- S3 -----------------------------------------------------------------------

function s3(o: Json, ctx: Ctx): Json {
  const p = "configuration.";
  return compact({
    bucketUrl: str(o, "bucketUrl", p),
    s3Endpoint: optionalStr(o, "s3Endpoint", p),
    region: optionalStr(o, "region", p),
    authenticationMode:
      o.authenticationMode === undefined || o.authenticationMode === null
        ? undefined
        : byType(o.authenticationMode, "configuration.authenticationMode", {
            awsAccessKey: (a, path) => ({
              accessKeyId: str(a, "accessKeyId", `${path}.`),
              secretAccessKey: encrypted(a.secretAccessKey, `${path}.secretAccessKey`, ctx),
              type: "awsAccessKey",
            }),
            cloudIdentity: (a, path) => ({
              cloudIdentityRid: ridString(str(a, "cloudIdentityRid", `${path}.`), `${path}.cloudIdentityRid`),
              type: "cloudIdentity",
            }),
            oidc: (a, path) => ({
              audience: str(a, "audience", `${path}.`),
              issuerUrl: str(a, "issuerUrl", `${path}.`),
              subject: ridString(a.subject, `${path}.subject`),
              type: "oidc",
            }),
          }),
    s3EndpointSigningRegion: optionalStr(o, "s3EndpointSigningRegion", p),
    clientKmsConfiguration: kms(o.clientKmsConfiguration),
    stsRoleConfiguration: sts(o.stsRoleConfiguration),
    proxyConfiguration: s3Proxy(o.proxyConfiguration, ctx),
    maxConnections: optionalInt(o, "maxConnections", p, 1),
    connectionTimeoutMillis: optionalInt(o, "connectionTimeoutMillis", p, 0),
    socketTimeoutMillis: optionalInt(o, "socketTimeoutMillis", p, 0),
    maxErrorRetry: optionalInt(o, "maxErrorRetry", p, 0),
    matchSubfolderExactly: optionalBool(o, "matchSubfolderExactly", p),
    enableRequesterPays: optionalBool(o, "enableRequesterPays", p),
    type: "s3",
  });
}

function kms(raw: unknown): Json | undefined {
  const o = optionalObj(raw, "configuration.clientKmsConfiguration");
  if (!o) return undefined;
  const p = "configuration.clientKmsConfiguration.";
  return compact({ kmsKey: str(o, "kmsKey", p), kmsRegion: optionalStr(o, "kmsRegion", p) });
}

function sts(raw: unknown): Json | undefined {
  const o = optionalObj(raw, "configuration.stsRoleConfiguration");
  if (!o) return undefined;
  const p = "configuration.stsRoleConfiguration.";
  let duration: Json | undefined;
  if (o.roleSessionDuration !== undefined && o.roleSessionDuration !== null) {
    const d = obj(o.roleSessionDuration, `${p}roleSessionDuration`);
    duration = { value: optionalInt(d, "value", `${p}roleSessionDuration.`, 0) ?? 0, unit: str(d, "unit", `${p}roleSessionDuration.`) };
  }
  return compact({
    roleArn: str(o, "roleArn", p),
    roleSessionName: str(o, "roleSessionName", p),
    roleSessionDuration: duration,
    externalId: optionalStr(o, "externalId", p),
    stsEndpoint: optionalStr(o, "stsEndpoint", p),
  });
}

function s3Proxy(raw: unknown, ctx: Ctx): Json | undefined {
  const path = "configuration.proxyConfiguration";
  const o = optionalObj(raw, path);
  if (!o) return undefined;
  const p = `${path}.`;
  return compact({
    host: hostName(o, "host", p),
    port: requiredPort(o, "port", p),
    nonProxyHosts:
      o.nonProxyHosts === undefined || o.nonProxyHosts === null
        ? undefined
        : list(o.nonProxyHosts, `${p}nonProxyHosts`).map((h, i) => {
            if (typeof h !== "string") throw invalidArgument(`${p}nonProxyHosts[${i}]`, "must be a string");
            return h;
          }),
    protocol: optionalOneOf(o, "protocol", p, ["HTTP", "HTTPS"]),
    credentials: optionalBasic(o.credentials, `${path}.credentials`, ctx),
  });
}

// -- REST ---------------------------------------------------------------------

function rest(o: Json, ctx: Ctx): Json {
  const p = "configuration.";
  const domains = nonEmptyList(o.domains, "configuration.domains").map((d, i) =>
    domain(d, `configuration.domains[${i}]`, ctx),
  );
  let additionalSecrets: Json | undefined;
  if (o.additionalSecrets !== undefined && o.additionalSecrets !== null) {
    additionalSecrets = byType(o.additionalSecrets, "configuration.additionalSecrets", {
      asSecretsWithPlaintextValues: (s, path) => {
        const secrets = stringMap(s.secrets, `${path}.secrets`);
        for (const [name, value] of Object.entries(secrets)) {
          if (name.trim() === "") throw invalidArgument(`${path}.secrets`, "has a blank secret name");
          if (value === "") throw invalidArgument(`${path}.secrets.${name}`, "cannot be empty");
          addSecret(ctx, name, value);
        }
        return { type: "asSecretsNames", secretNames: Object.keys(secrets) };
      },
      asSecretsNames: () => {
        throw additionalSecretsMustBeSpecifiedAsPlaintextValueMap();
      },
    });
  }
  return compact({
    domains,
    additionalSecrets,
    oauth2ClientRid:
      o.oauth2ClientRid === undefined || o.oauth2ClientRid === null
        ? undefined
        : ridString(o.oauth2ClientRid, `${p}oauth2ClientRid`),
    type: "rest",
  });
}

function domain(raw: unknown, path: string, ctx: Ctx): Json {
  const o = obj(raw, path);
  const p = `${path}.`;
  const scheme = optionalOneOf(o, "scheme", p, ["HTTP", "HTTPS"]);
  const auth =
    o.auth === undefined || o.auth === null
      ? undefined
      : byType(o.auth, `${path}.auth`, {
          bearerToken: (a, ap) => ({
            bearerToken: encrypted(a.bearerToken, `${ap}.bearerToken`, ctx),
            type: "bearerToken",
          }),
          apiKey: (a, ap) => ({
            location: byType(a.location, `${ap}.location`, {
              header: (l, lp) => ({ headerName: str(l, "headerName", `${lp}.`), type: "header" }),
              queryParameter: (l, lp) => ({
                queryParameterName: str(l, "queryParameterName", `${lp}.`),
                type: "queryParameter",
              }),
            }),
            apiKey: encrypted(a.apiKey, `${ap}.apiKey`, ctx),
            type: "apiKey",
          }),
          basic: (a, ap) => basic(a, ap, ctx),
          oauth2: () => ({ type: "oauth2" }),
        });
  // A credential over plain HTTP is a credential on the wire; Foundry refuses it.
  if (auth && scheme === "HTTP") throw domainMustUseHttpsWithAuthentication();
  return compact({ scheme, host: hostName(o, "host", p), port: port(o, "port", p), auth });
}

// -- Snowflake ----------------------------------------------------------------

function snowflake(o: Json, ctx: Ctx): Json {
  const p = "configuration.";
  return compact({
    accountIdentifier: str(o, "accountIdentifier", p),
    database: optionalStr(o, "database", p),
    role: optionalStr(o, "role", p),
    schema: optionalStr(o, "schema", p),
    warehouse: optionalStr(o, "warehouse", p),
    authenticationMode: byType(o.authenticationMode, "configuration.authenticationMode", {
      keyPair: (a, ap) => ({
        user: str(a, "user", `${ap}.`),
        privateKey: encrypted(a.privateKey, `${ap}.privateKey`, ctx),
        type: "keyPair",
      }),
      basic: (a, ap) => basic(a, ap, ctx),
      externalOauth: () => {
        throw invalidArgument(
          "configuration.authenticationMode.type",
          "externalOauth is not supported: it needs an OIDC issuer this platform does not run",
        );
      },
    }),
    jdbcProperties: stringMap(o.jdbcProperties, "configuration.jdbcProperties"),
    type: "snowflake",
  });
}

// -- Databricks ---------------------------------------------------------------

function databricks(o: Json, ctx: Ctx): Json {
  const p = "configuration.";
  return {
    hostName: hostName(o, "hostName", p),
    httpPath: str(o, "httpPath", p),
    authentication: byType(o.authentication, "configuration.authentication", {
      oauthM2M: (a, ap) => ({
        clientID: str(a, "clientID", `${ap}.`),
        clientSecret: encrypted(a.clientSecret, `${ap}.clientSecret`, ctx),
        type: "oauthM2M",
      }),
      personalAccessToken: (a, ap) => ({
        personalAccessToken: encrypted(a.personalAccessToken, `${ap}.personalAccessToken`, ctx),
        type: "personalAccessToken",
      }),
      basic: (a, ap) => basic(a, ap, ctx),
      workflowIdentityFederation: () => {
        throw invalidArgument(
          "configuration.authentication.type",
          "workflowIdentityFederation is not supported: it needs an OIDC issuer this platform does not run",
        );
      },
    }),
    jdbcProperties: stringMap(o.jdbcProperties, "configuration.jdbcProperties"),
    type: "databricks",
  };
}

// -- SMB ----------------------------------------------------------------------

const SHARE_FORBIDDEN = /[\\/:*?"<>|]/;

function smb(o: Json, ctx: Ctx): Json {
  const p = "configuration.";
  const share = str(o, "share", p);
  if (SHARE_FORBIDDEN.test(share)) throw invalidShareName(share);
  const proxy = optionalObj(o.proxy, "configuration.proxy");
  return compact({
    hostname: hostName(o, "hostname", p),
    port: port(o, "port", p),
    proxy:
      proxy &&
      compact({
        hostname: hostName(proxy, "hostname", "configuration.proxy."),
        port: requiredPort(proxy, "port", "configuration.proxy."),
        protocol: oneOf(proxy, "protocol", "configuration.proxy.", ["HTTP", "SOCKS"]),
      }),
    share,
    baseDirectory: optionalStr(o, "baseDirectory", p),
    auth: byType(o.auth, "configuration.auth", {
      usernamePassword: (a, ap) =>
        compact({
          username: str(a, "username", `${ap}.`),
          password: encrypted(a.password, `${ap}.password`, ctx),
          domain: optionalStr(a, "domain", `${ap}.`),
          type: "usernamePassword",
        }),
    }),
    requireMessageSigning: optionalBool(o, "requireMessageSigning", p),
    type: "smb",
  });
}

// -- JDBC ---------------------------------------------------------------------

function jdbc(o: Json, ctx: Ctx): Json {
  const p = "configuration.";
  return compact({
    url: str(o, "url", p),
    driverClass: str(o, "driverClass", p),
    // No driver can have been uploaded to a connection that does not exist yet.
    uploadedJdbcDrivers: [],
    jdbcProperties: stringMap(o.jdbcProperties, "configuration.jdbcProperties"),
    credentials: optionalBasic(o.credentials, "configuration.credentials", ctx),
    type: "jdbc",
  });
}

// -- Export settings ----------------------------------------------------------

export function parseExportSettings(raw: unknown, path: string): {
  exportsEnabled: boolean;
  exportEnabledWithoutMarkingsValidation: boolean;
} {
  const o = obj(raw, path);
  return {
    exportsEnabled: requiredBool(o, "exportsEnabled", `${path}.`),
    exportEnabledWithoutMarkingsValidation: requiredBool(
      o,
      "exportEnabledWithoutMarkingsValidation",
      `${path}.`,
    ),
  };
}
