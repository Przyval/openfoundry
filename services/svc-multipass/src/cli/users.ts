import { parseArgs } from "node:util";
import { createPool } from "@openfoundry/db";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../passwords.js";
import { PgAuthorizationStore } from "@openfoundry/permissions";
import { PgUserStore, UserAlreadyExistsError } from "../store/pg-user-store.js";
import {
  canonicalIds,
  canonicalRoles,
  isValidUsername,
  legacyRolesWarning,
  syncLegacyRootGrants,
  type RoleNames,
} from "../store/user-store.js";

/**
 * Manage the accounts people sign in with, directly in the `users` table.
 *
 * This is the operator's path to the first administrator of a deployment and
 * to every later account: it needs DATABASE_URL, so only someone who already
 * holds the database credentials can use it, and nothing about it is
 * reachable over HTTP.
 *
 *   users create       --username <name> --roles <ADMIN,SERVICE_ACCOUNT>
 *                      [--display-name <text>] [--org-rid <rid>]
 *                      [--groups <id,...>] [--markings <id,...>]
 *   users set-password --username <name>
 *   users set-roles    --username <name> --roles <ADMIN,...|"">
 *   users set-groups   --username <name> --groups <id,...|"">
 *   users set-markings --username <name> --markings <id,...|"">
 *
 * Groups and Markings are signed into the user's token at sign-in and on
 * refresh; the permission model checks a resource's Markings against them.
 * The legacy roles EDITOR and VIEWER are still accepted and granted as editor
 * or viewer on the platform root, with a deprecation warning.
 *
 * The password is read from OPENFOUNDRY_USER_PASSWORD when set, otherwise
 * from standard input: prompted for (twice, unechoed) on a terminal, or the
 * first line of piped input. It is never taken as an argument, where it would
 * land in shell history and the process list.
 */

const USAGE = `Usage:
  users create       --username <name> --roles <ADMIN,SERVICE_ACCOUNT> [--display-name <text>] [--org-rid <rid>]
                     [--groups <id,...>] [--markings <id,...>]
  users set-password --username <name>
  users set-roles    --username <name> --roles <ADMIN,...>   (an empty list removes every role)
  users set-groups   --username <name> --groups <id,...>     (an empty list removes every group)
  users set-markings --username <name> --markings <id,...>   (an empty list removes every marking)

Requires DATABASE_URL. The password comes from OPENFOUNDRY_USER_PASSWORD, or
standard input (prompted on a terminal).`;

/** A mistake by the operator. `showUsage` when it was in the arguments. */
class UsageError extends Error {
  constructor(message: string, readonly showUsage = true) {
    super(message);
  }
}

function parseRoles(raw: string | undefined): RoleNames {
  if (raw === undefined) throw new UsageError("--roles is required");
  try {
    return canonicalRoles(raw.split(","));
  } catch (err) {
    throw new UsageError((err as Error).message);
  }
}

function parseIds(kind: string, raw: string | undefined, required: boolean): string[] {
  if (raw === undefined) {
    if (required) throw new UsageError(`--${kind}s is required`);
    return [];
  }
  try {
    return canonicalIds(kind, raw.split(","));
  } catch (err) {
    throw new UsageError((err as Error).message);
  }
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stderr.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stderr.write("\n");
          reject(new UsageError("cancelled", false));
          return;
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.OPENFOUNDRY_USER_PASSWORD;
  let password: string;
  if (fromEnv !== undefined && fromEnv !== "") {
    password = fromEnv;
  } else if (process.stdin.isTTY) {
    password = await promptHidden("Password: ");
    const again = await promptHidden("Repeat password: ");
    if (password !== again) throw new UsageError("the passwords do not match", false);
  } else {
    let input = "";
    for await (const chunk of process.stdin) input += String(chunk);
    password = input.split(/\r?\n/)[0] ?? "";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new UsageError(`the password must be at least ${MIN_PASSWORD_LENGTH} characters`, false);
  }
  return password;
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    return;
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      username: { type: "string" },
      roles: { type: "string" },
      "display-name": { type: "string" },
      "org-rid": { type: "string" },
      groups: { type: "string" },
      markings: { type: "string" },
    },
    strict: true,
  });

  const username = values.username;
  if (!username) throw new UsageError("--username is required");
  if (!isValidUsername(username)) {
    throw new UsageError(
      "a username is 1-64 letters, digits or ._@- and starts with a letter or digit",
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new UsageError("DATABASE_URL is not set; accounts are stored in the database");
  }

  // Validate everything that needs no database before asking for a password.
  if (!["create", "set-password", "set-roles", "set-groups", "set-markings"].includes(command)) {
    throw new UsageError(`unknown command "${command}"`);
  }
  const roles: RoleNames =
    command === "create" || command === "set-roles"
      ? parseRoles(values.roles)
      : { platformRoles: [], rootRoles: [], legacy: [] };
  const groups = parseIds("group", values.groups, command === "set-groups");
  const markings = parseIds("marking", values.markings, command === "set-markings");

  const pool = createPool({ connectionString: databaseUrl, maxConnections: 1 });
  const store = new PgUserStore(pool);
  // A legacy EDITOR or VIEWER is a role on the platform root now; setting
  // roles without one takes back what an earlier mapping granted.
  const syncRootRoles = async () => {
    if (roles.legacy.length > 0) {
      console.error(`users: warning: ${legacyRolesWarning(`user "${username}"`, roles.legacy)}`);
    }
    await syncLegacyRootGrants(
      new PgAuthorizationStore(pool),
      (id) => id === username,
      new Map([[username, roles.rootRoles]]),
    );
  };
  try {
    switch (command) {
      case "create": {
        const passwordHash = await hashPassword(await readPassword());
        const user = await store.createUser({
          username,
          displayName: values["display-name"] ?? username,
          passwordHash,
          roles: roles.platformRoles,
          orgRid: values["org-rid"] ?? null,
          groups,
          markings,
        });
        await syncRootRoles();
        console.log(
          `Created user "${user.username}" with roles: ${user.roles.join(", ") || "(none)"}`,
        );
        break;
      }
      case "set-password": {
        const passwordHash = await hashPassword(await readPassword());
        if (!(await store.setPassword(username, passwordHash))) {
          throw new UsageError(`no user "${username}"`, false);
        }
        console.log(`Password set for "${username}"`);
        break;
      }
      case "set-roles": {
        if (!(await store.setRoles(username, roles.platformRoles))) {
          throw new UsageError(`no user "${username}"`, false);
        }
        await syncRootRoles();
        console.log(`Roles of "${username}" set to: ${roles.platformRoles.join(", ") || "(none)"}`);
        break;
      }
      case "set-groups": {
        if (!(await store.setGroups(username, groups))) {
          throw new UsageError(`no user "${username}"`, false);
        }
        console.log(`Groups of "${username}" set to: ${groups.join(", ") || "(none)"}`);
        break;
      }
      case "set-markings": {
        if (!(await store.setMarkings(username, markings))) {
          throw new UsageError(`no user "${username}"`, false);
        }
        console.log(`Markings of "${username}" set to: ${markings.join(", ") || "(none)"}`);
        break;
      }
    }
  } finally {
    await pool.end();
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  const argsError = (err as { code?: string }).code?.startsWith("ERR_PARSE_ARGS");
  if (err instanceof UsageError || err instanceof UserAlreadyExistsError || argsError) {
    console.error(`users: ${(err as Error).message}`);
    if ((err instanceof UsageError && err.showUsage) || argsError) {
      console.error(`\n${USAGE}`);
    }
  } else {
    console.error("users: failed:", err);
  }
  process.exit(1);
});
